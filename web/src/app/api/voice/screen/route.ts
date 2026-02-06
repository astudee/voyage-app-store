import { NextRequest } from "next/server";
import { twimlResponse, say, gather } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/screen
 *
 * Call screening / whisper endpoint. Twilio calls this URL when a
 * sales or operator team member answers, BEFORE connecting the caller.
 *
 * The called person hears: "Voyage Advisory call from [number].
 * Press 1 to accept. Press any other key for voicemail."
 *
 * Used via the `url` attribute on <Number> inside <Dial>.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const callerNumber = formData.get("From")?.toString() || "unknown caller";
  const callType = request.nextUrl.searchParams.get("type") || "operator";
  const v = phoneConfig.voice;
  const lang = phoneConfig.voiceLanguage;

  // Format phone number for speech: "+13122120815" → "3 1 2. 2 1 2. 0 8 1 5"
  const spokenNumber = formatNumberForSpeech(callerNumber);

  const label = callType === "sales" ? "Voyage sales call" : "Voyage operator call";

  const body = [
    gather({
      input: "dtmf",
      numDigits: 1,
      action: "/api/voice/screen-response",
      timeout: 4,
      children: say(
        `${label} from ${spokenNumber}. Press 1 to accept. Press 2 for voicemail.`,
        v,
        lang
      ),
    }),
    // No input → treat as reject (send to voicemail)
    `  <Hangup />`,
  ].join("\n");

  return twimlResponse(body);
}

/**
 * Format a phone number for natural speech.
 * "+13122120815" → "3 1 2, 2 1 2, 0 8 1 5"
 */
function formatNumberForSpeech(number: string): string {
  // Strip + and country code (1 for US)
  const digits = number.replace(/\D/g, "");
  const local = digits.startsWith("1") && digits.length === 11
    ? digits.slice(1)
    : digits;

  if (local.length === 10) {
    const area = local.slice(0, 3).split("").join(" ");
    const prefix = local.slice(3, 6).split("").join(" ");
    const line = local.slice(6).split("").join(" ");
    return `${area}, ${prefix}, ${line}`;
  }

  // Fallback: just space out all digits
  return local.split("").join(" ");
}

export async function GET(request: NextRequest) {
  return POST(request);
}
