import { NextRequest, NextResponse } from "next/server";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/voicemail-transcription
 *
 * Called asynchronously by Twilio once the voicemail transcription is ready.
 * This is where you'd send email/Slack notifications.
 *
 * For now, logs the transcription. You can wire this up to:
 *  - SendGrid / Resend for email
 *  - Slack webhook
 *  - Google Sheets via Apps Script
 *  - Snowflake insert
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const transcriptionText = formData.get("TranscriptionText")?.toString() || "";
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

  // ---------------------------------------------------------
  // TODO: Send notification email
  // ---------------------------------------------------------
  // Option A: Use Twilio SendGrid
  //   npm install @sendgrid/mail
  //
  // Option B: Use Resend (great with Vercel)
  //   npm install resend
  //
  // Option C: Hit a Google Apps Script webhook to send via Gmail
  //   await fetch(process.env.GAS_VOICEMAIL_WEBHOOK_URL, {
  //     method: "POST",
  //     body: JSON.stringify({ callerNumber, transcriptionText, recordingUrl }),
  //   });
  //
  // Option D: Post to a Slack webhook
  //   await fetch(process.env.SLACK_WEBHOOK_URL, {
  //     method: "POST",
  //     body: JSON.stringify({
  //       text: `New voicemail from ${callerNumber}\n\n"${transcriptionText}"\n\n${recordingUrl}`,
  //     }),
  //   });
  // ---------------------------------------------------------

  return NextResponse.json({ status: "received" });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
