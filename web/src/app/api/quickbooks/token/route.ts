import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const REDIRECT_URI = "https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl";

// POST /api/quickbooks/token - Exchange authorization code for tokens
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "QuickBooks credentials not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: "Authorization code is required" },
        { status: 400 }
      );
    }

    // Exchange code for tokens
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenResponse = await fetch(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authString}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code.trim(),
          redirect_uri: REDIRECT_URI,
        }),
      }
    );

    const data = await tokenResponse.json();

    if (tokenResponse.status === 200) {
      return NextResponse.json({
        success: true,
        refresh_token: data.refresh_token,
        access_token: data.access_token,
        expires_in: data.expires_in,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: data.error || "Token exchange failed",
          error_description: data.error_description,
          status: tokenResponse.status,
        },
        { status: tokenResponse.status }
      );
    }
  } catch (error) {
    console.error("QuickBooks token exchange error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// GET /api/quickbooks/token - Get authorization URL
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.QB_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "QB_CLIENT_ID not configured" },
      { status: 500 }
    );
  }

  const authUrl =
    "https://appcenter.intuit.com/connect/oauth2" +
    `?client_id=${clientId}` +
    "&response_type=code" +
    "&scope=com.intuit.quickbooks.accounting" +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    "&state=voyage_auth";

  return NextResponse.json({ authUrl });
}
