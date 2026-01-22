import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";

interface BulkAssignment {
  assignment_id?: number; // If present, update; if absent, create
  project_id: number;
  staff_name: string;
  month_date: string;
  allocated_hours: number;
  bill_rate: number;
  notes?: string | null;
}

interface BulkDeleteRequest {
  assignment_ids: number[];
}

// POST /api/assignments/bulk - Bulk create/update assignments
// Useful for saving an entire staff row in the grid
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const assignments: BulkAssignment[] = body.assignments;

    if (!assignments || !Array.isArray(assignments)) {
      return NextResponse.json(
        { error: "assignments array is required" },
        { status: 400 }
      );
    }

    const results: { assignment_id: number; action: "created" | "updated" }[] = [];

    for (const assignment of assignments) {
      const { assignment_id, project_id, staff_name, month_date, allocated_hours, bill_rate, notes } = assignment;

      if (!project_id || !staff_name || !month_date) {
        continue; // Skip invalid entries
      }

      if (assignment_id) {
        // Update existing
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
            assignment_id,
          ]
        );
        results.push({ assignment_id, action: "updated" });
      } else {
        // Create new
        const result = await query<{ ASSIGNMENT_ID: number }>(
          `INSERT INTO VC_STAFF_ASSIGNMENTS (
            PROJECT_ID, STAFF_NAME, MONTH_DATE, ALLOCATED_HOURS, BILL_RATE, NOTES,
            CREATED_AT, UPDATED_AT
          ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
          RETURNING ASSIGNMENT_ID`,
          [
            project_id,
            staff_name,
            month_date,
            allocated_hours || 0,
            bill_rate || 0,
            notes || null,
          ]
        );
        results.push({ assignment_id: result[0].ASSIGNMENT_ID, action: "created" });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Error in bulk assignment operation:", error);
    return NextResponse.json(
      { error: "Failed to process bulk assignments" },
      { status: 500 }
    );
  }
}

// DELETE /api/assignments/bulk - Bulk delete assignments
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: BulkDeleteRequest = await request.json();
    const { assignment_ids } = body;

    if (!assignment_ids || !Array.isArray(assignment_ids) || assignment_ids.length === 0) {
      return NextResponse.json(
        { error: "assignment_ids array is required" },
        { status: 400 }
      );
    }

    // Delete all specified assignments
    const placeholders = assignment_ids.map(() => "?").join(", ");
    await execute(
      `DELETE FROM VC_STAFF_ASSIGNMENTS WHERE ASSIGNMENT_ID IN (${placeholders})`,
      assignment_ids
    );

    return NextResponse.json({ success: true, deleted: assignment_ids.length });
  } catch (error) {
    console.error("Error in bulk delete operation:", error);
    return NextResponse.json(
      { error: "Failed to delete assignments" },
      { status: 500 }
    );
  }
}
