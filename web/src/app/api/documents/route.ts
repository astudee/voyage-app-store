import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/snowflake";
import { generateDocumentId } from "@/lib/nanoid";

export interface Document {
  id: string;
  original_filename: string;
  file_path: string;
  file_size_bytes: number;
  file_hash: string;
  status: "uploaded" | "pending_approval" | "archived" | "deleted";
  is_contract: boolean | null;
  // Contract fields
  document_category: string | null;
  contract_type: string | null;
  party: string | null;
  sub_party: string | null;
  executed_date: string | null;
  // Document fields
  issuer_category: string | null;
  document_type: string | null;
  period_end_date: string | null;
  letter_date: string | null;
  account_last4: string | null;
  // Shared
  notes: string | null;
  // AI fields
  ai_extracted_text: string | null;
  ai_confidence_score: number | null;
  ai_raw_response: string | null;
  ai_model_used: string | null;
  ai_processed_at: string | null;
  // Tracking
  duplicate_of_id: string | null;
  deleted_at: string | null;
  source: string;
  source_email_from: string | null;
  source_email_subject: string | null;
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
    const sortBy = searchParams.get("sortBy");
    const sortDir = searchParams.get("sortDir") === "asc" ? "ASC" : "DESC";

    // Map frontend sort keys to SQL columns
    const sortColumnMap: Record<string, string> = {
      party: "PARTY",
      type: "COALESCE(CONTRACT_TYPE, DOCUMENT_TYPE)",
      date: "DOCUMENT_DATE",
      notes: "NOTES",
      uploaded: "CREATED_AT",
    };
    const orderColumn = sortColumnMap[sortBy || ""] || "CREATED_AT";

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

    sqlQuery += ` ORDER BY ${orderColumn} ${sortDir} NULLS LAST LIMIT ? OFFSET ?`;
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
      original_filename,
      file_path,
      file_size_bytes,
      file_hash,
      status = "uploaded",
      source = "upload",
      source_email_from,
      source_email_subject,
    } = body;

    if (!original_filename || !file_path || !file_hash) {
      return NextResponse.json(
        { error: "Missing required fields: original_filename, file_path, file_hash" },
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

    // Generate NanoID
    const id = await generateDocumentId(async (testId: string) => {
      const exists = await query<{ ID: string }>(
        `SELECT ID FROM DOCUMENTS WHERE ID = ?`,
        [testId]
      );
      return exists.length > 0;
    });

    const insertSql = `
      INSERT INTO DOCUMENTS (
        ID, ORIGINAL_FILENAME, FILE_PATH, FILE_SIZE_BYTES, FILE_HASH,
        STATUS, SOURCE, SOURCE_EMAIL_FROM, SOURCE_EMAIL_SUBJECT,
        CREATED_AT, UPDATED_AT
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
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
