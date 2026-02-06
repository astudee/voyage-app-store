import { NextRequest } from "next/server";
import { twimlResponse, say, dial, redirect, pause } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/directory-route
 *
 * Routes the caller to the selected directory entry by extension or name.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const digits = formData.get("Digits")?.toString() || "";
  const speech = formData.get("SpeechResult")?.toString().toLowerCase() || "";
  const v = phoneConfig.voice;

  const match = findDirectoryMatch(digits, speech);

  if (!match) {
    return twimlResponse(
      [
        say("Sorry, I couldn't find that person in our directory.", v),
        redirect("/api/voice/directory"),
      ].join("\n")
    );
  }

  return twimlResponse(
    [
      say(`Connecting you to ${match.name}.`, v),
      pause(0.5),
      dial({
        numbers: [match.number],
        callerId: phoneConfig.twilioNumber,
        timeout: phoneConfig.ringTimeout,
        action: "/api/voice/operator-status", // Reuse — if no answer, go to voicemail
      }),
    ].join("\n")
  );
}

function findDirectoryMatch(
  digits: string,
  speech: string
): (typeof phoneConfig.directory)[number] | undefined {
  // Match by extension
  if (digits) {
    return phoneConfig.directory.find((entry) => entry.extension === digits);
  }

  // Match by name in speech
  if (speech) {
    return phoneConfig.directory.find((entry) =>
      speech.includes(entry.name.toLowerCase())
    );
  }

  return undefined;
}

export async function GET(request: NextRequest) {
  return POST(request);
}
