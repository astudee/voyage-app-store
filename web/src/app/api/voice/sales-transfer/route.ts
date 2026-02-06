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
  const B = phoneConfig.baseUrl;

  try {
    const formData = await request.formData();
    const callerNumber = formData.get("From")?.toString() || "unknown";
    const v = phoneConfig.voice;
    const lang = phoneConfig.voiceLanguage;

    const confName = `voyage-sales-${Date.now()}`;

    // Fire off outbound calls to sales team — errors must not block TwiML
    try {
      await dialTeamForConference({
        numbers: [...phoneConfig.salesNumbers],
        from: phoneConfig.twilioNumber,
        confName,
        callType: "sales",
        callerNumber,
        baseUrl: B,
        timeout: phoneConfig.ringTimeout,
      });
    } catch (dialErr) {
      console.error("[sales-transfer] Failed to dial team:", dialErr);
    }

    return twimlResponse(
      [
        say("Let me connect you with someone who can tell you more.", v, lang),
        pause(1),
        `  <Dial action="${esc(`${B}/api/voice/operator-status`)}">`,
        `    <Conference waitUrl="${esc(`${B}/api/voice/hold-music`)}" waitMethod="POST" beep="false" startConferenceOnEnter="true" endConferenceOnExit="true" maxParticipants="2">`,
        `      ${confName}`,
        `    </Conference>`,
        `  </Dial>`,
      ].join("\n")
    );
  } catch (err) {
    console.error("[sales-transfer] Unhandled error:", err);
    return twimlResponse(
      say("We're experiencing a technical issue. Please try again later.", phoneConfig.voice, phoneConfig.voiceLanguage)
    );
  }
}

/** Escape XML special chars in attribute values */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(request: NextRequest) {
  return POST(request);
}
