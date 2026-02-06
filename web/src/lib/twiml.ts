/**
 * Lightweight TwiML helper — generates Twilio XML without pulling in the full SDK.
 * Keeps the Vercel bundle small and deployment fast.
 */

export function twimlResponse(body: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${body}\n</Response>`;
  return new Response(xml, {
    headers: { "Content-Type": "text/xml" },
  });
}

export function say(
  text: string,
  voice = "Polly.Joanna-Generative",
  language = "en-US"
): string {
  return `  <Say voice="${voice}" language="${language}">${escapeXml(text)}</Say>`;
}

export function gather(opts: {
  input?: string;
  numDigits?: number;
  action: string;
  timeout?: number;
  speechTimeout?: string;
  children: string;
}): string {
  const attrs = [
    `input="${opts.input || "dtmf speech"}"`,
    opts.numDigits ? `numDigits="${opts.numDigits}"` : "",
    `action="${opts.action}"`,
    `timeout="${opts.timeout || 5}"`,
    opts.speechTimeout ? `speechTimeout="${opts.speechTimeout}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `  <Gather ${attrs}>\n${opts.children}\n  </Gather>`;
}

export function dial(opts: {
  numbers: string[];
  callerId?: string;
  timeout?: number;
  action?: string;
}): string {
  const attrs = [
    opts.callerId ? `callerId="${opts.callerId}"` : "",
    `timeout="${opts.timeout || 25}"`,
    opts.action ? `action="${opts.action}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const numberTags = opts.numbers
    .map((n) => `    <Number>${n}</Number>`)
    .join("\n");
  return `  <Dial ${attrs}>\n${numberTags}\n  </Dial>`;
}

export function record(opts: {
  action: string;
  maxLength?: number;
  transcribe?: boolean;
  transcribeCallback?: string;
  playBeep?: boolean;
}): string {
  const attrs = [
    `action="${opts.action}"`,
    `maxLength="${opts.maxLength || 120}"`,
    opts.transcribe !== false ? `transcribe="true"` : "",
    opts.transcribeCallback
      ? `transcribeCallback="${opts.transcribeCallback}"`
      : "",
    opts.playBeep !== false ? `playBeep="true"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `  <Record ${attrs} />`;
}

export function redirect(url: string): string {
  return `  <Redirect>${url}</Redirect>`;
}

export function pause(length = 1): string {
  return `  <Pause length="${length}" />`;
}

export function hangup(): string {
  return `  <Hangup />`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
