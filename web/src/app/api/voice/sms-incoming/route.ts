import { NextRequest, NextResponse } from "next/server";
import { phoneConfig } from "@/lib/phone-config";
import { sendGmailNotification } from "@/lib/gmail";

/**
 * POST /api/voice/sms-incoming
 *
 * Twilio webhook for incoming SMS messages.
 * Forwards the text message as an email to hello@voyageadvisory.com.
 *
 * Twilio sends form-encoded data with fields like:
 *   From, To, Body, NumMedia, MediaUrl0, MediaContentType0, etc.
 *
 * Configure in Twilio Console → Phone Numbers → Messaging → "A Message Comes In"
 *   URL: https://apps.voyage.xyz/api/voice/sms-incoming  (HTTP POST)
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();

  const from = formData.get("From")?.toString() || "Unknown";
  const to = formData.get("To")?.toString() || "";
  const body = formData.get("Body")?.toString() || "";
  const numMedia = parseInt(formData.get("NumMedia")?.toString() || "0", 10);
  const messageSid = formData.get("MessageSid")?.toString() || "";

  // Collect any media attachments (MMS)
  const mediaItems: { url: string; contentType: string }[] = [];
  for (let i = 0; i < numMedia; i++) {
    const url = formData.get(`MediaUrl${i}`)?.toString();
    const contentType = formData.get(`MediaContentType${i}`)?.toString();
    if (url) {
      mediaItems.push({ url, contentType: contentType || "unknown" });
    }
  }

  console.log("========================================");
  console.log("[SMS Received]");
  console.log(`  From:    ${from}`);
  console.log(`  To:      ${to}`);
  console.log(`  Body:    ${body}`);
  console.log(`  Media:   ${numMedia} attachment(s)`);
  console.log(`  MsgSid:  ${messageSid}`);
  console.log("========================================");

  // Build email HTML
  const escapedBody = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const mediaHtml = mediaItems.length > 0
    ? `
      <tr>
        <td style="padding: 8px 12px; font-weight: bold; color: #555; vertical-align: top;">Attachments:</td>
        <td style="padding: 8px 12px;">
          ${mediaItems.map((m, i) => `<a href="${m.url}" style="color: #0066cc;">${m.contentType.startsWith("image/") ? "Image" : "File"} ${i + 1}</a> (${m.contentType})`).join("<br>")}
        </td>
      </tr>`
    : "";

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2 style="color: #1a1a2e;">New Text Message</h2>
      <table style="border-collapse: collapse; width: 100%; margin-bottom: 16px;">
        <tr>
          <td style="padding: 8px 12px; font-weight: bold; color: #555;">From:</td>
          <td style="padding: 8px 12px;">${from}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-weight: bold; color: #555;">To:</td>
          <td style="padding: 8px 12px;">${to}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-weight: bold; color: #555; vertical-align: top;">Message:</td>
          <td style="padding: 8px 12px;">${escapedBody || "<em>(no text)</em>"}</td>
        </tr>
        ${mediaHtml}
      </table>
      <p style="color: #888; font-size: 12px;">
        Message SID: ${messageSid}<br>
        Sent by Voyage Advisory Phone System
      </p>
    </div>
  `;

  const toEmails = phoneConfig.voicemailEmails.filter(Boolean);
  const emailResult = await sendGmailNotification({
    to: toEmails,
    subject: `Text message from ${from}`,
    htmlBody,
  });

  // Debug mode: return JSON diagnostics instead of TwiML
  const url = new URL(request.url);
  if (url.searchParams.get("debug") === "true") {
    return NextResponse.json({
      received: { from, to, body, numMedia, messageSid },
      email: emailResult,
      toEmails,
      hasServiceAccountKey: !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
      delegatedUser: process.env.GMAIL_DELEGATED_USER || "astudee@voyageadvisory.com",
    });
  }

  // Return empty TwiML response (no auto-reply)
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}

export async function GET(request: NextRequest) {
  return POST(request);
}
