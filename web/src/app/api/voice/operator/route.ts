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
  try {
    const formData = await request.formData();
    const callerNumber = formData.get("From")?.toString() || "unknown";
    const v = phoneConfig.voice;
    const lang = phoneConfig.voiceLanguage;

    const confName = `voyage-op-${Date.now()}`;

    // Fire off outbound calls to operator team — errors must not block TwiML
    try {
      await dialTeamForConference({
        numbers: [...phoneConfig.operatorNumbers],
        from: phoneConfig.twilioNumber,
        confName,
        callType: "operator",
        callerNumber,
        baseUrl: phoneConfig.baseUrl,
        timeout: phoneConfig.ringTimeout,
      });
    } catch (dialErr) {
      console.error("[operator] Failed to dial team:", dialErr);
    }

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
  } catch (err) {
    console.error("[operator] Unhandled error:", err);
    return twimlResponse(
      say("We're experiencing a technical issue. Please try again later.", phoneConfig.voice, phoneConfig.voiceLanguage)
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
