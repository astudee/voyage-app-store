import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

export interface CommissionRule {
  RULE_ID: number;
  RULE_SCOPE: string;
  CLIENT_OR_RESOURCE: string;
  SALESPERSON: string;
  CATEGORY: string;
  RATE: number;
  START_DATE: string | null;
  END_DATE: string | null;
  NOTE: string | null;
  IS_ACTIVE: boolean;
}

// GET /api/commission-rules - List all commission rules
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rules = await query<CommissionRule>(
      `SELECT * FROM VC_COMMISSION_RULES ORDER BY SALESPERSON, CLIENT_OR_RESOURCE, START_DATE`
    );
    return NextResponse.json(rules);
  } catch (error) {
    console.error("Error fetching commission rules:", error);
    return NextResponse.json(
      { error: "Failed to fetch commission rules" },
      { status: 500 }
    );
  }
}

// POST /api/commission-rules - Create a new commission rule
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const result = await query<{ RULE_ID: number }>(
      `INSERT INTO VC_COMMISSION_RULES (
        RULE_SCOPE, CLIENT_OR_RESOURCE, SALESPERSON, CATEGORY, RATE,
        START_DATE, END_DATE, NOTE, IS_ACTIVE, CREATED_AT, UPDATED_AT
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
      RETURNING RULE_ID`,
      [
        body.rule_scope,
        body.client_or_resource,
        body.salesperson,
        body.category,
        body.rate,
        body.start_date || null,
        body.end_date || null,
        body.note || null,
        body.is_active ?? true,
      ]
    );

    return NextResponse.json({ rule_id: result[0].RULE_ID }, { status: 201 });
  } catch (error) {
    console.error("Error creating commission rule:", error);
    return NextResponse.json(
      { error: "Failed to create commission rule" },
      { status: 500 }
    );
  }
}
