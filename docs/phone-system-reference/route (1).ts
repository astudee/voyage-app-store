import { NextRequest } from "next/server";
import { twimlResponse, say, redirect } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/menu
 *
 * Processes the caller's selection from the main IVR menu.
 * Twilio sends the digit pressed as `Digits` and/or speech as `SpeechResult`.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const digits = formData.get("Digits")?.toString() || "";
  const speech = formData.get("SpeechResult")?.toString().toLowerCase() || "";
  const v = phoneConfig.voice;

  // Determine which path the caller wants
  const path = routeFromInput(digits, speech);

  switch (path) {
    case "services":
      // Phase 2: This will connect to ConversationRelay AI receptionist.
      // For now, play a brief overview and offer to connect to operator.
      return twimlResponse(
        [
          say(
            "Voyage Advisory is a management consulting firm specializing in operational transformation for utilities, government agencies, and large organizations.",
            v
          ),
          say(
            "We help clients re-engineer processes, transform contact centers, and optimize field operations through data-driven assessments and hands-on implementation.",
            v
          ),
          say(
            "To learn more or discuss how we can help your organization, let me connect you with our team.",
            v
          ),
          redirect("/api/voice/operator"),
        ].join("\n")
      );

    case "directory":
      return twimlResponse(redirect("/api/voice/directory"));

    case "operator":
      return twimlResponse(redirect("/api/voice/operator"));

    default:
      // Unrecognized input — replay the menu
      return twimlResponse(
        [
          say("Sorry, I didn't understand that selection.", v),
          redirect("/api/voice/incoming"),
        ].join("\n")
      );
  }
}

function routeFromInput(digits: string, speech: string): string {
  // DTMF routing
  if (digits === "1") return "services";
  if (digits === "2") return "directory";
  if (digits === "0") return "operator";

  // Speech routing
  if (!speech) return "unknown";

  const serviceWords = ["learn more", "services", "learn", "service", "about"];
  const directoryWords = ["directory", "extension", "person", "someone specific"];
  const operatorWords = ["operator", "speak", "someone", "human", "agent", "help", "zero"];

  if (serviceWords.some((w) => speech.includes(w))) return "services";
  if (directoryWords.some((w) => speech.includes(w))) return "directory";
  if (operatorWords.some((w) => speech.includes(w))) return "operator";

  return "unknown";
}

export async function GET(request: NextRequest) {
  return POST(request);
}
