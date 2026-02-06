import { NextRequest } from "next/server";
import { twimlResponse, say, pause } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";
import { dialTeamForConference } from "@/lib/twilio-api";

/**
 * POST /api/voice/sales-transfer
 *
 * Transfers caller to sales team via conference with hold music.
 * Used as a redirect target from services overview and services-menu.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const callerNumber = formData.get("From")?.toString() || "unknown";
  const v = phoneConfig.voice;
  const lang = phoneConfig.voiceLanguage;

  const confName = `voyage-sales-${Date.now()}`;

  // Fire off outbound calls to sales team (must await on Vercel)
  await dialTeamForConference({
    numbers: [...phoneConfig.salesNumbers],
    from: phoneConfig.twilioNumber,
    confName,
    callType: "sales",
    callerNumber,
    baseUrl: phoneConfig.baseUrl,
    timeout: phoneConfig.ringTimeout,
  });

  return twimlResponse(
    [
      say("Let me connect you with someone who can tell you more.", v, lang),
      pause(0.5),
      `  <Dial action="/api/voice/operator-status">`,
      `    <Conference waitUrl="${phoneConfig.baseUrl}/api/voice/hold-music" waitMethod="POST" beep="false" startConferenceOnEnter="true" endConferenceOnExit="true" maxParticipants="2">`,
      `      ${confName}`,
      `    </Conference>`,
      `  </Dial>`,
    ].join("\n")
  );
}

export async function GET(request: NextRequest) {
  return POST(request);
}
