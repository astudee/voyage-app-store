import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/snowflake";

const SELECT_FIELDS = `
  ID, ORIGINAL_FILENAME, FILE_PATH, PARTY, SUB_PARTY, DOCUMENT_TYPE,
  DOCUMENT_TYPE_CATEGORY, DOCUMENT_CATEGORY, CONTRACT_TYPE,
  AI_SUMMARY, DOCUMENT_DATE, EXECUTED_DATE, LETTER_DATE, PERIOD_END_DATE,
  AMOUNT, DUE_DATE, INVOICE_TYPE, NOTES, CREATED_AT, REVIEWED_AT
`;

interface ArchivedDocument {
  ID: string;
  ORIGINAL_FILENAME: string;
  FILE_PATH: string;
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
  REVIEWED_AT: string | null;
}

/**
 * POST /api/documents/search
 *
 * Two modes:
 *   mode=text (default) — SQL ILIKE boolean search across all archived documents.
 *     Supports: quoted phrases, AND, NOT/-, implicit OR.
 *   mode=ai — Gemini semantic search for natural language queries.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { q, mode = "text" } = body as { q: string; mode?: "text" | "ai" };

    if (!q || q.trim().length < 2) {
      return NextResponse.json({ error: "Query too short (min 2 characters)" }, { status: 400 });
    }

    const searchQuery = q.trim();
    console.log(`[search] mode=${mode} query="${searchQuery}"`);

    if (mode === "ai") {
      return performAiSearch(searchQuery, startTime);
    }

    return performSqlSearch(searchQuery, startTime);
  } catch (error) {
    console.error("[search] Error:", error);
    return NextResponse.json(
      { error: "Search failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// SQL-based boolean search (normal search)
// ---------------------------------------------------------------------------

/** The columns we search with ILIKE */
const SEARCH_COLUMNS = [
  "PARTY", "SUB_PARTY", "ORIGINAL_FILENAME", "CONTRACT_TYPE",
  "DOCUMENT_TYPE", "DOCUMENT_TYPE_CATEGORY", "DOCUMENT_CATEGORY",
  "AI_SUMMARY", "NOTES", "INVOICE_TYPE",
];

function parseQuery(queryStr: string): { mustMatch: string[]; mustNotMatch: string[]; isAnd: boolean } {
  const mustMatch: string[] = [];
  const mustNotMatch: string[] = [];

  const isAnd = /\bAND\b/.test(queryStr);

  let cleaned = queryStr.replace(/\b(AND|OR)\b/gi, " ");

  // Extract quoted phrases
  const phraseRegex = /"([^"]+)"/g;
  let m;
  while ((m = phraseRegex.exec(cleaned)) !== null) {
    mustMatch.push(m[1]);
  }
  cleaned = cleaned.replace(phraseRegex, " ");

  // Extract NOT / - terms
  const notRegex = /(?:\bNOT\s+|-)(\S+)/gi;
  while ((m = notRegex.exec(cleaned)) !== null) {
    mustNotMatch.push(m[1]);
  }
  cleaned = cleaned.replace(notRegex, " ");

  // Remaining terms
  const terms = cleaned.split(/\s+/).filter((t) => t.length > 0);
  mustMatch.push(...terms);

  return { mustMatch, mustNotMatch, isAnd };
}

/**
 * Build a SQL condition for one term: (col1 ILIKE ? OR col2 ILIKE ? OR ...)
 * Returns the SQL fragment and an array of bind values (one per placeholder).
 */
function termCondition(term: string): { sql: string; binds: string[] } {
  const pattern = `%${term}%`;
  const clauses = SEARCH_COLUMNS.map((col) => `${col} ILIKE ?`);
  clauses.push(`CAST(AMOUNT AS VARCHAR) ILIKE ?`);
  clauses.push(`CAST(COALESCE(DOCUMENT_DATE, EXECUTED_DATE, LETTER_DATE, PERIOD_END_DATE) AS VARCHAR) ILIKE ?`);
  const bindCount = clauses.length;
  return { sql: `(${clauses.join(" OR ")})`, binds: Array(bindCount).fill(pattern) };
}

async function performSqlSearch(queryStr: string, startTime: number) {
  const { mustMatch, mustNotMatch, isAnd } = parseQuery(queryStr);

  if (mustMatch.length === 0 && mustNotMatch.length === 0) {
    return NextResponse.json({ results: [], total: 0, query: queryStr, search_type: "text" });
  }

  const conditions: string[] = ["STATUS = 'archived'", "DELETED_AT IS NULL"];
  const allBinds: string[] = [];

  // Must-match terms
  if (mustMatch.length > 0) {
    if (isAnd) {
      // AND: every term must appear somewhere
      for (const term of mustMatch) {
        const { sql, binds } = termCondition(term);
        conditions.push(sql);
        allBinds.push(...binds);
      }
    } else {
      // OR: at least one term must match — combine into one big OR group
      const orParts: string[] = [];
      for (const term of mustMatch) {
        const { sql, binds } = termCondition(term);
        orParts.push(sql);
        allBinds.push(...binds);
      }
      conditions.push(`(${orParts.join(" OR ")})`);
    }
  }

  // Must-NOT-match terms
  for (const term of mustNotMatch) {
    const pattern = `%${term}%`;
    const notClauses = SEARCH_COLUMNS.map(() => `?`);
    const notSql = SEARCH_COLUMNS.map((col, i) => `${col} ILIKE ${notClauses[i]}`);
    conditions.push(`NOT (${notSql.join(" OR ")})`);
    allBinds.push(...Array(SEARCH_COLUMNS.length).fill(pattern));
  }

  const sql = `
    SELECT ${SELECT_FIELDS}
    FROM DOCUMENTS
    WHERE ${conditions.join("\n      AND ")}
    ORDER BY COALESCE(DOCUMENT_DATE, EXECUTED_DATE, LETTER_DATE, PERIOD_END_DATE) DESC NULLS LAST
    LIMIT 200
  `;

  console.log(`[search/sql] Running query with ${allBinds.length} bind params`);

  const documents = await query<ArchivedDocument>(sql, allBinds);

  const results = documents.map(formatDocument);
  const duration = Date.now() - startTime;
  console.log(`[search/sql] Found ${results.length} results in ${duration}ms`);

  return NextResponse.json({
    results,
    total: results.length,
    query: queryStr,
    search_type: "text",
    duration_ms: duration,
  });
}

// ---------------------------------------------------------------------------
// AI-powered semantic search (smart search)
// ---------------------------------------------------------------------------

async function performAiSearch(searchQuery: string, startTime: number) {
  // Load all archived docs for AI to consider
  const documents = await query<ArchivedDocument>(`
    SELECT ${SELECT_FIELDS}
    FROM DOCUMENTS
    WHERE STATUS = 'archived' AND DELETED_AT IS NULL
    ORDER BY CREATED_AT DESC
    LIMIT 1000
  `);

  if (documents.length === 0) {
    return NextResponse.json({ results: [], total: 0, query: searchQuery, search_type: "ai" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[search/ai] Gemini API key not configured, falling back to SQL search");
    return performSqlSearch(searchQuery, startTime);
  }

  // Build context for Gemini
  const docsContext = documents
    .map((d, i) => {
      const docDate = d.DOCUMENT_DATE || d.EXECUTED_DATE || d.LETTER_DATE || d.PERIOD_END_DATE;
      return [
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
    })
    .join("\n");

  const prompt = `You are a document search assistant. Given a natural language search query and a list of documents, identify which documents are relevant.

Search query: "${searchQuery}"

Documents:
${docsContext}

Instructions:
1. Interpret the query as a natural language request
2. Find documents that semantically match what the user is looking for
3. Consider: party names, document types, dates, amounts, summaries, notes
4. Partial name matches count (e.g., "ECS" matches "ECS Federal")
5. Understand date references: "last year" = previous calendar year, "this year" = current year, "from 2024" = year 2024
6. Understand amount queries: "over $5000" = amount > 5000
7. Rank results by relevance (most relevant first)
8. Only include documents that are actually relevant

Return ONLY a JSON object (no markdown, no explanation):
{"matches": [0, 5, 12]}

Return empty array if nothing matches:
{"matches": []}`;

  console.log("[search/ai] Calling Gemini...");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1000 },
      }),
    }
  );

  if (!response.ok) {
    console.log(`[search/ai] Gemini returned ${response.status}, falling back to SQL search`);
    return performSqlSearch(searchQuery, startTime);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"matches":[]}';
  console.log("[search/ai] Gemini response:", text.substring(0, 200));

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log("[search/ai] Could not parse response, falling back to SQL search");
    return performSqlSearch(searchQuery, startTime);
  }

  let parsed: { matches: number[] };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    console.log("[search/ai] JSON parse failed, falling back to SQL search");
    return performSqlSearch(searchQuery, startTime);
  }

  const results = (parsed.matches || [])
    .filter((idx: number) => idx >= 0 && idx < documents.length)
    .map((idx: number) => formatDocument(documents[idx]));

  const duration = Date.now() - startTime;
  console.log(`[search/ai] Found ${results.length} results in ${duration}ms`);

  return NextResponse.json({
    results,
    total: results.length,
    query: searchQuery,
    search_type: "ai",
    duration_ms: duration,
  });
}

// ---------------------------------------------------------------------------

function formatDocument(doc: ArchivedDocument) {
  return {
    id: doc.ID,
    original_filename: doc.ORIGINAL_FILENAME,
    file_path: doc.FILE_PATH,
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
    reviewed_at: doc.REVIEWED_AT,
  };
}
