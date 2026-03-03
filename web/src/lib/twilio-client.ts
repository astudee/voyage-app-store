/**
 * Shared Twilio REST API read client.
 *
 * Reuses the Basic auth pattern from twilio-api.ts but provides
 * generic GET/POST helpers for reading Twilio resources (calls,
 * recordings, messages, etc.).
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

function authHeader() {
  const { accountSid, authToken } = getCredentials();
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

/**
 * GET a Twilio REST API resource.
 * `path` is relative to /Accounts/{sid}/ — e.g. "Calls.json"
 */
export async function twilioGet<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const { accountSid } = getCredentials();
  const url = new URL(`${BASE_URL}/Accounts/${accountSid}/${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: authHeader() },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio GET ${path} failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

/**
 * POST to a Twilio REST API resource (form-encoded).
 */
export async function twilioPost<T>(
  path: string,
  body: Record<string, string>
): Promise<T> {
  const { accountSid } = getCredentials();
  const url = `${BASE_URL}/Accounts/${accountSid}/${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio POST ${path} failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Fetch a raw response from Twilio (for streaming audio, etc.).
 * Returns the fetch Response object directly.
 */
export async function twilioFetchRaw(fullUrl: string): Promise<Response> {
  const res = await fetch(fullUrl, {
    headers: { Authorization: authHeader() },
  });

  if (!res.ok) {
    throw new Error(`Twilio fetch ${fullUrl} failed: ${res.status}`);
  }

  return res;
}

/**
 * Get the account SID (needed for constructing recording URLs, etc.).
 */
export function getAccountSid(): string {
  return getCredentials().accountSid;
}
