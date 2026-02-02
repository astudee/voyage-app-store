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
  DOCUMENT_DATE: string | null;
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
        AI_SUMMARY, DOCUMENT_DATE, EXECUTED_DATE, LETTER_DATE, PERIOD_END_DATE,
        AMOUNT, DUE_DATE, INVOICE_TYPE, NOTES, CREATED_AT
      FROM DOCUMENTS
      WHERE STATUS = 'archived'
      AND DELETED_AT IS NULL
      ORDER BY CREATED_AT DESC
      LIMIT 500
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
        // Use DOCUMENT_DATE if available, fall back to legacy fields
        const docDate = d.DOCUMENT_DATE || d.EXECUTED_DATE || d.LETTER_DATE || d.PERIOD_END_DATE;
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
          docDate ? `Date: ${docDate}` : null,
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

Boolean Query Support:
- If query contains AND (e.g., "principal insurance AND invoice"), ALL terms must match
- If query has quoted phrases like "principal insurance", match the exact phrase
- If query has -term or NOT term, exclude documents containing that term

Natural Language Support:
- "utility bills from 2024" → find documents with type containing "bill" or "utility" AND date in 2024
- "contracts with ECS" → find documents where party contains "ECS" AND type is contract
- "invoices over $5000" → find invoices with amount > 5000
- "contract modifications" or "amendments" → find contracts with type containing "modification" or "amendment"

Date Filtering:
- "from 2024" or "in 2024" → dates with year 2024
- "last year" → dates from previous calendar year
- "this year" → dates from current year

Entity Matching:
- If the query is about a person, company, or entity, look for matches in party, sub_party, and filenames
- Partial matches count (e.g., "ECS" matches "ECS Federal")

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

// Parse boolean query into terms and phrases
// Supports: "quoted phrase", AND, OR (implicit), NOT/-
function parseQuery(queryStr: string): { mustMatch: string[]; mustNotMatch: string[]; isAnd: boolean } {
  const mustMatch: string[] = [];
  const mustNotMatch: string[] = [];

  // Check if AND is used (case insensitive)
  const hasAnd = /\bAND\b/i.test(queryStr);
  const isAnd = hasAnd;

  // Remove AND/OR operators for parsing
  let cleaned = queryStr.replace(/\b(AND|OR)\b/gi, " ");

  // Extract quoted phrases
  const phraseRegex = /"([^"]+)"/g;
  let match;
  while ((match = phraseRegex.exec(cleaned)) !== null) {
    mustMatch.push(match[1].toLowerCase());
  }
  cleaned = cleaned.replace(phraseRegex, " ");

  // Extract NOT terms (prefixed with - or NOT)
  const notRegex = /(?:NOT\s+|-)([\w]+)/gi;
  while ((match = notRegex.exec(cleaned)) !== null) {
    mustNotMatch.push(match[1].toLowerCase());
  }
  cleaned = cleaned.replace(notRegex, " ");

  // Extract remaining terms
  const terms = cleaned
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  mustMatch.push(...terms);

  return { mustMatch, mustNotMatch, isAnd };
}

// Fallback text-based search with boolean support
function performTextSearch(documents: ArchivedDocument[], queryStr: string) {
  const { mustMatch, mustNotMatch, isAnd } = parseQuery(queryStr);

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
      doc.EXECUTED_DATE,
      doc.LETTER_DATE,
      doc.PERIOD_END_DATE,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    // Check for must-not-match terms
    for (const term of mustNotMatch) {
      if (searchableText.includes(term)) {
        return { doc, score: 0 };
      }
    }

    // Score based on matching
    let matchedCount = 0;
    let score = 0;

    for (const term of mustMatch) {
      if (searchableText.includes(term)) {
        matchedCount++;
        score++;
        // Bonus for exact word match (not just substring)
        const words = searchableText.split(/[\s.,;:()\[\]{}\/\\-]+/);
        if (words.includes(term)) {
          score += 0.5;
        }
        // Extra bonus for party/sub_party match
        if ((doc.PARTY || "").toLowerCase().includes(term) ||
            (doc.SUB_PARTY || "").toLowerCase().includes(term)) {
          score += 1;
        }
      }
    }

    // For AND queries, all terms must match
    if (isAnd && matchedCount < mustMatch.length) {
      return { doc, score: 0 };
    }

    return { doc, score };
  });

  const results = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 100)
    .map((s) => formatDocument(s.doc));

  return NextResponse.json({
    results,
    total: results.length,
    query: queryStr,
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
    document_date: doc.DOCUMENT_DATE,
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
