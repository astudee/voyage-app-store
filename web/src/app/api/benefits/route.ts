import { NextResponse } from "next/server";
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
}

// GET /api/benefits - List all benefits (used for dropdowns)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const benefits = await query<Benefit>(
      `SELECT * FROM VC_BENEFITS ORDER BY CODE`
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
