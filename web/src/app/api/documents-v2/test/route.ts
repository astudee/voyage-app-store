import { NextResponse } from "next/server";
import { listFilesInR2, uploadToR2, deleteFromR2 } from "@/lib/r2";
import { query, execute } from "@/lib/snowflake";

// GET - Test R2 connection and check table schema
export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    r2: { status: "pending" },
    snowflake: { status: "pending" },
    tableSchema: { status: "pending" },
  };

  // Test R2 connection
  try {
    console.log("[test] Testing R2 connection...");

    // Try to list files in the import folder (current standard)
    const files = await listFilesInR2("import/", 10);
    results.r2 = {
      status: "success",
      filesFound: files.length,
      sampleFiles: files.slice(0, 3).map((f) => ({
        key: f.key,
        size: f.size,
        lastModified: f.lastModified,
      })),
    };
    console.log(`[test] R2 connection successful, found ${files.length} files`);

    // Try a write/delete test
    const testKey = `test/connection-test-${Date.now()}.txt`;
    const testContent = Buffer.from("Connection test at " + new Date().toISOString());
    await uploadToR2(testKey, testContent, "text/plain");
    await deleteFromR2(testKey);
    (results.r2 as Record<string, unknown>).writeTest = "success";
    console.log("[test] R2 write/delete test successful");
  } catch (error) {
    console.error("[test] R2 error:", error);
    results.r2 = {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Test Snowflake connection
  try {
    console.log("[test] Testing Snowflake connection...");
    const testQuery = await query<{ TEST: number }>(`SELECT 1 as TEST`);
    results.snowflake = {
      status: "success",
      result: testQuery[0]?.TEST,
    };
    console.log("[test] Snowflake connection successful");
  } catch (error) {
    console.error("[test] Snowflake error:", error);
    results.snowflake = {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Check DOCUMENTS table schema
  try {
    console.log("[test] Checking DOCUMENTS table schema...");
    const schemaQuery = await query<{
      COLUMN_NAME: string;
      DATA_TYPE: string;
      IS_NULLABLE: string;
      COLUMN_DEFAULT: string | null;
    }>(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'DOCUMENTS'
      ORDER BY ORDINAL_POSITION
    `);

    const columns = schemaQuery.map((col) => ({
      name: col.COLUMN_NAME,
      type: col.DATA_TYPE,
      nullable: col.IS_NULLABLE === "YES",
      default: col.COLUMN_DEFAULT,
    }));

    // Check if IS_CONTRACT allows null
    const isContractCol = columns.find(
      (c) => c.name.toUpperCase() === "IS_CONTRACT"
    );

    results.tableSchema = {
      status: "success",
      columnCount: columns.length,
      columns: columns,
      isContractNullable: isContractCol?.nullable ?? "column not found",
    };

    console.log(
      `[test] Table has ${columns.length} columns, IS_CONTRACT nullable: ${isContractCol?.nullable}`
    );
  } catch (error) {
    console.error("[test] Schema check error:", error);
    results.tableSchema = {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return NextResponse.json(results);
}

// POST - Fix table schema (make IS_CONTRACT nullable)
export async function POST() {
  try {
    console.log("[test] Attempting to alter DOCUMENTS table...");

    // Make IS_CONTRACT nullable
    await execute(`ALTER TABLE DOCUMENTS ALTER COLUMN IS_CONTRACT DROP NOT NULL`);

    console.log("[test] Successfully made IS_CONTRACT nullable");

    return NextResponse.json({
      status: "success",
      message: "IS_CONTRACT column is now nullable",
    });
  } catch (error) {
    console.error("[test] Alter table error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
