/**
 * Shared Gmail API helper for sending emails via Google Service Account.
 *
 * Used by phone system notifications (voicemail, SMS forwarding, etc.).
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_KEY  - JSON service account credentials
 *   GMAIL_DELEGATED_USER        - (optional) defaults to astudee@voyageadvisory.com
 */

interface SendEmailOptions {
  to: string[];
  subject: string;
  htmlBody: string;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
  gmailResponse?: Record<string, unknown>;
}

/**
 * Send an email via Gmail API using the Google service account.
 * Returns result object with success flag and details.
 */
export async function sendGmailNotification(options: SendEmailOptions): Promise<SendEmailResult> {
  const { to, subject, htmlBody } = options;

  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    console.warn("[Gmail] GOOGLE_SERVICE_ACCOUNT_KEY not set — skipping email");
    return { success: false, error: "GOOGLE_SERVICE_ACCOUNT_KEY not set" };
  }

  if (to.length === 0) {
    console.warn("[Gmail] No recipient email addresses provided");
    return { success: false, error: "No recipient email addresses" };
  }

  let keyData;
  try {
    keyData = JSON.parse(serviceAccountKey);
  } catch {
    console.error("[Gmail] Invalid GOOGLE_SERVICE_ACCOUNT_KEY JSON");
    return { success: false, error: "Invalid GOOGLE_SERVICE_ACCOUNT_KEY JSON" };
  }

  const delegatedUser = process.env.GMAIL_DELEGATED_USER || "astudee@voyageadvisory.com";

  try {
    const mimeMessage = [
      `From: ${delegatedUser}`,
      `To: ${to.join(", ")}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      htmlBody,
    ].join("\r\n");

    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({
      credentials: keyData,
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      clientOptions: { subject: delegatedUser },
    });

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      console.error("[Gmail] Failed to get access token");
      return { success: false, error: "Failed to get Gmail access token" };
    }

    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: Buffer.from(mimeMessage).toString("base64url"),
        }),
      }
    );

    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("[Gmail] Send failed:", JSON.stringify(responseBody));
      return { success: false, error: `Gmail API ${response.status}`, gmailResponse: responseBody };
    }

    console.log("[Gmail] Email sent to:", to.join(", "));
    return { success: true, gmailResponse: responseBody };
  } catch (error) {
    console.error("[Gmail] Error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
