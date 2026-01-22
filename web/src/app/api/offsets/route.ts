import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

export interface Offset {
  OFFSET_ID: number;
  EFFECTIVE_DATE: string;
  SALESPERSON: string;
  CATEGORY: string;
  AMOUNT: number;
  NOTE: string | null;
}

// GET /api/offsets - List all offsets
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const offsets = await query<Offset>(
      `SELECT * FROM VC_COMMISSION_OFFSETS ORDER BY EFFECTIVE_DATE DESC, SALESPERSON`
    );
    return NextResponse.json(offsets);
  } catch (error) {
    console.error("Error fetching offsets:", error);
    return NextResponse.json(
      { error: "Failed to fetch offsets" },
      { status: 500 }
    );
  }
}

// POST /api/offsets - Create a new offset
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const result = await query<{ OFFSET_ID: number }>(
      `INSERT INTO VC_COMMISSION_OFFSETS (
        EFFECTIVE_DATE, SALESPERSON, CATEGORY, AMOUNT, NOTE,
        CREATED_AT, UPDATED_AT
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
      RETURNING OFFSET_ID`,
      [
        body.effective_date,
        body.salesperson,
        body.category,
        body.amount,
        body.note || null,
      ]
    );

    return NextResponse.json({ offset_id: result[0].OFFSET_ID }, { status: 201 });
  } catch (error) {
    console.error("Error creating offset:", error);
    return NextResponse.json(
      { error: "Failed to create offset" },
      { status: 500 }
    );
  }
}
