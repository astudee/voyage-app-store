import { NextRequest, NextResponse } from "next/server";
import { downloadFromR2, moveFileInR2 } from "@/lib/r2";
import { query, execute } from "@/lib/snowflake";

const GEMINI_MODEL = "gemini-2.0-flash";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// Classification prompt for AI - Simplified with unified document_date
function getClassificationPrompt(): string {
  return `You are a document classification and filing assistant for Voyage Advisory.

STEP 1: DETERMINE THE DOCUMENT TYPE

**CONTRACT** = Documents with signatures, commitments, or agreements:
- Signed agreements between Voyage and another party
- Employee documents: offer letters, CNAPs, bonus plans, direct deposit forms, benefits enrollment
- Contractor documents: contractor agreements, contractor SOWs
- Vendor/Client contracts: MSAs, SOWs, NDAs, teaming agreements, referral agreements
- Email PDFs showing approvals or commitments
- Anything with signatures or binding commitments

**DOCUMENT** = Informational correspondence without commitments:
- Bank statements and credit card statements
- Tax notices and government correspondence
- Utility bills
- Insurance statements
- Government licenses and renewals
- Any informational letter or notice without signatures

**INVOICE** = Bills to pay or invoices sent:
- Bills/invoices received from vendors (PAYABLE)
- Invoices Voyage sent to clients (RECEIVABLE)
- Look for: "Invoice", "Bill", "Amount Due", "Total Due", "Payment Due"

STEP 2: EXTRACT FIELDS

Return JSON only:
{
  "document_type_category": "contract" | "document" | "invoice",
  "party": "Primary entity - see rules below",
  "sub_party": "Secondary entity or null - see rules below",
  "document_type": "Specific type (MSA, SOW, Statement, Notice, Invoice, etc.)",
  "document_date": "YYYY-MM-DD - the most relevant date (signed date for contracts, letter date for documents, invoice date for invoices)",
  "ai_summary": "2-4 sentence description for searching later. Include key names, dates, amounts, and purpose.",
  "notes": "Additional context like account numbers, reference numbers, etc.",
  "confidence_score": 0.0-1.0,
  // CONTRACT only:
  "document_category": "EMPLOYEE" | "CONTRACTOR" | "VENDOR" | "CLIENT" | "PARTNER",
  "contract_type": "MSA" | "SOW" | "NDA" | "SubK" | "CSOW" | "Offer Letter" | etc.,
  // INVOICE only (REQUIRED for invoices):
  "amount": 1234.56,
  "due_date": "YYYY-MM-DD"
}

**INVOICE EXTRACTION RULES (CRITICAL):**
- For invoices, you MUST extract "amount" and "due_date"
- "amount" = the total amount due as a NUMBER (not a string). Examples: 1500.00, 250, 10000.50
- "due_date" = the payment due date in YYYY-MM-DD format
- "document_date" = the invoice date (when it was issued)
- If amount has currency symbol or commas, remove them: "$1,500.00" → 1500.00
- If no due date is visible, use null
- "party" = the vendor or company that sent the invoice (NOT Voyage Advisory)

**CRITICAL RULE - PARTY IDENTIFICATION:**

The party field should almost NEVER be "Voyage Advisory" or "Voyage Advisory LLC".
Voyage Advisory is the company that owns this document management system.
The party should be the OTHER party in the relationship:

- For contracts: party = the other company or person (client, vendor, contractor, employee)
- For documents: party = the issuer/sender (bank, government, utility)
- For invoices: party = the vendor billing us

The ONLY exceptions where party = "Voyage Advisory" are internal documents like:
- Operating agreements
- Articles of incorporation
- Standard operating procedures
- Internal policies

Examples:
- MSA between Voyage Advisory and Acme Corp → party = "Acme Corp"
- SOW where Voyage performs work for State of North Dakota → party = "State of North Dakota"
- SubK between Voyage and Lightwater Consulting → party = "Lightwater Consulting LLC"
- Offer letter from Voyage to John Smith → party = "Smith, John"
- Chase bank statement → party = "Chase"
- Voyage operating agreement → party = "Voyage Advisory LLC" (exception)

**CONTRACTOR PARTY RULES:**
- If contractor operates through a company (LLC, Inc, Corp, etc.):
  - party = The contractor's company name (e.g., "Jill Hanson Consulting LLC")
  - sub_party = The individual in "Last, First" format (e.g., "Hanson, Jill")
- If contractor is an individual with no company entity:
  - party = The individual in "Last, First" format (e.g., "Wise, Marc")
  - sub_party = null
- NEVER set party to "Voyage Advisory" for contractor documents

**EMPLOYEE PARTY RULES:**
- party = Employee name in "Last, First" format (e.g., "Smith, John")
- sub_party = null

**DOCUMENT PARTY RULES:**
- Government: party = "State of {Name}" or "US Government", sub_party = agency name
- Banks/companies: party = company name, sub_party = division if applicable
- Individuals: party = name in "Last, First" format

CRITICAL RULES:
1. Use STRICT "Last, First" format for person names
2. Never use forward slashes (/) anywhere in values
3. The ai_summary should be searchable - include key terms
4. Return ONLY valid JSON, no markdown formatting`;
}

// Simplified analysis interface with unified document_date
interface Analysis {
  document_type_category: "contract" | "document" | "invoice";
  party?: string;
  sub_party?: string;
  document_type?: string;
  document_date?: string; // Unified date field
  ai_summary?: string;
  notes?: string;
  confidence_score?: number;
  // Contract-specific
  document_category?: string; // EMPLOYEE, CONTRACTOR, VENDOR, CLIENT, PARTNER
  contract_type?: string;
  // Invoice-specific
  amount?: number;
  due_date?: string;
  // Legacy fields for backwards compatibility (no longer returned by AI)
  executed_date?: string;
  letter_date?: string;
  period_end_date?: string;
  account_last4?: string;
  invoice_type?: string;
  is_contract?: boolean;
  // Internal
  _aiUsed?: string;
}

// Normalize AI analysis - parse amounts, clean up fields
function normalizeAnalysis(analysis: Analysis): void {
  // Parse amount if it's a string (e.g., "$1,500.00" or "1,500")
  if (analysis.amount !== undefined && analysis.amount !== null) {
    if (typeof analysis.amount === "string") {
      // Remove currency symbols, commas, and whitespace
      const cleaned = (analysis.amount as unknown as string).replace(/[$,\s]/g, "");
      const parsed = parseFloat(cleaned);
      analysis.amount = isNaN(parsed) ? undefined : parsed;
    }
  }

  // Log invoice detection for debugging
  if (analysis.document_type_category === "invoice") {
    console.log("[process] Invoice detected - amount:", analysis.amount, "due_date:", analysis.due_date, "document_date:", analysis.document_date);
  }
}

async function analyzeWithGemini(pdfBase64: string): Promise<Analysis | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[process] Gemini API key not configured");
    return null;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: getClassificationPrompt() },
          { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1500,
    },
  };

  try {
    console.log("[process] Calling Gemini API...");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 429) {
      console.log("[process] Gemini quota exceeded (429), will fall back to Claude");
      return null;
    }

    if (!response.ok) {
      console.log(`[process] Gemini returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.log("[process] Gemini returned no text content");
      return null;
    }

    const textResponse = data.candidates[0].content.parts[0].text;
    console.log("[process] Gemini raw response:", textResponse.substring(0, 200));

    // Extract JSON from response
    const match = textResponse.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log("[process] Could not extract JSON from Gemini response");
      return null;
    }

    const analysis = JSON.parse(match[0]) as Analysis;
    analysis._aiUsed = "Gemini";
    normalizeAnalysis(analysis);
    console.log("[process] Gemini analysis successful");
    return analysis;
  } catch (err) {
    console.error("[process] Gemini error:", err);
    return null;
  }
}

async function analyzeWithClaude(pdfBase64: string): Promise<Analysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("[process] Anthropic API key not configured");
    return null;
  }

  const url = "https://api.anthropic.com/v1/messages";

  const payload = {
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: getClassificationPrompt() },
        ],
      },
    ],
  };

  try {
    console.log("[process] Calling Claude API...");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.log(`[process] Claude returned ${response.status}`);
      const errorText = await response.text();
      console.log("[process] Claude error:", errorText);
      return null;
    }

    const data = await response.json();
    const textResponse = data.content?.[0]?.text;
    if (!textResponse) {
      console.log("[process] Claude returned no text content");
      return null;
    }

    console.log("[process] Claude raw response:", textResponse.substring(0, 200));

    // Extract JSON from response
    const match = textResponse.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log("[process] Could not extract JSON from Claude response");
      return null;
    }

    const analysis = JSON.parse(match[0]) as Analysis;
    analysis._aiUsed = "Claude";
    normalizeAnalysis(analysis);
    console.log("[process] Claude analysis successful");
    return analysis;
  } catch (err) {
    console.error("[process] Claude error:", err);
    return null;
  }
}

async function analyzeFile(pdfBase64: string): Promise<Analysis | null> {
  // Try Gemini first (faster, cheaper)
  const geminiResult = await analyzeWithGemini(pdfBase64);
  if (geminiResult) return geminiResult;

  // Fall back to Claude
  return analyzeWithClaude(pdfBase64);
}

interface ProcessResult {
  id: string;
  success: boolean;
  error?: string;
  is_contract?: boolean;
  ai_model_used?: string;
  confidence_score?: number;
}

async function processDocument(docId: string, filePath: string, originalFilename: string): Promise<ProcessResult> {
  try {
    console.log(`[process] Processing document ${docId}: ${originalFilename}`);

    // Download file from R2
    let fileBuffer: Buffer;
    try {
      fileBuffer = await downloadFromR2(filePath);
      console.log(`[process] Downloaded ${fileBuffer.length} bytes`);
    } catch (r2Error) {
      console.error("[process] R2 download failed:", r2Error);
      return {
        id: docId,
        success: false,
        error: `Failed to download file: ${r2Error instanceof Error ? r2Error.message : String(r2Error)}`,
      };
    }

    // Convert to base64 for AI APIs
    const pdfBase64 = fileBuffer.toString("base64");

    // Analyze with AI
    const analysis = await analyzeFile(pdfBase64);

    if (!analysis) {
      return {
        id: docId,
        success: false,
        error: "AI analysis failed - both Gemini and Claude returned null",
      };
    }

    const aiUsed = analysis._aiUsed || "Unknown";

    // Determine is_contract from document_type_category for backwards compatibility
    const isContract = analysis.document_type_category === "contract";

    // Build update query based on analysis type
    const updateFields: string[] = [];
    const updateValues: (string | number | boolean | null)[] = [];

    // Core fields
    updateFields.push("DOCUMENT_TYPE_CATEGORY = ?");
    updateValues.push(analysis.document_type_category);

    updateFields.push("IS_CONTRACT = ?");
    updateValues.push(isContract);

    updateFields.push("AI_MODEL_USED = ?");
    updateValues.push(aiUsed);

    updateFields.push("AI_RAW_RESPONSE = ?");
    updateValues.push(JSON.stringify(analysis));

    updateFields.push("AI_CONFIDENCE_SCORE = ?");
    updateValues.push(analysis.confidence_score ?? null);

    updateFields.push("AI_SUMMARY = ?");
    updateValues.push(analysis.ai_summary ?? null);

    updateFields.push("AI_PROCESSED_AT = CURRENT_TIMESTAMP()");

    // Set status to pending_approval
    updateFields.push("STATUS = 'pending_approval'");

    // Common fields for all types
    updateFields.push("PARTY = ?");
    updateValues.push(analysis.party ?? null);

    updateFields.push("SUB_PARTY = ?");
    updateValues.push(analysis.sub_party ?? null);

    updateFields.push("DOCUMENT_TYPE = ?");
    updateValues.push(analysis.document_type ?? null);

    updateFields.push("NOTES = ?");
    updateValues.push(analysis.notes ?? null);

    // Unified document_date field for all types
    updateFields.push("DOCUMENT_DATE = ?");
    updateValues.push(analysis.document_date ?? null);

    // Type-specific fields
    if (analysis.document_type_category === "contract") {
      updateFields.push("DOCUMENT_CATEGORY = ?");
      updateValues.push(analysis.document_category ?? null);

      updateFields.push("CONTRACT_TYPE = ?");
      updateValues.push(analysis.contract_type ?? null);
    } else if (analysis.document_type_category === "invoice") {
      updateFields.push("AMOUNT = ?");
      updateValues.push(analysis.amount ?? null);

      updateFields.push("DUE_DATE = ?");
      updateValues.push(analysis.due_date ?? null);
    }

    updateFields.push("UPDATED_AT = CURRENT_TIMESTAMP()");
    updateValues.push(docId);

    // Move file from import/ to review/
    let newFilePath = filePath;
    if (filePath.startsWith("import/")) {
      newFilePath = filePath.replace("import/", "review/");
      try {
        await moveFileInR2(filePath, newFilePath);
        console.log(`[process] Moved file from ${filePath} to ${newFilePath}`);
        // Add FILE_PATH update
        updateFields.push("FILE_PATH = ?");
        updateValues.splice(-1, 0, newFilePath); // Insert before docId
      } catch (moveError) {
        console.error("[process] Failed to move file:", moveError);
        // Continue anyway - file location mismatch is not critical
      }
    }

    const updateSql = `
      UPDATE DOCUMENTS
      SET ${updateFields.join(", ")}
      WHERE ID = ?
    `;

    await execute(updateSql, updateValues);

    return {
      id: docId,
      success: true,
      is_contract: analysis.is_contract,
      ai_model_used: aiUsed,
      confidence_score: analysis.confidence_score,
    };
  } catch (error) {
    console.error(`[process] Error processing document ${docId}:`, error);
    return {
      id: docId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// POST - Process selected documents with AI
// Body: { ids: string[] }
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { ids } = body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: ids (array of document IDs)" },
        { status: 400 }
      );
    }

    console.log(`[process] Processing ${ids.length} documents...`);

    // Get documents from database
    const placeholders = ids.map(() => "?").join(", ");
    const docs = await query<{
      ID: string;
      FILE_PATH: string;
      ORIGINAL_FILENAME: string;
      STATUS: string;
    }>(`SELECT ID, FILE_PATH, ORIGINAL_FILENAME, STATUS FROM DOCUMENTS WHERE ID IN (${placeholders})`, ids);

    if (docs.length === 0) {
      return NextResponse.json(
        { error: "No documents found with the provided IDs" },
        { status: 404 }
      );
    }

    // Process each document
    const results: ProcessResult[] = [];
    for (const doc of docs) {
      // Skip if already processed (not in 'uploaded' status)
      if (doc.STATUS !== "uploaded") {
        results.push({
          id: doc.ID,
          success: false,
          error: `Document already processed (status: ${doc.STATUS})`,
        });
        continue;
      }

      const result = await processDocument(doc.ID, doc.FILE_PATH, doc.ORIGINAL_FILENAME);
      results.push(result);
    }

    const processed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const duration = Date.now() - startTime;

    console.log(`[process] Complete: ${processed} processed, ${failed} failed in ${duration}ms`);

    return NextResponse.json({
      processed,
      failed,
      duration_ms: duration,
      results,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[process] Error after ${duration}ms:`, error);
    return NextResponse.json(
      {
        error: "Processing failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
