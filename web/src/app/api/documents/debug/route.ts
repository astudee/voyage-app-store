import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/snowflake";

// GET - Debug endpoint to check document data in database
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    // If no ID provided, list recent documents with AI fields
    const docs = await query<Record<string, unknown>>(`
      SELECT
        ID,
        ORIGINAL_FILENAME,
        STATUS,
        IS_CONTRACT,
        AI_MODEL_USED,
        AI_CONFIDENCE_SCORE,
        DOCUMENT_CATEGORY,
        COUNTERPARTY,
        SUB_ENTITY,
        CONTRACT_TYPE,
        ISSUER_CATEGORY,
        ISSUER_NAME,
        CREATED_AT,
        UPDATED_AT
      FROM DOCUMENTS
      ORDER BY CREATED_AT DESC
      LIMIT 10
    `);

    return NextResponse.json({
      message: "Recent documents (add ?id=xxx to see full details)",
      count: docs.length,
      documents: docs.map(d => ({
        id: d.ID,
        filename: d.ORIGINAL_FILENAME,
        status: d.STATUS,
        is_contract: d.IS_CONTRACT,
        ai_model_used: d.AI_MODEL_USED,
        ai_confidence: d.AI_CONFIDENCE_SCORE,
        category: d.DOCUMENT_CATEGORY || d.ISSUER_CATEGORY,
        counterparty: d.COUNTERPARTY || d.ISSUER_NAME,
        sub_entity: d.SUB_ENTITY,
        contract_type: d.CONTRACT_TYPE,
        created: d.CREATED_AT,
        updated: d.UPDATED_AT,
      })),
    });
  }

  // Fetch all fields for specific document
  const docs = await query<Record<string, unknown>>(`
    SELECT *
    FROM DOCUMENTS
    WHERE ID = ?
  `, [id]);

  if (docs.length === 0) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const doc = docs[0];

  // Organize the response
  const response = {
    basic_info: {
      id: doc.ID,
      original_filename: doc.ORIGINAL_FILENAME,
      file_path: doc.FILE_PATH,
      file_size_bytes: doc.FILE_SIZE_BYTES,
      file_hash: doc.FILE_HASH,
      status: doc.STATUS,
      source: doc.SOURCE,
    },
    ai_processing: {
      is_contract: doc.IS_CONTRACT,
      ai_model_used: doc.AI_MODEL_USED,
      ai_confidence_score: doc.AI_CONFIDENCE_SCORE,
      ai_raw_response: doc.AI_RAW_RESPONSE ? JSON.parse(String(doc.AI_RAW_RESPONSE)) : null,
    },
    contract_fields: {
      document_category: doc.DOCUMENT_CATEGORY,
      contract_type: doc.CONTRACT_TYPE,
      counterparty: doc.COUNTERPARTY,
      sub_entity: doc.SUB_ENTITY,
      executed_date: doc.EXECUTED_DATE,
      is_corp_to_corp: doc.IS_CORP_TO_CORP,
      description: doc.DESCRIPTION,
    },
    document_fields: {
      issuer_category: doc.ISSUER_CATEGORY,
      issuer_name: doc.ISSUER_NAME,
      document_type: doc.DOCUMENT_TYPE,
      country: doc.COUNTRY,
      state: doc.STATE,
      period_end_date: doc.PERIOD_END_DATE,
      letter_date: doc.LETTER_DATE,
      account_last4: doc.ACCOUNT_LAST4,
      employee_name: doc.EMPLOYEE_NAME,
      invoice_type: doc.INVOICE_TYPE,
      amount: doc.AMOUNT,
      currency: doc.CURRENCY,
      due_date: doc.DUE_DATE,
    },
    timestamps: {
      created_at: doc.CREATED_AT,
      updated_at: doc.UPDATED_AT,
      deleted_at: doc.DELETED_AT,
    },
    raw_record: doc,
  };

  return NextResponse.json(response);
}
