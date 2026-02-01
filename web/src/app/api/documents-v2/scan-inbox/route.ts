import { NextRequest, NextResponse } from "next/server";
import { listFilesInR2, downloadFromR2 } from "@/lib/r2";
import { query, execute } from "@/lib/snowflake";
import { createHash } from "crypto";

interface ScanResult {
  total_files: number;
  new_files: number;
  existing_files: number;
  errors: number;
  results: {
    key: string;
    status: "created" | "exists" | "error";
    id?: string;
    error?: string;
  }[];
}

// POST - Scan import/ folder and create DB records for new files
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("[scan-inbox] Starting scan of import/ folder...");

    // List all files in import/ folder
    const files = await listFilesInR2("import/", 1000);
    console.log(`[scan-inbox] Found ${files.length} files in import/`);

    if (files.length === 0) {
      return NextResponse.json({
        total_files: 0,
        new_files: 0,
        existing_files: 0,
        errors: 0,
        results: [],
      } as ScanResult);
    }

    // Get existing document IDs from file paths
    const existingDocs = await query<{ FILE_PATH: string; ID: string }>(
      `SELECT FILE_PATH, ID FROM DOCUMENTS WHERE FILE_PATH LIKE 'import/%' AND STATUS != 'deleted'`
    );

    const existingPaths = new Set(existingDocs.map((d) => d.FILE_PATH));
    console.log(`[scan-inbox] Found ${existingPaths.size} existing DB records for import/`);

    const results: ScanResult["results"] = [];
    let newCount = 0;
    let existingCount = 0;
    let errorCount = 0;

    for (const file of files) {
      // Skip non-PDF files
      if (!file.key.toLowerCase().endsWith(".pdf")) {
        console.log(`[scan-inbox] Skipping non-PDF file: ${file.key}`);
        continue;
      }

      // Check if already in DB
      if (existingPaths.has(file.key)) {
        existingCount++;
        const doc = existingDocs.find((d) => d.FILE_PATH === file.key);
        results.push({
          key: file.key,
          status: "exists",
          id: doc?.ID,
        });
        continue;
      }

      // New file - create DB record
      try {
        // Extract ID from filename (format: import/{id}.pdf)
        const filename = file.key.split("/").pop() || "";
        const id = filename.replace(/\.pdf$/i, "");

        if (!id || id.length < 5) {
          throw new Error(`Invalid filename format: ${filename}`);
        }

        // Download file to calculate hash
        console.log(`[scan-inbox] Downloading ${file.key} to calculate hash...`);
        const fileBuffer = await downloadFromR2(file.key);
        const hash = createHash("sha256").update(fileBuffer).digest("hex");

        // Check for duplicate by hash
        const duplicateCheck = await query<{ ID: string }>(
          `SELECT ID FROM DOCUMENTS WHERE FILE_HASH = ? AND STATUS != 'deleted' LIMIT 1`,
          [hash]
        );

        if (duplicateCheck.length > 0) {
          console.log(`[scan-inbox] Duplicate detected: ${file.key} -> ${duplicateCheck[0].ID}`);
          results.push({
            key: file.key,
            status: "exists",
            id: duplicateCheck[0].ID,
            error: "Duplicate file (matching hash)",
          });
          existingCount++;
          continue;
        }

        // Check if ID already exists
        const idCheck = await query<{ ID: string }>(
          `SELECT ID FROM DOCUMENTS WHERE ID = ?`,
          [id]
        );

        if (idCheck.length > 0) {
          throw new Error(`ID ${id} already exists in database`);
        }

        // Create document record
        const insertSql = `
          INSERT INTO DOCUMENTS (
            ID, ORIGINAL_FILENAME, FILE_PATH, FILE_SIZE_BYTES, FILE_HASH,
            STATUS, SOURCE, CREATED_AT, UPDATED_AT
          ) VALUES (?, ?, ?, ?, ?, 'uploaded', 'r2_scan', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
        `;

        await execute(insertSql, [id, filename, file.key, fileBuffer.length, hash]);

        console.log(`[scan-inbox] Created record for ${file.key} with ID ${id}`);
        newCount++;
        results.push({
          key: file.key,
          status: "created",
          id,
        });
      } catch (error) {
        console.error(`[scan-inbox] Error processing ${file.key}:`, error);
        errorCount++;
        results.push({
          key: file.key,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[scan-inbox] Complete in ${duration}ms: ${newCount} new, ${existingCount} existing, ${errorCount} errors`
    );

    return NextResponse.json({
      total_files: files.length,
      new_files: newCount,
      existing_files: existingCount,
      errors: errorCount,
      results,
    } as ScanResult);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[scan-inbox] Error after ${duration}ms:`, error);
    return NextResponse.json(
      {
        error: "Scan failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// GET - Show what would be found (dry run)
export async function GET(request: NextRequest) {
  try {
    console.log("[scan-inbox] Dry run: listing import/ folder...");

    // List all files in import/ folder
    const files = await listFilesInR2("import/", 1000);

    // Get existing document IDs from file paths
    const existingDocs = await query<{ FILE_PATH: string; ID: string }>(
      `SELECT FILE_PATH, ID FROM DOCUMENTS WHERE FILE_PATH LIKE 'import/%' AND STATUS != 'deleted'`
    );

    const existingPaths = new Set(existingDocs.map((d) => d.FILE_PATH));

    const pdfFiles = files.filter((f) => f.key.toLowerCase().endsWith(".pdf"));
    const newFiles = pdfFiles.filter((f) => !existingPaths.has(f.key));
    const existingFiles = pdfFiles.filter((f) => existingPaths.has(f.key));

    return NextResponse.json({
      total_files_in_r2: pdfFiles.length,
      new_files: newFiles.map((f) => ({
        key: f.key,
        size: f.size,
        lastModified: f.lastModified,
      })),
      existing_files: existingFiles.map((f) => {
        const doc = existingDocs.find((d) => d.FILE_PATH === f.key);
        return {
          key: f.key,
          id: doc?.ID,
          size: f.size,
        };
      }),
    });
  } catch (error) {
    console.error("[scan-inbox] Error:", error);
    return NextResponse.json(
      {
        error: "Scan preview failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
