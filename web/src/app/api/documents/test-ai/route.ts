import { NextResponse } from "next/server";

const GEMINI_MODEL = "gemini-2.0-flash";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// GET - Test AI API connectivity
export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    environment: {},
    gemini: { status: "not_tested" },
    claude: { status: "not_tested" },
  };

  // Check environment variables
  const geminiKey = process.env.GEMINI_API_KEY;
  const claudeKey = process.env.CLAUDE_API_KEY;

  results.environment = {
    GEMINI_API_KEY: geminiKey ? `exists (${geminiKey.length} chars)` : "NOT SET",
    CLAUDE_API_KEY: claudeKey ? `exists (${claudeKey.length} chars)` : "NOT SET",
    NODE_ENV: process.env.NODE_ENV,
  };

  console.log("[test-ai] Environment check:", results.environment);

  // Test Gemini API
  if (geminiKey) {
    try {
      console.log("[test-ai] Testing Gemini API...");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;

      const payload = {
        contents: [
          {
            parts: [{ text: "Reply with exactly: GEMINI_OK" }],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 50,
        },
      };

      const startTime = Date.now();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const duration = Date.now() - startTime;
      console.log(`[test-ai] Gemini response status: ${response.status} (${duration}ms)`);

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "no text";
        console.log("[test-ai] Gemini response text:", text);
        results.gemini = {
          status: "success",
          response_status: response.status,
          duration_ms: duration,
          response_text: text.trim(),
          model: GEMINI_MODEL,
        };
      } else {
        const errorText = await response.text();
        console.log("[test-ai] Gemini error:", errorText);
        results.gemini = {
          status: "error",
          response_status: response.status,
          duration_ms: duration,
          error: errorText.substring(0, 500),
          model: GEMINI_MODEL,
        };
      }
    } catch (err) {
      console.error("[test-ai] Gemini exception:", err);
      results.gemini = {
        status: "exception",
        error: err instanceof Error ? err.message : String(err),
        model: GEMINI_MODEL,
      };
    }
  } else {
    results.gemini = { status: "skipped", reason: "GEMINI_API_KEY not set" };
  }

  // Test Claude API
  if (claudeKey) {
    try {
      console.log("[test-ai] Testing Claude API...");
      const url = "https://api.anthropic.com/v1/messages";

      const payload = {
        model: CLAUDE_MODEL,
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: "Reply with exactly: CLAUDE_OK",
          },
        ],
      };

      const startTime = Date.now();
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": claudeKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const duration = Date.now() - startTime;
      console.log(`[test-ai] Claude response status: ${response.status} (${duration}ms)`);

      if (response.ok) {
        const data = await response.json();
        const text = data.content?.[0]?.text || "no text";
        console.log("[test-ai] Claude response text:", text);
        results.claude = {
          status: "success",
          response_status: response.status,
          duration_ms: duration,
          response_text: text.trim(),
          model: CLAUDE_MODEL,
        };
      } else {
        const errorText = await response.text();
        console.log("[test-ai] Claude error:", errorText);
        results.claude = {
          status: "error",
          response_status: response.status,
          duration_ms: duration,
          error: errorText.substring(0, 500),
          model: CLAUDE_MODEL,
        };
      }
    } catch (err) {
      console.error("[test-ai] Claude exception:", err);
      results.claude = {
        status: "exception",
        error: err instanceof Error ? err.message : String(err),
        model: CLAUDE_MODEL,
      };
    }
  } else {
    results.claude = { status: "skipped", reason: "CLAUDE_API_KEY not set" };
  }

  // Summary
  results.summary = {
    gemini_working: (results.gemini as Record<string, unknown>).status === "success",
    claude_working: (results.claude as Record<string, unknown>).status === "success",
    at_least_one_working:
      (results.gemini as Record<string, unknown>).status === "success" ||
      (results.claude as Record<string, unknown>).status === "success",
  };

  console.log("[test-ai] Final results:", JSON.stringify(results, null, 2));

  return NextResponse.json(results);
}
