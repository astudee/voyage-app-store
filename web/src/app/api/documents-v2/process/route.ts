import { NextRequest, NextResponse } from "next/server";
import { downloadFromR2, moveFileInR2 } from "@/lib/r2";
import { query, execute } from "@/lib/snowflake";

const GEMINI_MODEL = "gemini-2.0-flash";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// Classification prompt for AI - Phase 2: contract/document/invoice types
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

STEP 2: EXTRACT FIELDS BASED ON TYPE

For ALL types, include:
- party: Primary entity name (company, person, or issuer)
- sub_party: Secondary entity if relevant (use "Last, First" format for people)
- document_type: Specific type (e.g., "MSA", "Statement", "Invoice")
- ai_summary: 2-4 sentence description for easy searching. Include key names, dates, amounts, and purpose.
- confidence_score: 0.0 to 1.0

For CONTRACTS additionally include:
- document_category: "EMPLOYEE" | "CONTRACTOR" | "VENDOR" | "CLIENT" | "PARTNER"
- contract_type: MSA, SOW, NDA, SubK, CSOW, Offer Letter, Bonus Plan, TA (Teaming Agreement), etc.
- executed_date: Date signed (YYYY-MM-DD)

For DOCUMENTS additionally include:
- letter_date: Date of the document (YYYY-MM-DD)
- period_end_date: For statements, the period end date (YYYY-MM-DD)
- account_last4: Last 4 digits of account if applicable

For INVOICES additionally include:
- amount: Dollar amount as number (e.g., 5000.00)
- due_date: Payment due date (YYYY-MM-DD)
- invoice_type: "PAYABLE" (bill to pay) | "RECEIVABLE" (invoice we sent)

**PARTY AND SUB_PARTY RULES:**

For EMPLOYEE contracts:
- party = Employee name in "Last, First" format
- sub_party = null

For CONTRACTOR contracts:
- party = Contractor's company name
- sub_party = Individual contractor name in "Last, First" format

For VENDOR contracts:
- party = Vendor company name
- sub_party = null or department

For CLIENT contracts:
- party = Client company name
- sub_party = Department or division if mentioned

For PARTNER contracts (teaming agreements, joint ventures, referral agreements):
- party = Partner company name
- sub_party = null or specific contact/department

For DOCUMENTS:
- party = Issuing entity (bank, government, utility)
- sub_party = Specific agency or department

For INVOICES:
- party = Vendor (if payable) or Client (if receivable)
- sub_party = null or specific department

CRITICAL RULES:
1. Use STRICT "Last, First" format for person names
2. Never use forward slashes (/) anywhere in values
3. The ai_summary should be searchable - include key terms
4. For contracts, executed_date is the latest signature date
5. Return ONLY valid JSON, no markdown formatting

Return JSON:
{
  "document_type_category": "contract" | "document" | "invoice",
  "party": "...",
  "sub_party": "..." or null,
  "document_type": "...",
  "ai_summary": "2-4 sentence summary with key details...",
  "confidence_score": 0.0-1.0,
  // Contract-specific (only if contract):
  "document_category": "EMPLOYEE" | "CONTRACTOR" | "VENDOR" | "CLIENT",
  "contract_type": "...",
  "executed_date": "YYYY-MM-DD",
  // Document-specific (only if document):
  "letter_date": "YYYY-MM-DD",
  "period_end_date": "YYYY-MM-DD",
  "account_last4": "1234",
  // Invoice-specific (only if invoice):
  "amount": 5000.00,
  "due_date": "YYYY-MM-DD",
  "invoice_type": "PAYABLE" | "RECEIVABLE"
}`;
}

// Phase 2: Unified analysis interface with document_type_category
interface Analysis {
  document_type_category: "contract" | "document" | "invoice";
  party?: string;
  sub_party?: string;
  document_type?: string;
  ai_summary?: string;
  confidence_score?: number;
  // Contract-specific
  document_category?: string; // EMPLOYEE, CONTRACTOR, VENDOR, CLIENT
  contract_type?: string;
  executed_date?: string;
  // Document-specific
  letter_date?: string;
  period_end_date?: string;
  account_last4?: string;
  // Invoice-specific
  amount?: number;
  due_date?: string;
  invoice_type?: string; // PAYABLE, RECEIVABLE
  // Legacy field for backwards compatibility
  is_contract?: boolean;
  // Internal
  _aiUsed?: string;
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

    // Type-specific fields
    if (analysis.document_type_category === "contract") {
      updateFields.push("DOCUMENT_CATEGORY = ?");
      updateValues.push(analysis.document_category ?? null);

      updateFields.push("CONTRACT_TYPE = ?");
      updateValues.push(analysis.contract_type ?? null);

      updateFields.push("EXECUTED_DATE = ?");
      updateValues.push(analysis.executed_date ?? null);
    } else if (analysis.document_type_category === "document") {
      updateFields.push("LETTER_DATE = ?");
      updateValues.push(analysis.letter_date ?? null);

      updateFields.push("PERIOD_END_DATE = ?");
      updateValues.push(analysis.period_end_date ?? null);

      updateFields.push("ACCOUNT_LAST4 = ?");
      updateValues.push(analysis.account_last4 ?? null);
    } else if (analysis.document_type_category === "invoice") {
      updateFields.push("AMOUNT = ?");
      updateValues.push(analysis.amount ?? null);

      updateFields.push("DUE_DATE = ?");
      updateValues.push(analysis.due_date ?? null);

      updateFields.push("INVOICE_TYPE = ?");
      updateValues.push(analysis.invoice_type ?? null);
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
