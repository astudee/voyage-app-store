import { NextRequest, NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";
import { query, execute } from "@/lib/snowflake";
import { createHash, randomUUID } from "crypto";

const GEMINI_MODEL = "gemini-2.0-flash-exp";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

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
  "is_corp_to_corp": true/false or null (for CONTRACTOR only),
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
  is_corp_to_corp?: boolean | null;
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
    console.log("[upload] Gemini API key not configured");
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
    console.log("[upload] Calling Gemini API...");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 429) {
      console.log("[upload] Gemini quota exceeded (429), will fall back to Claude");
      return null;
    }

    if (!response.ok) {
      console.log(`[upload] Gemini returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.log("[upload] Gemini returned no text content");
      return null;
    }

    const textResponse = data.candidates[0].content.parts[0].text;
    console.log("[upload] Gemini raw response:", textResponse.substring(0, 200));

    // Extract JSON from response
    const match = textResponse.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log("[upload] Could not extract JSON from Gemini response");
      return null;
    }

    const analysis = JSON.parse(match[0]) as Analysis;
    analysis._aiUsed = "Gemini";
    console.log("[upload] Gemini analysis successful");
    return analysis;
  } catch (err) {
    console.error("[upload] Gemini error:", err);
    return null;
  }
}

async function analyzeWithClaude(pdfBase64: string): Promise<Analysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("[upload] Anthropic API key not configured");
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
    console.log("[upload] Calling Claude API...");
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
      console.log(`[upload] Claude returned ${response.status}`);
      const errorText = await response.text();
      console.log("[upload] Claude error:", errorText);
      return null;
    }

    const data = await response.json();
    const textResponse = data.content?.[0]?.text;
    if (!textResponse) {
      console.log("[upload] Claude returned no text content");
      return null;
    }

    console.log("[upload] Claude raw response:", textResponse.substring(0, 200));

    // Extract JSON from response
    const match = textResponse.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log("[upload] Could not extract JSON from Claude response");
      return null;
    }

    const analysis = JSON.parse(match[0]) as Analysis;
    analysis._aiUsed = "Claude";
    console.log("[upload] Claude analysis successful");
    return analysis;
  } catch (err) {
    console.error("[upload] Claude error:", err);
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

async function updateDocumentWithAIResults(
  documentId: string,
  analysis: Analysis
): Promise<void> {
  const aiUsed = analysis._aiUsed || "Unknown";

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

    updateFields.push("IS_CORP_TO_CORP = ?");
    updateValues.push(ca.is_corp_to_corp ?? null);

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
  updateValues.push(documentId);

  const updateSql = `
    UPDATE DOCUMENTS
    SET ${updateFields.join(", ")}
    WHERE ID = ?
  `;

  await execute(updateSql, updateValues);
}

// POST - Upload a file to R2 and create document record
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let fileId = "";
  let filePath = "";

  try {
    console.log("[upload] Starting file upload...");

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const source = (formData.get("source") as string) || "upload";

    if (!file) {
      console.log("[upload] Error: No file provided");
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    console.log(`[upload] File received: ${file.name}, type: ${file.type}, size: ${file.size}`);

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "image/png",
      "image/jpeg",
    ];

    if (!allowedTypes.includes(file.type)) {
      console.log(`[upload] Error: Invalid file type: ${file.type}`);
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG` },
        { status: 400 }
      );
    }

    // Read file content
    console.log("[upload] Reading file content...");
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Calculate SHA-256 hash
    const hash = createHash("sha256").update(buffer).digest("hex");
    console.log(`[upload] File hash: ${hash.substring(0, 16)}...`);

    // Check for duplicate by hash
    console.log("[upload] Checking for duplicates...");
    try {
      const duplicateCheck = await query<{ ID: string; ORIGINAL_FILENAME: string }>(
        `SELECT ID, ORIGINAL_FILENAME FROM DOCUMENTS WHERE FILE_HASH = ? AND STATUS != 'deleted' LIMIT 1`,
        [hash]
      );

      if (duplicateCheck.length > 0) {
        console.log(`[upload] Duplicate found: ${duplicateCheck[0].ID}`);
        return NextResponse.json(
          {
            error: "Duplicate file detected",
            duplicate_of_id: duplicateCheck[0].ID,
            duplicate_filename: duplicateCheck[0].ORIGINAL_FILENAME,
          },
          { status: 409 }
        );
      }
    } catch (dbError) {
      console.error("[upload] Error checking duplicates:", dbError);
      // Continue anyway - table might not exist yet or other issue
    }

    // Generate UUID for file storage
    fileId = randomUUID();
    const fileExtension = getFileExtension(file.name);
    filePath = `to-file/${fileId}${fileExtension}`;
    console.log(`[upload] Generated file path: ${filePath}`);

    // Upload to R2
    console.log("[upload] Uploading to R2...");
    try {
      await uploadToR2(filePath, buffer, file.type);
      console.log("[upload] R2 upload successful");
    } catch (r2Error) {
      console.error("[upload] R2 upload failed:", r2Error);
      const errorMessage = r2Error instanceof Error ? r2Error.message : String(r2Error);
      return NextResponse.json(
        { error: `R2 upload failed: ${errorMessage}` },
        { status: 500 }
      );
    }

    // Create document record in Snowflake
    // Note: IS_CONTRACT is nullable - will be set by AI processing later
    console.log("[upload] Creating Snowflake record...");
    try {
      const insertSql = `
        INSERT INTO DOCUMENTS (
          ID, ORIGINAL_FILENAME, FILE_PATH, FILE_SIZE_BYTES, FILE_HASH,
          STATUS, SOURCE, CREATED_AT, UPDATED_AT
        ) VALUES (?, ?, ?, ?, ?, 'pending_review', ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
      `;

      await execute(insertSql, [
        fileId,
        file.name,
        filePath,
        buffer.length,
        hash,
        source,
      ]);
      console.log("[upload] Snowflake record created");
    } catch (dbError) {
      console.error("[upload] Snowflake insert failed:", dbError);
      const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);

      // Try to clean up the R2 file since DB insert failed
      try {
        const { deleteFromR2 } = await import("@/lib/r2");
        await deleteFromR2(filePath);
        console.log("[upload] Cleaned up R2 file after DB failure");
      } catch (cleanupError) {
        console.error("[upload] Failed to cleanup R2 file:", cleanupError);
      }

      return NextResponse.json(
        { error: `Database insert failed: ${errorMessage}` },
        { status: 500 }
      );
    }

    // Run AI processing for PDF files
    let aiAnalysis: Analysis | null = null;
    let aiModelUsed: string | null = null;

    if (file.type === "application/pdf") {
      console.log("[upload] Starting AI analysis for PDF...");
      try {
        const pdfBase64 = buffer.toString("base64");
        aiAnalysis = await analyzeFile(pdfBase64);

        if (aiAnalysis) {
          aiModelUsed = aiAnalysis._aiUsed || "Unknown";
          console.log(`[upload] AI analysis complete using ${aiModelUsed}`);

          // Update document record with AI results
          await updateDocumentWithAIResults(fileId, aiAnalysis);
          console.log("[upload] Document record updated with AI results");
        } else {
          console.log("[upload] AI analysis returned null - both Gemini and Claude failed");
        }
      } catch (aiError) {
        console.error("[upload] AI processing error (non-fatal):", aiError);
        // Continue without AI results - document is still uploaded
      }
    } else {
      console.log(`[upload] Skipping AI analysis for non-PDF file type: ${file.type}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[upload] Upload complete in ${duration}ms`);

    return NextResponse.json(
      {
        id: fileId,
        original_filename: file.name,
        file_path: filePath,
        file_size_bytes: buffer.length,
        file_hash: hash,
        status: "pending_review",
        ai_processed: aiAnalysis !== null,
        ai_model_used: aiModelUsed,
        is_contract: aiAnalysis?.is_contract ?? null,
        confidence_score: aiAnalysis?.confidence_score ?? null,
        analysis: aiAnalysis,
      },
      { status: 201 }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[upload] Unexpected error after ${duration}ms:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    return NextResponse.json(
      {
        error: "Failed to upload document",
        details: errorMessage,
        stack: process.env.NODE_ENV === "development" ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}
