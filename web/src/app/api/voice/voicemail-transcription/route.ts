import { NextRequest, NextResponse } from "next/server";
import { phoneConfig } from "@/lib/phone-config";
import { sendGmailNotification } from "@/lib/gmail";

/**
 * POST /api/voice/voicemail-transcription
 *
 * Called asynchronously by Twilio once the voicemail transcription is ready.
 * Sends an email notification to hello@voyageadvisory.com via Gmail API.
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

  const toEmails = phoneConfig.voicemailEmails.filter(Boolean);
  await sendGmailNotification({
    to: toEmails,
    subject: `Voicemail from ${callerNumber}`,
    htmlBody,
  });

  return NextResponse.json({ status: "received" });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
