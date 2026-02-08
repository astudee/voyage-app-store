import { NextRequest } from "next/server";
import { twimlResponse, say, gather } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";
import { sendCallerToVoicemail } from "@/lib/twilio-api";

/**
 * POST /api/voice/connect
 *
 * Called by Twilio when an outbound call (to a team member) is answered.
 * Shows a screening prompt, and if accepted, joins the conference.
 *
 * Query params:
 *   conf   - conference name to join
 *   type   - "sales" or "operator" (for the whisper label)
 *   caller - original caller's phone number
 *
 * Flow:
 *   1. Team member answers → hears "Voyage sales call from 3 1 2..."
 *   2. Press 1 → joins conference (caller's hold music stops)
 *   3. Press 2 or timeout → hangs up (caller stays on hold)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const digits = formData.get("Digits")?.toString() || "";

    const url = request.nextUrl;
    const confName = url.searchParams.get("conf") || "";
    const callType = url.searchParams.get("type") || "operator";
    const callerNumber = url.searchParams.get("caller") || "unknown";
    const isAcceptPhase = url.searchParams.get("accept") === "1";

    const v = phoneConfig.voice;
    const lang = phoneConfig.voiceLanguage;

    // Phase 2: They pressed a key during screening
    if (isAcceptPhase) {
      if (digits === "1") {
        // Accept — join the conference
        return twimlResponse(
          `  <Dial><Conference beep="true" endConferenceOnExit="true">${escapeXml(confName)}</Conference></Dial>`
        );
      }
      // Press 2 — explicitly send caller to voicemail via REST API
      if (digits === "2") {
        try {
          const voicemailUrl = `${phoneConfig.baseUrl}/api/voice/operator-status?action=voicemail`;
          await sendCallerToVoicemail(confName, voicemailUrl);
        } catch (err) {
          console.error("[connect] Failed to redirect caller to voicemail:", err);
        }
      }
      // Hang up this team member's leg
      return twimlResponse(`  <Hangup />`);
    }

    // Phase 1: Play screening prompt
    const label = callType === "sales" ? "Voyage sales" : "Voyage operator";

    const acceptUrl =
      `${phoneConfig.baseUrl}/api/voice/connect` +
      `?conf=${encodeURIComponent(confName)}` +
      `&type=${encodeURIComponent(callType)}` +
      `&caller=${encodeURIComponent(callerNumber)}` +
      `&accept=1`;

    const body = [
      gather({
        input: "dtmf",
        numDigits: 1,
        action: acceptUrl,
        timeout: 4,
        children: say(
          `${label}. Press 1 to accept.`,
          v,
          lang
        ),
      }),
      // No input → reject (hang up this leg)
      `  <Hangup />`,
    ].join("\n");

    return twimlResponse(body);
  } catch (error) {
    console.error("[connect] Error:", error);
    // Return valid TwiML even on error — hang up gracefully
    return twimlResponse(`  <Hangup />`);
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(request: NextRequest) {
  return POST(request);
}
