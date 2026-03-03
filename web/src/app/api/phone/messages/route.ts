import { NextResponse } from "next/server";
import { twilioGet } from "@/lib/twilio-client";

interface TwilioMessage {
  sid: string;
  from: string;
  to: string;
  body: string;
  direction: string;
  status: string;
  date_sent: string;
  date_created: string;
  num_media: string;
}

interface TwilioMessageList {
  messages: TwilioMessage[];
}

export async function GET() {
  try {
    const data = await twilioGet<TwilioMessageList>("Messages.json", {
      PageSize: "200",
    });

    const messages = (data.messages || []).map((msg) => ({
      sid: msg.sid,
      from: msg.from,
      to: msg.to,
      body: msg.body,
      direction: msg.direction === "inbound" ? "inbound" : "outbound",
      status: msg.status,
      date: msg.date_sent || msg.date_created,
      hasMedia: parseInt(msg.num_media || "0") > 0,
    }));

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("[phone/messages] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch messages" },
      { status: 500 }
    );
  }
}
