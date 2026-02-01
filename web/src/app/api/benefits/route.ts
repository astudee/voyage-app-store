import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

export interface Benefit {
  BENEFIT_ID: number;
  DESCRIPTION: string;
  CODE: string;
  BENEFIT_TYPE: string;
  IS_FORMULA_BASED: boolean;
  TOTAL_MONTHLY_COST: number | null;
  EE_MONTHLY_COST: number | null;
  FIRM_MONTHLY_COST: number | null;
  COVERAGE_PERCENTAGE: number | null;
  MAX_WEEKLY_BENEFIT: number | null;
  MAX_MONTHLY_BENEFIT: number | null;
  RATE_PER_UNIT: number | null;
  IS_ACTIVE: boolean;
}

// GET /api/benefits - List all benefits (used for dropdowns)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const benefits = await query<Benefit>(
      `SELECT * FROM VC_BENEFITS ORDER BY BENEFIT_TYPE, CODE`
    );
    return NextResponse.json(benefits);
  } catch (error) {
    console.error("Error fetching benefits:", error);
    return NextResponse.json(
      { error: "Failed to fetch benefits" },
      { status: 500 }
    );
  }
}

// POST /api/benefits - Create a new benefit
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Insert the record (Snowflake doesn't support RETURNING)
    await query(
      `INSERT INTO VC_BENEFITS (
        DESCRIPTION, CODE, BENEFIT_TYPE, IS_FORMULA_BASED,
        TOTAL_MONTHLY_COST, EE_MONTHLY_COST, FIRM_MONTHLY_COST,
        COVERAGE_PERCENTAGE, MAX_WEEKLY_BENEFIT, MAX_MONTHLY_BENEFIT,
        RATE_PER_UNIT, IS_ACTIVE, CREATED_AT, UPDATED_AT
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
      [
        body.description,
        body.code,
        body.benefit_type,
        body.is_formula_based ?? false,
        body.total_monthly_cost,
        body.ee_monthly_cost,
        body.firm_monthly_cost,
        body.coverage_percentage,
        body.max_weekly_benefit,
        body.max_monthly_benefit,
        body.rate_per_unit,
        body.is_active ?? true,
      ]
    );

    // Query back for the ID using the unique CODE field
    const result = await query<{ BENEFIT_ID: number }>(
      `SELECT BENEFIT_ID FROM VC_BENEFITS WHERE CODE = ?`,
      [body.code]
    );

    return NextResponse.json({ benefit_id: result[0]?.BENEFIT_ID }, { status: 201 });
  } catch (error) {
    console.error("Error creating benefit:", error);
    return NextResponse.json(
      { error: "Failed to create benefit" },
      { status: 500 }
    );
  }
}
