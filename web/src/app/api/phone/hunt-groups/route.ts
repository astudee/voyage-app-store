import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";
import { ensureHuntGroupTable, getAllHuntGroupMembers, getHuntGroupMembers } from "@/lib/phone-directory";

// GET /api/phone/hunt-groups?group=operator|sales
// Returns all members, or filtered by group
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const group = request.nextUrl.searchParams.get("group");
    const rows = group
      ? await getHuntGroupMembers(group)
      : await getAllHuntGroupMembers();

    const members = rows.map((r) => ({
      id: r.MEMBER_ID,
      groupName: r.GROUP_NAME,
      phoneNumber: r.PHONE_NUMBER,
      displayName: r.DISPLAY_NAME,
    }));

    return NextResponse.json(members);
  } catch (error) {
    console.error("[hunt-groups] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch hunt groups" }, { status: 500 });
  }
}

// POST /api/phone/hunt-groups - Add a member to a hunt group
// Body: { groupName: 'operator'|'sales', phoneNumber: string, displayName: string }
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureHuntGroupTable();

  try {
    const body = await request.json();
    const { groupName, phoneNumber, displayName } = body;

    if (!groupName || !phoneNumber) {
      return NextResponse.json(
        { error: "groupName and phoneNumber are required" },
        { status: 400 }
      );
    }

    if (!["operator", "sales"].includes(groupName)) {
      return NextResponse.json(
        { error: "groupName must be 'operator' or 'sales'" },
        { status: 400 }
      );
    }

    // Check for duplicate in same group
    const existing = await query(
      `SELECT MEMBER_ID FROM VC_HUNT_GROUP_MEMBERS WHERE GROUP_NAME = ? AND PHONE_NUMBER = ?`,
      [groupName, phoneNumber]
    );
    if (existing.length > 0) {
      return NextResponse.json(
        { error: `${displayName || phoneNumber} is already in the ${groupName} group` },
        { status: 409 }
      );
    }

    await execute(
      `INSERT INTO VC_HUNT_GROUP_MEMBERS (GROUP_NAME, PHONE_NUMBER, DISPLAY_NAME) VALUES (?, ?, ?)`,
      [groupName, phoneNumber, displayName || null]
    );

    // Return updated group
    const members = await getHuntGroupMembers(groupName);
    return NextResponse.json(
      members.map((r) => ({
        id: r.MEMBER_ID,
        groupName: r.GROUP_NAME,
        phoneNumber: r.PHONE_NUMBER,
        displayName: r.DISPLAY_NAME,
      })),
      { status: 201 }
    );
  } catch (error) {
    console.error("[hunt-groups] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add member" },
      { status: 500 }
    );
  }
}

// DELETE /api/phone/hunt-groups - Remove a member from a hunt group
// Body: { id: number, groupName: string }
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureHuntGroupTable();

  try {
    const body = await request.json();
    const { id, groupName } = body;

    if (!id || !groupName) {
      return NextResponse.json(
        { error: "id and groupName are required" },
        { status: 400 }
      );
    }

    // Enforce minimum 1 member
    const currentMembers = await getHuntGroupMembers(groupName);
    if (currentMembers.length <= 1) {
      return NextResponse.json(
        { error: `Cannot remove the last member from the ${groupName} group. At least 1 member is required.` },
        { status: 400 }
      );
    }

    await execute(
      `DELETE FROM VC_HUNT_GROUP_MEMBERS WHERE MEMBER_ID = ?`,
      [Number(id)]
    );

    // Return updated group
    const members = await getHuntGroupMembers(groupName);
    return NextResponse.json(
      members.map((r) => ({
        id: r.MEMBER_ID,
        groupName: r.GROUP_NAME,
        phoneNumber: r.PHONE_NUMBER,
        displayName: r.DISPLAY_NAME,
      }))
    );
  } catch (error) {
    console.error("[hunt-groups] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove member" },
      { status: 500 }
    );
  }
}
