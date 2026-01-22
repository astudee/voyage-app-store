import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";
import { FixedFeeRevenue } from "../route";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/fixed-fee/[id] - Get one fixed fee revenue entry
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

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
      WHERE f.REVENUE_ID = ?`,
      [parseInt(id)]
    );

    if (revenues.length === 0) {
      return NextResponse.json({ error: "Revenue entry not found" }, { status: 404 });
    }

    return NextResponse.json(revenues[0]);
  } catch (error) {
    console.error("Error fetching fixed fee revenue:", error);
    return NextResponse.json(
      { error: "Failed to fetch fixed fee revenue" },
      { status: 500 }
    );
  }
}

// PUT /api/fixed-fee/[id] - Update fixed fee revenue entry
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    const { project_id, month_date, revenue_amount } = body;

    if (!project_id || !month_date || revenue_amount === undefined) {
      return NextResponse.json(
        { error: "project_id, month_date, and revenue_amount are required" },
        { status: 400 }
      );
    }

    await execute(
      `UPDATE VC_FIXED_FEE_REVENUE SET
        PROJECT_ID = ?,
        MONTH_DATE = ?,
        REVENUE_AMOUNT = ?,
        UPDATED_AT = CURRENT_TIMESTAMP()
      WHERE REVENUE_ID = ?`,
      [
        project_id,
        month_date,
        revenue_amount,
        parseInt(id),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating fixed fee revenue:", error);
    return NextResponse.json(
      { error: "Failed to update fixed fee revenue" },
      { status: 500 }
    );
  }
}

// DELETE /api/fixed-fee/[id] - Delete fixed fee revenue entry (hard delete)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await execute(
      `DELETE FROM VC_FIXED_FEE_REVENUE WHERE REVENUE_ID = ?`,
      [parseInt(id)]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting fixed fee revenue:", error);
    return NextResponse.json(
      { error: "Failed to delete fixed fee revenue" },
      { status: 500 }
    );
  }
}
