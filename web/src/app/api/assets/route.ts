import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query, execute } from "@/lib/snowflake";
import { Asset } from "@/lib/asset-types";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ASSET_TRACKER_ASSETS (
  ASSET_ID VARCHAR(36) PRIMARY KEY,
  ASSET_TAG VARCHAR(50),
  ASSET_TYPE VARCHAR(50) NOT NULL,
  BRAND VARCHAR(100) NOT NULL,
  MODEL VARCHAR(200) NOT NULL,
  SERIAL_NUMBER VARCHAR(200),
  STATUS VARCHAR(30) NOT NULL DEFAULT 'Inventory',
  ASSIGNED_TO_STAFF_ID NUMBER(38,0),
  ASSIGNED_TO_OTHER VARCHAR(200),
  PURCHASE_DATE DATE,
  PURCHASE_COST NUMBER(10,2),
  WARRANTY_EXPIRY DATE,
  LIQUIDATED_DATE DATE,
  NOTES TEXT,
  CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
)`;

let tableEnsured = false;

async function ensureTable() {
  if (tableEnsured) return;
  await execute(CREATE_TABLE_SQL);
  tableEnsured = true;
}

// GET /api/assets - List assets with optional filters
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const assigned = searchParams.get("assigned");
  const search = searchParams.get("search");

  let sql = `
    SELECT a.*, s.STAFF_NAME AS ASSIGNED_TO_STAFF_NAME
    FROM ASSET_TRACKER_ASSETS a
    LEFT JOIN VC_STAFF s ON a.ASSIGNED_TO_STAFF_ID = s.STAFF_ID
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (status) {
    sql += ` AND a.STATUS = ?`;
    params.push(status);
  }

  if (type) {
    sql += ` AND a.ASSET_TYPE = ?`;
    params.push(type);
  }

  if (assigned === "unassigned") {
    sql += ` AND a.ASSIGNED_TO_STAFF_ID IS NULL AND a.ASSIGNED_TO_OTHER IS NULL`;
  } else if (assigned === "assigned") {
    sql += ` AND (a.ASSIGNED_TO_STAFF_ID IS NOT NULL OR a.ASSIGNED_TO_OTHER IS NOT NULL)`;
  }

  if (search) {
    sql += ` AND (
      a.ASSET_TAG ILIKE ? OR a.BRAND ILIKE ? OR a.MODEL ILIKE ?
      OR a.SERIAL_NUMBER ILIKE ? OR s.STAFF_NAME ILIKE ? OR a.ASSIGNED_TO_OTHER ILIKE ?
    )`;
    const term = `%${search}%`;
    params.push(term, term, term, term, term, term);
  }

  sql += ` ORDER BY a.UPDATED_AT DESC`;

  try {
    const assets = await query<Asset>(sql, params);
    return NextResponse.json(assets);
  } catch (error) {
    console.error("Error fetching assets:", error);
    return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 });
  }
}

// POST /api/assets - Create new asset
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureTable();

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

    const id = crypto.randomUUID();

    await execute(
      `INSERT INTO ASSET_TRACKER_ASSETS (
        ASSET_ID, ASSET_TAG, ASSET_TYPE, BRAND, MODEL, SERIAL_NUMBER,
        STATUS, ASSIGNED_TO_STAFF_ID, ASSIGNED_TO_OTHER,
        PURCHASE_DATE, PURCHASE_COST, WARRANTY_EXPIRY, LIQUIDATED_DATE, NOTES,
        CREATED_AT, UPDATED_AT
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
      [
        id,
        asset_tag || null,
        asset_type,
        brand,
        model,
        serial_number || null,
        status || "Inventory",
        assigned_to_staff_id || null,
        assigned_to_other || null,
        purchase_date || null,
        purchase_cost || null,
        warranty_expiry || null,
        liquidated_date || null,
        notes || null,
      ]
    );

    // Query back the created record
    const rows = await query<Asset>(
      `SELECT a.*, s.STAFF_NAME AS ASSIGNED_TO_STAFF_NAME
       FROM ASSET_TRACKER_ASSETS a
       LEFT JOIN VC_STAFF s ON a.ASSIGNED_TO_STAFF_ID = s.STAFF_ID
       WHERE a.ASSET_ID = ?`,
      [id]
    );

    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    console.error("Error creating asset:", error);
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 });
  }
}
