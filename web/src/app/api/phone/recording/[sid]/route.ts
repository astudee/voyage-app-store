import { NextRequest, NextResponse } from "next/server";
import { twilioFetchRaw, getAccountSid } from "@/lib/twilio-client";

/**
 * Proxy endpoint for Twilio recording audio.
 * Twilio recording URLs require Basic auth, so the browser can't
 * fetch them directly. This streams the audio through our server.
 *
 * Usage: <audio src="/api/phone/recording/{recordingSid}" />
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sid: string }> }
) {
  try {
    const { sid } = await params;
    const accountSid = getAccountSid();
    const recordingUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${sid}.mp3`;

    const twilioRes = await twilioFetchRaw(recordingUrl);

    // Stream the audio back to the client
    return new NextResponse(twilioRes.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[phone/recording] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch recording" },
      { status: 500 }
    );
  }
}
