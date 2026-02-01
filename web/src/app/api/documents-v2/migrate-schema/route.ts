import { NextResponse } from "next/server";
import { execute, query } from "@/lib/snowflake";

// POST - Migrate schema to add new columns (non-destructive)
export async function POST() {
  try {
    console.log("[migrate-schema] Starting schema migration...");

    const migrations: { name: string; sql: string }[] = [
      {
        name: "Add ai_summary column",
        sql: `ALTER TABLE VOYAGE_APP_STORE.PUBLIC.DOCUMENTS ADD COLUMN IF NOT EXISTS ai_summary TEXT`,
      },
      {
        name: "Add document_type_category column",
        sql: `ALTER TABLE VOYAGE_APP_STORE.PUBLIC.DOCUMENTS ADD COLUMN IF NOT EXISTS document_type_category VARCHAR(20)`,
      },
      {
        name: "Add amount column for invoices",
        sql: `ALTER TABLE VOYAGE_APP_STORE.PUBLIC.DOCUMENTS ADD COLUMN IF NOT EXISTS amount DECIMAL(12,2)`,
      },
      {
        name: "Add due_date column for invoices",
        sql: `ALTER TABLE VOYAGE_APP_STORE.PUBLIC.DOCUMENTS ADD COLUMN IF NOT EXISTS due_date DATE`,
      },
      {
        name: "Add invoice_type column",
        sql: `ALTER TABLE VOYAGE_APP_STORE.PUBLIC.DOCUMENTS ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(20)`,
      },
    ];

    const results: { name: string; status: string; error?: string }[] = [];

    for (const migration of migrations) {
      try {
        console.log(`[migrate-schema] Running: ${migration.name}`);
        await execute(migration.sql);
        results.push({ name: migration.name, status: "success" });
        console.log(`[migrate-schema] Success: ${migration.name}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Check if column already exists (which is fine)
        if (errorMsg.includes("already exists")) {
          results.push({ name: migration.name, status: "skipped (already exists)" });
          console.log(`[migrate-schema] Skipped (already exists): ${migration.name}`);
        } else {
          results.push({ name: migration.name, status: "failed", error: errorMsg });
          console.error(`[migrate-schema] Failed: ${migration.name}`, error);
        }
      }
    }

    // Verify current schema
    console.log("[migrate-schema] Verifying schema...");
    const columns = await query<{ COLUMN_NAME: string; DATA_TYPE: string }>(
      `SELECT COLUMN_NAME, DATA_TYPE
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = 'PUBLIC' AND TABLE_NAME = 'DOCUMENTS'
       ORDER BY ORDINAL_POSITION`
    );

    console.log("[migrate-schema] Migration complete!");
    return NextResponse.json({
      success: true,
      message: "Schema migration complete",
      migrations: results,
      current_columns: columns.map((c) => `${c.COLUMN_NAME} (${c.DATA_TYPE})`),
    });
  } catch (error) {
    console.error("[migrate-schema] Error:", error);
    return NextResponse.json(
      {
        error: "Migration failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// GET - Check current schema
export async function GET() {
  try {
    const columns = await query<{ COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }>(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = 'PUBLIC' AND TABLE_NAME = 'DOCUMENTS'
       ORDER BY ORDINAL_POSITION`
    );

    return NextResponse.json({
      table: "DOCUMENTS",
      columns: columns.map((c) => ({
        name: c.COLUMN_NAME,
        type: c.DATA_TYPE,
        nullable: c.IS_NULLABLE === "YES",
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to get schema",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
