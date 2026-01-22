import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";
import { Assignment } from "../route";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/assignments/[id] - Get one assignment
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const assignments = await query<Assignment>(
      `SELECT
        a.ASSIGNMENT_ID,
        a.PROJECT_ID,
        a.STAFF_NAME,
        a.MONTH_DATE,
        a.ALLOCATED_HOURS,
        a.BILL_RATE,
        a.NOTES,
        p.PROJECT_NAME,
        p.CLIENT_NAME,
        p.PROJECT_STATUS
      FROM VC_STAFF_ASSIGNMENTS a
      LEFT JOIN VC_PROJECTS p ON a.PROJECT_ID = p.PROJECT_ID
      WHERE a.ASSIGNMENT_ID = ?`,
      [parseInt(id)]
    );

    if (assignments.length === 0) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    return NextResponse.json(assignments[0]);
  } catch (error) {
    console.error("Error fetching assignment:", error);
    return NextResponse.json(
      { error: "Failed to fetch assignment" },
      { status: 500 }
    );
  }
}

// PUT /api/assignments/[id] - Update assignment
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    const { project_id, staff_name, month_date, allocated_hours, bill_rate, notes } = body;

    if (!project_id || !staff_name || !month_date) {
      return NextResponse.json(
        { error: "project_id, staff_name, and month_date are required" },
        { status: 400 }
      );
    }

    await execute(
      `UPDATE VC_STAFF_ASSIGNMENTS SET
        PROJECT_ID = ?,
        STAFF_NAME = ?,
        MONTH_DATE = ?,
        ALLOCATED_HOURS = ?,
        BILL_RATE = ?,
        NOTES = ?,
        UPDATED_AT = CURRENT_TIMESTAMP()
      WHERE ASSIGNMENT_ID = ?`,
      [
        project_id,
        staff_name,
        month_date,
        allocated_hours || 0,
        bill_rate || 0,
        notes || null,
        parseInt(id),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating assignment:", error);
    return NextResponse.json(
      { error: "Failed to update assignment" },
      { status: 500 }
    );
  }
}

// DELETE /api/assignments/[id] - Delete assignment (hard delete)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await execute(
      `DELETE FROM VC_STAFF_ASSIGNMENTS WHERE ASSIGNMENT_ID = ?`,
      [parseInt(id)]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting assignment:", error);
    return NextResponse.json(
      { error: "Failed to delete assignment" },
      { status: 500 }
    );
  }
}
