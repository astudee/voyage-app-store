import { NextRequest } from "next/server";
import { twimlResponse, say, pause } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";
import { dialTeamForConference } from "@/lib/twilio-api";

/**
 * POST /api/voice/operator
 *
 * Puts the caller into a conference with classical hold music,
 * then dials operators simultaneously via REST API.
 * When an operator answers and accepts the screening prompt,
 * they join the conference and the music stops.
 *
 * If nobody answers, the hold music eventually ends and the
 * caller is routed to voicemail via the Dial action URL.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const callerNumber = formData.get("From")?.toString() || "unknown";
  const v = phoneConfig.voice;
  const lang = phoneConfig.voiceLanguage;

  const confName = `voyage-op-${Date.now()}`;

  // Fire off outbound calls to operator team (non-blocking)
  dialTeamForConference({
    numbers: [...phoneConfig.operatorNumbers],
    from: phoneConfig.twilioNumber,
    confName,
    callType: "operator",
    callerNumber,
    baseUrl: phoneConfig.baseUrl,
    timeout: phoneConfig.ringTimeout,
  });

  // Put caller into conference with hold music
  const body = [
    say("One moment while I connect you.", v, lang),
    pause(0.5),
    `  <Dial action="/api/voice/operator-status">`,
    `    <Conference waitUrl="${phoneConfig.baseUrl}/api/voice/hold-music" waitMethod="POST" beep="false" startConferenceOnEnter="true" endConferenceOnExit="true" maxParticipants="2">`,
    `      ${confName}`,
    `    </Conference>`,
    `  </Dial>`,
  ].join("\n");

  return twimlResponse(body);
}

export async function GET(request: NextRequest) {
  return POST(request);
}
