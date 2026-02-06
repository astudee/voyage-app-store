/**
 * Phone system configuration.
 * 
 * In production, sensitive values (phone numbers, API keys) should come
 * from environment variables. This file provides the structure and defaults.
 */

export const phoneConfig = {
  // Your Twilio phone number (set in env)
  twilioNumber: process.env.TWILIO_PHONE_NUMBER || "+1XXXXXXXXXX",

  // Operator path — ring these numbers simultaneously
  operatorNumbers: [
    process.env.OPERATOR_PHONE_1 || "+13122120815", // Andrew
    process.env.OPERATOR_PHONE_2 || "+12404401901", // Emma
  ],

  // How long to ring before going to voicemail (seconds)
  ringTimeout: 25,

  // Voicemail max length (seconds)
  voicemailMaxLength: 120,

  // Email addresses for voicemail notifications
  voicemailEmails: [
    process.env.VOICEMAIL_EMAIL_1 || "",
    process.env.VOICEMAIL_EMAIL_2 || "",
  ],

  // Company directory entries
  directory: [
    { name: "Andrew", extension: "1", number: process.env.OPERATOR_PHONE_1 || "+13122120815" },
    { name: "Emma", extension: "2", number: process.env.OPERATOR_PHONE_2 || "+12404401901" },
  ],

  // Base URL for webhooks (set after Vercel deploy)
  baseUrl: process.env.PHONE_SYSTEM_BASE_URL || "https://your-app.vercel.app",

  // TTS voice
  voice: "Polly.Joanna" as const,
} as const;
