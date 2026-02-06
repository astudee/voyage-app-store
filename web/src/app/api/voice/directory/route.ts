import { NextRequest } from "next/server";
import {
  twimlResponse,
  say,
  gather,
  redirect,
} from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/directory
 *
 * Company directory. Callers can:
 * - Say a first name, last name, or full name
 * - Enter a 3-digit extension number
 */
export async function POST(request: NextRequest) {
  const v = phoneConfig.voice;

  const body = [
    gather({
      input: "dtmf speech",
      numDigits: 3,
      action: "/api/voice/directory-route",
      timeout: 5,
      speechTimeout: "auto",
      children: say(
        "Company directory. Please say the name of the person you are trying to reach, enter their three digit extension, or say main menu to go back.",
        v
      ),
    }),
    // No input — go back to main menu
    say("No selection made. Returning to the main menu.", v),
    redirect("/api/voice/incoming"),
  ].join("\n");

  return twimlResponse(body);
}

export async function GET(request: NextRequest) {
  return POST(request);
}
