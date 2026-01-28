import { NextRequest, NextResponse } from "next/server";
import { getSignedViewUrl } from "@/lib/r2";
import { query } from "@/lib/snowflake";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get a signed URL for viewing the document
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get document record to find file path
    const docs = await query<{ FILE_PATH: string }>(
      `SELECT FILE_PATH FROM DOCUMENTS WHERE ID = ?`,
      [id]
    );

    if (docs.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const filePath = docs[0].FILE_PATH;

    // Generate signed URL (valid for 1 hour)
    const signedUrl = await getSignedViewUrl(filePath, 3600);

    return NextResponse.json({ url: signedUrl });
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return NextResponse.json(
      { error: "Failed to generate view URL" },
      { status: 500 }
    );
  }
}
