import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";
import { Asset } from "@/lib/asset-types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/assets/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const rows = await query<Asset>(
      `SELECT a.*, s.STAFF_NAME AS ASSIGNED_TO_STAFF_NAME
       FROM ASSET_TRACKER_ASSETS a
       LEFT JOIN VC_STAFF s ON a.ASSIGNED_TO_STAFF_ID = s.STAFF_ID
       WHERE a.ASSET_ID = ?`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error("Error fetching asset:", error);
    return NextResponse.json({ error: "Failed to fetch asset" }, { status: 500 });
  }
}

// PUT /api/assets/[id]
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const {
      asset_tag, asset_type, brand, model, serial_number, status,
      assigned_to_staff_id, assigned_to_other, purchase_date,
      purchase_cost, warranty_expiry, liquidated_date, notes,
    } = body;

    if (!asset_type || !brand || !model) {
      return NextResponse.json(
        { error: "asset_type, brand, and model are required" },
        { status: 400 }
      );
    }

    if (status === "In Use" && !assigned_to_staff_id && !assigned_to_other) {
      return NextResponse.json(
        { error: "Assignee is required when status is 'In Use'" },
        { status: 400 }
      );
    }

    // Status change logic
    let finalAssignedStaffId = assigned_to_staff_id || null;
    let finalAssignedOther = assigned_to_other || null;
    let finalLiquidatedDate = liquidated_date || null;

    if (status === "Inventory" || status === "Liquidated" || status === "Lost") {
      finalAssignedStaffId = null;
      finalAssignedOther = null;
    }

    if (status === "Liquidated" && !finalLiquidatedDate) {
      finalLiquidatedDate = new Date().toISOString().split("T")[0];
    }

    await execute(
      `UPDATE ASSET_TRACKER_ASSETS SET
        ASSET_TAG = ?,
        ASSET_TYPE = ?,
        BRAND = ?,
        MODEL = ?,
        SERIAL_NUMBER = ?,
        STATUS = ?,
        ASSIGNED_TO_STAFF_ID = ?,
        ASSIGNED_TO_OTHER = ?,
        PURCHASE_DATE = ?,
        PURCHASE_COST = ?,
        WARRANTY_EXPIRY = ?,
        LIQUIDATED_DATE = ?,
        NOTES = ?,
        UPDATED_AT = CURRENT_TIMESTAMP()
      WHERE ASSET_ID = ?`,
      [
        asset_tag || null,
        asset_type,
        brand,
        model,
        serial_number || null,
        status || "Inventory",
        finalAssignedStaffId,
        finalAssignedOther,
        purchase_date || null,
        purchase_cost || null,
        warranty_expiry || null,
        finalLiquidatedDate,
        notes || null,
        id,
      ]
    );

    // Query back
    const rows = await query<Asset>(
      `SELECT a.*, s.STAFF_NAME AS ASSIGNED_TO_STAFF_NAME
       FROM ASSET_TRACKER_ASSETS a
       LEFT JOIN VC_STAFF s ON a.ASSIGNED_TO_STAFF_ID = s.STAFF_ID
       WHERE a.ASSET_ID = ?`,
      [id]
    );

    return NextResponse.json(rows[0] || { success: true });
  } catch (error) {
    console.error("Error updating asset:", error);
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
  }
}

// DELETE /api/assets/[id] - Hard delete
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await execute(
      `DELETE FROM ASSET_TRACKER_ASSETS WHERE ASSET_ID = ?`,
      [id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting asset:", error);
    return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 });
  }
}
