import { NextRequest, NextResponse } from "next/server";
import { twilioPost } from "@/lib/twilio-client";

export async function POST(request: NextRequest) {
  try {
    const { from, to, body } = await request.json();

    if (!from || !to || !body) {
      return NextResponse.json(
        { error: "from, to, and body are required" },
        { status: 400 }
      );
    }

    const result = await twilioPost<{ sid: string; status: string }>(
      "Messages.json",
      { From: from, To: to, Body: body }
    );

    return NextResponse.json({
      sid: result.sid,
      status: result.status,
    });
  } catch (error) {
    console.error("[phone/messages/send] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send message" },
      { status: 500 }
    );
  }
}
