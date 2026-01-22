import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";
import { ClientNameMapping } from "../route";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/mapping/[id] - Get one mapping
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const mappings = await query<ClientNameMapping>(
      `SELECT * FROM VC_CLIENT_NAME_MAPPING WHERE MAPPING_ID = ?`,
      [parseInt(id)]
    );

    if (mappings.length === 0) {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }

    return NextResponse.json(mappings[0]);
  } catch (error) {
    console.error("Error fetching mapping:", error);
    return NextResponse.json(
      { error: "Failed to fetch mapping" },
      { status: 500 }
    );
  }
}

// PUT /api/mapping/[id] - Update mapping
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    const { before_name, after_name, source_system, is_active } = body;

    if (!before_name || !after_name || !source_system) {
      return NextResponse.json(
        { error: "before_name, after_name, and source_system are required" },
        { status: 400 }
      );
    }

    await execute(
      `UPDATE VC_CLIENT_NAME_MAPPING SET
        BEFORE_NAME = ?,
        AFTER_NAME = ?,
        SOURCE_SYSTEM = ?,
        IS_ACTIVE = ?,
        UPDATED_AT = CURRENT_TIMESTAMP()
      WHERE MAPPING_ID = ?`,
      [
        before_name,
        after_name,
        source_system,
        is_active ?? true,
        parseInt(id),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating mapping:", error);
    return NextResponse.json(
      { error: "Failed to update mapping" },
      { status: 500 }
    );
  }
}

// DELETE /api/mapping/[id] - Deactivate mapping (soft delete)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await execute(
      `UPDATE VC_CLIENT_NAME_MAPPING SET IS_ACTIVE = FALSE, UPDATED_AT = CURRENT_TIMESTAMP() WHERE MAPPING_ID = ?`,
      [parseInt(id)]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deactivating mapping:", error);
    return NextResponse.json(
      { error: "Failed to deactivate mapping" },
      { status: 500 }
    );
  }
}
