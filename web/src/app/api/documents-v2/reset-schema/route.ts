import { NextResponse } from "next/server";
import { execute } from "@/lib/snowflake";

// POST - Reset the DOCUMENTS table with new schema
// WARNING: This will DROP the existing table and all data!
export async function POST() {
  try {
    console.log("[reset-schema] Starting schema reset...");

    // Drop existing tables (if any)
    console.log("[reset-schema] Dropping existing tables...");
    await execute(`DROP TABLE IF EXISTS VOYAGE_APP_STORE.PUBLIC.DOCUMENT_PROCESSING_QUEUE`);
    await execute(`DROP TABLE IF EXISTS VOYAGE_APP_STORE.PUBLIC.DOCUMENTS`);

    // Create new DOCUMENTS table with updated schema
    console.log("[reset-schema] Creating new DOCUMENTS table...");
    const createTableSql = `
      CREATE TABLE VOYAGE_APP_STORE.PUBLIC.DOCUMENTS (
          id VARCHAR(10) PRIMARY KEY,  -- NanoID, 10 chars alphanumeric
          original_filename VARCHAR(500) NOT NULL,
          file_path VARCHAR(1000) NOT NULL,
          file_size_bytes NUMBER,
          file_hash VARCHAR(64),

          status VARCHAR(20) NOT NULL DEFAULT 'uploaded',
          -- Values: uploaded (waiting for AI), pending_approval (AI done), archived, deleted

          is_contract BOOLEAN,

          -- Contract fields
          document_category VARCHAR(20),  -- EMPLOYEE, CONTRACTOR, COMPANY
          contract_type VARCHAR(50),
          party VARCHAR(500),
          sub_party VARCHAR(500),
          executed_date DATE,

          -- Document fields
          issuer_category VARCHAR(30),
          document_type VARCHAR(100),
          period_end_date DATE,
          letter_date DATE,
          account_last4 VARCHAR(10),

          -- Shared
          notes TEXT,

          -- AI processing
          ai_extracted_text TEXT,
          ai_confidence_score DECIMAL(3,2),
          ai_raw_response VARIANT,
          ai_model_used VARCHAR(50),
          ai_processed_at TIMESTAMP_NTZ,

          -- Duplicate handling
          duplicate_of_id VARCHAR(10),

          -- Soft delete
          deleted_at TIMESTAMP_NTZ,

          -- Source tracking
          source VARCHAR(20) NOT NULL,  -- email, upload, to-file
          source_email_from VARCHAR(500),
          source_email_subject VARCHAR(1000),

          -- Audit
          reviewed_by VARCHAR(100),
          reviewed_at TIMESTAMP_NTZ,
          created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
          updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
      )
    `;
    await execute(createTableSql);

    // Grant permissions
    console.log("[reset-schema] Granting permissions...");
    await execute(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE VOYAGE_APP_STORE.PUBLIC.DOCUMENTS TO ROLE VOYAGE_APP_STORE_ROLE`);

    console.log("[reset-schema] Schema reset complete!");
    return NextResponse.json({
      success: true,
      message: "DOCUMENTS table has been reset with new schema",
      schema: {
        id: "VARCHAR(10) - NanoID, 10 chars alphanumeric",
        status: "uploaded | pending_approval | archived | deleted",
        party: "Renamed from counterparty",
        sub_party: "Renamed from sub_entity",
        notes: "Renamed from description",
      },
    });
  } catch (error) {
    console.error("[reset-schema] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to reset schema",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
