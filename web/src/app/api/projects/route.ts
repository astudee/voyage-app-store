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

// POST /api/projects - Create a new project
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { project_id, client_name, project_name, project_status, project_type, bill_rate } = body;

    if (!project_id || !client_name || !project_name) {
      return NextResponse.json(
        { error: "project_id, client_name, and project_name are required" },
        { status: 400 }
      );
    }

    // Check if project already exists
    const existing = await query<{ PROJECT_ID: number }>(
      `SELECT PROJECT_ID FROM VC_PROJECTS WHERE PROJECT_ID = ?`,
      [project_id]
    );
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Project already exists" },
        { status: 409 }
      );
    }

    await query(
      `INSERT INTO VC_PROJECTS (PROJECT_ID, CLIENT_NAME, PROJECT_NAME, PROJECT_STATUS, PROJECT_TYPE, BILL_RATE, CREATED_AT, UPDATED_AT)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
      [
        project_id,
        client_name,
        project_name,
        project_status || 'Active',
        project_type || 'T&M',
        bill_rate || 0,
      ]
    );

    // Query back the created record (Snowflake doesn't support RETURNING)
    const created = await query<Project>(
      `SELECT PROJECT_ID, CLIENT_NAME, PROJECT_NAME, PROJECT_STATUS, PROJECT_TYPE, BILL_RATE
       FROM VC_PROJECTS WHERE PROJECT_ID = ?`,
      [project_id]
    );

    return NextResponse.json(created[0], { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create project" },
      { status: 500 }
    );
  }
}
