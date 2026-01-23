import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const CONTRACT_STANDARDS_DOC_ID = process.env.CONTRACT_STANDARDS_DOC_ID || "1RbPIYVgYH1HZ-FQTHYbQWycHshe-K_L5OZkat45VQnQ";

async function fetchGoogleDocContent(docId: string): Promise<string | null> {
  // Try public export first (works if doc is "Anyone with link can view")
  try {
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    const response = await fetch(exportUrl, { next: { revalidate: 3600 } }); // Cache for 1 hour

    if (response.ok) {
      return await response.text();
    }
  } catch {
    // Continue to authenticated fallback
  }

  // Try authenticated access
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    return null;
  }

  try {
    const keyData = JSON.parse(serviceAccountKey);
    const { GoogleAuth } = await import("google-auth-library");

    const auth = new GoogleAuth({
      credentials: keyData,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) return null;

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=text/plain`,
      {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
        },
      }
    );

    if (response.ok) {
      return await response.text();
    }
  } catch (e) {
    console.error("Failed to fetch Google Doc:", e);
  }

  return null;
}

async function callClaudeAPI(contractText: string, standardsText: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Claude API key not configured");
  }

  const prompt = `You are a legal contract reviewer for Voyage Advisory LLC. Your task is to review the contract provided below against Voyage's contract standards.

## Voyage Contract Standards
${standardsText}

## Contract to Review
${contractText}

## Instructions
Please provide a comprehensive review of the contract following this format:

### GENERAL COMMENTS
Provide 2-4 paragraphs summarizing the overall contract, key concerns, and general observations. Do NOT use bullet points in this section.

### DETAILED FINDINGS

For each issue found, provide a bullet point in this format:
• **Section [X.X]: [Issue Title]** - [Description of the issue and why it's a concern based on Voyage's standards].
  **Proposed Language:** "[Exact replacement language to use]"

For missing provisions that should be added:
• **Proposed New Section [X.X]: [Title]** - [Explanation of what's missing and why it should be added].
  **Proposed Language:** "[Exact language to insert]"

Group your findings by category:
1. Limitation of Liability
2. Work Product and Intellectual Property
3. Payment Terms
4. Indemnification
5. Confidentiality
6. Termination
7. Governing Law and Venue
8. Entity Names and Signature Blocks
9. Other Concerns

### SUMMARY
A brief paragraph summarizing the most critical items that must be addressed before signing.

Remember:
- Reference specific section numbers from the contract
- Propose specific replacement language using Voyage's preferred standards
- Flag any unusual, non-standard, or one-sided provisions
- Check entity names in preamble and signature blocks
- Verify master agreement references if this is a SOW`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || null;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { contractText, standardsDocId } = body;

    if (!contractText || contractText.trim().length < 100) {
      return NextResponse.json(
        { error: "Please provide contract text (at least 100 characters)" },
        { status: 400 }
      );
    }

    // Fetch standards
    const docId = standardsDocId || CONTRACT_STANDARDS_DOC_ID;
    const standardsText = await fetchGoogleDocContent(docId);

    if (!standardsText) {
      return NextResponse.json(
        { error: "Could not load contract standards. Please ensure the document is accessible." },
        { status: 500 }
      );
    }

    // Call Claude
    const review = await callClaudeAPI(contractText, standardsText);

    if (!review) {
      return NextResponse.json(
        { error: "Failed to generate review" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      review,
      standardsLoaded: true,
      contractLength: contractText.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Contract review error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
