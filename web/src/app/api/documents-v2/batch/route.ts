import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/snowflake";
import { deleteFromR2, moveFileInR2 } from "@/lib/r2";

interface BatchResult {
  id: string;
  success: boolean;
  error?: string;
}

// POST - Batch operations: approve or delete documents
// Body: { action: 'approve' | 'delete', ids: string[] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ids } = body as { action: "approve" | "delete"; ids: string[] };

    if (!action || !["approve", "delete"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'approve' or 'delete'" },
        { status: 400 }
      );
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: ids (array of document IDs)" },
        { status: 400 }
      );
    }

    console.log(`[batch] ${action} ${ids.length} documents...`);

    const results: BatchResult[] = [];

    if (action === "approve") {
      // Approve: move file to archive/, set status='archived', reviewed_at=now
      for (const id of ids) {
        try {
          // Get document file path
          const docs = await query<{ FILE_PATH: string }>(
            `SELECT FILE_PATH FROM DOCUMENTS WHERE ID = ? AND STATUS = 'pending_approval'`,
            [id]
          );

          if (docs.length === 0) {
            results.push({ id, success: false, error: "Document not found or not pending approval" });
            continue;
          }

          const filePath = docs[0].FILE_PATH;
          let newFilePath = filePath;

          // Move file from to-file/ or review/ to archive/
          if (filePath.startsWith("to-file/") || filePath.startsWith("review/")) {
            newFilePath = filePath.replace(/^(to-file|review)\//, "archive/");
            try {
              await moveFileInR2(filePath, newFilePath);
              console.log(`[batch] Moved file from ${filePath} to ${newFilePath}`);
            } catch (moveError) {
              console.error(`[batch] Failed to move file for ${id}:`, moveError);
              // Continue anyway - update DB even if move fails
            }
          }

          await execute(
            `UPDATE DOCUMENTS
             SET STATUS = 'archived',
                 FILE_PATH = ?,
                 REVIEWED_AT = CURRENT_TIMESTAMP(),
                 UPDATED_AT = CURRENT_TIMESTAMP()
             WHERE ID = ?`,
            [newFilePath, id]
          );
          results.push({ id, success: true });
        } catch (error) {
          console.error(`[batch] Error approving ${id}:`, error);
          results.push({
            id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else if (action === "delete") {
      // Delete: permanently remove from R2 and database
      for (const id of ids) {
        try {
          // Get document info first
          const docs = await query<{ FILE_PATH: string }>(
            `SELECT FILE_PATH FROM DOCUMENTS WHERE ID = ?`,
            [id]
          );

          if (docs.length === 0) {
            results.push({ id, success: false, error: "Document not found" });
            continue;
          }

          const doc = docs[0];

          // Hard delete: remove from R2 and database
          try {
            await deleteFromR2(doc.FILE_PATH);
            console.log(`[batch] Removed file from R2: ${doc.FILE_PATH}`);
          } catch (r2Error) {
            console.error(`[batch] R2 delete failed for ${id}:`, r2Error);
            // Continue with DB deletion
          }
          await execute(`DELETE FROM DOCUMENTS WHERE ID = ?`, [id]);
          results.push({ id, success: true });
        } catch (error) {
          console.error(`[batch] Error deleting ${id}:`, error);
          results.push({
            id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const success = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`[batch] Complete: ${success} succeeded, ${failed} failed`);

    return NextResponse.json({
      success,
      failed,
      results,
    });
  } catch (error) {
    console.error("[batch] Error:", error);
    return NextResponse.json(
      {
        error: "Batch operation failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
