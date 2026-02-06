import { NextRequest } from "next/server";
import { twimlResponse, say, gather, redirect } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

const SERVICES_OVERVIEW =
  "Voyage Advisory is a management consulting firm. We help clients elevate service, drive performance, and power transformation. We work across a variety of industries including utilities, financial services, supply chain, and the public sector. " +
  "To hear this again, press 1. To return to the main menu, press 2. Or stay on the line and I'll connect you with someone.";

/**
 * POST /api/voice/services-menu
 *
 * Handles caller input after the services overview message.
 * Options: hear again (1), main menu (2), or connect to sales (default/timeout).
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const digits = formData.get("Digits")?.toString() || "";
  const speech = formData.get("SpeechResult")?.toString().toLowerCase() || "";
  const v = phoneConfig.voice;
  const lang = phoneConfig.voiceLanguage;

  // Hear again — replay the overview with the same gather
  if (
    digits === "1" ||
    speech.includes("again") ||
    speech.includes("repeat") ||
    speech.includes("hear")
  ) {
    return twimlResponse(
      [
        gather({
          input: "dtmf speech",
          numDigits: 1,
          action: "/api/voice/services-menu",
          timeout: 4,
          speechTimeout: "auto",
          children: say(SERVICES_OVERVIEW, v, lang),
        }),
        say("Let me connect you with someone who can tell you more.", v, lang),
        `  <Dial timeout="${phoneConfig.ringTimeout}" action="/api/voice/operator-status">`,
        `    <Number>${phoneConfig.salesNumbers[0]}</Number>`,
        `    <Number>${phoneConfig.salesNumbers[1]}</Number>`,
        `  </Dial>`,
      ].join("\n")
    );
  }

  // Main menu
  if (
    digits === "2" ||
    speech.includes("main menu") ||
    speech.includes("go back") ||
    speech.includes("back") ||
    speech.includes("menu")
  ) {
    return twimlResponse(
      [
        say("Returning to the main menu.", v, lang),
        redirect("/api/voice/incoming"),
      ].join("\n")
    );
  }

  // Talk to someone / connect / anything else → transfer to sales
  return twimlResponse(
    [
      say("Let me connect you with someone who can tell you more.", v, lang),
      `  <Dial timeout="${phoneConfig.ringTimeout}" action="/api/voice/operator-status">`,
      `    <Number>${phoneConfig.salesNumbers[0]}</Number>`,
      `    <Number>${phoneConfig.salesNumbers[1]}</Number>`,
      `  </Dial>`,
    ].join("\n")
  );
}

export async function GET(request: NextRequest) {
  return POST(request);
}
