import { NextRequest } from "next/server";
import { twimlResponse, say, redirect } from "@/lib/twiml";
import { phoneConfig } from "@/lib/phone-config";

/**
 * POST /api/voice/menu
 *
 * Processes the caller's selection from the conversational greeting.
 * Supports natural speech like "tell me about your services",
 * "can I speak with Karen", "sales please", "help", etc.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const digits = formData.get("Digits")?.toString() || "";
  const speech = formData.get("SpeechResult")?.toString().toLowerCase() || "";
  const v = phoneConfig.voice;
  const lang = phoneConfig.voiceLanguage;

  const path = routeFromInput(digits, speech);

  switch (path.route) {
    case "services":
      // Services / learn more → ring Andrew + David (same as sales)
      return twimlResponse(
        [
          say(
            "Voyage Advisory is a management consulting firm specializing in operational transformation for utilities, government agencies, and large organizations. " +
              "Let me connect you with someone who can tell you more.",
            v,
            lang
          ),
          `  <Dial timeout="${phoneConfig.ringTimeout}" action="/api/voice/operator-status">`,
          `    <Number>${phoneConfig.salesNumbers[0]}</Number>`,
          `    <Number>${phoneConfig.salesNumbers[1]}</Number>`,
          `  </Dial>`,
        ].join("\n")
      );

    case "directory":
      return twimlResponse(redirect("/api/voice/directory"));

    case "directory-direct":
      // Caller said a person's name directly from the main menu — skip the directory prompt
      // and go straight to the directory router with the speech result
      return twimlResponse(redirect(`/api/voice/directory-route?speech=${encodeURIComponent(path.nameQuery || "")}`));

    case "sales":
      // Sales / services / learn more → ring Andrew + David
      return twimlResponse(
        [
          say("Let me connect you with our team.", v, lang),
          `  <Dial timeout="${phoneConfig.ringTimeout}" action="/api/voice/operator-status">`,
          `    <Number>${phoneConfig.salesNumbers[0]}</Number>`,
          `    <Number>${phoneConfig.salesNumbers[1]}</Number>`,
          `  </Dial>`,
        ].join("\n")
      );

    case "operator":
      return twimlResponse(redirect("/api/voice/operator"));

    default:
      return twimlResponse(
        [
          say("Sorry, I didn't quite get that. Let me connect you with someone who can help.", v, lang),
          redirect("/api/voice/operator"),
        ].join("\n")
      );
  }
}

function routeFromInput(
  digits: string,
  speech: string
): { route: string; nameQuery?: string } {
  // DTMF routing (legacy support)
  if (digits === "1") return { route: "services" };
  if (digits === "2") return { route: "directory" };
  if (digits === "0") return { route: "operator" };

  if (!speech) return { route: "unknown" };

  // Service / learn more keywords
  const serviceWords = [
    "learn more", "services", "learn", "service", "about",
    "what do you do", "what does voyage do", "tell me about",
    "consulting", "offerings",
  ];

  // Directory keywords
  const directoryWords = ["directory", "extension", "dial by name"];

  // Sales keywords
  const salesWords = ["sales", "pricing", "proposal", "engagement", "new client", "new customer", "business development"];

  // Operator / help keywords
  const operatorWords = [
    "help", "operator", "someone", "human", "agent",
    "zero", "connect me", "talk to someone", "receptionist",
  ];

  if (serviceWords.some((w) => speech.includes(w))) return { route: "services" };
  if (directoryWords.some((w) => speech.includes(w))) return { route: "directory" };
  if (salesWords.some((w) => speech.includes(w))) return { route: "sales" };
  if (operatorWords.some((w) => speech.includes(w))) return { route: "operator" };

  // Check if the caller said a person's name directly
  // e.g. "Can I speak with Karen Gliwa" or "transfer me to Jerrod"
  const speakWithPatterns = [
    "speak with", "speak to", "talk to", "transfer to", "connect me to",
    "connect me with", "reach", "looking for", "calling for", "is .* there",
    "can i talk", "put me through",
  ];

  const mentionsName = phoneConfig.directory.some((entry) => {
    const first = entry.firstName.toLowerCase();
    const last = entry.lastName.toLowerCase();
    return (
      speech.includes(`${first} ${last}`) ||
      speech.includes(last) ||
      (speech.includes(first) && first.length > 3)
    );
  });

  if (mentionsName || speakWithPatterns.some((p) => speech.match(new RegExp(p)))) {
    // Extract just the name part for the directory router
    let nameQuery = speech;
    for (const pattern of speakWithPatterns) {
      nameQuery = nameQuery.replace(new RegExp(`.*${pattern}\\s*`), "");
    }
    return { route: "directory-direct", nameQuery: nameQuery.trim() };
  }

  return { route: "unknown" };
}

export async function GET(request: NextRequest) {
  return POST(request);
}
