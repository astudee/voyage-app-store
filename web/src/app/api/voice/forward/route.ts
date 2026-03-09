import { NextRequest } from "next/server";
import { twimlResponse, say, dial } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/forward?to=+1234567890
 *
 * Simple forwarding route — dials the target number directly.
 * Used when a Twilio number is configured to forward instead of
 * routing to the main IVR menu.
 *
 * The caller's real number is passed through as caller ID.
 */
export async function POST(request: NextRequest) {
  const to = request.nextUrl.searchParams.get("to");

  if (!to) {
    return twimlResponse(
      say("Sorry, this number is not configured correctly. Please try again later.",
        phoneConfig.voice,
        phoneConfig.voiceLanguage
      )
    );
  }

  const body = dial({
    numbers: [to],
    callerId: phoneConfig.mainNumber,
    timeout: 25,
  });

  return twimlResponse(body);
}

export async function GET(request: NextRequest) {
  return POST(request);
}
