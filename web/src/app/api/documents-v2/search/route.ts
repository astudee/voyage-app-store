import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/snowflake";

interface ArchivedDocument {
  ID: string;
  ORIGINAL_FILENAME: string;
  PARTY: string | null;
  SUB_PARTY: string | null;
  DOCUMENT_TYPE: string | null;
  DOCUMENT_TYPE_CATEGORY: string | null;
  DOCUMENT_CATEGORY: string | null;
  CONTRACT_TYPE: string | null;
  AI_SUMMARY: string | null;
  EXECUTED_DATE: string | null;
  LETTER_DATE: string | null;
  PERIOD_END_DATE: string | null;
  AMOUNT: number | null;
  DUE_DATE: string | null;
  INVOICE_TYPE: string | null;
  NOTES: string | null;
  CREATED_AT: string;
}

// POST - AI-powered semantic search of archived documents
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { q } = body as { q: string };

    if (!q || q.trim().length < 2) {
      return NextResponse.json({ error: "Query too short (min 2 characters)" }, { status: 400 });
    }

    const searchQuery = q.trim();
    console.log(`[search] Searching for: "${searchQuery}"`);

    // Get archived documents with all searchable fields
    const documents = await query<ArchivedDocument>(`
      SELECT
        ID, ORIGINAL_FILENAME, PARTY, SUB_PARTY, DOCUMENT_TYPE,
        DOCUMENT_TYPE_CATEGORY, DOCUMENT_CATEGORY, CONTRACT_TYPE,
        AI_SUMMARY, EXECUTED_DATE, LETTER_DATE, PERIOD_END_DATE,
        AMOUNT, DUE_DATE, INVOICE_TYPE, NOTES, CREATED_AT
      FROM DOCUMENTS
      WHERE STATUS = 'archived'
      AND DELETED_AT IS NULL
      ORDER BY CREATED_AT DESC
      LIMIT 200
    `);

    if (documents.length === 0) {
      return NextResponse.json({
        results: [],
        total: 0,
        query: searchQuery,
        message: "No archived documents found",
      });
    }

    console.log(`[search] Found ${documents.length} archived documents to search`);

    // Build context for AI - include all searchable fields
    const docsContext = documents
      .map((d, i) => {
        const parts = [
          `[${i}]`,
          `File: ${d.ORIGINAL_FILENAME}`,
          d.PARTY ? `Party: ${d.PARTY}` : null,
          d.SUB_PARTY ? `Sub-party: ${d.SUB_PARTY}` : null,
          d.DOCUMENT_TYPE_CATEGORY ? `Type: ${d.DOCUMENT_TYPE_CATEGORY}` : null,
          d.DOCUMENT_CATEGORY ? `Category: ${d.DOCUMENT_CATEGORY}` : null,
          d.CONTRACT_TYPE ? `Contract: ${d.CONTRACT_TYPE}` : null,
          d.DOCUMENT_TYPE ? `Doc type: ${d.DOCUMENT_TYPE}` : null,
          d.AMOUNT ? `Amount: $${d.AMOUNT}` : null,
          d.EXECUTED_DATE ? `Executed: ${d.EXECUTED_DATE}` : null,
          d.LETTER_DATE ? `Date: ${d.LETTER_DATE}` : null,
          d.AI_SUMMARY ? `Summary: ${d.AI_SUMMARY}` : null,
          d.NOTES ? `Notes: ${d.NOTES}` : null,
        ]
          .filter(Boolean)
          .join(" | ");
        return parts;
      })
      .join("\n");

    // Call Gemini for semantic search ranking
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log("[search] Gemini API key not configured, falling back to text search");
      return performTextSearch(documents, searchQuery);
    }

    const prompt = `You are a document search assistant. Given a search query and a list of documents, identify which documents are relevant.

Search query: "${searchQuery}"

Documents:
${docsContext}

Instructions:
1. Find documents that match the search query semantically
2. Consider matches in: filenames, party names, sub-parties, document types, AI summaries, notes, amounts, and dates
3. Rank results by relevance (most relevant first)
4. Only include documents that are actually relevant to the query
5. If the query is about a person, company, or entity, look for matches in party, sub_party, and filenames
6. If the query is about a document type, look for matches in document_type, contract_type, and document_type_category
7. If the query mentions amounts or dates, look for matches in those fields

Return ONLY a JSON object with this format (no markdown, no explanation):
{"matches": [0, 5, 12]}

Return an empty array if no documents match:
{"matches": []}`;

    console.log("[search] Calling Gemini for semantic search...");
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
      console.log(`[search] Gemini returned ${response.status}, falling back to text search`);
      return performTextSearch(documents, searchQuery);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"matches":[]}';
    console.log("[search] Gemini response:", text.substring(0, 100));

    // Parse the response
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log("[search] Could not parse Gemini response, falling back to text search");
      return performTextSearch(documents, searchQuery);
    }

    let parsed: { matches: number[] };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      console.log("[search] JSON parse failed, falling back to text search");
      return performTextSearch(documents, searchQuery);
    }

    // Return matched documents in order
    const results = (parsed.matches || [])
      .filter((idx: number) => idx >= 0 && idx < documents.length)
      .map((idx: number) => formatDocument(documents[idx]));

    const duration = Date.now() - startTime;
    console.log(`[search] Found ${results.length} results in ${duration}ms`);

    return NextResponse.json({
      results,
      total: results.length,
      query: searchQuery,
      search_type: "ai",
      duration_ms: duration,
    });
  } catch (error) {
    console.error("[search] Error:", error);
    return NextResponse.json(
      {
        error: "Search failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// Fallback text-based search
function performTextSearch(documents: ArchivedDocument[], query: string) {
  const searchTerms = query.toLowerCase().split(/\s+/);

  const scored = documents.map((doc) => {
    const searchableText = [
      doc.ORIGINAL_FILENAME,
      doc.PARTY,
      doc.SUB_PARTY,
      doc.DOCUMENT_TYPE,
      doc.DOCUMENT_TYPE_CATEGORY,
      doc.DOCUMENT_CATEGORY,
      doc.CONTRACT_TYPE,
      doc.AI_SUMMARY,
      doc.NOTES,
      doc.INVOICE_TYPE,
      doc.AMOUNT?.toString(),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    // Score based on how many terms match
    let score = 0;
    for (const term of searchTerms) {
      if (searchableText.includes(term)) {
        score++;
        // Bonus for exact word match
        if (searchableText.split(/\s+/).includes(term)) {
          score += 0.5;
        }
      }
    }

    return { doc, score };
  });

  const results = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((s) => formatDocument(s.doc));

  return NextResponse.json({
    results,
    total: results.length,
    query,
    search_type: "text",
  });
}

function formatDocument(doc: ArchivedDocument) {
  return {
    id: doc.ID,
    original_filename: doc.ORIGINAL_FILENAME,
    party: doc.PARTY,
    sub_party: doc.SUB_PARTY,
    document_type: doc.DOCUMENT_TYPE,
    document_type_category: doc.DOCUMENT_TYPE_CATEGORY,
    document_category: doc.DOCUMENT_CATEGORY,
    contract_type: doc.CONTRACT_TYPE,
    ai_summary: doc.AI_SUMMARY,
    executed_date: doc.EXECUTED_DATE,
    letter_date: doc.LETTER_DATE,
    period_end_date: doc.PERIOD_END_DATE,
    amount: doc.AMOUNT,
    due_date: doc.DUE_DATE,
    invoice_type: doc.INVOICE_TYPE,
    notes: doc.NOTES,
    created_at: doc.CREATED_AT,
  };
}
