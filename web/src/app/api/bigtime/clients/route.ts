import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const BIGTIME_API_KEY = process.env.BIGTIME_API_KEY;
const BIGTIME_FIRM_ID = process.env.BIGTIME_FIRM_ID;

interface BigTimeClient {
  SystemId: number;
  Nm: string;
  ClientId?: string;
  IsInactive?: boolean;
}

interface BigTimeProject {
  SystemId: number;
  Nm: string;
  ProjectCode?: string;
  ClientNm?: string;
  ClientSid?: number;
  IsInactive?: boolean;
}

interface Client {
  id: number;
  name: string;
  clientId?: string;
}

interface Project {
  id: number;
  projectName: string;
  clientName: string;
  projectCode?: string;
}

// Fetch all clients directly from BigTime API
async function fetchClientsRaw(): Promise<BigTimeClient[]> {
  // Always fetch with ShowInactive to get all, we'll filter in code
  const url = `https://iq.bigtime.net/BigtimeData/api/v2/client?ShowInactive=true`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Auth-ApiToken": BIGTIME_API_KEY!,
      "X-Auth-Realm": BIGTIME_FIRM_ID!,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`BigTime Client API error: ${response.status}`);
  }

  return await response.json();
}

// Fetch all projects directly from BigTime API
async function fetchProjectsRaw(): Promise<BigTimeProject[]> {
  // Always fetch with ShowInactive to get all, we'll filter in code
  const url = `https://iq.bigtime.net/BigtimeData/api/v2/project?ShowInactive=true`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Auth-ApiToken": BIGTIME_API_KEY!,
      "X-Auth-Realm": BIGTIME_FIRM_ID!,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`BigTime Project API error: ${response.status}`);
  }

  return await response.json();
}

// GET /api/bigtime/clients?includeInactive=true
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!BIGTIME_API_KEY || !BIGTIME_FIRM_ID) {
    return NextResponse.json(
      { error: "BigTime API not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  try {
    // Fetch clients and projects in parallel
    const [rawClients, rawProjects] = await Promise.all([
      fetchClientsRaw(),
      fetchProjectsRaw(),
    ]);

    // Build client lookup map (id -> name)
    const clientLookup = new Map<number, string>();
    for (const c of rawClients) {
      if (c.SystemId && c.Nm) {
        clientLookup.set(c.SystemId, c.Nm);
      }
    }

    // Filter and transform clients
    const clients: Client[] = rawClients
      .filter((c) => c.Nm && c.SystemId)
      .filter((c) => includeInactive || !c.IsInactive)
      .map((c) => ({
        id: c.SystemId,
        name: c.Nm,
        clientId: c.ClientId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Filter and transform projects, using client lookup for names
    const projects: Project[] = rawProjects
      .filter((p) => p.Nm && p.SystemId)
      .filter((p) => includeInactive || !p.IsInactive)
      .map((p) => ({
        id: p.SystemId,
        projectName: p.Nm,
        clientName: p.ClientSid ? (clientLookup.get(p.ClientSid) || "Unknown") : (p.ClientNm || "Unknown"),
        projectCode: p.ProjectCode,
      }))
      .sort((a, b) =>
        a.clientName.localeCompare(b.clientName) ||
        a.projectName.localeCompare(b.projectName)
      );

    return NextResponse.json({
      success: true,
      clients,
      projects,
      includeInactive,
    });
  } catch (error) {
    console.error("BigTime clients fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
