import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";
import { google } from "googleapis";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

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
      message: `Connection failed`,
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
      message: `Connection failed`,
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
    // Use report endpoint with POST (same as Python bigtime.py)
    // Report 284796 is the standard time report
    const currentYear = new Date().getFullYear();
    const response = await fetch(
      "https://iq.bigtime.net/BigtimeData/api/v2/report/data/284796",
      {
        method: "POST",
        headers: {
          "X-Auth-ApiToken": apiKey,
          "X-Auth-Realm": firmId,
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          DT_BEGIN: `${currentYear}-01-01`,
          DT_END: `${currentYear}-01-31`,
        }),
      }
    );

    if (response.status === 200) {
      const data = await response.json();
      const rowCount = data?.Data?.length || 0;
      return {
        status: "success",
        message: "Connected successfully",
        details: `Firm ID: ${firmId} (${rowCount} time entries in Jan ${currentYear})`,
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
      message: `Connection failed`,
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Check QuickBooks API
async function checkQuickBooks(): Promise<HealthResult> {
  const refreshToken = process.env.QB_REFRESH_TOKEN;
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  const realmId = process.env.QB_REALM_ID;

  if (!refreshToken || !clientId || !clientSecret || !realmId) {
    return {
      status: "not_configured",
      message: "QuickBooks API not configured",
      details: "Add QB_REFRESH_TOKEN, QB_CLIENT_ID, QB_CLIENT_SECRET, QB_REALM_ID",
    };
  }

  try {
    // Try to refresh the token to verify credentials
    const tokenResponse = await fetch(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
      }
    );

    if (tokenResponse.status === 200) {
      const tokenData = await tokenResponse.json();
      if (tokenData.access_token) {
        return {
          status: "success",
          message: "Connected successfully",
          details: `Token valid. Realm ID: ${realmId}`,
        };
      }
    }

    const errorText = await tokenResponse.text();
    if (errorText.includes("invalid_grant")) {
      return {
        status: "error",
        message: "Token expired",
        details: "Refresh token is expired. Use QuickBooks Token Refresh utility.",
      };
    }

    return {
      status: "error",
      message: `Token refresh failed (${tokenResponse.status})`,
      details: errorText.substring(0, 200),
    };
  } catch (error) {
    return {
      status: "error",
      message: `Connection failed`,
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Check Claude API
async function checkClaude(): Promise<HealthResult> {
  const apiKey = process.env.CLAUDE_API_KEY;

  if (!apiKey) {
    return {
      status: "not_configured",
      message: "CLAUDE_API_KEY not configured",
      details: "Add CLAUDE_API_KEY to environment variables",
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
        details: "CLAUDE_API_KEY working. AI features available.",
      };
    } else if (response.status === 401) {
      return {
        status: "error",
        message: "Authentication failed",
        details: "CLAUDE_API_KEY is invalid. Check key value in Vercel.",
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
      message: "Connection failed",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Check ChatGPT/OpenAI API
async function checkChatGPT(): Promise<HealthResult> {
  const apiKey = process.env.CHATGPT_API_KEY;
  if (!apiKey) {
    return {
      status: "not_configured",
      message: "CHATGPT_API_KEY not configured",
      details: "Add CHATGPT_API_KEY to environment variables",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.status === 200) {
      const data = await response.json();
      const modelCount = data.data?.length || 0;
      return {
        status: "success",
        message: "Connected successfully",
        details: `Access to ${modelCount} models`,
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
      message: "Connection failed",
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
    // List available models
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
      details: `Using model: ${targetModel}`,
    };
  } catch (error) {
    return {
      status: "error",
      message: `Connection failed`,
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Helper to get Google auth client
function getGoogleAuthClient(scopes: string[], impersonateEmail?: string) {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    return null;
  }

  try {
    const credentials = JSON.parse(serviceAccountKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes,
    });

    if (impersonateEmail) {
      // For domain-wide delegation (Gmail)
      const client = new google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes,
        subject: impersonateEmail,
      });
      return { client, credentials };
    }

    return { auth, credentials };
  } catch {
    return null;
  }
}

// Check Google Drive
async function checkGoogleDrive(): Promise<HealthResult> {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    return {
      status: "not_configured",
      message: "Google APIs not configured",
      details: "Add GOOGLE_SERVICE_ACCOUNT_KEY to environment variables",
    };
  }

  // Get folder IDs to test (only folders actually used by apps)
  const folderConfigs: { [key: string]: string | undefined } = {
    "To-File Inbox": process.env.FOLDER_TO_FILE,
    "Archive - Contracts": process.env.FOLDER_ARCHIVE_CONTRACTS,
    "Archive - Docs": process.env.FOLDER_ARCHIVE_DOCS,
    "Reports": process.env.REPORTS_FOLDER_ID,
  };

  // Filter out undefined
  const folders = Object.entries(folderConfigs).filter(([, v]) => v);

  if (folders.length === 0) {
    return {
      status: "warning",
      message: "No folder IDs configured",
      details: "Service account key present but no FOLDER_* env vars set",
    };
  }

  try {
    const authResult = getGoogleAuthClient([
      "https://www.googleapis.com/auth/drive.readonly",
    ]);
    if (!authResult) {
      return {
        status: "error",
        message: "Invalid service account key",
        details: "Could not parse GOOGLE_SERVICE_ACCOUNT_KEY JSON",
      };
    }

    const { auth, credentials } = authResult as { auth: InstanceType<typeof google.auth.GoogleAuth>; credentials: { client_email: string } };
    const drive = google.drive({ version: "v3", auth });

    const accessible: string[] = [];
    const inaccessible: string[] = [];

    for (const [name, folderId] of folders) {
      try {
        const response = await drive.files.get({
          fileId: folderId,
          fields: "id,name",
          supportsAllDrives: true,
        });
        accessible.push(`${name} (${response.data.name})`);
      } catch (e) {
        const error = e as { code?: number };
        if (error.code === 404) {
          inaccessible.push(`${name}: Not found`);
        } else if (error.code === 403) {
          inaccessible.push(`${name}: Permission denied`);
        } else {
          inaccessible.push(`${name}: Error`);
        }
      }
    }

    if (inaccessible.length > 0 && accessible.length === 0) {
      // All folders failed - error
      return {
        status: "error",
        message: `Cannot access any folders`,
        details: `SA: ${credentials.client_email}\nInaccessible: ${inaccessible.join(", ")}`,
      };
    }

    if (inaccessible.length > 0) {
      // Some folders failed - warning (partial access is still useful)
      return {
        status: "warning",
        message: `${accessible.length}/${folders.length} folders accessible`,
        details: `SA: ${credentials.client_email}\nAccessible: ${accessible.join(", ")}\nInaccessible: ${inaccessible.join(", ")}`,
      };
    }

    return {
      status: "success",
      message: "Connected successfully",
      details: `Service account can access all ${accessible.length} folders`,
    };
  } catch (error) {
    return {
      status: "error",
      message: "Connection failed",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Check Google Docs (Contract Standards template)
async function checkGoogleDocs(): Promise<HealthResult> {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const docId = process.env.CONTRACT_STANDARDS_DOC_ID;

  if (!serviceAccountKey) {
    return {
      status: "not_configured",
      message: "Google APIs not configured",
      details: "Add GOOGLE_SERVICE_ACCOUNT_KEY to environment variables",
    };
  }

  if (!docId) {
    return {
      status: "not_configured",
      message: "CONTRACT_STANDARDS_DOC_ID not configured",
      details: "Add CONTRACT_STANDARDS_DOC_ID to environment variables",
    };
  }

  try {
    const authResult = getGoogleAuthClient([
      "https://www.googleapis.com/auth/drive.readonly",
    ]);
    if (!authResult) {
      return {
        status: "error",
        message: "Invalid service account key",
        details: "Could not parse GOOGLE_SERVICE_ACCOUNT_KEY JSON",
      };
    }

    const { auth } = authResult as { auth: InstanceType<typeof google.auth.GoogleAuth> };
    const drive = google.drive({ version: "v3", auth });

    const response = await drive.files.get({
      fileId: docId,
      fields: "id,name,mimeType",
      supportsAllDrives: true,
    });

    return {
      status: "success",
      message: "Connected successfully",
      details: `Can access: ${response.data.name}`,
    };
  } catch (e) {
    const error = e as { code?: number; message?: string };
    if (error.code === 404) {
      return {
        status: "error",
        message: "Document not found",
        details: "Check CONTRACT_STANDARDS_DOC_ID is correct",
      };
    } else if (error.code === 403) {
      return {
        status: "error",
        message: "Permission denied",
        details: "Service account needs access to this document",
      };
    }
    return {
      status: "error",
      message: "Connection failed",
      details: error.message || "Unknown error",
    };
  }
}

// Check Config Data (Snowflake - migrated from Google Sheets)
async function checkConfigData(): Promise<HealthResult> {
  try {
    const result = await query<{ COUNT: number }>(
      "SELECT COUNT(*) as COUNT FROM VC_STAFF"
    );
    const count = result[0]?.COUNT || 0;

    if (count > 0) {
      return {
        status: "success",
        message: "Config loaded from Snowflake",
        details: `Found ${count} staff members in VC_STAFF`,
      };
    }

    return {
      status: "warning",
      message: "No config data found",
      details: "VC_STAFF table is empty",
    };
  } catch (error) {
    return {
      status: "error",
      message: "Could not read config",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Check Cloudflare R2
async function checkCloudflareR2(): Promise<HealthResult> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    const missing = [];
    if (!accountId) missing.push("R2_ACCOUNT_ID");
    if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
    if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
    if (!bucketName) missing.push("R2_BUCKET_NAME");
    return {
      status: "not_configured",
      message: "Cloudflare R2 not configured",
      details: `Missing: ${missing.join(", ")}`,
    };
  }

  try {
    const r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // List files in each folder to verify access
    const folders = ["to-file/", "review/", "archive/"];
    const folderCounts: { [key: string]: number } = {};

    for (const prefix of folders) {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        MaxKeys: 100,
      });
      const response = await r2Client.send(command);
      folderCounts[prefix.replace("/", "")] = response.Contents?.length || 0;
    }

    const totalFiles = Object.values(folderCounts).reduce((a, b) => a + b, 0);
    const folderSummary = Object.entries(folderCounts)
      .map(([name, count]) => `${name}: ${count}`)
      .join(", ");

    return {
      status: "success",
      message: "Connected successfully",
      details: `Bucket: ${bucketName} (${totalFiles} files: ${folderSummary})`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "";
    if (errorMsg.includes("AccessDenied") || errorMsg.includes("InvalidAccessKeyId")) {
      return {
        status: "error",
        message: "Authentication failed",
        details: "Check R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY",
      };
    }
    if (errorMsg.includes("NoSuchBucket")) {
      return {
        status: "error",
        message: "Bucket not found",
        details: `Bucket "${process.env.R2_BUCKET_NAME}" does not exist`,
      };
    }
    return {
      status: "error",
      message: "Connection failed",
      details: errorMsg || "Unknown error",
    };
  }
}

// Check Gmail (sends actual test email)
async function checkGmail(sendTestEmail: boolean = false): Promise<HealthResult> {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    return {
      status: "not_configured",
      message: "Google APIs not configured",
      details: "Add GOOGLE_SERVICE_ACCOUNT_KEY to environment variables",
    };
  }

  const notificationEmail = process.env.NOTIFICATION_EMAIL || "astudee@voyageadvisory.com";
  const impersonateEmail = process.env.GMAIL_IMPERSONATE_EMAIL || "astudee@voyageadvisory.com";

  try {
    const authResult = getGoogleAuthClient(
      ["https://www.googleapis.com/auth/gmail.send"],
      impersonateEmail
    );

    if (!authResult) {
      return {
        status: "error",
        message: "Invalid service account key",
        details: "Could not parse GOOGLE_SERVICE_ACCOUNT_KEY JSON",
      };
    }

    const { client, credentials } = authResult as { client: InstanceType<typeof google.auth.JWT>; credentials: { client_email: string; client_id: string } };

    if (!sendTestEmail) {
      // Just verify we can authenticate
      try {
        await client.authorize();
        return {
          status: "success",
          message: "Configured (test email not sent)",
          details: `Service account: ${credentials.client_email}. Click "Send Test Email" to verify delivery.`,
        };
      } catch (authError) {
        const errorMsg = authError instanceof Error ? authError.message : "";
        if (errorMsg.includes("delegation") || errorMsg.includes("unauthorized")) {
          return {
            status: "error",
            message: "Domain-wide delegation issue",
            details: `Verify Client ID ${credentials.client_id} is authorized in Workspace Admin with gmail.send scope`,
          };
        }
        return {
          status: "error",
          message: "Authentication failed",
          details: errorMsg,
        };
      }
    }

    // Send actual test email
    const gmail = google.gmail({ version: "v1", auth: client });

    const timestamp = new Date().toISOString();
    const emailContent = [
      `To: ${notificationEmail}`,
      `From: ${impersonateEmail}`,
      "Subject: Voyage App Store - Gmail Health Check",
      "Content-Type: text/plain; charset=utf-8",
      "",
      `This is an automated health check test.`,
      "",
      `Timestamp: ${timestamp}`,
      `Service Account: ${credentials.client_email}`,
      "",
      "If you received this, Gmail API is working correctly!",
      "",
      "You can safely delete this email.",
    ].join("\r\n");

    const encodedMessage = Buffer.from(emailContent)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    return {
      status: "success",
      message: "Test email sent!",
      details: `Email sent to ${notificationEmail}. Check inbox to confirm delivery.`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "";
    if (errorMsg.includes("delegation") || errorMsg.includes("unauthorized") || errorMsg.includes("insufficient")) {
      return {
        status: "error",
        message: "Domain-wide delegation issue",
        details: "Verify service account Client ID is authorized in Workspace Admin with gmail.send scope",
      };
    }
    return {
      status: "error",
      message: "Failed to send email",
      details: errorMsg || "Unknown error",
    };
  }
}

// Check Zendesk API
async function checkZendesk(): Promise<HealthResult> {
  const subdomain = (process.env.ZENDESK_SUBDOMAIN || "").trim();
  const email = (process.env.ZENDESK_AGENT_EMAIL || "").trim();
  const token = (process.env.ZENDESK_API_TOKEN || "").trim();

  if (!subdomain || !email || !token || token === "placeholder") {
    return {
      status: "not_configured",
      message: "Zendesk not configured",
      details: "Add ZENDESK_SUBDOMAIN, ZENDESK_AGENT_EMAIL, and ZENDESK_API_TOKEN to environment variables",
    };
  }

  try {
    const credentials = `${email}/token:${token}`;
    const response = await fetch(
      `https://${subdomain}.zendesk.com/api/v2/users/me.json`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(credentials).toString("base64")}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 200) {
      const data = await response.json();
      const userName = data.user?.name || "Unknown";
      const userRole = data.user?.role || "unknown";
      const userEmail = data.user?.email || "unknown";
      const isAgent = userRole === "agent" || userRole === "admin";
      const emailUsed = email?.trim();
      const emailMatch = userEmail === emailUsed;
      return {
        status: isAgent ? "success" : "warning",
        message: isAgent ? "Connected successfully" : "Connected but wrong role",
        details: isAgent
          ? `Authenticated as ${userName} (${userRole}) on ${subdomain}.zendesk.com`
          : `Authenticated as "${userName}" (${userEmail}) with role "${userRole}". Auth email used: "${emailUsed}" (${emailUsed?.length} chars). Email match: ${emailMatch}. Token length: ${token?.trim().length}. Ticket Watcher requires agent or admin role.`,
      };
    } else if (response.status === 401) {
      return {
        status: "error",
        message: "Authentication failed",
        details: "Invalid email or API token",
      };
    }
    return {
      status: "error",
      message: `HTTP ${response.status}`,
      details: (await response.text()).substring(0, 200),
    };
  } catch (error) {
    return {
      status: "error",
      message: "Connection failed",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// GET /api/health - Run all health checks
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if we should send test email
  const url = new URL(request.url);
  const sendTestEmail = url.searchParams.get("sendTestEmail") === "true";

  const results: HealthResults = {};

  // Run all checks in parallel
  const [
    snowflake,
    pipedrive,
    bigtime,
    quickbooks,
    zendesk,
    cloudflareR2,
    claude,
    chatgpt,
    gemini,
    googleDrive,
    googleDocs,
    configData,
    gmail,
  ] = await Promise.all([
    checkSnowflake(),
    checkPipedrive(),
    checkBigTime(),
    checkQuickBooks(),
    checkZendesk(),
    checkCloudflareR2(),
    checkClaude(),
    checkChatGPT(),
    checkGemini(),
    checkGoogleDrive(),
    checkGoogleDocs(),
    checkConfigData(),
    checkGmail(sendTestEmail),
  ]);

  // Order matters for display
  results["Snowflake"] = snowflake;
  results["BigTime"] = bigtime;
  results["QuickBooks"] = quickbooks;
  results["Pipedrive"] = pipedrive;
  results["Zendesk"] = zendesk;
  results["Cloudflare R2"] = cloudflareR2;
  results["Google Drive"] = googleDrive;
  results["Google Docs"] = googleDocs;
  results["Config Data"] = configData;
  results["Gmail"] = gmail;
  results["Claude API"] = claude;
  results["ChatGPT API"] = chatgpt;
  results["Gemini API"] = gemini;

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
