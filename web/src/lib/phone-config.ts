/**
 * Phone system configuration.
 *
 * In production, sensitive values (phone numbers, API keys) should come
 * from environment variables. This file provides the structure and defaults.
 */

export const phoneConfig = {
  // Primary Twilio phone number (set in Vercel env: +12029984405)
  twilioNumber: process.env.TWILIO_PHONE_NUMBER || "+1XXXXXXXXXX",

  // Operator path (press 0 / help / catch-all) — ring these simultaneously
  operatorNumbers: [
    process.env.OPERATOR_PHONE_1 || "+13122120815", // Andrew
    process.env.OPERATOR_PHONE_2 || "+12404401901", // Emma
    process.env.OPERATOR_PHONE_3 || "+17123440077", // Olivia
  ],

  // Sales / services / learn more path — ring these simultaneously
  salesNumbers: [
    process.env.SALES_PHONE_1 || "+13122120815", // Andrew
    process.env.SALES_PHONE_2 || "+19206916440", // David
  ],

  // How long to ring before going to voicemail (seconds)
  ringTimeout: 25,

  // Voicemail max length (seconds)
  voicemailMaxLength: 120,

  // Email addresses for voicemail and SMS notifications
  voicemailEmails: [
    "hello@voyageadvisory.com",
    "astudee@voyageadvisory.com",
  ],

  // Company directory entries
  directory: [
    { extension: "501", firstName: "Andrew", lastName: "Studee", title: "Managing Director", number: "+13122120815" },
    { extension: "502", firstName: "Emily", lastName: "Minton", title: "Director", number: "+13153726406" },
    { extension: "503", firstName: "David", lastName: "Woods", title: "Director", number: "+19206916440" },
    { extension: "504", firstName: "Harry", lastName: "Marsteller", title: "Director", number: "+14104598486" },
    { extension: "505", firstName: "Karen", lastName: "Gliwa", title: "Director", number: "+13129538653" },
    { extension: "506", firstName: "John", lastName: "Adelphia", title: "Consultant", number: "+17733433915" },
    { extension: "507", firstName: "Steve", lastName: "Campbell", title: "Senior Consultant", number: "+17038680095" },
    { extension: "508", firstName: "Derrick", lastName: "Chin", title: "Senior Consultant", number: "+17037328142" },
    { extension: "509", firstName: "Peter", lastName: "Croswell", title: "Senior Consultant", number: "+15023209055" },
    { extension: "510", firstName: "Charlie", lastName: "Danoff", title: "Associate Consultant", number: "+17735406095" },
    { extension: "511", firstName: "Olivia", lastName: "Dodds", title: "Associate", number: "+17123440077" },
    { extension: "512", firstName: "Jamar", lastName: "Freeze", title: "Consultant", number: "+16465964715" },
    { extension: "513", firstName: "Kiki", lastName: "Hager", title: "Associate", number: "+18168049418" },
    { extension: "514", firstName: "Jill", lastName: "Hanson", title: "Senior Consultant", number: "+16086286037" },
    { extension: "515", firstName: "Bryan", lastName: "Hayden", title: "Sales Director", number: "+17057944396" },
    { extension: "516", firstName: "Jacob", lastName: "Heiss", title: "Knowledge & Marketing Associate", number: "+17733698311" },
    { extension: "517", firstName: "Greg", lastName: "Jacobson", title: "Senior Advisor", number: "+14105998395" },
    { extension: "518", firstName: "Terrence", lastName: "Jefferson", title: "Associate Consultant", number: "+13012418592" },
    { extension: "519", firstName: "Roger", lastName: "LaGrone", title: "Senior Consultant", number: "+16312366397" },
    { extension: "520", firstName: "Kevin", lastName: "Moos", title: "Senior Advisor", number: "+16507992962" },
    { extension: "521", firstName: "Nora", lastName: "Naughton", title: "Associate Consultant", number: "+13128134405" },
    { extension: "522", firstName: "Luke", lastName: "Puchalski", title: "Consultant", number: "+12146818498" },
    { extension: "523", firstName: "Sarah", lastName: "Rivard", title: "Assistant", number: "+18155733919" },
    { extension: "524", firstName: "Jerrod", lastName: "Rogers", title: "Director", number: "+19203273325" },
    { extension: "525", firstName: "Traci", lastName: "Stanek", title: "Recruiter", number: "+16085168969" },
    { extension: "526", firstName: "Emma", lastName: "Sweeney", title: "Project Coordinator / Admin Asst", number: "+12404401901" },
    { extension: "527", firstName: "Sarah", lastName: "Taylor", title: "Associate Consultant", number: "+17173640022" },
    { extension: "528", firstName: "Randy/Holly", lastName: "Tran", title: "Associate Consultant", number: "+14252086368", aliases: ["Randy", "Holly"] },
    { extension: "529", firstName: "Sophia", lastName: "Valbuena", title: "Senior Consultant", number: "+13125816022" },
    { extension: "530", firstName: "Harry", lastName: "Waldron", title: "Associate Consultant", number: "+15405214223" },
  ],

  // Base URL for webhooks (set after Vercel deploy)
  baseUrl: process.env.PHONE_SYSTEM_BASE_URL || "https://your-app.vercel.app",

  // TTS voice — Generative voices sound most natural
  // Google Chirp3-HD (female): Aoede, Kore, Leda, Zephyr
  // Google Chirp3-HD (male): Puck, Charon, Fenrir, Orus
  // Amazon Polly Generative: Polly.Joanna-Generative
  // Note: Generative voices require language="en-US" on the <Say> tag
  voice: "Google.en-US-Chirp3-HD-Aoede" as const,
  voiceLanguage: "en-US" as const,
} as const;
