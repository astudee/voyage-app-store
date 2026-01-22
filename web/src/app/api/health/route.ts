import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

interface HealthResult {
  status: "success" | "warning" | "error" | "not_configured";
  message: string;
  details: string;
}

interface HealthResults {
  [service: string]: HealthResult;
}

// Check Snowflake connection
async function checkSnowflake(): Promise<HealthResult> {
  try {
    const result = await query<{ VERSION: string }>(
      "SELECT CURRENT_VERSION() as VERSION"
    );
    return {
      status: "success",
      message: "Connected successfully",
      details: `Snowflake version: ${result[0]?.VERSION || "unknown"}`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message.toLowerCase() : "";
    if (errorMsg.includes("authentication") || errorMsg.includes("password")) {
      return {
        status: "error",
        message: "Authentication failed",
        details: "Check user/password in environment variables",
      };
    }
    return {
      status: "error",
      message: `Connection failed: ${error instanceof Error ? error.constructor.name : "Unknown"}`,
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Check Pipedrive API
async function checkPipedrive(): Promise<HealthResult> {
  const apiToken = process.env.PIPEDRIVE_API_TOKEN;
  if (!apiToken) {
    return {
      status: "not_configured",
      message: "PIPEDRIVE_API_TOKEN not configured",
      details: "Add PIPEDRIVE_API_TOKEN to environment variables",
    };
  }

  try {
    const response = await fetch(
      `https://api.pipedrive.com/v1/users/me?api_token=${apiToken}`,
      { method: "GET" }
    );

    if (response.status === 200) {
      const data = await response.json();
      if (data.success) {
        const userName = data.data?.name || "Unknown";
        const companyName = data.data?.company_name || "Unknown";
        return {
          status: "success",
          message: "Connected successfully",
          details: `Authenticated as ${userName} from ${companyName}`,
        };
      }
      return {
        status: "error",
        message: "API returned success=false",
        details: data.error || "Unknown error",
      };
    } else if (response.status === 401) {
      return {
        status: "error",
        message: "Authentication failed",
        details: "Invalid API token",
      };
    }
    return {
      status: "error",
      message: `HTTP ${response.status}`,
      details: await response.text(),
    };
  } catch (error) {
    return {
      status: "error",
      message: `Connection failed: ${error instanceof Error ? error.constructor.name : "Unknown"}`,
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Check BigTime API
async function checkBigTime(): Promise<HealthResult> {
  const apiKey = process.env.BIGTIME_API_KEY;
  const firmId = process.env.BIGTIME_FIRM_ID;

  if (!apiKey || !firmId) {
    return {
      status: "not_configured",
      message: "BigTime API not configured",
      details: "Add BIGTIME_API_KEY and BIGTIME_FIRM_ID to environment variables",
    };
  }

  try {
    const response = await fetch(
      "https://iq.bigtime.net/BigtimeData/api/v2/firm",
      {
        method: "GET",
        headers: {
          "X-Auth-Token": apiKey,
          "X-Auth-Realm": firmId,
        },
      }
    );

    if (response.status === 200) {
      const data = await response.json();
      return {
        status: "success",
        message: "Connected successfully",
        details: `Firm: ${data.FirmName || firmId}`,
      };
    } else if (response.status === 401) {
      return {
        status: "error",
        message: "Authentication failed",
        details: "Invalid API key or firm ID",
      };
    }
    return {
      status: "error",
      message: `HTTP ${response.status}`,
      details: await response.text(),
    };
  } catch (error) {
    return {
      status: "error",
      message: `Connection failed: ${error instanceof Error ? error.constructor.name : "Unknown"}`,
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Check QuickBooks API
async function checkQuickBooks(): Promise<HealthResult> {
  const refreshToken = process.env.QB_REFRESH_TOKEN;
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    return {
      status: "not_configured",
      message: "QuickBooks API not configured",
      details: "Add QB_REFRESH_TOKEN, QB_CLIENT_ID, QB_CLIENT_SECRET to environment variables",
    };
  }

  // For now, just report as configured but not tested
  // Full OAuth flow would require refreshing token
  return {
    status: "warning",
    message: "Configured but not tested",
    details: "QuickBooks requires OAuth token refresh to verify",
  };
}

// Check Claude API
async function checkClaude(): Promise<HealthResult> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return {
      status: "not_configured",
      message: "CLAUDE_API_KEY not configured",
      details: "Add CLAUDE_API_KEY to environment variables for AI features",
    };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    if (response.status === 200) {
      return {
        status: "success",
        message: "Connected successfully",
        details: "AI features available",
      };
    } else if (response.status === 401) {
      return {
        status: "error",
        message: "Authentication failed",
        details: "API key invalid or expired",
      };
    }
    return {
      status: "error",
      message: `API returned ${response.status}`,
      details: (await response.text()).substring(0, 200),
    };
  } catch (error) {
    return {
      status: "error",
      message: `Connection failed: ${error instanceof Error ? error.constructor.name : "Unknown"}`,
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Check Gemini API
async function checkGemini(): Promise<HealthResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      status: "not_configured",
      message: "GEMINI_API_KEY not configured",
      details: "Add GEMINI_API_KEY to environment variables for vault processing",
    };
  }

  try {
    // First, list available models
    const listResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (listResponse.status !== 200) {
      return {
        status: "error",
        message: `Could not list models (${listResponse.status})`,
        details: (await listResponse.text()).substring(0, 200),
      };
    }

    const data = await listResponse.json();
    const models = data.models || [];

    // Find a model that supports generateContent
    let targetModel: string | null = null;
    for (const m of models) {
      if (m.supportedGenerationMethods?.includes("generateContent")) {
        const modelName = m.name.replace("models/", "");
        if (modelName.includes("flash") || modelName.includes("pro")) {
          targetModel = modelName;
          break;
        }
        if (!targetModel) {
          targetModel = modelName;
        }
      }
    }

    if (!targetModel) {
      return {
        status: "error",
        message: "No text generation models found",
        details: "API key works but no models support generateContent",
      };
    }

    return {
      status: "success",
      message: "Connected successfully",
      details: `Available model: ${targetModel}`,
    };
  } catch (error) {
    return {
      status: "error",
      message: `Connection failed: ${error instanceof Error ? error.constructor.name : "Unknown"}`,
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Check Google APIs (Drive, Sheets, Gmail)
async function checkGoogleAPIs(): Promise<HealthResult> {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    return {
      status: "not_configured",
      message: "Google APIs not configured",
      details: "Add GOOGLE_SERVICE_ACCOUNT_KEY to environment variables",
    };
  }

  // For now, just report as configured
  // Full verification would require parsing the key and making API calls
  return {
    status: "warning",
    message: "Configured but not fully tested",
    details: "Service account key present. Full verification requires API calls.",
  };
}

// GET /api/health - Run all health checks
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: HealthResults = {};

  // Run all checks in parallel
  const [
    snowflake,
    pipedrive,
    bigtime,
    quickbooks,
    claude,
    gemini,
    google,
  ] = await Promise.all([
    checkSnowflake(),
    checkPipedrive(),
    checkBigTime(),
    checkQuickBooks(),
    checkClaude(),
    checkGemini(),
    checkGoogleAPIs(),
  ]);

  results["Snowflake"] = snowflake;
  results["Pipedrive"] = pipedrive;
  results["BigTime"] = bigtime;
  results["QuickBooks"] = quickbooks;
  results["Claude API"] = claude;
  results["Gemini API"] = gemini;
  results["Google APIs"] = google;

  // Calculate summary
  const total = Object.keys(results).length;
  const successCount = Object.values(results).filter((r) => r.status === "success").length;
  const warningCount = Object.values(results).filter((r) => r.status === "warning").length;
  const errorCount = Object.values(results).filter((r) => r.status === "error").length;
  const notConfiguredCount = Object.values(results).filter((r) => r.status === "not_configured").length;

  return NextResponse.json({
    results,
    summary: {
      total,
      success: successCount,
      warning: warningCount,
      error: errorCount,
      notConfigured: notConfiguredCount,
    },
    timestamp: new Date().toISOString(),
  });
}
