import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";
import { Staff } from "../route";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/staff/[id] - Get one staff member
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const staff = await query<Staff>(
      `SELECT * FROM VC_STAFF WHERE STAFF_ID = ?`,
      [parseInt(id)]
    );

    if (staff.length === 0) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    return NextResponse.json(staff[0]);
  } catch (error) {
    console.error("Error fetching staff:", error);
    return NextResponse.json(
      { error: "Failed to fetch staff" },
      { status: 500 }
    );
  }
}

// PUT /api/staff/[id] - Update staff member
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    const {
      staff_name,
      start_date,
      salary,
      utilization_bonus_target,
      other_bonus_target,
      medical_plan_code,
      dental_plan_code,
      vision_plan_code,
      std_code,
      ltd_code,
      life_code,
      addl_life_code,
      phone_allowance,
      staff_type,
      notes,
      is_active,
      bigtime_staff_id,
    } = body;

    if (!staff_name) {
      return NextResponse.json(
        { error: "staff_name is required" },
        { status: 400 }
      );
    }

    await execute(
      `UPDATE VC_STAFF SET
        STAFF_NAME = ?,
        START_DATE = ?,
        SALARY = ?,
        UTILIZATION_BONUS_TARGET = ?,
        OTHER_BONUS_TARGET = ?,
        MEDICAL_PLAN_CODE = ?,
        DENTAL_PLAN_CODE = ?,
        VISION_PLAN_CODE = ?,
        STD_CODE = ?,
        LTD_CODE = ?,
        LIFE_CODE = ?,
        ADDL_LIFE_CODE = ?,
        PHONE_ALLOWANCE = ?,
        STAFF_TYPE = ?,
        NOTES = ?,
        IS_ACTIVE = ?,
        BIGTIME_STAFF_ID = ?,
        UPDATED_AT = CURRENT_TIMESTAMP()
      WHERE STAFF_ID = ?`,
      [
        staff_name,
        start_date || null,
        salary || null,
        utilization_bonus_target || null,
        other_bonus_target || null,
        medical_plan_code || null,
        dental_plan_code || null,
        vision_plan_code || null,
        std_code || null,
        ltd_code || null,
        life_code || null,
        addl_life_code || null,
        phone_allowance || null,
        staff_type || null,
        notes || null,
        is_active ?? true,
        bigtime_staff_id || null,
        parseInt(id),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating staff:", error);
    return NextResponse.json(
      { error: "Failed to update staff" },
      { status: 500 }
    );
  }
}

// DELETE /api/staff/[id] - Deactivate staff member (soft delete)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await execute(
      `UPDATE VC_STAFF SET IS_ACTIVE = FALSE, UPDATED_AT = CURRENT_TIMESTAMP() WHERE STAFF_ID = ?`,
      [parseInt(id)]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deactivating staff:", error);
    return NextResponse.json(
      { error: "Failed to deactivate staff" },
      { status: 500 }
    );
  }
}
