import { NextRequest } from "next/server";
import { twimlResponse, say, dial } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

export async function POST(request: NextRequest) {
  const dest = request.nextUrl.searchParams.get("dest");

  if (!dest || !/^\+[1-9]\d{6,14}$/.test(dest)) {
    return twimlResponse(
      say("Sorry, the destination number is invalid. Goodbye.", phoneConfig.voice, phoneConfig.voiceLanguage)
    );
  }

  return twimlResponse([
    say("Connecting you now.", phoneConfig.voice, phoneConfig.voiceLanguage),
    dial({
      numbers: [dest],
      callerId: phoneConfig.mainNumber,
      timeout: 30,
    }),
  ].join("\n"));
}
