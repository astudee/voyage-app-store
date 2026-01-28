import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";

interface ClientStateMapping {
  CLIENT_NAME: string;
  YEAR: number;
  STATE_CODE: string;
  CREATED_AT: string;
  UPDATED_AT: string;
}

// Ensure table exists
async function ensureTableExists() {
  await query(`
    CREATE TABLE IF NOT EXISTS VC_CLIENT_STATE_MAPPING (
      CLIENT_NAME VARCHAR(200) NOT NULL,
      YEAR NUMBER(4) NOT NULL,
      STATE_CODE VARCHAR(2) NOT NULL,
      CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
      UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
      PRIMARY KEY (CLIENT_NAME, YEAR)
    )
  `);
}

// GET - List all mappings for a year
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());

  try {
    await ensureTableExists();

    const mappings = await query<ClientStateMapping>(`
      SELECT CLIENT_NAME, YEAR, STATE_CODE, CREATED_AT, UPDATED_AT
      FROM VC_CLIENT_STATE_MAPPING
      WHERE YEAR = ?
      ORDER BY CLIENT_NAME
    `, [year]);

    // Convert to a map for easy lookup
    const stateMap: Record<string, string> = {};
    for (const m of mappings) {
      stateMap[m.CLIENT_NAME] = m.STATE_CODE;
    }

    return NextResponse.json({
      year,
      mappings,
      stateMap,
    });
  } catch (error) {
    console.error("Client state mapping error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// POST - Create or update a mapping (upsert)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { clientName, year, stateCode } = body;

    if (!clientName || !year) {
      return NextResponse.json({ error: "clientName and year are required" }, { status: 400 });
    }

    await ensureTableExists();

    if (!stateCode || stateCode === "") {
      // Delete the mapping if state is cleared
      await execute(`
        DELETE FROM VC_CLIENT_STATE_MAPPING
        WHERE CLIENT_NAME = ? AND YEAR = ?
      `, [clientName, year]);

      return NextResponse.json({ success: true, deleted: true });
    }

    // Validate state code
    if (!/^[A-Z]{2}$/.test(stateCode)) {
      return NextResponse.json({ error: "State code must be 2 uppercase letters" }, { status: 400 });
    }

    // Use MERGE for upsert
    await query(`
      MERGE INTO VC_CLIENT_STATE_MAPPING AS target
      USING (SELECT ? AS CLIENT_NAME, ? AS YEAR, ? AS STATE_CODE) AS source
      ON target.CLIENT_NAME = source.CLIENT_NAME AND target.YEAR = source.YEAR
      WHEN MATCHED THEN
        UPDATE SET STATE_CODE = source.STATE_CODE, UPDATED_AT = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN
        INSERT (CLIENT_NAME, YEAR, STATE_CODE)
        VALUES (source.CLIENT_NAME, source.YEAR, source.STATE_CODE)
    `, [clientName, year, stateCode]);

    return NextResponse.json({ success: true, clientName, year, stateCode });
  } catch (error) {
    console.error("Client state mapping save error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
