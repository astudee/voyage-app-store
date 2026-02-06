import { twimlResponse, say } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/hold-music
 *
 * TwiML served as the `waitUrl` for conference participants.
 * Plays classical hold music while waiting for a team member to join.
 * After the music ends (~90 seconds), apologizes and leaves the conference,
 * which triggers the Dial action URL → voicemail.
 *
 * Uses Twilio's public classical music S3 bucket.
 */

const MUSIC_FILES = [
  "https://com.twilio.music.classical.s3.amazonaws.com/ClockworkWaltz.mp3",
  "https://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.mp3",
  "https://com.twilio.music.classical.s3.amazonaws.com/Mellotroniac_-_Flight_Of_The_Concords.mp3",
];

export async function POST() {
  const v = phoneConfig.voice;
  const lang = phoneConfig.voiceLanguage;

  const body = [
    // Play classical music tracks (each ~30-90 seconds)
    ...MUSIC_FILES.map((url) => `  <Play>${url}</Play>`),
    // If all tracks finish and nobody joined, apologize and leave
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
