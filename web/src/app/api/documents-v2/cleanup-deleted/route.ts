import { NextResponse } from "next/server";
import { query, execute } from "@/lib/snowflake";
import { deleteFromR2 } from "@/lib/r2";

interface DeletedDocument {
  ID: string;
  FILE_PATH: string;
  ORIGINAL_FILENAME: string;
  DELETED_AT: string;
}

// POST - Permanently delete all soft-deleted documents
// This is a one-time cleanup endpoint
export async function POST() {
  try {
    console.log("[cleanup-deleted] Starting cleanup of soft-deleted documents...");

    // Find all soft-deleted documents
    const deletedDocs = await query<DeletedDocument>(
      `SELECT ID, FILE_PATH, ORIGINAL_FILENAME, DELETED_AT
       FROM DOCUMENTS
       WHERE STATUS = 'deleted'
       ORDER BY DELETED_AT`
    );

    console.log(`[cleanup-deleted] Found ${deletedDocs.length} soft-deleted documents`);

    if (deletedDocs.length === 0) {
      return NextResponse.json({
        message: "No soft-deleted documents found",
        deleted: 0,
        failed: 0,
      });
    }

    let deleted = 0;
    let failed = 0;
    const results: { id: string; filename: string; success: boolean; error?: string }[] = [];

    for (const doc of deletedDocs) {
      try {
        // Delete from R2
        try {
          await deleteFromR2(doc.FILE_PATH);
          console.log(`[cleanup-deleted] Removed from R2: ${doc.FILE_PATH}`);
        } catch (r2Error) {
          console.error(`[cleanup-deleted] R2 delete failed for ${doc.ID}:`, r2Error);
          // Continue with DB deletion - file might already be gone
        }

        // Delete from database
        await execute(`DELETE FROM DOCUMENTS WHERE ID = ?`, [doc.ID]);
        console.log(`[cleanup-deleted] Removed from DB: ${doc.ID} (${doc.ORIGINAL_FILENAME})`);

        deleted++;
        results.push({ id: doc.ID, filename: doc.ORIGINAL_FILENAME, success: true });
      } catch (error) {
        console.error(`[cleanup-deleted] Error deleting ${doc.ID}:`, error);
        failed++;
        results.push({
          id: doc.ID,
          filename: doc.ORIGINAL_FILENAME,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(`[cleanup-deleted] Cleanup complete: ${deleted} deleted, ${failed} failed`);

    return NextResponse.json({
      message: `Cleanup complete: ${deleted} permanently deleted, ${failed} failed`,
      deleted,
      failed,
      results,
    });
  } catch (error) {
    console.error("[cleanup-deleted] Error:", error);
    return NextResponse.json(
      {
        error: "Cleanup failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// GET - Preview soft-deleted documents without deleting
export async function GET() {
  try {
    const deletedDocs = await query<DeletedDocument>(
      `SELECT ID, FILE_PATH, ORIGINAL_FILENAME, DELETED_AT
       FROM DOCUMENTS
       WHERE STATUS = 'deleted'
       ORDER BY DELETED_AT`
    );

    return NextResponse.json({
      message: `Found ${deletedDocs.length} soft-deleted document(s)`,
      count: deletedDocs.length,
      documents: deletedDocs.map((d) => ({
        id: d.ID,
        filename: d.ORIGINAL_FILENAME,
        file_path: d.FILE_PATH,
        deleted_at: d.DELETED_AT,
      })),
    });
  } catch (error) {
    console.error("[cleanup-deleted] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to list deleted documents",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
