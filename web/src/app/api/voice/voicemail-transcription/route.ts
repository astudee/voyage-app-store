import { NextRequest, NextResponse } from "next/server";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/voicemail-transcription
 *
 * Called asynchronously by Twilio once the voicemail transcription is ready.
 * Sends an email notification to hello@voyageadvisory.com via Resend.
 *
 * Required env var: RESEND_API_KEY
 * Optional: VOICEMAIL_FROM_EMAIL (defaults to onboarding@resend.dev until
 *           you verify your domain with Resend — then use noreply@voyageadvisory.com)
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

  // Send email notification via Resend
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const fromEmail = process.env.VOICEMAIL_FROM_EMAIL || "onboarding@resend.dev";
      const toEmails = phoneConfig.voicemailEmails.filter(Boolean);

      if (toEmails.length > 0) {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: `Voyage Phone System <${fromEmail}>`,
            to: toEmails,
            subject: `Voicemail from ${callerNumber}`,
            html: `
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
            `,
          }),
        });

        if (!response.ok) {
          const err = await response.text();
          console.error("[Voicemail] Resend email failed:", err);
        } else {
          console.log("[Voicemail] Email notification sent to:", toEmails.join(", "));
        }
      }
    } catch (error) {
      console.error("[Voicemail] Email notification error:", error);
    }
  } else {
    console.warn("[Voicemail] RESEND_API_KEY not set — skipping email notification");
  }

  return NextResponse.json({ status: "received" });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
