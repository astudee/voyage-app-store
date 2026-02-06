function getConfig() {
  return {
    subdomain: (process.env.ZENDESK_SUBDOMAIN || "voyageadvisoryllc").trim(),
    email: (process.env.ZENDESK_AGENT_EMAIL || "").trim(),
    token: (process.env.ZENDESK_API_TOKEN || "").trim(),
  };
}

function getBaseUrl(): string {
  return `https://${getConfig().subdomain}.zendesk.com/api/v2`;
}

function getAuthHeader(): string {
  const { email, token } = getConfig();
  const credentials = `${email}/token:${token}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

export function isConfigured(): boolean {
  const { subdomain, email, token } = getConfig();
  return !!(subdomain && email && token && token !== "placeholder");
}

interface ZendeskUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface ZendeskTicket {
  id: number;
  subject: string;
  status: string;
  priority: string | null;
  assignee_id: number | null;
  requester_id: number | null;
  created_at: string;
  updated_at: string;
  solved_at?: string | null;
}

interface ZendeskSearchResponse {
  results: ZendeskTicket[];
  next_page: string | null;
  count: number;
}

interface ZendeskUsersResponse {
  users: ZendeskUser[];
  next_page: string | null;
}

async function zendeskFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zendesk API ${res.status}: ${text.substring(0, 200)}`);
  }

  return res.json();
}

// Test connection by calling /users/me.json
export async function testConnection(): Promise<{ success: boolean; userName?: string; userRole?: string; error?: string }> {
  try {
    const data = await zendeskFetch<{ user: ZendeskUser & { role: string } }>(
      `${getBaseUrl()}/users/me.json`
    );
    return { success: true, userName: data.user.name, userRole: data.user.role };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Verify the authenticated user has agent/admin role (required for search API)
export async function verifyAgentAccess(): Promise<{ ok: boolean; role?: string; error?: string }> {
  try {
    const data = await zendeskFetch<{ user: ZendeskUser & { role: string } }>(
      `${getBaseUrl()}/users/me.json`
    );
    const role = data.user.role;
    if (role === "agent" || role === "admin") {
      return { ok: true, role };
    }
    return {
      ok: false,
      role,
      error: `Zendesk user "${data.user.name}" has role "${role}" — agent or admin role is required. Check that ZENDESK_AGENT_EMAIL matches an agent account in Zendesk.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Paginate through all search results
async function searchAllTickets(queryStr: string): Promise<ZendeskTicket[]> {
  const allTickets: ZendeskTicket[] = [];
  let nextUrl: string | null = `${getBaseUrl()}/search.json?query=${encodeURIComponent(queryStr)}`;

  while (nextUrl) {
    const data: ZendeskSearchResponse = await zendeskFetch<ZendeskSearchResponse>(nextUrl);
    allTickets.push(...data.results);
    nextUrl = data.next_page;
  }

  return allTickets;
}

// Get all agents (includes admins who can be assignees)
export async function fetchAgents(): Promise<Map<number, ZendeskUser>> {
  const agents = new Map<number, ZendeskUser>();

  // Fetch both agents and admins since both can be ticket assignees
  for (const role of ["agent", "admin"]) {
    let nextUrl: string | null = `${getBaseUrl()}/users.json?role=${role}`;
    while (nextUrl) {
      const data: ZendeskUsersResponse = await zendeskFetch<ZendeskUsersResponse>(nextUrl);
      for (const user of data.users) {
        agents.set(user.id, user);
      }
      nextUrl = data.next_page;
    }
  }

  return agents;
}

// Fetch specific users by ID (for assignees not in agents list)
export async function fetchUsersByIds(ids: number[]): Promise<Map<number, ZendeskUser>> {
  const users = new Map<number, ZendeskUser>();
  if (ids.length === 0) return users;

  const uniqueIds = [...new Set(ids)];
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const batch = uniqueIds.slice(i, i + 100);
    try {
      const data = await zendeskFetch<ZendeskUsersResponse>(
        `${getBaseUrl()}/users/show_many.json?ids=${batch.join(",")}`
      );
      for (const user of data.users) {
        users.set(user.id, user);
      }
    } catch {
      // Some users may not exist, continue
    }
  }
  return users;
}

// Get all requesters by IDs (batch lookup)
export async function fetchUsers(ids: number[]): Promise<Map<number, ZendeskUser>> {
  const users = new Map<number, ZendeskUser>();
  if (ids.length === 0) return users;

  // Zendesk show_many supports up to 100 IDs at a time
  const uniqueIds = [...new Set(ids)];
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const batch = uniqueIds.slice(i, i + 100);
    const data = await zendeskFetch<ZendeskUsersResponse>(
      `${getBaseUrl()}/users/show_many.json?ids=${batch.join(",")}`
    );
    for (const user of data.users) {
      users.set(user.id, user);
    }
  }

  return users;
}

// Fetch all open tickets (status < solved)
export async function fetchOpenTickets(): Promise<ZendeskTicket[]> {
  return searchAllTickets("type:ticket status<solved");
}

// Fetch tickets solved/closed in last 7 days
export async function fetchCompletedTickets(): Promise<ZendeskTicket[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const isoDate = sevenDaysAgo.toISOString().split("T")[0];

  const [solved, closed] = await Promise.all([
    searchAllTickets(`type:ticket status:solved solved>=${isoDate}`),
    searchAllTickets(`type:ticket status:closed solved>=${isoDate}`),
  ]);

  // Deduplicate by ticket ID
  const seen = new Set<number>();
  const all: ZendeskTicket[] = [];
  for (const t of [...solved, ...closed]) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      all.push(t);
    }
  }

  return all;
}

export type { ZendeskTicket, ZendeskUser };
// Force redeploy Thu Feb  5 20:09:21 UTC 2026
