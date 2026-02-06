import { NextRequest } from "next/server";
import { twimlResponse, say, dial, redirect, pause } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/operator
 *
 * Rings Andrew and Emma simultaneously. First to pick up gets the call.
 * If neither answers within the timeout, falls through to voicemail.
 */
export async function POST(request: NextRequest) {
  const v = phoneConfig.voice;
  const lang = phoneConfig.voiceLanguage;

  const screenUrl = `${phoneConfig.baseUrl}/api/voice/screen?type=operator`;
  const body = [
    say("One moment while I connect you.", v, lang),
    pause(0.5),
    dial({
      numbers: phoneConfig.operatorNumbers.map((n) => ({ number: n, url: screenUrl })),
      callerId: phoneConfig.twilioNumber,
      timeout: phoneConfig.ringTimeout,
      action: "/api/voice/operator-status",
    }),
  ].join("\n");

  return twimlResponse(body);
}

export async function GET(request: NextRequest) {
  return POST(request);
}
