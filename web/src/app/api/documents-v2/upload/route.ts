import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { query, execute } from "@/lib/snowflake";
import { createHash, randomUUID } from "crypto";

// POST - Upload a file to R2 and create document record
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const source = (formData.get("source") as string) || "upload";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

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
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG` },
        { status: 400 }
      );
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Calculate SHA-256 hash
    const hash = createHash("sha256").update(buffer).digest("hex");

    // Check for duplicate by hash
    const duplicateCheck = await query<{ ID: string; ORIGINAL_FILENAME: string }>(
      `SELECT ID, ORIGINAL_FILENAME FROM DOCUMENTS WHERE FILE_HASH = ? AND STATUS != 'deleted' LIMIT 1`,
      [hash]
    );

    if (duplicateCheck.length > 0) {
      return NextResponse.json(
        {
          error: "Duplicate file detected",
          duplicate_of_id: duplicateCheck[0].ID,
          duplicate_filename: duplicateCheck[0].ORIGINAL_FILENAME,
        },
        { status: 409 }
      );
    }

    // Generate UUID for file storage
    const fileId = randomUUID();
    const fileExtension = getFileExtension(file.name);
    const filePath = `to-file/${fileId}${fileExtension}`;

    // Upload to R2
    await uploadToR2(filePath, buffer, file.type);

    // Create document record in Snowflake
    const insertSql = `
      INSERT INTO DOCUMENTS (
        ID, ORIGINAL_FILENAME, FILE_PATH, FILE_SIZE_BYTES, FILE_HASH,
        STATUS, SOURCE, CREATED_AT, UPDATED_AT
      ) VALUES (?, ?, ?, ?, ?, 'pending_review', ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
    `;

    await execute(insertSql, [
      fileId,
      file.name,
      filePath,
      buffer.length,
      hash,
      source,
    ]);

    return NextResponse.json(
      {
        id: fileId,
        original_filename: file.name,
        file_path: filePath,
        file_size_bytes: buffer.length,
        file_hash: hash,
        status: "pending_review",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error uploading document:", error);
    return NextResponse.json(
      { error: "Failed to upload document" },
      { status: 500 }
    );
  }
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}
