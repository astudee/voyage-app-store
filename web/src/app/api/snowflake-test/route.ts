import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/snowflake";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Ensure test_input table exists
async function ensureTableExists() {
  await query(`
    CREATE TABLE IF NOT EXISTS TEST_INPUT (
      ID NUMBER AUTOINCREMENT,
      USER_TEXT VARCHAR(500),
      CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
    )
  `);
}

// GET /api/snowflake-test - Fetch recent test records
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureTableExists();

    const records = await query<{
      ID: number;
      USER_TEXT: string;
      CREATED_AT: string;
    }>(`
      SELECT ID, USER_TEXT, CREATED_AT
      FROM TEST_INPUT
      ORDER BY CREATED_AT DESC
      LIMIT 10
    `);

    return NextResponse.json({ records });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// POST /api/snowflake-test - Insert a new test record
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== "string" || text.trim() === "") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    await ensureTableExists();

    // Insert the record - escape single quotes
    const escapedText = text.replace(/'/g, "''");
    await query(`INSERT INTO TEST_INPUT (USER_TEXT) VALUES ('${escapedText}')`);

    return NextResponse.json({ success: true, message: "Record saved to Snowflake" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// DELETE /api/snowflake-test - Clear all test records
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await query(`DELETE FROM TEST_INPUT`);
    return NextResponse.json({ success: true, message: "All records deleted" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
