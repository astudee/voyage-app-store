import { NextResponse } from "next/server";
import { phoneConfig } from "@/lib/phone-config";
import { twilioGet } from "@/lib/twilio-client";
import { getActiveDirectory, toClientEntries } from "@/lib/phone-directory";

interface TwilioPhoneNumber {
  sid: string;
  phone_number: string;
  friendly_name: string;
  voice_url: string;
  sms_url: string;
}

interface TwilioPhoneNumberList {
  incoming_phone_numbers: TwilioPhoneNumber[];
}

export async function GET() {
  try {
    // Fetch Twilio phone numbers
    let twilioNumbers: { sid: string; number: string; label: string }[] = [];
    try {
      const data = await twilioGet<TwilioPhoneNumberList>(
        "IncomingPhoneNumbers.json",
        { PageSize: "20" }
      );
      twilioNumbers = (data.incoming_phone_numbers || []).map((n) => ({
        sid: n.sid,
        number: n.phone_number,
        label: n.friendly_name || "",
      }));
    } catch (err) {
      console.error("[phone/config] Failed to fetch Twilio numbers:", err);
    }

    // Build directory from Snowflake (with fallback to hardcoded config)
    let directory;
    try {
      const rows = await getActiveDirectory();
      directory = toClientEntries(rows);
    } catch (err) {
      console.error("[phone/config] Failed to fetch directory from Snowflake, using fallback:", err);
      directory = phoneConfig.directory.map((entry) => ({
        extension: entry.extension,
        firstName: entry.firstName,
        lastName: entry.lastName,
        title: entry.title,
        number: entry.number,
        aliases: "aliases" in entry ? [...(entry as { aliases: readonly string[] }).aliases] : undefined,
      }));
    }

    // Build hunt groups from phone-config (these still use env vars for phone numbers)
    const huntGroups = {
      sales: {
        label: "Sales",
        description: "Inbound sales inquiries — callers who say 'sales' or ask about pricing",
        ringTimeout: phoneConfig.ringTimeout,
        members: phoneConfig.salesNumbers.map((num) => {
          const person = directory.find((d) => d.number === num);
          return {
            name: person ? `${person.firstName} ${person.lastName}` : num,
            phone: num,
            extension: person?.extension || null,
          };
        }),
      },
      operator: {
        label: "Main / Operator",
        description: "General calls — callers who press 0 or say 'help'",
        ringTimeout: phoneConfig.ringTimeout,
        members: phoneConfig.operatorNumbers.map((num) => {
          const person = directory.find((d) => d.number === num);
          return {
            name: person ? `${person.firstName} ${person.lastName}` : num,
            phone: num,
            extension: person?.extension || null,
          };
        }),
      },
    };

    return NextResponse.json({
      directory,
      huntGroups,
      twilioNumbers,
      voicemailEmails: phoneConfig.voicemailEmails,
      voicemailMaxLength: phoneConfig.voicemailMaxLength,
    });
  } catch (error) {
    console.error("[phone/config] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch config" },
      { status: 500 }
    );
  }
}
