import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/snowflake";

// POST - Create document record from email worker
export async function POST(request: NextRequest) {
  console.log("[from-email] Received webhook");

  // Verify authorization
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.EMAIL_WEBHOOK_SECRET;

  if (!expectedSecret) {
    console.error("[from-email] EMAIL_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${expectedSecret}`) {
    console.error("[from-email] Invalid authorization");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    console.log("[from-email] Payload:", JSON.stringify(body));

    const {
      id,
      filename,
      filePath,
      fileSize,
      source,
      sourceEmailFrom,
      sourceEmailSubject,
    } = body;

    // Validate required fields
    if (!id || !filename || !filePath) {
      return NextResponse.json(
        { error: "Missing required fields: id, filename, filePath" },
        { status: 400 }
      );
    }

    // Check if document already exists
    const existing = await query<{ ID: string }>(
      "SELECT ID FROM DOCUMENTS WHERE ID = ?",
      [id]
    );

    if (existing.length > 0) {
      console.log(`[from-email] Document ${id} already exists`);
      return NextResponse.json({ id, status: "already_exists" });
    }

    // Insert document record with status 'uploaded' (waiting for AI processing)
    const insertSql = `
      INSERT INTO DOCUMENTS (
        ID, ORIGINAL_FILENAME, FILE_PATH, FILE_SIZE_BYTES,
        STATUS, SOURCE, SOURCE_EMAIL_FROM, SOURCE_EMAIL_SUBJECT,
        CREATED_AT, UPDATED_AT
      ) VALUES (?, ?, ?, ?, 'uploaded', ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
    `;

    await execute(insertSql, [
      id,
      filename,
      filePath,
      fileSize || 0,
      source || "email",
      sourceEmailFrom || null,
      sourceEmailSubject || null,
    ]);

    console.log(`[from-email] Created document record: ${id}`);

    return NextResponse.json({
      id,
      status: "created",
      message: "Document record created, awaiting AI processing",
    });
  } catch (error) {
    console.error("[from-email] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
