import { NextRequest, NextResponse } from "next/server";
import { downloadFromR2 } from "@/lib/r2";
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
  DOCUMENT_DATE: string | null;
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

  // Date - use document_date first, then fall back to type-specific dates
  const date = doc.DOCUMENT_DATE || doc.EXECUTED_DATE || doc.LETTER_DATE || doc.PERIOD_END_DATE || doc.DUE_DATE;
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

// GET - Download document with smart filename
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get document record with metadata for smart filename
    const docs = await query<DocumentRecord>(
      `SELECT FILE_PATH, PARTY, SUB_PARTY, DOCUMENT_TYPE, CONTRACT_TYPE,
              DOCUMENT_DATE, EXECUTED_DATE, LETTER_DATE, PERIOD_END_DATE, DUE_DATE, NOTES
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

    // Download file from R2
    let fileBuffer: Buffer;
    try {
      fileBuffer = await downloadFromR2(filePath);
    } catch (r2Error) {
      console.error("Error downloading from R2:", r2Error);
      return NextResponse.json(
        { error: "Failed to download file" },
        { status: 500 }
      );
    }

    // Return file with Content-Disposition header
    // Convert Buffer to Uint8Array for NextResponse compatibility
    const uint8Array = new Uint8Array(fileBuffer);
    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${downloadFilename}"`,
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Error downloading document:", error);
    return NextResponse.json(
      { error: "Failed to download document" },
      { status: 500 }
    );
  }
}
