import { NextRequest } from "next/server";
import {
  twimlResponse,
  say,
  gather,
  dial,
  redirect,
  pause,
} from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/directory
 *
 * Simple company directory. Caller can press an extension number
 * or say a person's name.
 */
export async function POST(request: NextRequest) {
  const v = phoneConfig.voice;

  const directoryEntries = phoneConfig.directory
    .map((entry) => `For ${entry.name}, press ${entry.extension}.`)
    .join(" ");

  const body = [
    gather({
      input: "dtmf speech",
      numDigits: 1,
      action: "/api/voice/directory-route",
      timeout: 5,
      speechTimeout: "auto",
      children: say(
        `Company directory. ${directoryEntries} Or say the person's name.`,
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
