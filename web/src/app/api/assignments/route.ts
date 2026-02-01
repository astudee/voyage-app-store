import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

export interface Assignment {
  ASSIGNMENT_ID: number;
  PROJECT_ID: number;
  STAFF_NAME: string;
  MONTH_DATE: string;
  ALLOCATED_HOURS: number;
  BILL_RATE: number;
  NOTES: string | null;
  // Joined from VC_PROJECTS
  PROJECT_NAME?: string;
  CLIENT_NAME?: string;
  PROJECT_STATUS?: string;
}

// GET /api/assignments - List assignments with optional project filter
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get("projectId");

  try {
    let sql = `
      SELECT
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
    `;

    const params: (string | number)[] = [];

    if (projectId) {
      sql += ` WHERE a.PROJECT_ID = ?`;
      params.push(parseInt(projectId));
    }

    sql += ` ORDER BY a.PROJECT_ID, a.STAFF_NAME, a.MONTH_DATE`;

    const assignments = await query<Assignment>(sql, params);
    return NextResponse.json(assignments);
  } catch (error) {
    console.error("Error fetching assignments:", error);
    return NextResponse.json(
      { error: "Failed to fetch assignments" },
      { status: 500 }
    );
  }
}

// POST /api/assignments - Create a new assignment
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const { project_id, staff_name, month_date, allocated_hours, bill_rate, notes } = body;

    if (!project_id || !staff_name || !month_date) {
      return NextResponse.json(
        { error: `Missing required fields: ${!project_id ? 'project_id ' : ''}${!staff_name ? 'staff_name ' : ''}${!month_date ? 'month_date' : ''}`.trim() },
        { status: 400 }
      );
    }

    // Insert the record (Snowflake doesn't support RETURNING)
    await query(
      `INSERT INTO VC_STAFF_ASSIGNMENTS (
        PROJECT_ID, STAFF_NAME, MONTH_DATE, ALLOCATED_HOURS, BILL_RATE, NOTES,
        CREATED_AT, UPDATED_AT
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
      [
        project_id,
        staff_name,
        month_date,
        allocated_hours || 0,
        bill_rate || 0,
        notes || null,
      ]
    );

    // Query back to get the assignment ID using the unique key
    const result = await query<{ ASSIGNMENT_ID: number }>(
      `SELECT ASSIGNMENT_ID FROM VC_STAFF_ASSIGNMENTS
       WHERE PROJECT_ID = ? AND STAFF_NAME = ? AND MONTH_DATE = ?`,
      [project_id, staff_name, month_date]
    );

    const assignmentId = result[0]?.ASSIGNMENT_ID;
    return NextResponse.json({ assignment_id: assignmentId }, { status: 201 });
  } catch (error) {
    console.error("Error creating assignment:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to create assignment: ${errorMessage}` },
      { status: 500 }
    );
  }
}
