import { NextRequest, NextResponse } from "next/server";
import { downloadFromR2 } from "@/lib/r2";
import { query, execute } from "@/lib/snowflake";

const GEMINI_MODEL = "gemini-2.0-flash";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Classification prompt for AI
function getClassificationPrompt(): string {
  return `You are a document classification and filing assistant for Voyage Advisory.

STEP 1: DETERMINE IF THIS IS A CONTRACT OR A DOCUMENT

**CONTRACT** = Documents with signatures, commitments, or agreements:
- Signed agreements between Voyage and another party
- Employee documents: offer letters, CNAPs, bonus plans, direct deposit forms, benefits enrollment forms
- Contractor documents: contractor agreements, contractor SOWs
- Company contracts: MSAs, SOWs, NDAs, teaming agreements, referral agreements
- Email PDFs showing approvals or commitments
- Anything on Voyage letterhead with signatures or binding commitments

**DOCUMENT** = Informational correspondence without signatures or commitments:
- Bank statements and credit card statements
- Tax notices and government correspondence
- Utility bills
- Insurance statements
- Government licenses and renewals
- Invoices and bills received
- Any informational letter or notice that does NOT require a signature

STEP 2: EXTRACT APPROPRIATE INFORMATION

If CONTRACT, return JSON:
{
  "is_contract": true,
  "document_category": "EMPLOYEE" | "CONTRACTOR" | "COMPANY",
  "counterparty": "See rules below",
  "sub_entity": "See rules below",
  "executed_date": "YYYY-MM-DD",
  "contract_type": "See codes below",
  "description": "Brief description or empty string",
  "confidence_score": 0.0 to 1.0
}

**COUNTERPARTY AND SUB_ENTITY RULES BY CATEGORY:**

For COMPANY contracts:
- counterparty = Client/partner company name (e.g., "State of North Dakota", "Acme Corp")
- sub_entity = Department or division if mentioned (e.g., "Department of Workforce Safety Insurance"), otherwise null

For CONTRACTOR contracts:
- counterparty = Contractor's company name (e.g., "Acme Consulting LLC")
- sub_entity = Individual contractor name in "Last, First" format (e.g., "Shah, Alam")
- This allows searching by either company OR individual name

For EMPLOYEE contracts:
- counterparty = Employee name in "Last, First" format (e.g., "Smith, John")
- sub_entity = null (not used for employees)

CONTRACT TYPE CODES:
- COMPANY: CSA, MSA, SOW, NDA, TA (Teaming Agreement), RA (Referral Agreement), MOD# (modification number)
- CONTRACTOR: SubK (contractor agreement), CSOW (contractor SOW)
- EMPLOYEE: "Offer Letter", "Bonus Plan", "CNAP", "Direct Deposit Form", "Benefits Selection", etc.

If DOCUMENT, return JSON:
{
  "is_contract": false,
  "issuer_category": "BANK" | "CREDIT_CARD" | "UTILITY" | "INSURER" | "GOVERNMENT_STATE" | "GOVERNMENT_FEDERAL" | "INVOICE" | "OTHER",
  "issuer_name": "Top-level entity name (bank, company, or government entity)",
  "sub_entity": "Department, agency, or division name if applicable",
  "country": "US or CA or other",
  "state": "Full state name (for GOVERNMENT_STATE only)",
  "document_type": "Short description (e.g., 'Statement', 'Tax Notice', 'Invoice')",
  "period_end_date": "YYYY-MM-DD or null",
  "letter_date": "YYYY-MM-DD or null",
  "account_last4": "Last 4 digits if applicable",
  "employee_name": "Last, First if this relates to a specific employee",
  "invoice_type": "For invoices: 'VENDOR' (bill from vendor), 'CLIENT' (invoice to client), or 'CONTRACTOR' (contractor invoice)",
  "amount": numeric amount if this is an invoice/bill,
  "currency": "USD" or other currency code,
  "due_date": "YYYY-MM-DD if applicable",
  "confidence_score": 0.0 to 1.0
}

**DOCUMENT ISSUER_NAME AND SUB_ENTITY RULES:**
- For GOVERNMENT_STATE: issuer_name = "State of {StateName}", sub_entity = specific agency/department
- For GOVERNMENT_FEDERAL: issuer_name = "US Government" or country name, sub_entity = specific agency (e.g., "IRS", "SSA")
- For BANK/CREDIT_CARD/UTILITY/INSURER: issuer_name = company name, sub_entity = division if applicable
- For INVOICE: issuer_name = vendor/client company name

CRITICAL RULES:
1. Use STRICT "Last, First" format for person names (e.g., "Smith, John" not "John Smith")
2. Never use forward slashes (/) anywhere in values
3. For contracts, the executed_date is the latest signature date
4. Do NOT duplicate information across fields
5. The confidence_score should reflect how certain you are about the classification (1.0 = very certain)

Return ONLY valid JSON, no markdown formatting.`;
}

interface ContractAnalysis {
  is_contract: true;
  document_category?: string;
  counterparty?: string;
  sub_entity?: string;
  executed_date?: string;
  contract_type?: string;
  description?: string;
  confidence_score?: number;
}

interface DocumentAnalysis {
  is_contract: false;
  issuer_category?: string;
  issuer_name?: string;
  sub_entity?: string;
  country?: string;
  state?: string;
  document_type?: string;
  period_end_date?: string;
  letter_date?: string;
  account_last4?: string;
  employee_name?: string;
  invoice_type?: string;
  amount?: number;
  currency?: string;
  due_date?: string;
  confidence_score?: number;
}

type Analysis = (ContractAnalysis | DocumentAnalysis) & { _aiUsed?: string };

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

// POST - Process a document with AI
export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();

  try {
    const { id } = await params;
    console.log(`[process] Starting AI processing for document ${id}`);

    // Get document record
    const docs = await query<{
      ID: string;
      FILE_PATH: string;
      STATUS: string;
      ORIGINAL_FILENAME: string;
    }>(`SELECT ID, FILE_PATH, STATUS, ORIGINAL_FILENAME FROM DOCUMENTS WHERE ID = ?`, [id]);

    if (docs.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const doc = docs[0];
    console.log(`[process] Found document: ${doc.ORIGINAL_FILENAME}, status: ${doc.STATUS}`);

    // Download file from R2
    console.log(`[process] Downloading from R2: ${doc.FILE_PATH}`);
    let fileBuffer: Buffer;
    try {
      fileBuffer = await downloadFromR2(doc.FILE_PATH);
      console.log(`[process] Downloaded ${fileBuffer.length} bytes`);
    } catch (r2Error) {
      console.error("[process] R2 download failed:", r2Error);
      return NextResponse.json(
        { error: `Failed to download file from storage: ${r2Error instanceof Error ? r2Error.message : String(r2Error)}` },
        { status: 500 }
      );
    }

    // Convert to base64 for AI APIs
    const pdfBase64 = fileBuffer.toString("base64");

    // Analyze with AI
    console.log("[process] Starting AI analysis...");
    const analysis = await analyzeFile(pdfBase64);

    if (!analysis) {
      console.log("[process] AI analysis failed - both Gemini and Claude returned null");
      return NextResponse.json(
        { error: "AI analysis failed. Please check API keys and try again." },
        { status: 500 }
      );
    }

    const aiUsed = analysis._aiUsed || "Unknown";
    console.log(`[process] AI analysis complete using ${aiUsed}`);

    // Build update query based on analysis type
    const updateFields: string[] = [];
    const updateValues: (string | number | boolean | null)[] = [];

    updateFields.push("IS_CONTRACT = ?");
    updateValues.push(analysis.is_contract);

    updateFields.push("AI_MODEL_USED = ?");
    updateValues.push(aiUsed);

    updateFields.push("AI_RAW_RESPONSE = ?");
    updateValues.push(JSON.stringify(analysis));

    updateFields.push("AI_CONFIDENCE_SCORE = ?");
    updateValues.push(analysis.confidence_score ?? null);

    if (analysis.is_contract) {
      const ca = analysis as ContractAnalysis;
      updateFields.push("DOCUMENT_CATEGORY = ?");
      updateValues.push(ca.document_category ?? null);

      updateFields.push("CONTRACT_TYPE = ?");
      updateValues.push(ca.contract_type ?? null);

      updateFields.push("COUNTERPARTY = ?");
      updateValues.push(ca.counterparty ?? null);

      updateFields.push("SUB_ENTITY = ?");
      updateValues.push(ca.sub_entity ?? null);

      updateFields.push("EXECUTED_DATE = ?");
      updateValues.push(ca.executed_date ?? null);

      updateFields.push("DESCRIPTION = ?");
      updateValues.push(ca.description ?? null);
    } else {
      const da = analysis as DocumentAnalysis;
      updateFields.push("ISSUER_CATEGORY = ?");
      updateValues.push(da.issuer_category ?? null);

      updateFields.push("ISSUER_NAME = ?");
      updateValues.push(da.issuer_name ?? null);

      updateFields.push("SUB_ENTITY = ?");
      updateValues.push(da.sub_entity ?? null);

      updateFields.push("DOCUMENT_TYPE = ?");
      updateValues.push(da.document_type ?? null);

      updateFields.push("COUNTRY = ?");
      updateValues.push(da.country ?? null);

      updateFields.push("STATE = ?");
      updateValues.push(da.state ?? null);

      updateFields.push("PERIOD_END_DATE = ?");
      updateValues.push(da.period_end_date ?? null);

      updateFields.push("LETTER_DATE = ?");
      updateValues.push(da.letter_date ?? null);

      updateFields.push("ACCOUNT_LAST4 = ?");
      updateValues.push(da.account_last4 ?? null);

      updateFields.push("EMPLOYEE_NAME = ?");
      updateValues.push(da.employee_name ?? null);

      updateFields.push("INVOICE_TYPE = ?");
      updateValues.push(da.invoice_type ?? null);

      updateFields.push("AMOUNT = ?");
      updateValues.push(da.amount ?? null);

      updateFields.push("CURRENCY = ?");
      updateValues.push(da.currency ?? null);

      updateFields.push("DUE_DATE = ?");
      updateValues.push(da.due_date ?? null);
    }

    updateFields.push("UPDATED_AT = CURRENT_TIMESTAMP()");
    updateValues.push(id);

    const updateSql = `
      UPDATE DOCUMENTS
      SET ${updateFields.join(", ")}
      WHERE ID = ?
    `;

    console.log("[process] Updating document record...");
    await execute(updateSql, updateValues);

    const duration = Date.now() - startTime;
    console.log(`[process] Processing complete in ${duration}ms`);

    return NextResponse.json({
      success: true,
      id,
      is_contract: analysis.is_contract,
      ai_model_used: aiUsed,
      confidence_score: analysis.confidence_score,
      analysis: analysis,
      duration_ms: duration,
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
