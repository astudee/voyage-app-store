import { NextRequest } from "next/server";
import { twimlResponse, say, record, hangup } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/voicemail
 *
 * Records a voicemail from the caller. Twilio handles transcription
 * and sends the result to the transcription callback endpoint.
 */
export async function POST(request: NextRequest) {
  const v = phoneConfig.voice;

  const body = [
    record({
      action: "/api/voice/voicemail-complete",
      maxLength: phoneConfig.voicemailMaxLength,
      transcribe: true,
      transcribeCallback: "/api/voice/voicemail-transcription",
      playBeep: true,
    }),
    // If caller hangs up without recording
    say("We didn't receive a message. Goodbye.", v),
    hangup(),
  ].join("\n");

  return twimlResponse(body);
}

export async function GET(request: NextRequest) {
  return POST(request);
}
