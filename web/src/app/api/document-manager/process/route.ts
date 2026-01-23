import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";

const GEMINI_MODEL = "gemini-2.0-flash-exp";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

function getGoogleAuth() {
  const serviceAccountKey = process.env.SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("SERVICE_ACCOUNT_KEY not configured");
  }

  const credentials = JSON.parse(serviceAccountKey);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

function sanitize(text: string): string {
  if (!text) return "";
  return text.replace(/\//g, " ").replace(/[\r\n\t]/g, " ").trim();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) {
    const today = new Date();
    return `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;
  }
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }
  return dateStr;
}

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

If CONTRACT, extract:
{
  "is_contract": true,
  "document_category": "EMPLOYEE" | "CONTRACTOR" | "COMPANY",
  "counterparty": "Company Name or Last, First",
  "executed_date": "YYYY-MM-DD",
  "contract_type": "See codes below",
  "description": "Brief description or empty string",
  "contractor_company": "For contractors: company name",
  "contractor_individual": "For contractors: Last, First format",
  "is_corp_to_corp": true/false or null
}

CONTRACT TYPE CODES:
- COMPANY: CSA, MSA, SOW, NDA, TA, RA, MOD# (modification number)
- CONTRACTOR: SubK (contractor agreement), CSOW (contractor SOW)
- EMPLOYEE: "Offer Letter", "Bonus Plan", "CNAP", "Direct Deposit Form", "Benefits Selection", etc.

If DOCUMENT, extract:
{
  "is_contract": false,
  "issuer_category": "BANK" | "CREDIT_CARD" | "UTILITY" | "INSURER" | "GOVERNMENT_STATE" | "GOVERNMENT_FEDERAL" | "OTHER",
  "issuer_name": "Bank/company name",
  "country": "US or CA or other",
  "state": "Full state name for state docs",
  "agency_name": "Government agency name",
  "document_type": "Short description",
  "period_end_date": "YYYY-MM-DD or empty",
  "letter_date": "YYYY-MM-DD or empty",
  "account_last4": "Last 4 digits if applicable",
  "employee_name": "Last, First if applicable"
}

CRITICAL RULES:
1. Use STRICT "Last, First" format for person names
2. Never use forward slashes (/) anywhere
3. Latest signature date is the executed_date
4. Do NOT duplicate names in fields

Return ONLY valid JSON.`;
}

interface ContractAnalysis {
  is_contract: true;
  document_category?: string;
  counterparty?: string;
  executed_date?: string;
  contract_type?: string;
  description?: string;
  contractor_company?: string;
  contractor_individual?: string;
  is_corp_to_corp?: boolean | null;
  _aiUsed?: string;
}

interface DocumentAnalysis {
  is_contract: false;
  issuer_category?: string;
  issuer_name?: string;
  country?: string;
  state?: string;
  agency_name?: string;
  document_type?: string;
  period_end_date?: string;
  letter_date?: string;
  account_last4?: string;
  employee_name?: string;
  _aiUsed?: string;
}

type Analysis = ContractAnalysis | DocumentAnalysis;

async function analyzeWithGemini(pdfBase64: string): Promise<Analysis | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

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
      maxOutputTokens: 1000,
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 429) {
      console.log("Gemini quota hit, will fall back to Claude");
      return null;
    }

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) return null;

    const textResponse = data.candidates[0].content.parts[0].text;
    const match = textResponse.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const analysis = JSON.parse(match[0]) as Analysis;
    analysis._aiUsed = "Gemini";
    return analysis;
  } catch (err) {
    console.error("Gemini error:", err);
    return null;
  }
}

async function analyzeWithClaude(pdfBase64: string): Promise<Analysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const url = "https://api.anthropic.com/v1/messages";

  const payload = {
    model: CLAUDE_MODEL,
    max_tokens: 1000,
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
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const textResponse = data.content?.[0]?.text;
    if (!textResponse) return null;

    const match = textResponse.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const analysis = JSON.parse(match[0]) as Analysis;
    analysis._aiUsed = "Claude";
    return analysis;
  } catch (err) {
    console.error("Claude error:", err);
    return null;
  }
}

async function analyzeFile(pdfBase64: string): Promise<Analysis | null> {
  // Try Gemini first
  const geminiResult = await analyzeWithGemini(pdfBase64);
  if (geminiResult) return geminiResult;

  // Fall back to Claude
  return analyzeWithClaude(pdfBase64);
}

function buildContractFilename(analysis: ContractAnalysis): string {
  const counterparty = sanitize(analysis.counterparty || "");
  const executedDate = formatDate(analysis.executed_date || null);
  const contractType = sanitize(analysis.contract_type || "");
  const description = sanitize(analysis.description || "");
  const contractorCompany = sanitize(analysis.contractor_company || "");
  const contractorIndividual = sanitize(analysis.contractor_individual || "");

  let filename: string;

  if (contractType === "SubK" || contractType === "CSOW") {
    let base: string;
    if (contractorCompany && contractorIndividual) {
      base = `${contractorCompany} (${contractorIndividual})`;
    } else if (contractorCompany) {
      base = contractorCompany;
    } else if (contractorIndividual) {
      base = contractorIndividual;
    } else {
      base = counterparty;
    }

    if (contractType === "SubK") {
      filename = `${base} - ${executedDate} - Contractor Agreement`;
    } else {
      filename = `${base} - ${executedDate} - CSOW`;
      if (description) {
        filename += ` - ${description}`;
      }
    }
  } else {
    filename = `${counterparty} - ${executedDate} - ${contractType}`;
    if (description) {
      filename += ` - ${description}`;
    }
  }

  return `${filename}.pdf`;
}

function buildDocumentFilename(analysis: DocumentAnalysis): string {
  const issuerCategory = analysis.issuer_category || "OTHER";
  const issuerName = sanitize(analysis.issuer_name || "");
  const state = analysis.state || "";
  const agencyName = sanitize(analysis.agency_name || "");
  let docType = sanitize(analysis.document_type || "");
  const accountLast4 = sanitize(analysis.account_last4 || "");
  const employeeName = sanitize(analysis.employee_name || "");

  const formattedDate = formatDate(analysis.period_end_date || analysis.letter_date || null);

  // Build issuer part
  let issuerPart: string;
  if (issuerCategory === "GOVERNMENT_FEDERAL") {
    const country = analysis.country || "US";
    const agency = agencyName || issuerName;
    issuerPart = `${country} Government`;
    if (agency) {
      issuerPart += ` - ${agency}`;
    }
  } else if (issuerCategory === "GOVERNMENT_STATE") {
    if (state) {
      issuerPart = `State of ${state}`;
      if (agencyName) {
        issuerPart += ` - ${agencyName}`;
      }
    } else {
      issuerPart = issuerName || "State Government";
    }
  } else {
    issuerPart = issuerName || "Document";
  }

  // Add account last 4
  if (accountLast4 && !docType.toLowerCase().includes("ending in")) {
    docType += ` ending in ${accountLast4}`;
  }

  // Add employee name
  if (employeeName && !docType.toLowerCase().includes(employeeName.toLowerCase())) {
    docType += ` for ${employeeName}`;
  }

  const filename = `${issuerPart} - ${formattedDate} - ${docType}`;
  return sanitize(filename) + ".pdf";
}

export async function POST(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const toFileFolderId = process.env.FOLDER_TO_FILE;
    const contractsFolderId = process.env.FOLDER_ARCHIVE_CONTRACTS;
    const docsFolderId = process.env.FOLDER_ARCHIVE_DOCS;

    if (!toFileFolderId || !contractsFolderId || !docsFolderId) {
      return NextResponse.json(
        { error: "Folder IDs not configured (FOLDER_TO_FILE, FOLDER_ARCHIVE_CONTRACTS, FOLDER_ARCHIVE_DOCS)" },
        { status: 500 }
      );
    }

    const auth = getGoogleAuth();
    const drive = google.drive({ version: "v3", auth });

    // Get PDF files from "to file" folder
    const filesResponse = await drive.files.list({
      q: `'${toFileFolderId}' in parents and mimeType='application/pdf' and trashed=false`,
      fields: "files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = filesResponse.data.files || [];
    if (files.length === 0) {
      return NextResponse.json({
        success: true,
        processed: [],
        errors: [],
        message: "No files to process",
      });
    }

    const processed: Array<{ name: string; ai: string; kind: string }> = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!file.id || !file.name) continue;

      try {
        // Download file content
        const fileContent = await drive.files.get({
          fileId: file.id,
          alt: "media",
          supportsAllDrives: true,
        }, { responseType: "arraybuffer" });

        const pdfBase64 = Buffer.from(fileContent.data as ArrayBuffer).toString("base64");

        // Analyze with AI
        const analysis = await analyzeFile(pdfBase64);
        if (!analysis) {
          errors.push(`${file.name}: AI analysis failed`);
          continue;
        }

        const aiUsed = analysis._aiUsed || "Unknown";
        let newName: string;
        let targetFolder: string;
        let kind: string;

        if (analysis.is_contract) {
          newName = buildContractFilename(analysis as ContractAnalysis);
          targetFolder = contractsFolderId;
          kind = "CONTRACT";
        } else {
          newName = buildDocumentFilename(analysis as DocumentAnalysis);
          targetFolder = docsFolderId;
          kind = "DOCUMENT";
        }

        // Get current parents
        const fileInfo = await drive.files.get({
          fileId: file.id,
          fields: "parents",
          supportsAllDrives: true,
        });

        const previousParents = fileInfo.data.parents?.join(",") || "";

        // Rename and move file
        await drive.files.update({
          fileId: file.id,
          requestBody: { name: newName },
          addParents: targetFolder,
          removeParents: previousParents,
          supportsAllDrives: true,
        });

        processed.push({ name: newName, ai: aiUsed, kind });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${file.name}: ${message}`);
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      errors,
      message: `Processed ${processed.length} files`,
    });
  } catch (error) {
    console.error("Process error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET endpoint to list files in "to file" folder
export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const toFileFolderId = process.env.FOLDER_TO_FILE;
    if (!toFileFolderId) {
      return NextResponse.json(
        { error: "FOLDER_TO_FILE not configured" },
        { status: 500 }
      );
    }

    const auth = getGoogleAuth();
    const drive = google.drive({ version: "v3", auth });

    const filesResponse = await drive.files.list({
      q: `'${toFileFolderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType, createdTime)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      orderBy: "createdTime desc",
    });

    return NextResponse.json({
      files: filesResponse.data.files || [],
    });
  } catch (error) {
    console.error("List files error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
