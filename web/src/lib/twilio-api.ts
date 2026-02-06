/**
 * Twilio REST API helper for making outbound calls.
 *
 * Used by the conference-based call transfer flow:
 * 1. Caller goes into a conference with hold music
 * 2. REST API dials team members
 * 3. Team member hears screening prompt, presses 1
 * 4. Team member joins the conference, music stops, they're connected
 */

const BASE_URL = "https://api.twilio.com/2010-04-01";

function getCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
  }
  return { accountSid, authToken };
}

/**
 * Create an outbound call via Twilio REST API.
 * Returns the call SID.
 */
export async function createCall(opts: {
  to: string;
  from: string;
  url: string;
  timeout?: number;
  statusCallback?: string;
}): Promise<string> {
  const { accountSid, authToken } = getCredentials();
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const params = new URLSearchParams({
    To: opts.to,
    From: opts.from,
    Url: opts.url,
    Timeout: (opts.timeout || 18).toString(),
  });

  if (opts.statusCallback) {
    params.set("StatusCallback", opts.statusCallback);
    params.set("StatusCallbackEvent", "completed");
  }

  const response = await fetch(`${BASE_URL}/Accounts/${accountSid}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[Twilio] Failed to create call to ${opts.to}: ${response.status} ${text}`);
    throw new Error(`Failed to create call: ${response.status}`);
  }

  const data = await response.json();
  return data.sid;
}

/**
 * Dial multiple team members simultaneously for a conference.
 * Each member gets the screening prompt when they answer.
 * Fire-and-forget — errors are logged but not thrown.
 */
export async function dialTeamForConference(opts: {
  numbers: string[];
  from: string;
  confName: string;
  callType: "sales" | "operator";
  callerNumber: string;
  baseUrl: string;
  timeout?: number;
}): Promise<void> {
  const screenUrl = `${opts.baseUrl}/api/voice/connect` +
    `?conf=${encodeURIComponent(opts.confName)}` +
    `&type=${encodeURIComponent(opts.callType)}` +
    `&caller=${encodeURIComponent(opts.callerNumber)}`;

  const promises = opts.numbers.map((number) =>
    createCall({
      to: number,
      from: opts.from,
      url: screenUrl,
      timeout: opts.timeout || 18,
    }).catch((err) => {
      console.error(`[Twilio] Failed to dial ${number}:`, err);
    })
  );

  // Wait for all outbound calls to be created before returning.
  // On Vercel, the serverless function freezes after the response is sent,
  // so we must ensure the REST API calls complete first.
  await Promise.all(promises);
}
