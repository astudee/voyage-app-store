import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || "voyage-app-store-vercel";
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;

// POST /api/vercel/env - Update an environment variable
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!VERCEL_TOKEN) {
    return NextResponse.json(
      { error: "VERCEL_TOKEN not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || !value) {
      return NextResponse.json(
        { error: "key and value are required" },
        { status: 400 }
      );
    }

    // Build query params for team if needed
    const teamParam = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : "";

    // Step 1: Get existing env vars to find the ID
    const listResponse = await fetch(
      `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env${teamParam}`,
      {
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
        },
      }
    );

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      return NextResponse.json(
        { error: `Failed to list env vars: ${errorText}` },
        { status: listResponse.status }
      );
    }

    const listData = await listResponse.json();
    const envVars = listData.envs || [];

    // Find the existing env var
    const existingVar = envVars.find((env: { key: string }) => env.key === key);

    if (existingVar) {
      // Step 2a: Update existing env var
      const updateResponse = await fetch(
        `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env/${existingVar.id}${teamParam}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${VERCEL_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            value: value,
          }),
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        return NextResponse.json(
          { error: `Failed to update env var: ${errorText}` },
          { status: updateResponse.status }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Updated ${key} in Vercel`,
        action: "updated",
      });
    } else {
      // Step 2b: Create new env var (for all targets: production, preview, development)
      const createResponse = await fetch(
        `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env${teamParam}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${VERCEL_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            key: key,
            value: value,
            type: "encrypted",
            target: ["production", "preview", "development"],
          }),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        return NextResponse.json(
          { error: `Failed to create env var: ${errorText}` },
          { status: createResponse.status }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Created ${key} in Vercel`,
        action: "created",
      });
    }
  } catch (error) {
    console.error("Vercel env update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
