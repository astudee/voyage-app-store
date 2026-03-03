import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createCall } from "@/lib/twilio-api";
import { phoneConfig } from "@/lib/phone-config";

function isE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { userPhone, destinationPhone } = body;

    if (!userPhone || !destinationPhone) {
      return NextResponse.json(
        { error: "Both userPhone and destinationPhone are required" },
        { status: 400 }
      );
    }

    if (!isE164(userPhone)) {
      return NextResponse.json(
        { error: "userPhone must be in E.164 format (e.g. +13125551234)" },
        { status: 400 }
      );
    }

    if (!isE164(destinationPhone)) {
      return NextResponse.json(
        { error: "destinationPhone must be in E.164 format (e.g. +13125551234)" },
        { status: 400 }
      );
    }

    const bridgeUrl = `${phoneConfig.baseUrl}/api/voice/click-to-call-bridge?dest=${encodeURIComponent(destinationPhone)}`;

    const callSid = await createCall({
      to: userPhone,
      from: phoneConfig.mainNumber,
      url: bridgeUrl,
      timeout: 30,
    });

    return NextResponse.json({ success: true, callSid });
  } catch (err) {
    console.error("[click-to-call] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to initiate call" },
      { status: 500 }
    );
  }
}
