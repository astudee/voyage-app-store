import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/snowflake";

export interface Document {
  id: string;
  original_filename: string;
  file_path: string;
  file_size_bytes: number;
  file_hash: string;
  status: "pending_review" | "archived" | "duplicate" | "deleted";
  is_contract: boolean | null;
  // Contract fields
  document_category: string | null;
  contract_type: string | null;
  counterparty: string | null;
  sub_entity: string | null;
  executed_date: string | null;
  contractor_company: string | null;
  contractor_individual: string | null;
  is_corp_to_corp: boolean | null;
  // Document fields
  issuer_category: string | null;
  issuer_name: string | null;
  country: string | null;
  state: string | null;
  agency_name: string | null;
  document_type: string | null;
  period_end_date: string | null;
  letter_date: string | null;
  account_last4: string | null;
  employee_name: string | null;
  // Invoice fields
  invoice_type: string | null;
  amount: number | null;
  currency: string | null;
  due_date: string | null;
  // AI fields
  description: string | null;
  ai_extracted_text: string | null;
  ai_confidence_score: number | null;
  ai_raw_response: string | null;
  ai_model_used: string | null;
  // Tracking
  duplicate_of_id: string | null;
  deleted_at: string | null;
  permanent_delete_after: string | null;
  source: string | null;
  source_email_from: string | null;
  source_email_subject: string | null;
  source_original_path: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// GET - List documents with optional filtering
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    let sqlQuery = `
      SELECT *
      FROM DOCUMENTS
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (status) {
      sqlQuery += ` AND STATUS = ?`;
      params.push(status);
    }

    sqlQuery += ` ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await query<Record<string, unknown>>(sqlQuery, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM DOCUMENTS WHERE 1=1`;
    const countParams: string[] = [];
    if (status) {
      countQuery += ` AND STATUS = ?`;
      countParams.push(status);
    }
    const countResult = await query<{ TOTAL: number }>(countQuery, countParams);
    const total = countResult[0]?.TOTAL || 0;

    return NextResponse.json({
      documents: rows.map(normalizeDocument),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching documents:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

// POST - Create a new document record
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      id,
      original_filename,
      file_path,
      file_size_bytes,
      file_hash,
      status = "pending_review",
      source = "upload",
      source_email_from,
      source_email_subject,
      source_original_path,
    } = body;

    if (!id || !original_filename || !file_path || !file_hash) {
      return NextResponse.json(
        { error: "Missing required fields: id, original_filename, file_path, file_hash" },
        { status: 400 }
      );
    }

    // Check for duplicate by hash
    const duplicateCheck = await query<{ ID: string }>(
      `SELECT ID FROM DOCUMENTS WHERE FILE_HASH = ? AND STATUS != 'deleted' LIMIT 1`,
      [file_hash]
    );

    if (duplicateCheck.length > 0) {
      return NextResponse.json(
        {
          error: "Duplicate file detected",
          duplicate_of_id: duplicateCheck[0].ID,
        },
        { status: 409 }
      );
    }

    const insertSql = `
      INSERT INTO DOCUMENTS (
        ID, ORIGINAL_FILENAME, FILE_PATH, FILE_SIZE_BYTES, FILE_HASH,
        STATUS, SOURCE, SOURCE_EMAIL_FROM, SOURCE_EMAIL_SUBJECT, SOURCE_ORIGINAL_PATH,
        CREATED_AT, UPDATED_AT
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
    `;

    await execute(insertSql, [
      id,
      original_filename,
      file_path,
      file_size_bytes || 0,
      file_hash,
      status,
      source,
      source_email_from || null,
      source_email_subject || null,
      source_original_path || null,
    ]);

    return NextResponse.json({ id, status: "created" }, { status: 201 });
  } catch (error) {
    console.error("Error creating document:", error);
    return NextResponse.json(
      { error: "Failed to create document" },
      { status: 500 }
    );
  }
}

// Helper to normalize Snowflake column names to lowercase
function normalizeDocument(row: Record<string, unknown>): Document {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized as unknown as Document;
}
