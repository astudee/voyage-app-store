import { NextRequest, NextResponse } from "next/server";
import { listFilesInR2, deleteFromR2 } from "@/lib/r2";
import { query } from "@/lib/snowflake";

// POST - Cleanup orphaned files in R2 that have no database record
// Body: { dryRun?: boolean } - if true, just lists files without deleting
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // Default to dry run for safety

    console.log(`[cleanup] Starting cleanup (dryRun: ${dryRun})...`);

    // List all files in R2 under to-file/
    const r2Files = await listFilesInR2("to-file/");
    console.log(`[cleanup] Found ${r2Files.length} files in R2`);

    if (r2Files.length === 0) {
      return NextResponse.json({
        message: "No files found in R2",
        orphaned: [],
        deleted: 0,
        dryRun,
      });
    }

    // Get all file paths from database
    let dbFilePaths: Set<string>;
    try {
      const dbRecords = await query<{ FILE_PATH: string }>(
        `SELECT FILE_PATH FROM DOCUMENTS WHERE FILE_PATH IS NOT NULL`
      );
      dbFilePaths = new Set(dbRecords.map((r) => r.FILE_PATH));
      console.log(`[cleanup] Found ${dbFilePaths.size} file paths in database`);
    } catch (dbError) {
      // Table might not exist or be empty
      console.log(`[cleanup] Database query failed, assuming empty:`, dbError);
      dbFilePaths = new Set();
    }

    // Find orphaned files (in R2 but not in DB)
    const orphanedFiles = r2Files.filter((f) => !dbFilePaths.has(f.key));
    console.log(`[cleanup] Found ${orphanedFiles.length} orphaned files`);

    const results = {
      totalInR2: r2Files.length,
      totalInDB: dbFilePaths.size,
      orphaned: orphanedFiles.map((f) => ({
        key: f.key,
        size: f.size,
        lastModified: f.lastModified,
      })),
      deleted: 0,
      failed: [] as string[],
      dryRun,
    };

    // Delete orphaned files if not dry run
    if (!dryRun && orphanedFiles.length > 0) {
      for (const file of orphanedFiles) {
        try {
          await deleteFromR2(file.key);
          results.deleted++;
          console.log(`[cleanup] Deleted: ${file.key}`);
        } catch (err) {
          console.error(`[cleanup] Failed to delete ${file.key}:`, err);
          results.failed.push(file.key);
        }
      }
    }

    const message = dryRun
      ? `Found ${orphanedFiles.length} orphaned file(s). Set dryRun: false to delete.`
      : `Deleted ${results.deleted} orphaned file(s). ${results.failed.length} failed.`;

    return NextResponse.json({
      message,
      ...results,
    });
  } catch (error) {
    console.error("[cleanup] Error:", error);
    return NextResponse.json(
      {
        error: "Cleanup failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// GET - Just list orphaned files without deleting (always dry run)
export async function GET() {
  try {
    console.log("[cleanup] Listing orphaned files...");

    // List all files in R2 under to-file/
    const r2Files = await listFilesInR2("to-file/");

    if (r2Files.length === 0) {
      return NextResponse.json({
        message: "No files found in R2",
        totalInR2: 0,
        totalInDB: 0,
        orphaned: [],
      });
    }

    // Get all file paths from database
    let dbFilePaths: Set<string>;
    try {
      const dbRecords = await query<{ FILE_PATH: string }>(
        `SELECT FILE_PATH FROM DOCUMENTS WHERE FILE_PATH IS NOT NULL`
      );
      dbFilePaths = new Set(dbRecords.map((r) => r.FILE_PATH));
    } catch {
      dbFilePaths = new Set();
    }

    // Find orphaned files
    const orphanedFiles = r2Files.filter((f) => !dbFilePaths.has(f.key));

    return NextResponse.json({
      message: `Found ${orphanedFiles.length} orphaned file(s) out of ${r2Files.length} total`,
      totalInR2: r2Files.length,
      totalInDB: dbFilePaths.size,
      orphaned: orphanedFiles.map((f) => ({
        key: f.key,
        size: f.size,
        lastModified: f.lastModified,
      })),
    });
  } catch (error) {
    console.error("[cleanup] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to list files",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
