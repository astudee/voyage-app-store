import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";
import { ensureTable, getAllDirectory, toClientEntries } from "@/lib/phone-directory";

// GET /api/phone/directory - List all directory entries
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await getAllDirectory();
    return NextResponse.json(toClientEntries(rows));
  } catch (error) {
    console.error("[phone/directory] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch directory" },
      { status: 500 }
    );
  }
}

// POST /api/phone/directory - Create a new directory entry
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();

  try {
    const body = await request.json();
    const { extension, firstName, lastName, title, number, aliases } = body;

    if (!extension || !firstName || !lastName || !number) {
      return NextResponse.json(
        { error: "extension, firstName, lastName, and number are required" },
        { status: 400 }
      );
    }

    // Check for duplicate extension
    const existing = await query(
      `SELECT DIRECTORY_ID FROM VC_PHONE_DIRECTORY WHERE EXTENSION = ? AND IS_ACTIVE = TRUE`,
      [extension]
    );
    if (existing.length > 0) {
      return NextResponse.json(
        { error: `Extension ${extension} is already in use` },
        { status: 409 }
      );
    }

    await execute(
      `INSERT INTO VC_PHONE_DIRECTORY (EXTENSION, FIRST_NAME, LAST_NAME, TITLE, PHONE_NUMBER, ALIASES, IS_ACTIVE)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [
        extension,
        firstName,
        lastName,
        title || null,
        number,
        aliases || null,
      ]
    );

    // Query back the created record
    const rows = await query(
      `SELECT * FROM VC_PHONE_DIRECTORY WHERE EXTENSION = ? AND FIRST_NAME = ? AND LAST_NAME = ? ORDER BY DIRECTORY_ID DESC LIMIT 1`,
      [extension, firstName, lastName]
    );

    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    console.error("[phone/directory] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create entry" },
      { status: 500 }
    );
  }
}
