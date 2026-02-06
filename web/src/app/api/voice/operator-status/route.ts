import { NextRequest } from "next/server";
import { twimlResponse, say, redirect } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/operator-status
 *
 * Twilio calls this after the <Dial> completes (conference ends).
 * Only sends to voicemail when nobody answered or when explicitly
 * redirected here with ?action=voicemail (team member pressed 2).
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const dialCallStatus = formData.get("DialCallStatus")?.toString() || "";
  const v = phoneConfig.voice;
  const lang = phoneConfig.voiceLanguage;
  const B = phoneConfig.baseUrl;

  // Team member pressed 2 → caller was redirected here with ?action=voicemail
  const forceVoicemail = request.nextUrl.searchParams.get("action") === "voicemail";

  // These statuses mean nobody picked up
  const noAnswerStatuses = ["no-answer", "busy", "failed", "canceled"];

  if (forceVoicemail || noAnswerStatuses.includes(dialCallStatus)) {
    return twimlResponse(
      [
        say(
          "Sorry, no one is available right now. Please leave a message after the tone and we'll get back to you as soon as possible.",
          v,
          lang
        ),
        redirect(`${B}/api/voice/voicemail`),
      ].join("\n")
    );
  }

  // Call was connected and ended normally — just hang up
  return twimlResponse(`  <Hangup />`);
}

export async function GET(request: NextRequest) {
  return POST(request);
}
