import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/snowflake";

interface DocumentInfo {
  ID: string;
  ORIGINAL_FILENAME: string;
  PARTY: string | null;
  SUB_PARTY: string | null;
  DOCUMENT_TYPE: string | null;
  DOCUMENT_TYPE_CATEGORY: string | null;
  CONTRACT_TYPE: string | null;
  AI_SUMMARY: string | null;
  EXECUTED_DATE: string | null;
  LETTER_DATE: string | null;
  AMOUNT: number | null;
}

interface SimilarDocument {
  id: string;
  original_filename: string;
  party: string | null;
  document_type: string | null;
  ai_summary: string | null;
  date: string | null;
  similarity_reason: string;
}

// POST - Check for similar/duplicate documents before archiving
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body as { id: string };

    if (!id) {
      return NextResponse.json({ error: "Missing document ID" }, { status: 400 });
    }

    console.log(`[check-duplicates] Checking document ${id}`);

    // Get the document being archived
    const docs = await query<DocumentInfo>(
      `SELECT ID, ORIGINAL_FILENAME, PARTY, SUB_PARTY, DOCUMENT_TYPE,
              DOCUMENT_TYPE_CATEGORY, CONTRACT_TYPE, AI_SUMMARY,
              EXECUTED_DATE, LETTER_DATE, AMOUNT
       FROM DOCUMENTS WHERE ID = ?`,
      [id]
    );

    if (docs.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const doc = docs[0];
    console.log(`[check-duplicates] Document: ${doc.PARTY} - ${doc.DOCUMENT_TYPE || doc.CONTRACT_TYPE}`);

    // Get archived documents that could be duplicates:
    // 1. Same filename (exact duplicate upload)
    // 2. Same party AND same document type (different versions of same document)
    // This prevents false positives for common forms like W9, Direct Deposit with different parties
    const candidates = await query<DocumentInfo>(
      `SELECT ID, ORIGINAL_FILENAME, PARTY, SUB_PARTY, DOCUMENT_TYPE,
              DOCUMENT_TYPE_CATEGORY, CONTRACT_TYPE, AI_SUMMARY,
              EXECUTED_DATE, LETTER_DATE, AMOUNT
       FROM DOCUMENTS
       WHERE STATUS = 'archived'
       AND DELETED_AT IS NULL
       AND ID != ?
       AND (
         ORIGINAL_FILENAME = ?
         OR (PARTY IS NOT NULL AND PARTY = ? AND (DOCUMENT_TYPE = ? OR CONTRACT_TYPE = ?))
       )
       ORDER BY CREATED_AT DESC
       LIMIT 30`,
      [id, doc.ORIGINAL_FILENAME, doc.PARTY, doc.DOCUMENT_TYPE, doc.CONTRACT_TYPE]
    );

    if (candidates.length === 0) {
      console.log("[check-duplicates] No candidates found");
      return NextResponse.json({ similar: [], count: 0 });
    }

    console.log(`[check-duplicates] Found ${candidates.length} candidates`);

    // Use AI to check for potential duplicates
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Fall back to simple matching
      return performSimpleMatch(doc, candidates);
    }

    // Build context for AI
    const docContext = `Document being archived:
- Filename: ${doc.ORIGINAL_FILENAME}
- Party: ${doc.PARTY || "Unknown"}
- Sub-party: ${doc.SUB_PARTY || "None"}
- Type: ${doc.DOCUMENT_TYPE || doc.CONTRACT_TYPE || "Unknown"}
- Date: ${doc.EXECUTED_DATE || doc.LETTER_DATE || "Unknown"}
- Summary: ${doc.AI_SUMMARY || "No summary"}`;

    const candidatesContext = candidates
      .map(
        (c, i) =>
          `[${i}] ${c.ORIGINAL_FILENAME} | Party: ${c.PARTY} | Type: ${c.DOCUMENT_TYPE || c.CONTRACT_TYPE} | Date: ${c.EXECUTED_DATE || c.LETTER_DATE} | Summary: ${c.AI_SUMMARY || "No summary"}`
      )
      .join("\n");

    const prompt = `You are checking for potential duplicate documents in a filing system.

${docContext}

Existing archived documents (already filtered to same party or same filename):
${candidatesContext}

IMPORTANT: Only flag as duplicates if:
1. The exact same document uploaded twice (same filename AND same party)
2. A different version of the SAME agreement/document (same party, same type, different date - like an amendment or renewal)

DO NOT flag as duplicates:
- Documents that just happen to be the same TYPE (like W9, Direct Deposit forms) but are for DIFFERENT parties/people
- Documents with similar names but different parties

For each potential match, explain why you think it's a true duplicate.

Return ONLY a JSON object:
{
  "matches": [
    {"index": 0, "reason": "Same MSA with Acme Corp, different execution date - may be an amendment or duplicate"},
    {"index": 3, "reason": "Exact same filename and party - likely duplicate upload"}
  ]
}

Return empty matches array if no true duplicates:
{"matches": []}`;

    console.log("[check-duplicates] Calling Gemini for duplicate detection...");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
        }),
      }
    );

    if (!response.ok) {
      console.log(`[check-duplicates] Gemini returned ${response.status}, falling back to simple match`);
      return performSimpleMatch(doc, candidates);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"matches":[]}';
    console.log("[check-duplicates] Gemini response:", text.substring(0, 200));

    // Parse the response
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return performSimpleMatch(doc, candidates);
    }

    let parsed: { matches: { index: number; reason: string }[] };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return performSimpleMatch(doc, candidates);
    }

    // Build similar documents list
    const similar: SimilarDocument[] = (parsed.matches || [])
      .filter((m) => m.index >= 0 && m.index < candidates.length)
      .map((m) => {
        const c = candidates[m.index];
        return {
          id: c.ID,
          original_filename: c.ORIGINAL_FILENAME,
          party: c.PARTY,
          document_type: c.DOCUMENT_TYPE || c.CONTRACT_TYPE,
          ai_summary: c.AI_SUMMARY,
          date: c.EXECUTED_DATE || c.LETTER_DATE,
          similarity_reason: m.reason,
        };
      });

    console.log(`[check-duplicates] Found ${similar.length} potential duplicates`);

    return NextResponse.json({
      similar,
      count: similar.length,
      check_type: "ai",
    });
  } catch (error) {
    console.error("[check-duplicates] Error:", error);
    return NextResponse.json(
      {
        error: "Duplicate check failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// Simple matching fallback
function performSimpleMatch(doc: DocumentInfo, candidates: DocumentInfo[]) {
  const similar: SimilarDocument[] = [];

  for (const c of candidates) {
    const reasons: string[] = [];

    // Check for same filename
    if (
      c.ORIGINAL_FILENAME.toLowerCase() === doc.ORIGINAL_FILENAME.toLowerCase()
    ) {
      reasons.push("Same filename");
    }

    // Check for same party and type
    if (
      c.PARTY === doc.PARTY &&
      (c.DOCUMENT_TYPE === doc.DOCUMENT_TYPE ||
        c.CONTRACT_TYPE === doc.CONTRACT_TYPE)
    ) {
      // Check if dates are close
      const docDate = doc.EXECUTED_DATE || doc.LETTER_DATE;
      const candDate = c.EXECUTED_DATE || c.LETTER_DATE;

      if (docDate && candDate && docDate === candDate) {
        reasons.push("Same party, type, and date");
      } else if (docDate && candDate) {
        reasons.push("Same party and type, different date");
      } else {
        reasons.push("Same party and type");
      }
    }

    if (reasons.length > 0) {
      similar.push({
        id: c.ID,
        original_filename: c.ORIGINAL_FILENAME,
        party: c.PARTY,
        document_type: c.DOCUMENT_TYPE || c.CONTRACT_TYPE,
        ai_summary: c.AI_SUMMARY,
        date: c.EXECUTED_DATE || c.LETTER_DATE,
        similarity_reason: reasons.join("; "),
      });
    }
  }

  return NextResponse.json({
    similar: similar.slice(0, 5), // Limit to 5 results
    count: similar.length,
    check_type: "simple",
  });
}
