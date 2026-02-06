import { NextRequest, NextResponse } from "next/server";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/voicemail-transcription
 *
 * Called asynchronously by Twilio once the voicemail transcription is ready.
 * Sends an email notification to hello@voyageadvisory.com via Gmail API.
 *
 * Required env vars: GOOGLE_SERVICE_ACCOUNT_KEY
 * Optional: GMAIL_DELEGATED_USER (defaults to astudee@voyageadvisory.com)
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const transcriptionText = formData.get("TranscriptionText")?.toString() || "(transcription unavailable)";
  const recordingUrl = formData.get("RecordingUrl")?.toString() || "";
  const callerNumber = formData.get("From")?.toString() || "Unknown";
  const callSid = formData.get("CallSid")?.toString() || "";

  console.log("========================================");
  console.log("[Voicemail Transcription]");
  console.log(`  From:          ${callerNumber}`);
  console.log(`  CallSid:       ${callSid}`);
  console.log(`  Recording:     ${recordingUrl}`);
  console.log(`  Transcription: ${transcriptionText}`);
  console.log("========================================");

  // Send email notification via Gmail API
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    try {
      const toEmails = phoneConfig.voicemailEmails.filter(Boolean);
      if (toEmails.length === 0) {
        console.warn("[Voicemail] No voicemail email addresses configured");
        return NextResponse.json({ status: "received" });
      }

      const delegatedUser = process.env.GMAIL_DELEGATED_USER || "astudee@voyageadvisory.com";

      let keyData;
      try {
        keyData = JSON.parse(serviceAccountKey);
      } catch {
        console.error("[Voicemail] Invalid GOOGLE_SERVICE_ACCOUNT_KEY JSON");
        return NextResponse.json({ status: "received" });
      }

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #1a1a2e;">New Voicemail</h2>
          <table style="border-collapse: collapse; width: 100%; margin-bottom: 16px;">
            <tr>
              <td style="padding: 8px 12px; font-weight: bold; color: #555;">From:</td>
              <td style="padding: 8px 12px;">${callerNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; font-weight: bold; color: #555;">Transcription:</td>
              <td style="padding: 8px 12px; font-style: italic;">"${transcriptionText}"</td>
            </tr>
            ${recordingUrl ? `
            <tr>
              <td style="padding: 8px 12px; font-weight: bold; color: #555;">Recording:</td>
              <td style="padding: 8px 12px;">
                <a href="${recordingUrl}" style="color: #0066cc;">Listen to recording</a>
              </td>
            </tr>
            ` : ""}
          </table>
          <p style="color: #888; font-size: 12px;">
            Call SID: ${callSid}<br>
            Sent by Voyage Advisory Phone System
          </p>
        </div>
      `;

      const mimeMessage = [
        `From: ${delegatedUser}`,
        `To: ${toEmails.join(", ")}`,
        `Subject: Voicemail from ${callerNumber}`,
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
        console.error("[Voicemail] Failed to get Gmail access token");
        return NextResponse.json({ status: "received" });
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

      if (!response.ok) {
        const err = await response.text();
        console.error("[Voicemail] Gmail send failed:", err);
      } else {
        console.log("[Voicemail] Email notification sent to:", toEmails.join(", "));
      }
    } catch (error) {
      console.error("[Voicemail] Email notification error:", error);
    }
  } else {
    console.warn("[Voicemail] GOOGLE_SERVICE_ACCOUNT_KEY not set — skipping email notification");
  }

  return NextResponse.json({ status: "received" });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
