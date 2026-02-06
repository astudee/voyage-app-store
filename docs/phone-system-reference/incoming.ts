import { NextRequest } from "next/server";
import { twimlResponse, say, gather, redirect, pause } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/incoming
 *
 * First thing a caller hears when they dial the Voyage Advisory number.
 * Presents the main IVR menu with speech and DTMF input.
 */
export async function POST(request: NextRequest) {
  const v = phoneConfig.voice;

  const greeting = [
    say("Thank you for calling Voyage Advisory.", v),
    pause(0.5),
  ].join("\n");

  const menuPrompt = [
    say(
      "To learn more about our services, press 1, or say learn more.",
      v
    ),
    say(
      "For our company directory, press 2, or say directory.",
      v
    ),
    say(
      "To speak with someone, press 0.",
      v
    ),
  ].join("\n");

  const body = [
    greeting,
    gather({
      input: "dtmf speech",
      numDigits: 1,
      action: "/api/voice/menu",
      timeout: 6,
      speechTimeout: "auto",
      children: menuPrompt,
    }),
    // If no input, replay the menu once then go to operator
    say("We didn't catch that. Let us connect you to someone.", v),
    redirect("/api/voice/operator"),
  ].join("\n");

  return twimlResponse(body);
}

// Twilio sends webhooks as POST, but also accept GET for testing
export async function GET(request: NextRequest) {
  return POST(request);
}
