import { NextRequest } from "next/server";
import { twimlResponse } from "@/lib/twiml";

/**
 * POST /api/voice/screen-response
 *
 * Handles the team member's response to call screening.
 * Press 1 → accept (return empty response to connect the call)
 * Anything else → reject (hangup this leg, falls through to voicemail)
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const digits = formData.get("Digits")?.toString() || "";

  if (digits === "1") {
    // Accept — empty response connects the caller
    return twimlResponse("");
  }

  // Reject — hangup this leg so Twilio falls through to voicemail
  return twimlResponse(`  <Hangup />`);
}

export async function GET(request: NextRequest) {
  return POST(request);
}
