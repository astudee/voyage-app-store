import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";
import { Offset } from "../route";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/offsets/[id] - Get one offset
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const offsets = await query<Offset>(
      `SELECT * FROM VC_COMMISSION_OFFSETS WHERE OFFSET_ID = ?`,
      [parseInt(id)]
    );

    if (offsets.length === 0) {
      return NextResponse.json({ error: "Offset not found" }, { status: 404 });
    }

    return NextResponse.json(offsets[0]);
  } catch (error) {
    console.error("Error fetching offset:", error);
    return NextResponse.json(
      { error: "Failed to fetch offset" },
      { status: 500 }
    );
  }
}

// PUT /api/offsets/[id] - Update offset
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    const {
      effective_date,
      salesperson,
      category,
      amount,
      note,
    } = body;

    if (!effective_date || !salesperson || !category || amount === undefined) {
      return NextResponse.json(
        { error: "effective_date, salesperson, category, and amount are required" },
        { status: 400 }
      );
    }

    await execute(
      `UPDATE VC_COMMISSION_OFFSETS SET
        EFFECTIVE_DATE = ?,
        SALESPERSON = ?,
        CATEGORY = ?,
        AMOUNT = ?,
        NOTE = ?,
        UPDATED_AT = CURRENT_TIMESTAMP()
      WHERE OFFSET_ID = ?`,
      [
        effective_date,
        salesperson,
        category,
        amount,
        note || null,
        parseInt(id),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating offset:", error);
    return NextResponse.json(
      { error: "Failed to update offset" },
      { status: 500 }
    );
  }
}

// DELETE /api/offsets/[id] - Delete offset (hard delete)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await execute(
      `DELETE FROM VC_COMMISSION_OFFSETS WHERE OFFSET_ID = ?`,
      [parseInt(id)]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting offset:", error);
    return NextResponse.json(
      { error: "Failed to delete offset" },
      { status: 500 }
    );
  }
}
