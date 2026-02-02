import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/snowflake";
import { deleteFromR2, moveFileInR2 } from "@/lib/r2";

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
      "document_type_category",
      "document_category",
      "contract_type",
      "party",
      "sub_party",
      "document_type",
      "document_date",
      "executed_date",
      "letter_date",
      "period_end_date",
      "issuer_category",
      "account_last4",
      "notes",
      "ai_summary",
      "ai_extracted_text",
      "ai_confidence_score",
      "ai_raw_response",
      "ai_model_used",
      "ai_processed_at",
      "amount",
      "due_date",
      "invoice_type",
      "duplicate_of_id",
      "deleted_at",
      "reviewed_by",
      "reviewed_at",
    ];

    for (const field of allowedFields) {
      if (field in body) {
        let value = body[field];

        // Handle special field types
        if (field === "ai_raw_response" && typeof value === "object") {
          value = JSON.stringify(value);
        }

        // Handle timestamp fields - Snowflake expects specific format
        if ((field === "reviewed_at" || field === "ai_processed_at" || field === "deleted_at") && value) {
          // Convert ISO string to Snowflake-compatible format
          if (typeof value === "string" && value.includes("T")) {
            value = value.replace("T", " ").replace("Z", "").split(".")[0];
          }
        }

        updateFields.push(`${field.toUpperCase()} = ?`);
        values.push(value);
      }
    }

    if (updateFields.length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // If status is being changed to 'archived', move file to archive/ folder
    if (body.status === "archived") {
      const docRows = await query<{ FILE_PATH: string }>(
        `SELECT FILE_PATH FROM DOCUMENTS WHERE ID = ?`,
        [id]
      );

      if (docRows.length > 0) {
        const currentPath = docRows[0].FILE_PATH;
        // Move from import/ or review/ to archive/
        if (currentPath.startsWith("import/") || currentPath.startsWith("review/")) {
          const newPath = currentPath.replace(/^(import|review)\//, "archive/");
          try {
            await moveFileInR2(currentPath, newPath);
            console.log(`[PUT] Moved file from ${currentPath} to ${newPath}`);
            // Add FILE_PATH to update
            updateFields.push("FILE_PATH = ?");
            values.push(newPath);
          } catch (moveError) {
            console.error("[PUT] Failed to move file to archive:", moveError);
            // Continue anyway - file location mismatch is logged but not critical
          }
        }
      }
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
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to update document: ${message}` },
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
      // Soft delete: mark as deleted
      await execute(
        `UPDATE DOCUMENTS
         SET STATUS = 'deleted',
             DELETED_AT = CURRENT_TIMESTAMP(),
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
