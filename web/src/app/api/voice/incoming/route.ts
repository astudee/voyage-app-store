import { NextRequest } from "next/server";
import { twimlResponse, say, gather, redirect, pause } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/incoming
 *
 * First thing a caller hears when they dial the Voyage Advisory number.
 * Conversational greeting with speech and DTMF input.
 */
export async function POST(request: NextRequest) {
  const v = phoneConfig.voice;
  const lang = phoneConfig.voiceLanguage;

  const greeting = say(
    "Welcome to Voyage Advisory. " +
      "To learn about our services, say learn. " +
      "To speak with sales, say sales. " +
      "To reach a specific person, say their name or say directory. " +
      "For everything else, say team.",
    v,
    lang
  );

  const body = [
    // Pause before Gather prevents connection noise from triggering speech recognition
    pause(1),
    gather({
      input: "dtmf speech",
      numDigits: 1,
      action: "/api/voice/menu",
      timeout: 6,
      speechTimeout: "auto",
      // Pause inside Gather delays when DTMF/speech input is accepted
      children: pause(1) + "\n" + greeting,
    }),
    // If no input, try once more then connect to operator
    say(
      "I didn't catch that. Let me connect you with someone who can help.",
      v,
      lang
    ),
    redirect("/api/voice/operator"),
  ].join("\n");

  return twimlResponse(body);
}

// Twilio sends webhooks as POST, but also accept GET for testing
export async function GET(request: NextRequest) {
  return POST(request);
}
