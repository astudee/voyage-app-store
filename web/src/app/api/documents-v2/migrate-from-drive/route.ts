import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { uploadToR2 } from "@/lib/r2";
import { generateDocumentId } from "@/lib/nanoid";
import { query, execute } from "@/lib/snowflake";
import crypto from "crypto";

interface MigrationResult {
  filename: string;
  id?: string;
  success: boolean;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

// GET - Preview files in a Google Drive folder (dry run) or compare with Snowflake
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const folder = searchParams.get("folder"); // to-file, archive-docs, or archive-contracts
  const compare = searchParams.get("compare") === "true";

  if (!folder || !["to-file", "archive-docs", "archive-contracts"].includes(folder)) {
    return NextResponse.json(
      { error: "Invalid folder. Use: to-file, archive-docs, or archive-contracts" },
      { status: 400 }
    );
  }

  const folderId = getFolderId(folder);
  if (!folderId) {
    return NextResponse.json(
      { error: `Folder ID not configured for ${folder}` },
      { status: 400 }
    );
  }

  try {
    const drive = getDriveClient();
    if (!drive) {
      return NextResponse.json(
        { error: "Google Drive not configured" },
        { status: 500 }
      );
    }

    // List files in the folder
    const files = await listFilesInFolder(drive, folderId);

    // If compare mode, check which files already exist in Snowflake
    if (compare) {
      // Get all existing filenames and hashes from Snowflake
      const existingDocs = await query<{ ORIGINAL_FILENAME: string; FILE_HASH: string }>(
        `SELECT ORIGINAL_FILENAME, FILE_HASH FROM DOCUMENTS WHERE STATUS != 'deleted'`
      );
      const existingFilenames = new Set(existingDocs.map(d => d.ORIGINAL_FILENAME));
      const existingHashes = new Set(existingDocs.map(d => d.FILE_HASH));
      const totalInDatabase = existingDocs.length;

      // Categorize files
      const pdfFiles = files.filter(f => f.mimeType === "application/pdf");
      const nonPdfFiles = files.filter(f => f.mimeType !== "application/pdf");
      const alreadyImportedByName = pdfFiles.filter(f => existingFilenames.has(f.name || ""));
      const needsImportByName = pdfFiles.filter(f => !existingFilenames.has(f.name || ""));

      return NextResponse.json({
        folder,
        folderId,
        summary: {
          totalInDrive: files.length,
          pdfFiles: pdfFiles.length,
          nonPdfFiles: nonPdfFiles.length,
          alreadyImportedByFilename: alreadyImportedByName.length,
          needsImportByFilename: needsImportByName.length,
          totalInDatabase,
          totalUniqueHashes: existingHashes.size,
        },
        note: "Migration uses hash-based deduplication. Files with same content but different names will be skipped.",
        needsImport: needsImportByName.map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size,
        })),
        alreadyImported: alreadyImportedByName.map((f) => f.name),
        nonPdfSkipped: nonPdfFiles.map((f) => ({ name: f.name, mimeType: f.mimeType })),
      });
    }

    return NextResponse.json({
      folder,
      folderId,
      fileCount: files.length,
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        createdTime: f.createdTime,
      })),
    });
  } catch (error) {
    console.error("[migrate-from-drive] Error listing files:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list files" },
      { status: 500 }
    );
  }
}

// POST - Migrate files from Google Drive to R2
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const folder = searchParams.get("folder"); // to-file, archive-docs, or archive-contracts
  const limit = parseInt(searchParams.get("limit") || "50"); // Process in batches

  if (!folder || !["to-file", "archive-docs", "archive-contracts"].includes(folder)) {
    return NextResponse.json(
      { error: "Invalid folder. Use: to-file, archive-docs, or archive-contracts" },
      { status: 400 }
    );
  }

  const folderId = getFolderId(folder);
  if (!folderId) {
    return NextResponse.json(
      { error: `Folder ID not configured for ${folder}` },
      { status: 400 }
    );
  }

  try {
    const drive = getDriveClient();
    if (!drive) {
      return NextResponse.json(
        { error: "Google Drive not configured" },
        { status: 500 }
      );
    }

    // List files in the folder
    const allFiles = await listFilesInFolder(drive, folderId);
    const files = allFiles.slice(0, limit);

    console.log(`[migrate-from-drive] Processing ${files.length} of ${allFiles.length} files from ${folder}`);

    const results: MigrationResult[] = [];
    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    for (const file of files) {
      try {
        // Skip non-PDF files
        if (file.mimeType !== "application/pdf") {
          results.push({
            filename: file.name || "unknown",
            success: true,
            skipped: true,
            reason: `Not a PDF (${file.mimeType})`,
          });
          skipped++;
          continue;
        }

        // Download file content
        console.log(`[migrate-from-drive] Downloading: ${file.name}`);
        const fileBuffer = await downloadFile(drive, file.id!);

        // Calculate hash
        const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

        // Check if file already exists by hash
        const existing = await query<{ ID: string }>(
          `SELECT ID FROM DOCUMENTS WHERE FILE_HASH = ? AND STATUS != 'deleted' LIMIT 1`,
          [hash]
        );

        if (existing.length > 0) {
          results.push({
            filename: file.name || "unknown",
            success: true,
            skipped: true,
            reason: `Duplicate (hash matches ${existing[0].ID})`,
          });
          skipped++;
          continue;
        }

        // Generate document ID
        const docId = await generateDocumentId(async (testId: string) => {
          const exists = await query<{ ID: string }>(
            `SELECT ID FROM DOCUMENTS WHERE ID = ?`,
            [testId]
          );
          return exists.length > 0;
        });

        // Upload to R2
        const r2Key = `to-file/${docId}.pdf`;
        await uploadToR2(r2Key, fileBuffer, "application/pdf");
        console.log(`[migrate-from-drive] Uploaded to R2: ${r2Key}`);

        // Create database record
        const filename = file.name || "unknown.pdf";
        await execute(
          `INSERT INTO DOCUMENTS (
            ID, ORIGINAL_FILENAME, FILE_PATH, FILE_SIZE_BYTES, FILE_HASH,
            STATUS, SOURCE, CREATED_AT, UPDATED_AT
          ) VALUES (?, ?, ?, ?, ?, 'uploaded', 'drive_migration', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
          [docId, filename, r2Key, fileBuffer.length, hash]
        );

        results.push({
          filename: file.name || "unknown",
          id: docId,
          success: true,
        });
        migrated++;
        console.log(`[migrate-from-drive] Created record: ${docId} for ${file.name}`);
      } catch (error) {
        console.error(`[migrate-from-drive] Error processing ${file.name}:`, error);
        results.push({
          filename: file.name || "unknown",
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        failed++;
      }
    }

    return NextResponse.json({
      folder,
      total: allFiles.length,
      processed: files.length,
      migrated,
      skipped,
      failed,
      remaining: allFiles.length - files.length,
      results,
    });
  } catch (error) {
    console.error("[migrate-from-drive] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Migration failed" },
      { status: 500 }
    );
  }
}

function getFolderId(folder: string): string | undefined {
  switch (folder) {
    case "to-file":
      return process.env.FOLDER_TO_FILE;
    case "archive-docs":
      return process.env.FOLDER_ARCHIVE_DOCS;
    case "archive-contracts":
      return process.env.FOLDER_ARCHIVE_CONTRACTS;
    default:
      return undefined;
  }
}

function getDriveClient() {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    return null;
  }

  try {
    const credentials = JSON.parse(serviceAccountKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    return google.drive({ version: "v3", auth });
  } catch {
    return null;
  }
}

async function listFilesInFolder(
  drive: ReturnType<typeof google.drive>,
  folderId: string
): Promise<Array<{ id?: string | null; name?: string | null; mimeType?: string | null; size?: string | null; createdTime?: string | null }>> {
  const files: Array<{ id?: string | null; name?: string | null; mimeType?: string | null; size?: string | null; createdTime?: string | null }> = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, createdTime)",
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (response.data.files) {
      files.push(...response.data.files);
    }
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return files;
}

async function downloadFile(
  drive: ReturnType<typeof google.drive>,
  fileId: string
): Promise<Buffer> {
  const response = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );

  return Buffer.from(response.data as ArrayBuffer);
}
