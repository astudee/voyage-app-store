import { NextRequest, NextResponse } from "next/server";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/setup
 *
 * Configures Twilio phone number webhooks for voice and SMS.
 * Runs on Vercel where TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are available.
 *
 * Sets:
 *   Voice webhook → /api/voice/incoming (POST)
 *   SMS webhook   → /api/voice/sms-incoming (POST)
 *
 * GET returns current webhook configuration without changing anything.
 */

async function twilioFetch(path: string, method: string = "GET", body?: Record<string, string>) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken || accountSid.startsWith("ACxxx")) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set with real values");
  }

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}`;

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  };

  if (body && method === "POST") {
    options.headers = {
      ...options.headers,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    options.body = new URLSearchParams(body).toString();
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twilio API ${response.status}: ${text}`);
  }
  return response.json();
}

// GET - show current webhook configuration for all numbers
export async function GET() {
  try {
    const data = await twilioFetch("/IncomingPhoneNumbers.json");
    const numbers = data.incoming_phone_numbers || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = numbers.map((n: any) => ({
      sid: n.sid,
      phoneNumber: n.phone_number,
      friendlyName: n.friendly_name,
      voiceUrl: n.voice_url,
      voiceMethod: n.voice_method,
      smsUrl: n.sms_url,
      smsMethod: n.sms_method,
      capabilities: n.capabilities,
      statusCallback: n.status_callback,
      smsApplicationSid: n.sms_application_sid,
      smsFallbackUrl: n.sms_fallback_url,
    }));

    return NextResponse.json({ numbers: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// POST - configure webhooks for all numbers (or a specific one)
export async function POST(request: NextRequest) {
  try {
    const baseUrl = phoneConfig.baseUrl;
    const voiceUrl = `${baseUrl}/api/voice/incoming`;
    const smsUrl = `${baseUrl}/api/voice/sms-incoming`;

    // Optionally target a specific number
    let body: Record<string, string> | null = null;
    try {
      body = await request.json();
    } catch {
      // No body is fine — configure all numbers
    }
    const targetNumber = body?.phoneNumber;

    // List all numbers on the account
    const data = await twilioFetch("/IncomingPhoneNumbers.json");
    const numbers = data.incoming_phone_numbers || [];

    if (numbers.length === 0) {
      return NextResponse.json({ error: "No phone numbers found on this Twilio account" }, { status: 404 });
    }

    const results = [];

    for (const num of numbers) {
      // Skip if targeting a specific number and this isn't it
      if (targetNumber && num.phone_number !== targetNumber) {
        continue;
      }

      const before = {
        voiceUrl: num.voice_url,
        smsUrl: num.sms_url,
      };

      // Update the phone number's webhooks
      await twilioFetch(`/IncomingPhoneNumbers/${num.sid}.json`, "POST", {
        VoiceUrl: voiceUrl,
        VoiceMethod: "POST",
        SmsUrl: smsUrl,
        SmsMethod: "POST",
      });

      results.push({
        phoneNumber: num.phone_number,
        friendlyName: num.friendly_name,
        sid: num.sid,
        before,
        after: {
          voiceUrl,
          smsUrl,
        },
        status: "configured",
      });
    }

    if (results.length === 0 && targetNumber) {
      return NextResponse.json(
        { error: `Phone number ${targetNumber} not found on this account` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: `Configured ${results.length} phone number(s)`,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
