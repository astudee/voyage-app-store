import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { execute, query } from "@/lib/snowflake";
import {
  isConfigured,
  verifyAgentAccess,
  fetchOpenTickets,
  fetchCompletedTickets,
  fetchAgents,
  fetchUsersByIds,
} from "@/lib/zendesk-client";
import { isActionable } from "@/lib/ticket-types";

const CREATE_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS TICKET_WATCHER_SNAPSHOTS (
    ID VARCHAR(36) PRIMARY KEY,
    SNAPSHOT_DATE TIMESTAMP_NTZ,
    TOTAL_OPEN_TICKETS INTEGER,
    TOTAL_ACTIONABLE_TICKETS INTEGER,
    TOTAL_COMPLETED_LAST_7_DAYS INTEGER,
    CREATED_BY VARCHAR(100),
    CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
  )`,
  `CREATE TABLE IF NOT EXISTS TICKET_WATCHER_AGENT_STATS (
    ID VARCHAR(36) PRIMARY KEY,
    SNAPSHOT_ID VARCHAR(36) NOT NULL,
    AGENT_ID VARCHAR(100),
    AGENT_NAME VARCHAR(200),
    AGENT_EMAIL VARCHAR(200),
    OPEN_TICKETS INTEGER,
    ACTIONABLE_TICKETS INTEGER,
    COMPLETED_LAST_7_DAYS INTEGER,
    CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
  )`,
];

let tablesEnsured = false;

async function ensureTables() {
  if (tablesEnsured) return;
  for (const sql of CREATE_TABLES_SQL) {
    await execute(sql);
  }
  tablesEnsured = true;
}

// POST /api/tickets/snapshot - Take a new snapshot
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Zendesk is not configured. Check environment variables." },
      { status: 400 }
    );
  }

  await ensureTables();

  try {
    // Pre-flight: verify the token has agent/admin access
    const access = await verifyAgentAccess();
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error || `Insufficient permissions (role: ${access.role})` },
        { status: 403 }
      );
    }

    // Step 1-3: Fetch data from Zendesk in parallel
    const [openTickets, completedTickets, agentMap] = await Promise.all([
      fetchOpenTickets(),
      fetchCompletedTickets(),
      fetchAgents(),
    ]);

    // Step 4: Calculate totals
    const totalOpen = openTickets.length;
    const totalActionable = openTickets.filter((t) => isActionable(t.status)).length;
    const totalCompleted = completedTickets.length;

    // Step 5: Group by agent
    const agentOpenMap = new Map<string, typeof openTickets>();
    for (const t of openTickets) {
      const key = t.assignee_id?.toString() || "unassigned";
      if (!agentOpenMap.has(key)) agentOpenMap.set(key, []);
      agentOpenMap.get(key)!.push(t);
    }

    const agentCompletedMap = new Map<string, typeof completedTickets>();
    for (const t of completedTickets) {
      const key = t.assignee_id?.toString() || "unassigned";
      if (!agentCompletedMap.has(key)) agentCompletedMap.set(key, []);
      agentCompletedMap.get(key)!.push(t);
    }

    const allAgentKeys = new Set([
      ...agentOpenMap.keys(),
      ...agentCompletedMap.keys(),
    ]);

    // Fetch names for any assignees not in the agents map
    const missingAgentIds: number[] = [];
    for (const key of allAgentKeys) {
      if (key !== "unassigned") {
        const id = parseInt(key);
        if (!agentMap.has(id)) {
          missingAgentIds.push(id);
        }
      }
    }
    if (missingAgentIds.length > 0) {
      const extraUsers = await fetchUsersByIds(missingAgentIds);
      for (const [id, user] of extraUsers) {
        agentMap.set(id, user);
      }
    }

    // Step 6: Save to database
    const snapshotId = crypto.randomUUID();
    const createdBy = session.user?.name || session.user?.email || "Unknown";

    await execute(
      `INSERT INTO TICKET_WATCHER_SNAPSHOTS (ID, SNAPSHOT_DATE, TOTAL_OPEN_TICKETS, TOTAL_ACTIONABLE_TICKETS, TOTAL_COMPLETED_LAST_7_DAYS, CREATED_BY, CREATED_AT)
       VALUES (?, CURRENT_TIMESTAMP(), ?, ?, ?, ?, CURRENT_TIMESTAMP())`,
      [snapshotId, totalOpen, totalActionable, totalCompleted, createdBy]
    );

    // Insert agent stats (one query per agent - much faster than per-ticket)
    for (const agentKey of allAgentKeys) {
      const agentStatId = crypto.randomUUID();
      const agentIdNum = agentKey !== "unassigned" ? parseInt(agentKey) : null;
      const agent = agentIdNum ? agentMap.get(agentIdNum) : null;

      const agentOpenTickets = agentOpenMap.get(agentKey) || [];
      const agentCompletedTickets = agentCompletedMap.get(agentKey) || [];
      const agentActionable = agentOpenTickets.filter((t) => isActionable(t.status)).length;

      await execute(
        `INSERT INTO TICKET_WATCHER_AGENT_STATS (ID, SNAPSHOT_ID, AGENT_ID, AGENT_NAME, AGENT_EMAIL, OPEN_TICKETS, ACTIONABLE_TICKETS, COMPLETED_LAST_7_DAYS, CREATED_AT)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP())`,
        [
          agentStatId,
          snapshotId,
          agentKey,
          agent?.name || (agentKey === "unassigned" ? "Unassigned" : `Agent ${agentKey}`),
          agent?.email || null,
          agentOpenTickets.length,
          agentActionable,
          agentCompletedTickets.length,
        ]
      );
    }

    // Query back the snapshot
    const rows = await query<{
      ID: string;
      SNAPSHOT_DATE: string;
      TOTAL_OPEN_TICKETS: number;
      TOTAL_ACTIONABLE_TICKETS: number;
      TOTAL_COMPLETED_LAST_7_DAYS: number;
      CREATED_BY: string;
      CREATED_AT: string;
    }>(
      `SELECT * FROM TICKET_WATCHER_SNAPSHOTS WHERE ID = ?`,
      [snapshotId]
    );

    return NextResponse.json({
      snapshot: rows[0],
      stats: {
        open_tickets_fetched: totalOpen,
        completed_tickets_fetched: totalCompleted,
        agents_found: allAgentKeys.size,
      },
    });
  } catch (error) {
    console.error("Snapshot error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to take snapshot" },
      { status: 500 }
    );
  }
}
