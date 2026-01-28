import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/snowflake";
import { deleteFromR2 } from "@/lib/r2";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get a single document by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM DOCUMENTS WHERE ID = ?`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json(normalizeDocument(rows[0]));
  } catch (error) {
    console.error("Error fetching document:", error);
    return NextResponse.json(
      { error: "Failed to fetch document" },
      { status: 500 }
    );
  }
}

// PUT - Update a document
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Build dynamic update query based on provided fields
    const updateFields: string[] = [];
    const values: (string | number | boolean | null)[] = [];

    const allowedFields = [
      "status",
      "is_contract",
      "document_category",
      "contract_type",
      "counterparty",
      "sub_entity",
      "executed_date",
      "contractor_company",
      "contractor_individual",
      "is_corp_to_corp",
      "issuer_category",
      "issuer_name",
      "country",
      "state",
      "agency_name",
      "document_type",
      "period_end_date",
      "letter_date",
      "account_last4",
      "employee_name",
      "invoice_type",
      "amount",
      "currency",
      "due_date",
      "description",
      "ai_extracted_text",
      "ai_confidence_score",
      "ai_raw_response",
      "ai_model_used",
      "duplicate_of_id",
      "deleted_at",
      "permanent_delete_after",
      "reviewed_by",
      "reviewed_at",
    ];

    for (const field of allowedFields) {
      if (field in body) {
        updateFields.push(`${field.toUpperCase()} = ?`);
        values.push(body[field]);
      }
    }

    if (updateFields.length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    updateFields.push("UPDATED_AT = CURRENT_TIMESTAMP()");
    values.push(id);

    const updateSql = `
      UPDATE DOCUMENTS
      SET ${updateFields.join(", ")}
      WHERE ID = ?
    `;

    await execute(updateSql, values);

    // Fetch and return updated document
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM DOCUMENTS WHERE ID = ?`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json(normalizeDocument(rows[0]));
  } catch (error) {
    console.error("Error updating document:", error);
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 }
    );
  }
}

// DELETE - Soft delete a document (or hard delete if already soft deleted)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const permanent = searchParams.get("permanent") === "true";

    // Get current document
    const rows = await query<{ STATUS: string; FILE_PATH: string }>(
      `SELECT STATUS, FILE_PATH FROM DOCUMENTS WHERE ID = ?`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const doc = rows[0];

    if (permanent || doc.STATUS === "deleted") {
      // Hard delete: remove from R2 and database
      try {
        await deleteFromR2(doc.FILE_PATH);
      } catch (r2Error) {
        console.error("Error deleting from R2:", r2Error);
        // Continue with DB deletion even if R2 delete fails
      }

      await execute(`DELETE FROM DOCUMENTS WHERE ID = ?`, [id]);
      return NextResponse.json({ status: "permanently_deleted" });
    } else {
      // Soft delete: mark as deleted with 30-day retention
      await execute(
        `UPDATE DOCUMENTS
         SET STATUS = 'deleted',
             DELETED_AT = CURRENT_TIMESTAMP(),
             PERMANENT_DELETE_AFTER = DATEADD(day, 30, CURRENT_TIMESTAMP()),
             UPDATED_AT = CURRENT_TIMESTAMP()
         WHERE ID = ?`,
        [id]
      );
      return NextResponse.json({ status: "soft_deleted" });
    }
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}

// Helper to normalize Snowflake column names to lowercase
function normalizeDocument(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}
