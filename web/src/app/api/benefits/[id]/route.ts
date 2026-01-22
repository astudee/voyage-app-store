import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";
import { Benefit } from "../route";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/benefits/[id] - Get one benefit
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const benefits = await query<Benefit>(
      `SELECT * FROM VC_BENEFITS WHERE BENEFIT_ID = ?`,
      [parseInt(id)]
    );

    if (benefits.length === 0) {
      return NextResponse.json({ error: "Benefit not found" }, { status: 404 });
    }

    return NextResponse.json(benefits[0]);
  } catch (error) {
    console.error("Error fetching benefit:", error);
    return NextResponse.json(
      { error: "Failed to fetch benefit" },
      { status: 500 }
    );
  }
}

// PUT /api/benefits/[id] - Update benefit
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    const {
      description,
      code,
      benefit_type,
      is_formula_based,
      total_monthly_cost,
      ee_monthly_cost,
      firm_monthly_cost,
      coverage_percentage,
      max_weekly_benefit,
      max_monthly_benefit,
      rate_per_unit,
      is_active,
    } = body;

    if (!description || !code || !benefit_type) {
      return NextResponse.json(
        { error: "description, code, and benefit_type are required" },
        { status: 400 }
      );
    }

    await execute(
      `UPDATE VC_BENEFITS SET
        DESCRIPTION = ?,
        CODE = ?,
        BENEFIT_TYPE = ?,
        IS_FORMULA_BASED = ?,
        TOTAL_MONTHLY_COST = ?,
        EE_MONTHLY_COST = ?,
        FIRM_MONTHLY_COST = ?,
        COVERAGE_PERCENTAGE = ?,
        MAX_WEEKLY_BENEFIT = ?,
        MAX_MONTHLY_BENEFIT = ?,
        RATE_PER_UNIT = ?,
        IS_ACTIVE = ?,
        UPDATED_AT = CURRENT_TIMESTAMP()
      WHERE BENEFIT_ID = ?`,
      [
        description,
        code,
        benefit_type,
        is_formula_based ?? false,
        total_monthly_cost ?? null,
        ee_monthly_cost ?? null,
        firm_monthly_cost ?? null,
        coverage_percentage ?? null,
        max_weekly_benefit ?? null,
        max_monthly_benefit ?? null,
        rate_per_unit ?? null,
        is_active ?? true,
        parseInt(id),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating benefit:", error);
    return NextResponse.json(
      { error: "Failed to update benefit" },
      { status: 500 }
    );
  }
}

// DELETE /api/benefits/[id] - Deactivate benefit (soft delete)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await execute(
      `UPDATE VC_BENEFITS SET IS_ACTIVE = FALSE, UPDATED_AT = CURRENT_TIMESTAMP() WHERE BENEFIT_ID = ?`,
      [parseInt(id)]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deactivating benefit:", error);
    return NextResponse.json(
      { error: "Failed to deactivate benefit" },
      { status: 500 }
    );
  }
}
