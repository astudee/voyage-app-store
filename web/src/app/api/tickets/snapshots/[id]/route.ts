import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/tickets/snapshots/[id] - Get snapshot with agent stats
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const snapshots = await query<{
      ID: string;
      SNAPSHOT_DATE: string;
      TOTAL_OPEN_TICKETS: number;
      TOTAL_ACTIONABLE_TICKETS: number;
      TOTAL_COMPLETED_LAST_7_DAYS: number;
      CREATED_BY: string;
      CREATED_AT: string;
    }>(
      `SELECT * FROM TICKET_WATCHER_SNAPSHOTS WHERE ID = ?`,
      [id]
    );

    if (snapshots.length === 0) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }

    const agentStats = await query<{
      ID: string;
      SNAPSHOT_ID: string;
      AGENT_ID: string;
      AGENT_NAME: string;
      AGENT_EMAIL: string;
      OPEN_TICKETS: number;
      ACTIONABLE_TICKETS: number;
      COMPLETED_LAST_7_DAYS: number;
    }>(
      `SELECT * FROM TICKET_WATCHER_AGENT_STATS WHERE SNAPSHOT_ID = ? ORDER BY OPEN_TICKETS DESC`,
      [id]
    );

    return NextResponse.json({
      ...snapshots[0],
      agent_stats: agentStats,
    });
  } catch (error) {
    console.error("Error fetching snapshot:", error);
    return NextResponse.json({ error: "Failed to fetch snapshot" }, { status: 500 });
  }
}
