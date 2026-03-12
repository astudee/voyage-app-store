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

  try {
    await execute(
      `UPDATE COMPLIANCE_ITEMS
       SET DONE = FALSE, COMPLETED_AT = NULL, UPDATED_AT = CURRENT_TIMESTAMP()
       WHERE ID = ?`,
      [parseInt(id)]
    );

    const rows = await query<ComplianceRow>(
      "SELECT * FROM COMPLIANCE_ITEMS WHERE ID = ?",
      [parseInt(id)]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ item: formatRow(rows[0]) });
  } catch (error) {
    console.error("Error reopening compliance item:", error);
    return NextResponse.json({ error: "Failed to reopen compliance item" }, { status: 500 });
  }
}
