import { NextRequest, NextResponse } from "next/server";
import { getSignedViewUrl } from "@/lib/r2";
import { query } from "@/lib/snowflake";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface DocumentRecord {
  FILE_PATH: string;
  PARTY: string | null;
  SUB_PARTY: string | null;
  DOCUMENT_TYPE: string | null;
  CONTRACT_TYPE: string | null;
  EXECUTED_DATE: string | null;
  LETTER_DATE: string | null;
  PERIOD_END_DATE: string | null;
  DUE_DATE: string | null;
  NOTES: string | null;
}

/**
 * Generate a smart download filename based on document metadata
 * Format: {party} ({sub_party}) - {YYYY.MM.DD} - {document_type}.pdf
 */
function generateDownloadFilename(doc: DocumentRecord): string {
  const parts: string[] = [];

  // Party (with sub_party if present)
  if (doc.PARTY) {
    if (doc.SUB_PARTY) {
      parts.push(`${doc.PARTY} (${doc.SUB_PARTY})`);
    } else {
      parts.push(doc.PARTY);
    }
  } else {
    parts.push("Unknown");
  }

  // Date (pick most relevant date based on document type)
  const date = doc.EXECUTED_DATE || doc.LETTER_DATE || doc.PERIOD_END_DATE || doc.DUE_DATE;
  if (date) {
    const d = new Date(date);
    const formatted = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
    parts.push(formatted);
  }

  // Document type (prefer contract_type over document_type)
  if (doc.CONTRACT_TYPE) {
    parts.push(doc.CONTRACT_TYPE);
  } else if (doc.DOCUMENT_TYPE) {
    parts.push(doc.DOCUMENT_TYPE);
  }

  // Notes (only if short - useful for account numbers, etc.)
  if (doc.NOTES && doc.NOTES.length < 30) {
    parts.push(doc.NOTES);
  }

  let filename = parts.join(" - ");

  // Sanitize: remove characters not safe for filenames
  filename = filename.replace(/[\/\\:*?"<>|]/g, "_");

  return `${filename}.pdf`;
}

// GET - Get a signed URL for viewing the document
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get document record with metadata for smart filename
    const docs = await query<DocumentRecord>(
      `SELECT FILE_PATH, PARTY, SUB_PARTY, DOCUMENT_TYPE, CONTRACT_TYPE,
              EXECUTED_DATE, LETTER_DATE, PERIOD_END_DATE, DUE_DATE, NOTES
       FROM DOCUMENTS WHERE ID = ?`,
      [id]
    );

    if (docs.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const doc = docs[0];
    const filePath = doc.FILE_PATH;

    // Generate smart download filename
    const downloadFilename = generateDownloadFilename(doc);

    // Generate signed URL (valid for 1 hour)
    // Note: R2 signed URLs don't support Content-Disposition directly,
    // so we'll return the filename separately for the client to use
    const signedUrl = await getSignedViewUrl(filePath, 3600);

    return NextResponse.json({
      url: signedUrl,
      download_filename: downloadFilename,
    });
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return NextResponse.json(
      { error: "Failed to generate view URL" },
      { status: 500 }
    );
  }
}
