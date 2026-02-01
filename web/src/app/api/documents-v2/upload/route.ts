import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { query, execute } from "@/lib/snowflake";
import { createHash } from "crypto";
import { generateDocumentId } from "@/lib/nanoid";

// POST - Upload a file to R2 and create document record
// Note: AI processing is no longer done automatically - use POST /api/documents-v2/process
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let fileId = "";
  let filePath = "";

  try {
    console.log("[upload] Starting file upload...");

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const source = (formData.get("source") as string) || "upload";

    if (!file) {
      console.log("[upload] Error: No file provided");
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    console.log(`[upload] File received: ${file.name}, type: ${file.type}, size: ${file.size}`);

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "image/png",
      "image/jpeg",
    ];

    if (!allowedTypes.includes(file.type)) {
      console.log(`[upload] Error: Invalid file type: ${file.type}`);
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG` },
        { status: 400 }
      );
    }

    // Read file content
    console.log("[upload] Reading file content...");
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Calculate SHA-256 hash
    const hash = createHash("sha256").update(buffer).digest("hex");
    console.log(`[upload] File hash: ${hash.substring(0, 16)}...`);

    // Check for duplicate by hash
    console.log("[upload] Checking for duplicates...");
    try {
      const duplicateCheck = await query<{ ID: string; ORIGINAL_FILENAME: string }>(
        `SELECT ID, ORIGINAL_FILENAME FROM DOCUMENTS WHERE FILE_HASH = ? AND STATUS != 'deleted' LIMIT 1`,
        [hash]
      );

      if (duplicateCheck.length > 0) {
        console.log(`[upload] Duplicate found: ${duplicateCheck[0].ID}`);
        return NextResponse.json(
          {
            error: "Duplicate file detected",
            duplicate_of_id: duplicateCheck[0].ID,
            duplicate_filename: duplicateCheck[0].ORIGINAL_FILENAME,
          },
          { status: 409 }
        );
      }
    } catch (dbError) {
      console.error("[upload] Error checking duplicates:", dbError);
      // Continue anyway - table might not exist yet or other issue
    }

    // Generate NanoID for file storage (10-char alphanumeric)
    fileId = await generateDocumentId(async (testId: string) => {
      const exists = await query<{ ID: string }>(
        `SELECT ID FROM DOCUMENTS WHERE ID = ?`,
        [testId]
      );
      return exists.length > 0;
    });

    const fileExtension = getFileExtension(file.name);
    filePath = `to-file/${fileId}${fileExtension}`;
    console.log(`[upload] Generated file path: ${filePath}`);

    // Upload to R2
    console.log("[upload] Uploading to R2...");
    try {
      await uploadToR2(filePath, buffer, file.type);
      console.log("[upload] R2 upload successful");
    } catch (r2Error) {
      console.error("[upload] R2 upload failed:", r2Error);
      const errorMessage = r2Error instanceof Error ? r2Error.message : String(r2Error);
      return NextResponse.json(
        { error: `R2 upload failed: ${errorMessage}` },
        { status: 500 }
      );
    }

    // Create document record in Snowflake with status='uploaded'
    // Note: IS_CONTRACT is null - will be set by AI processing later
    console.log("[upload] Creating Snowflake record...");
    try {
      const insertSql = `
        INSERT INTO DOCUMENTS (
          ID, ORIGINAL_FILENAME, FILE_PATH, FILE_SIZE_BYTES, FILE_HASH,
          STATUS, SOURCE, CREATED_AT, UPDATED_AT
        ) VALUES (?, ?, ?, ?, ?, 'uploaded', ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
      `;

      await execute(insertSql, [
        fileId,
        file.name,
        filePath,
        buffer.length,
        hash,
        source,
      ]);
      console.log("[upload] Snowflake record created");
    } catch (dbError) {
      console.error("[upload] Snowflake insert failed:", dbError);
      const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);

      // Try to clean up the R2 file since DB insert failed
      try {
        const { deleteFromR2 } = await import("@/lib/r2");
        await deleteFromR2(filePath);
        console.log("[upload] Cleaned up R2 file after DB failure");
      } catch (cleanupError) {
        console.error("[upload] Failed to cleanup R2 file:", cleanupError);
      }

      return NextResponse.json(
        { error: `Database insert failed: ${errorMessage}` },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;
    console.log(`[upload] Upload complete in ${duration}ms`);

    return NextResponse.json(
      {
        id: fileId,
        original_filename: file.name,
        file_path: filePath,
        file_size_bytes: buffer.length,
        file_hash: hash,
        status: "uploaded",
        source,
      },
      { status: 201 }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[upload] Unexpected error after ${duration}ms:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    return NextResponse.json(
      {
        error: "Failed to upload document",
        details: errorMessage,
        stack: process.env.NODE_ENV === "development" ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}
