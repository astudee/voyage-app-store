import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";

export interface Staff {
  STAFF_ID: number;
  STAFF_NAME: string;
  START_DATE: string | null;
  SALARY: number | null;
  UTILIZATION_BONUS_TARGET: number | null;
  OTHER_BONUS_TARGET: number | null;
  MEDICAL_PLAN_CODE: string | null;
  DENTAL_PLAN_CODE: string | null;
  VISION_PLAN_CODE: string | null;
  STD_CODE: string | null;
  LTD_CODE: string | null;
  LIFE_CODE: string | null;
  ADDL_LIFE_CODE: string | null;
  PHONE_ALLOWANCE: number | null;
  STAFF_TYPE: string | null;
  NOTES: string | null;
  IS_ACTIVE: boolean;
  BIGTIME_STAFF_ID: number | null;
  CREATED_AT: string;
  UPDATED_AT: string;
}

// GET /api/staff - List all staff
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const staff = await query<Staff>(
      `SELECT * FROM VC_STAFF ORDER BY STAFF_NAME`
    );
    return NextResponse.json(staff);
  } catch (error) {
    console.error("Error fetching staff:", error);
    return NextResponse.json(
      { error: "Failed to fetch staff" },
      { status: 500 }
    );
  }
}

// POST /api/staff - Create new staff
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      is_active = true,
      bigtime_staff_id,
    } = body;

    if (!staff_name) {
      return NextResponse.json(
        { error: "staff_name is required" },
        { status: 400 }
      );
    }

    await execute(
      `INSERT INTO VC_STAFF (
        STAFF_NAME, START_DATE, SALARY, UTILIZATION_BONUS_TARGET, OTHER_BONUS_TARGET,
        MEDICAL_PLAN_CODE, DENTAL_PLAN_CODE, VISION_PLAN_CODE, STD_CODE, LTD_CODE,
        LIFE_CODE, ADDL_LIFE_CODE, PHONE_ALLOWANCE, STAFF_TYPE, NOTES, IS_ACTIVE,
        BIGTIME_STAFF_ID, CREATED_AT, UPDATED_AT
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
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
        is_active,
        bigtime_staff_id || null,
      ]
    );

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Error creating staff:", error);
    return NextResponse.json(
      { error: "Failed to create staff" },
      { status: 500 }
    );
  }
}
