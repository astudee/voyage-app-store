import { NextResponse } from "next/server";
import { query } from "@/lib/snowflake";

// GET /api/test-snowflake - Unauthenticated Snowflake connectivity test
export async function GET() {
  const startTime = Date.now();
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    tests: {},
  };

  try {
    // Test 1: Basic connection - get current context
    const contextResult = await query<{
      CURRENT_USER: string;
      CURRENT_ROLE: string;
      CURRENT_WAREHOUSE: string;
      CURRENT_DATABASE: string;
      CURRENT_SCHEMA: string;
    }>(
      `SELECT
        CURRENT_USER() as CURRENT_USER,
        CURRENT_ROLE() as CURRENT_ROLE,
        CURRENT_WAREHOUSE() as CURRENT_WAREHOUSE,
        CURRENT_DATABASE() as CURRENT_DATABASE,
        CURRENT_SCHEMA() as CURRENT_SCHEMA`
    );

    results.tests = {
      connection: {
        status: "OK",
        user: contextResult[0]?.CURRENT_USER,
        role: contextResult[0]?.CURRENT_ROLE,
        warehouse: contextResult[0]?.CURRENT_WAREHOUSE,
        database: contextResult[0]?.CURRENT_DATABASE,
        schema: contextResult[0]?.CURRENT_SCHEMA,
      },
    };

    // Test 2: List tables
    const tablesResult = await query<{ name: string }>(
      `SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = CURRENT_SCHEMA()
       ORDER BY TABLE_NAME`
    );

    (results.tests as Record<string, unknown>).tables = {
      status: "OK",
      count: tablesResult.length,
      names: tablesResult.map((t) => t.name),
    };

    // Test 3: Sample data from VC_STAFF (if exists)
    try {
      const staffCount = await query<{ COUNT: number }>(
        `SELECT COUNT(*) as COUNT FROM VC_STAFF`
      );
      (results.tests as Record<string, unknown>).staffTable = {
        status: "OK",
        rowCount: staffCount[0]?.COUNT,
      };
    } catch {
      (results.tests as Record<string, unknown>).staffTable = {
        status: "SKIPPED",
        reason: "VC_STAFF table not found",
      };
    }

    results.success = true;
    results.durationMs = Date.now() - startTime;

    return NextResponse.json(results);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        hint: "Check Snowflake environment variables are set correctly",
      },
      { status: 500 }
    );
  }
}
