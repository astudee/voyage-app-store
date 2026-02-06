import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/tickets/snapshots/[id]/tickets - Get tickets for a snapshot
// Query params: agent_stat_id, ticket_type (actionable, on_hold, completed)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const agentStatId = searchParams.get("agent_stat_id");
  const ticketType = searchParams.get("ticket_type");

  try {
    let sql = `SELECT * FROM TICKET_WATCHER_TICKETS WHERE SNAPSHOT_ID = ?`;
    const sqlParams: (string | number)[] = [id];

    if (agentStatId) {
      sql += ` AND AGENT_STAT_ID = ?`;
      sqlParams.push(agentStatId);
    }

    if (ticketType) {
      sql += ` AND TICKET_TYPE = ?`;
      sqlParams.push(ticketType);
    }

    sql += ` ORDER BY CREATED_DATE ASC`;

    const tickets = await query<{
      ID: string;
      SNAPSHOT_ID: string;
      AGENT_STAT_ID: string | null;
      ZENDESK_TICKET_ID: number;
      TICKET_SUBJECT: string;
      TICKET_STATUS: string;
      TICKET_PRIORITY: string | null;
      TICKET_TYPE: string;
      REQUESTER_NAME: string;
      CREATED_DATE: string;
      UPDATED_DATE: string;
      SOLVED_DATE: string | null;
    }>(sql, sqlParams);

    return NextResponse.json(tickets);
  } catch (error) {
    console.error("Error fetching tickets:", error);
    return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
  }
}
