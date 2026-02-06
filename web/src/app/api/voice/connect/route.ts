import { NextRequest } from "next/server";
import { twimlResponse, say, gather } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

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
          `  <Dial><Conference beep="false" endConferenceOnExit="true">${escapeXml(confName)}</Conference></Dial>`
        );
      }
      // Reject or other key — hang up this leg
      return twimlResponse(`  <Hangup />`);
    }

    // Phase 1: Play screening prompt
    const spokenNumber = formatNumberForSpeech(callerNumber);
    const label = callType === "sales" ? "Voyage sales call" : "Voyage operator call";

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
          `${label} from ${spokenNumber}. Press 1 to accept. Press 2 for voicemail.`,
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

/**
 * Format a phone number for natural speech.
 * "+13122120815" → "3 1 2, 2 1 2, 0 8 1 5"
 */
function formatNumberForSpeech(number: string): string {
  const digits = number.replace(/\D/g, "");
  const local =
    digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;

  if (local.length === 10) {
    const area = local.slice(0, 3).split("").join(" ");
    const prefix = local.slice(3, 6).split("").join(" ");
    const line = local.slice(6).split("").join(" ");
    return `${area}, ${prefix}, ${line}`;
  }

  return local.split("").join(" ");
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
