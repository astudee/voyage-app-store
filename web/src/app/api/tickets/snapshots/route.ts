import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

// GET /api/tickets/snapshots - List all snapshots
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      `SELECT * FROM TICKET_WATCHER_SNAPSHOTS ORDER BY SNAPSHOT_DATE DESC`
    );

    return NextResponse.json(snapshots);
  } catch (error) {
    // Table might not exist yet
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json([]);
    }
    console.error("Error fetching snapshots:", error);
    return NextResponse.json({ error: "Failed to fetch snapshots" }, { status: 500 });
  }
}
