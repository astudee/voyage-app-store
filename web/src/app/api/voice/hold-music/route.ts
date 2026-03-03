import { twimlResponse, say } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/hold-music
 *
 * TwiML served as the `waitUrl` for conference participants.
 * Plays a brief "please hold" message then waits in silence.
 * After ~30 seconds, apologizes and leaves the conference,
 * which triggers the Dial action URL → voicemail.
 *
 * Deliberately simple — no external audio files that could fail.
 */
export async function POST() {
  const v = phoneConfig.voice;
  const lang = phoneConfig.voiceLanguage;

  const body = [
    say("Please hold while we connect your call.", v, lang),
    `  <Pause length="30"/>`,
    say(
      "I'm sorry, no one is available right now. Please leave a message after the tone.",
      v,
      lang
    ),
    `  <Leave/>`,
  ].join("\n");

  return twimlResponse(body);
}

export async function GET() {
  return POST();
}
