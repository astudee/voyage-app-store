import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

export interface FixedFeeRevenue {
  REVENUE_ID: number;
  PROJECT_ID: number;
  MONTH_DATE: string;
  REVENUE_AMOUNT: number;
  PROJECT_NAME?: string;
  CLIENT_NAME?: string;
}

// GET /api/fixed-fee - List all fixed fee revenue entries with project names
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const revenues = await query<FixedFeeRevenue>(
      `SELECT
        f.REVENUE_ID,
        f.PROJECT_ID,
        f.MONTH_DATE,
        f.REVENUE_AMOUNT,
        p.PROJECT_NAME,
        p.CLIENT_NAME
      FROM VC_FIXED_FEE_REVENUE f
      LEFT JOIN VC_PROJECTS p ON f.PROJECT_ID = p.PROJECT_ID
      ORDER BY f.PROJECT_ID, f.MONTH_DATE`
    );
    return NextResponse.json(revenues);
  } catch (error) {
    console.error("Error fetching fixed fee revenues:", error);
    return NextResponse.json(
      { error: "Failed to fetch fixed fee revenues" },
      { status: 500 }
    );
  }
}

// POST /api/fixed-fee - Create a new fixed fee revenue entry
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Insert the record (Snowflake doesn't support RETURNING)
    await query(
      `INSERT INTO VC_FIXED_FEE_REVENUE (
        PROJECT_ID, MONTH_DATE, REVENUE_AMOUNT,
        CREATED_AT, UPDATED_AT
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
      [
        body.project_id,
        body.month_date,
        body.revenue_amount,
      ]
    );

    // Query back for the ID using the unique PROJECT_ID + MONTH_DATE combination
    const result = await query<{ REVENUE_ID: number }>(
      `SELECT REVENUE_ID FROM VC_FIXED_FEE_REVENUE WHERE PROJECT_ID = ? AND MONTH_DATE = ?`,
      [body.project_id, body.month_date]
    );

    return NextResponse.json({ revenue_id: result[0]?.REVENUE_ID }, { status: 201 });
  } catch (error) {
    console.error("Error creating fixed fee revenue:", error);
    return NextResponse.json(
      { error: "Failed to create fixed fee revenue" },
      { status: 500 }
    );
  }
}
