import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

export interface Project {
  PROJECT_ID: number;
  CLIENT_NAME: string;
  PROJECT_NAME: string;
  PROJECT_STATUS: string;
  PROJECT_TYPE: string;
  BILL_RATE: number;
}

// GET /api/projects - List all projects
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projects = await query<Project>(
      `SELECT
        PROJECT_ID,
        CLIENT_NAME,
        PROJECT_NAME,
        PROJECT_STATUS,
        PROJECT_TYPE,
        BILL_RATE
      FROM VC_PROJECTS
      ORDER BY CLIENT_NAME, PROJECT_NAME`
    );
    return NextResponse.json(projects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
