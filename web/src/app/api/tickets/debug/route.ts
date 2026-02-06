import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET /api/tickets/debug - Debug Zendesk auth
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subdomain = (process.env.ZENDESK_SUBDOMAIN || "").trim();
  const email = (process.env.ZENDESK_AGENT_EMAIL || "").trim();
  const token = (process.env.ZENDESK_API_TOKEN || "").trim();

  const credentials = `${email}/token:${token}`;
  const authHeader = `Basic ${Buffer.from(credentials).toString("base64")}`;
  const url = `https://${subdomain}.zendesk.com/api/v2/users/me.json`;

  // Test 1: Our standard approach
  let test1;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });
    const body = await res.json();
    test1 = {
      status: res.status,
      user_name: body.user?.name,
      user_email: body.user?.email,
      user_role: body.user?.role,
    };
  } catch (e) {
    test1 = { error: e instanceof Error ? e.message : "unknown" };
  }

  // Test 2: Try with just email:password format (in case it's a password, not API token)
  const credentialsAsPwd = `${email}:${token}`;
  const authHeaderAsPwd = `Basic ${Buffer.from(credentialsAsPwd).toString("base64")}`;
  let test2;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: authHeaderAsPwd,
        "Content-Type": "application/json",
      },
    });
    const body = await res.json();
    test2 = {
      status: res.status,
      user_name: body.user?.name,
      user_email: body.user?.email,
      user_role: body.user?.role,
      note: "Using email:password format (no /token:)",
    };
  } catch (e) {
    test2 = { error: e instanceof Error ? e.message : "unknown" };
  }

  return NextResponse.json({
    config: {
      subdomain,
      email,
      email_length: email.length,
      token_length: token.length,
      token_first4: token.substring(0, 4),
      token_last4: token.substring(token.length - 4),
      url,
    },
    test1_token_auth: test1,
    test2_password_auth: test2,
  });
}
