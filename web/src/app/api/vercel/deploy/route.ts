import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || "voyage-app-store-vercel";
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;

// POST /api/vercel/deploy - Trigger a new production deployment
export async function POST() {
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
    // Build query params for team if needed
    const teamParam = VERCEL_TEAM_ID ? `&teamId=${VERCEL_TEAM_ID}` : "";

    // Step 1: Get the latest production deployment to redeploy
    const deploymentsResponse = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&target=production&limit=1${teamParam}`,
      {
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
        },
      }
    );

    if (!deploymentsResponse.ok) {
      const errorText = await deploymentsResponse.text();
      return NextResponse.json(
        { error: `Failed to get deployments: ${errorText}` },
        { status: deploymentsResponse.status }
      );
    }

    const deploymentsData = await deploymentsResponse.json();
    const latestDeployment = deploymentsData.deployments?.[0];

    if (!latestDeployment) {
      return NextResponse.json(
        { error: "No existing deployment found to redeploy" },
        { status: 404 }
      );
    }

    // Step 2: Create a new deployment (redeploy)
    const redeployResponse = await fetch(
      `https://api.vercel.com/v13/deployments?forceNew=1${teamParam}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: VERCEL_PROJECT_ID,
          deploymentId: latestDeployment.uid,
          target: "production",
        }),
      }
    );

    if (!redeployResponse.ok) {
      const errorText = await redeployResponse.text();
      return NextResponse.json(
        { error: `Failed to trigger redeploy: ${errorText}` },
        { status: redeployResponse.status }
      );
    }

    const redeployData = await redeployResponse.json();

    return NextResponse.json({
      success: true,
      message: "Deployment triggered",
      deploymentId: redeployData.id,
      url: redeployData.url,
    });
  } catch (error) {
    console.error("Vercel deploy error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
