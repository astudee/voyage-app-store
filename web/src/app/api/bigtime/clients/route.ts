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

    // Cast to any for flexible field access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientsAny = rawClients as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projectsAny = rawProjects as any[];

    // Build client lookup map (id -> name) - try multiple possible ID fields
    const clientLookup = new Map<number, string>();
    for (const c of clientsAny) {
      const id = c.SystemId || c.Id || c.id || c.Sid;
      const name = c.Nm || c.Name || c.name;
      if (id && name) {
        clientLookup.set(Number(id), String(name));
      }
    }

    // Filter and transform clients - check various field name patterns
    const clients: Client[] = clientsAny
      .filter((c) => {
        const name = c.Nm || c.Name || c.name;
        const id = c.SystemId || c.Id || c.id || c.Sid;
        return name && id;
      })
      .filter((c) => {
        if (includeInactive) return true;
        // Check various possible inactive field names
        const inactive = c.IsInactive ?? c.isInactive ?? c.Inactive ?? c.inactive ?? false;
        return !inactive;
      })
      .map((c) => ({
        id: Number(c.SystemId || c.Id || c.id || c.Sid),
        name: String(c.Nm || c.Name || c.name),
        clientId: c.ClientId ? String(c.ClientId) : undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Filter and transform projects
    const projects: Project[] = projectsAny
      .filter((p) => {
        const name = p.Nm || p.Name || p.name;
        const id = p.SystemId || p.Id || p.id || p.Sid;
        return name && id;
      })
      .filter((p) => {
        if (includeInactive) return true;
        const inactive = p.IsInactive ?? p.isInactive ?? p.Inactive ?? p.inactive ?? false;
        return !inactive;
      })
      .map((p) => {
        const projectId = Number(p.SystemId || p.Id || p.id || p.Sid);
        const projectName = String(p.Nm || p.Name || p.name);

        // Try multiple possible client ID/name fields
        const clientSid = p.ClientSid || p.ClientId || p.clientId || p.Client_Id || p.ClientSystemId;
        const clientNm = p.ClientNm || p.ClientName || p.clientName || p.Client;

        let clientName = "Unknown";
        if (clientSid) {
          clientName = clientLookup.get(Number(clientSid)) || "Unknown";
        } else if (clientNm) {
          clientName = String(clientNm);
        }

        return {
          id: projectId,
          projectName,
          clientName,
          projectCode: p.ProjectCode ? String(p.ProjectCode) : undefined,
        };
      })
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
