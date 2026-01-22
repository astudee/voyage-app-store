import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

export interface ClientNameMapping {
  MAPPING_ID: number;
  BEFORE_NAME: string;
  AFTER_NAME: string;
  SOURCE_SYSTEM: string;
  IS_ACTIVE: boolean;
}

// GET /api/mapping - List all mappings
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const mappings = await query<ClientNameMapping>(
      `SELECT * FROM VC_CLIENT_NAME_MAPPING ORDER BY SOURCE_SYSTEM, BEFORE_NAME`
    );
    return NextResponse.json(mappings);
  } catch (error) {
    console.error("Error fetching mappings:", error);
    return NextResponse.json(
      { error: "Failed to fetch mappings" },
      { status: 500 }
    );
  }
}

// POST /api/mapping - Create a new mapping
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const result = await query<{ MAPPING_ID: number }>(
      `INSERT INTO VC_CLIENT_NAME_MAPPING (
        BEFORE_NAME, AFTER_NAME, SOURCE_SYSTEM, IS_ACTIVE,
        CREATED_AT, UPDATED_AT
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
      RETURNING MAPPING_ID`,
      [
        body.before_name,
        body.after_name,
        body.source_system,
        body.is_active ?? true,
      ]
    );

    return NextResponse.json({ mapping_id: result[0].MAPPING_ID }, { status: 201 });
  } catch (error) {
    console.error("Error creating mapping:", error);
    return NextResponse.json(
      { error: "Failed to create mapping" },
      { status: 500 }
    );
  }
}
