import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";

interface ComplianceRow {
  ID: number;
  AGENCY: string;
  DESCRIPTION: string;
  DUE_DATE: string;
  DONE: boolean;
  YEAR: number;
  NOTES: string | null;
  RECURRING: string;
  PARENT_ID: number | null;
  COMPLETED_AT: string | null;
  CREATED_AT: string;
  UPDATED_AT: string;
}

function formatRow(row: ComplianceRow) {
  return {
    id: row.ID,
    agency: row.AGENCY,
    description: row.DESCRIPTION,
    dueDate: row.DUE_DATE ? new Date(row.DUE_DATE).toISOString().split("T")[0] : null,
    done: row.DONE,
    year: row.YEAR,
    notes: row.NOTES || "",
    recurring: row.RECURRING || "annual",
    parentId: row.PARENT_ID,
    completedAt: row.COMPLETED_AT,
    createdAt: row.CREATED_AT,
    updatedAt: row.UPDATED_AT,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const itemId = parseInt(id);

  try {
    const body = await request.json();
    const { note, scheduleNext, nextDueDate } = body;

    // Get the current item first
    const existing = await query<ComplianceRow>(
      "SELECT * FROM COMPLIANCE_ITEMS WHERE ID = ?",
      [itemId]
    );
    if (existing.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const item = existing[0];
    const originalNotes = item.NOTES || "";

    // Build updated notes
    let updatedNotes = originalNotes;
    if (note) {
      updatedNotes = originalNotes
        ? `${originalNotes}\n---\nCompleted: ${note}`
        : `Completed: ${note}`;
    }

    // Mark as complete
    await execute(
      `UPDATE COMPLIANCE_ITEMS
       SET DONE = TRUE, COMPLETED_AT = CURRENT_TIMESTAMP(), NOTES = ?, UPDATED_AT = CURRENT_TIMESTAMP()
       WHERE ID = ?`,
      [updatedNotes || null, itemId]
    );

    // Fetch updated item
    const updatedRows = await query<ComplianceRow>(
      "SELECT * FROM COMPLIANCE_ITEMS WHERE ID = ?",
      [itemId]
    );

    const result: { item: ReturnType<typeof formatRow>; nextItem?: ReturnType<typeof formatRow> } = {
      item: formatRow(updatedRows[0]),
    };

    // Schedule next if requested
    if (scheduleNext && nextDueDate) {
      const nextYear = parseInt(nextDueDate.split("-")[0]);

      await execute(
        `INSERT INTO COMPLIANCE_ITEMS (AGENCY, DESCRIPTION, DUE_DATE, YEAR, NOTES, RECURRING, PARENT_ID, CREATED_AT, UPDATED_AT)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
        [item.AGENCY, item.DESCRIPTION, nextDueDate, nextYear, originalNotes || null, item.RECURRING, itemId]
      );

      // Query back the new item
      const newRows = await query<ComplianceRow>(
        `SELECT * FROM COMPLIANCE_ITEMS WHERE PARENT_ID = ? ORDER BY ID DESC LIMIT 1`,
        [itemId]
      );

      if (newRows.length > 0) {
        result.nextItem = formatRow(newRows[0]);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error completing compliance item:", error);
    return NextResponse.json({ error: "Failed to complete compliance item" }, { status: 500 });
  }
}
