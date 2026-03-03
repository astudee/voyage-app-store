import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";
import { ensureTable } from "@/lib/phone-directory";

// GET /api/phone/directory/[id] - Get a single directory entry
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();
  const { id } = await params;

  try {
    const rows = await query(
      `SELECT * FROM VC_PHONE_DIRECTORY WHERE DIRECTORY_ID = ?`,
      [Number(id)]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error("[phone/directory] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch entry" },
      { status: 500 }
    );
  }
}

// PUT /api/phone/directory/[id] - Update a directory entry
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();
  const { id } = await params;

  try {
    const body = await request.json();
    const { extension, firstName, lastName, title, number, aliases, isActive } = body;

    // Check entry exists
    const existing = await query(
      `SELECT * FROM VC_PHONE_DIRECTORY WHERE DIRECTORY_ID = ?`,
      [Number(id)]
    );
    if (existing.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Check extension uniqueness if changing
    if (extension) {
      const extCheck = await query(
        `SELECT DIRECTORY_ID FROM VC_PHONE_DIRECTORY WHERE EXTENSION = ? AND DIRECTORY_ID != ? AND IS_ACTIVE = TRUE`,
        [extension, Number(id)]
      );
      if (extCheck.length > 0) {
        return NextResponse.json(
          { error: `Extension ${extension} is already in use` },
          { status: 409 }
        );
      }
    }

    // Build dynamic update
    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];

    if (extension !== undefined) { updates.push("EXTENSION = ?"); values.push(extension); }
    if (firstName !== undefined) { updates.push("FIRST_NAME = ?"); values.push(firstName); }
    if (lastName !== undefined) { updates.push("LAST_NAME = ?"); values.push(lastName); }
    if (title !== undefined) { updates.push("TITLE = ?"); values.push(title || null); }
    if (number !== undefined) { updates.push("PHONE_NUMBER = ?"); values.push(number); }
    if (aliases !== undefined) { updates.push("ALIASES = ?"); values.push(aliases || null); }
    if (isActive !== undefined) { updates.push("IS_ACTIVE = ?"); values.push(isActive); }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    updates.push("UPDATED_AT = CURRENT_TIMESTAMP()");
    values.push(Number(id));

    await execute(
      `UPDATE VC_PHONE_DIRECTORY SET ${updates.join(", ")} WHERE DIRECTORY_ID = ?`,
      values
    );

    // Query back updated record
    const rows = await query(
      `SELECT * FROM VC_PHONE_DIRECTORY WHERE DIRECTORY_ID = ?`,
      [Number(id)]
    );

    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error("[phone/directory] PUT error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update entry" },
      { status: 500 }
    );
  }
}

// DELETE /api/phone/directory/[id] - Delete (deactivate) a directory entry
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();
  const { id } = await params;

  try {
    const existing = await query(
      `SELECT * FROM VC_PHONE_DIRECTORY WHERE DIRECTORY_ID = ?`,
      [Number(id)]
    );
    if (existing.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Hard delete
    await execute(
      `DELETE FROM VC_PHONE_DIRECTORY WHERE DIRECTORY_ID = ?`,
      [Number(id)]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[phone/directory] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete entry" },
      { status: 500 }
    );
  }
}
