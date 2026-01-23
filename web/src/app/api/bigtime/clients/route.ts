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
async function fetchClients(showInactive: boolean = false): Promise<Client[]> {
  const url = `https://iq.bigtime.net/BigtimeData/api/v2/client${showInactive ? "?ShowInactive=true" : ""}`;

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

  const data: BigTimeClient[] = await response.json();

  return data
    .filter((c) => c.Nm && c.SystemId)
    .map((c) => ({
      id: c.SystemId,
      name: c.Nm,
      clientId: c.ClientId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Fetch all projects directly from BigTime API
async function fetchProjects(showInactive: boolean = false): Promise<Project[]> {
  const url = `https://iq.bigtime.net/BigtimeData/api/v2/project${showInactive ? "?ShowInactive=true" : ""}`;

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

  const data: BigTimeProject[] = await response.json();

  return data
    .filter((p) => p.Nm && p.SystemId)
    .map((p) => ({
      id: p.SystemId,
      projectName: p.Nm,
      clientName: p.ClientNm || "Unknown",
      projectCode: p.ProjectCode,
    }))
    .sort((a, b) =>
      a.clientName.localeCompare(b.clientName) ||
      a.projectName.localeCompare(b.projectName)
    );
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
    // Fetch clients and projects in parallel using direct API endpoints
    const [clients, projects] = await Promise.all([
      fetchClients(includeInactive),
      fetchProjects(includeInactive),
    ]);

    return NextResponse.json({
      success: true,
      clients,
      projects,
      includeInactive,
      // Legacy compatibility fields
      years: [new Date().getFullYear()],
      entryCount: 0, // No longer using time entries
    });
  } catch (error) {
    console.error("BigTime clients fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
