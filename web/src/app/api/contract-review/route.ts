import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CONTRACT_STANDARDS } from "@/data/contract-standards";

async function callClaudeAPI(contractText: string, standardsText: string): Promise<string | null> {
  // Try ANTHROPIC_API_KEY first, fall back to CLAUDE_API_KEY
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error("Claude API key not configured (set ANTHROPIC_API_KEY or CLAUDE_API_KEY)");
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
    const { contractText } = body;

    if (!contractText || contractText.trim().length < 100) {
      return NextResponse.json(
        { error: "Please provide contract text (at least 100 characters)" },
        { status: 400 }
      );
    }

    // Call Claude with bundled standards (no external fetch needed)
    const review = await callClaudeAPI(contractText, CONTRACT_STANDARDS);

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
