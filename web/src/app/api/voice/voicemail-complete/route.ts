import { NextRequest } from "next/server";
import { twimlResponse, say, hangup } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/voicemail-complete
 *
 * Called by Twilio after the caller finishes recording.
 * Thanks the caller and hangs up.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const recordingUrl = formData.get("RecordingUrl")?.toString() || "";
  const callerNumber = formData.get("From")?.toString() || "Unknown";
  const v = phoneConfig.voice;

  // Log the recording (in production, you might store this in a DB)
  console.log(`[Voicemail] New recording from ${callerNumber}: ${recordingUrl}`);

  return twimlResponse(
    [
      say("Thank you for your message. Someone from our team will get back to you shortly. Goodbye.", v),
      hangup(),
    ].join("\n")
  );
}

export async function GET(request: NextRequest) {
  return POST(request);
}
