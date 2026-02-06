import { NextRequest } from "next/server";
import { twimlResponse, say, gather, redirect, pause } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/directory-route
 *
 * Routes the caller to the selected directory entry by:
 * - 3-digit extension number
 * - First name, last name, or full name (speech)
 * - Handles "Randy" or "Holly" for Randy/Holly Tran
 * - Also accepts ?speech= query param for direct routing from the main menu
 *
 * IMPORTANT: Does NOT override caller ID — the person being called
 * sees the actual caller's number, not the Voyage main line.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const digits = formData.get("Digits")?.toString() || "";
  const speechFromForm = formData.get("SpeechResult")?.toString().toLowerCase() || "";

  // Also check query param (used when main menu detects a name directly)
  const speechFromQuery = request.nextUrl.searchParams.get("speech")?.toLowerCase() || "";
  const speech = speechFromForm || speechFromQuery;

  const v = phoneConfig.voice;
  const lang = phoneConfig.voiceLanguage;
  const B = phoneConfig.baseUrl;

  // Check for main menu / go back requests
  const menuWords = ["main menu", "go back", "back", "menu", "start over"];
  if (menuWords.some((w) => speech.includes(w))) {
    return twimlResponse(
      [
        say("Returning to the main menu.", v, lang),
        redirect(`${B}/api/voice/incoming`),
      ].join("\n")
    );
  }

  const matches = findDirectoryMatches(digits, speech);

  // No match
  if (matches.length === 0) {
    return twimlResponse(
      [
        say("Sorry, I couldn't find that person in our directory. Let me try again.", v, lang),
        redirect(`${B}/api/voice/directory`),
      ].join("\n")
    );
  }

  // Single match — connect directly
  if (matches.length === 1) {
    const match = matches[0];
    return twimlResponse(
      [
        say(`Connecting you to ${match.firstName.replace("Randy/Holly", "Holly")} ${match.lastName}.`, v, lang),
        pause(1),
        // No callerId override — caller's real number passes through
        `  <Dial timeout="${phoneConfig.ringTimeout}" action="${esc(`${B}/api/voice/operator-status`)}">`,
        `    <Number>${match.number}</Number>`,
        `  </Dial>`,
      ].join("\n")
    );
  }

  // Multiple matches — ask caller to disambiguate
  const options = matches
    .map(
      (m) =>
        `${m.firstName} ${m.lastName}, ${m.title}, extension ${m.extension}.`
    )
    .join(" ");

  return twimlResponse(
    gather({
      input: "dtmf speech",
      numDigits: 3,
      action: `${B}/api/voice/directory-route`,
      timeout: 8,
      speechTimeout: "auto",
      children: say(
        `I found a few people with that name. ${options} Please say the full name or enter the extension number.`,
        v,
        lang
      ),
    })
  );
}

type DirectoryEntry = (typeof phoneConfig.directory)[number];

function findDirectoryMatches(
  digits: string,
  speech: string
): DirectoryEntry[] {
  // Match by 3-digit extension
  if (digits) {
    const match = phoneConfig.directory.find(
      (entry) => entry.extension === digits
    );
    return match ? [match] : [];
  }

  // Match by name in speech
  if (!speech) return [];

  const normalized = speech.toLowerCase().trim();

  // Score each entry by match quality
  const scored = phoneConfig.directory
    .map((entry) => {
      const first = entry.firstName.toLowerCase();
      const last = entry.lastName.toLowerCase();
      const full = `${first} ${last}`;

      // Check aliases (for Randy/Holly Tran)
      const aliasNames: string[] = "aliases" in entry
        ? (entry as DirectoryEntry & { aliases?: string[] }).aliases?.map((a: string) => a.toLowerCase()) || []
        : [];

      let score = 0;

      // Exact full name match
      if (normalized === full) score = 100;
      // Last name + first name order
      else if (normalized === `${last} ${first}`) score = 95;
      // Speech contains full name
      else if (normalized.includes(full)) score = 90;
      // Exact last name match
      else if (normalized === last) score = 80;
      // Exact first name match
      else if (normalized === first) score = 70;
      // Alias match
      else if (aliasNames.some((alias) => normalized === alias)) score = 70;
      // Partial match — speech contains first or last name
      else if (normalized.includes(last) && last.length > 2) score = 60;
      else if (normalized.includes(first) && first.length > 2) score = 50;
      else if (aliasNames.some((alias) => normalized.includes(alias) && alias.length > 2)) score = 50;

      return { entry, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  // If top match is significantly better than second, return just that one
  if (
    scored.length === 1 ||
    (scored.length > 1 && scored[0].score - scored[1].score >= 20)
  ) {
    return [scored[0].entry];
  }

  // Return top matches (up to 3) for disambiguation
  return scored.slice(0, 3).map((s) => s.entry);
}

/** Escape XML special chars in attribute values */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(request: NextRequest) {
  return POST(request);
}
