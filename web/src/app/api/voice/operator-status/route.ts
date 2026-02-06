import { NextRequest } from "next/server";
import { twimlResponse, say, redirect } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/operator-status
 *
 * Twilio calls this after the <Dial> completes. If nobody answered,
 * send the caller to voicemail.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const dialCallStatus = formData.get("DialCallStatus")?.toString() || "";
  const v = phoneConfig.voice;
  const lang = phoneConfig.voiceLanguage;

  // If the call was answered, Twilio already connected them — nothing to do.
  if (dialCallStatus === "completed") {
    return twimlResponse(`  <Hangup />`);
  }

  // Nobody picked up — send to voicemail
  return twimlResponse(
    [
      say(
        "Sorry, no one is available right now. Please leave a message after the tone and we'll get back to you as soon as possible.",
        v
      ),
      redirect("/api/voice/voicemail"),
    ].join("\n")
  );
}

export async function GET(request: NextRequest) {
  return POST(request);
}
