import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";
import { CommissionRule } from "../route";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/commission-rules/[id] - Get one commission rule
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const rules = await query<CommissionRule>(
      `SELECT * FROM VC_COMMISSION_RULES WHERE RULE_ID = ?`,
      [parseInt(id)]
    );

    if (rules.length === 0) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    return NextResponse.json(rules[0]);
  } catch (error) {
    console.error("Error fetching commission rule:", error);
    return NextResponse.json(
      { error: "Failed to fetch commission rule" },
      { status: 500 }
    );
  }
}

// PUT /api/commission-rules/[id] - Update commission rule
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    const {
      rule_scope,
      client_or_resource,
      salesperson,
      category,
      rate,
      start_date,
      end_date,
      note,
      is_active,
    } = body;

    if (!rule_scope || !client_or_resource || !salesperson || !category || rate === undefined) {
      return NextResponse.json(
        { error: "rule_scope, client_or_resource, salesperson, category, and rate are required" },
        { status: 400 }
      );
    }

    await execute(
      `UPDATE VC_COMMISSION_RULES SET
        RULE_SCOPE = ?,
        CLIENT_OR_RESOURCE = ?,
        SALESPERSON = ?,
        CATEGORY = ?,
        RATE = ?,
        START_DATE = ?,
        END_DATE = ?,
        NOTE = ?,
        IS_ACTIVE = ?,
        UPDATED_AT = CURRENT_TIMESTAMP()
      WHERE RULE_ID = ?`,
      [
        rule_scope,
        client_or_resource,
        salesperson,
        category,
        rate,
        start_date || null,
        end_date || null,
        note || null,
        is_active ?? true,
        parseInt(id),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating commission rule:", error);
    return NextResponse.json(
      { error: "Failed to update commission rule" },
      { status: 500 }
    );
  }
}

// DELETE /api/commission-rules/[id] - Deactivate commission rule (soft delete)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await execute(
      `UPDATE VC_COMMISSION_RULES SET IS_ACTIVE = FALSE, UPDATED_AT = CURRENT_TIMESTAMP() WHERE RULE_ID = ?`,
      [parseInt(id)]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deactivating commission rule:", error);
    return NextResponse.json(
      { error: "Failed to deactivate commission rule" },
      { status: 500 }
    );
  }
}
