import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS COMPLIANCE_ITEMS (
    ID NUMBER AUTOINCREMENT PRIMARY KEY,
    AGENCY VARCHAR(300) NOT NULL,
    DESCRIPTION VARCHAR(500) NOT NULL,
    DUE_DATE DATE NOT NULL,
    DONE BOOLEAN DEFAULT FALSE,
    YEAR NUMBER NOT NULL,
    NOTES TEXT,
    RECURRING VARCHAR(20) DEFAULT 'annual',
    PARENT_ID NUMBER,
    COMPLETED_AT TIMESTAMP,
    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
    UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)`;

let tableEnsured = false;
async function ensureTable() {
  if (tableEnsured) return;
  await execute(CREATE_TABLE_SQL);
  tableEnsured = true;
}

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

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureTable();

  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");

  try {
    let sql = "SELECT * FROM COMPLIANCE_ITEMS";
    const params: (string | number)[] = [];
    if (year) {
      sql += " WHERE YEAR = ?";
      params.push(parseInt(year));
    }
    sql += " ORDER BY DUE_DATE ASC";

    const rows = await query<ComplianceRow>(sql, params);
    return NextResponse.json({ items: rows.map(formatRow) });
  } catch (error) {
    console.error("Error fetching compliance items:", error);
    return NextResponse.json({ error: "Failed to fetch compliance items" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureTable();

  try {
    const body = await request.json();
    const { agency, description, dueDate, notes, recurring, year } = body;

    if (!agency || !description || !dueDate) {
      return NextResponse.json({ error: "agency, description, and dueDate are required" }, { status: 400 });
    }

    const itemYear = year || parseInt(dueDate.split("-")[0]);

    await execute(
      `INSERT INTO COMPLIANCE_ITEMS (AGENCY, DESCRIPTION, DUE_DATE, YEAR, NOTES, RECURRING, CREATED_AT, UPDATED_AT)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
      [agency, description, dueDate, itemYear, notes || null, recurring || "annual"]
    );

    // Query back the created record
    const rows = await query<ComplianceRow>(
      `SELECT * FROM COMPLIANCE_ITEMS WHERE AGENCY = ? AND DESCRIPTION = ? AND DUE_DATE = ? ORDER BY ID DESC LIMIT 1`,
      [agency, description, dueDate]
    );

    return NextResponse.json({ item: formatRow(rows[0]) }, { status: 201 });
  } catch (error) {
    console.error("Error creating compliance item:", error);
    return NextResponse.json({ error: "Failed to create compliance item" }, { status: 500 });
  }
}
