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

/**
 * Send the caller in a conference to voicemail.
 * Finds the in-progress conference by name, lists its participants,
 * and redirects each participant's call to the voicemail URL.
 *
 * Used when a team member presses 2 (reject) during screening.
 * Errors are logged but never thrown — caller falls back to hold music timeout.
 */
export async function sendCallerToVoicemail(
  confName: string,
  voicemailUrl: string
): Promise<void> {
  const { accountSid, authToken } = getCredentials();
  const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;

  // 1. Find the conference by friendly name
  const confRes = await fetch(
    `${BASE_URL}/Accounts/${accountSid}/Conferences.json?FriendlyName=${encodeURIComponent(confName)}&Status=in-progress`,
    { headers: { Authorization: authHeader } }
  );

  if (!confRes.ok) {
    console.error("[sendCallerToVoicemail] Failed to find conference:", await confRes.text());
    return;
  }

  const confData = await confRes.json();
  const conferences = confData.conferences || [];
  if (conferences.length === 0) {
    console.error("[sendCallerToVoicemail] No in-progress conference:", confName);
    return;
  }

  const confSid = conferences[0].sid;

  // 2. List participants in the conference
  const partRes = await fetch(
    `${BASE_URL}/Accounts/${accountSid}/Conferences/${confSid}/Participants.json`,
    { headers: { Authorization: authHeader } }
  );

  if (!partRes.ok) {
    console.error("[sendCallerToVoicemail] Failed to list participants:", await partRes.text());
    return;
  }

  const partData = await partRes.json();
  const participants = partData.participants || [];
  if (participants.length === 0) {
    console.error("[sendCallerToVoicemail] No participants in conference:", confName);
    return;
  }

  // 3. Redirect each participant's call to the voicemail URL
  for (const p of participants) {
    try {
      await fetch(`${BASE_URL}/Accounts/${accountSid}/Calls/${p.call_sid}.json`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          Url: voicemailUrl,
          Method: "POST",
        }).toString(),
      });
      console.log(`[sendCallerToVoicemail] Redirected ${p.call_sid} to voicemail`);
    } catch (err) {
      console.error(`[sendCallerToVoicemail] Failed to redirect ${p.call_sid}:`, err);
    }
  }
}
