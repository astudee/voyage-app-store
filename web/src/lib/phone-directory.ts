/**
 * Phone directory helper — reads directory entries from Snowflake.
 * Used by IVR routes, config API, and phone management UI.
 */

import { query, execute } from "@/lib/snowflake";

export interface DirectoryEntry {
  DIRECTORY_ID: number;
  EXTENSION: string;
  FIRST_NAME: string;
  LAST_NAME: string;
  TITLE: string | null;
  PHONE_NUMBER: string;
  ALIASES: string | null;
  IS_ACTIVE: boolean;
  CREATED_AT: string;
  UPDATED_AT: string;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS VC_PHONE_DIRECTORY (
  DIRECTORY_ID NUMBER(38,0) AUTOINCREMENT PRIMARY KEY,
  EXTENSION VARCHAR(10) NOT NULL,
  FIRST_NAME VARCHAR(100) NOT NULL,
  LAST_NAME VARCHAR(100) NOT NULL,
  TITLE VARCHAR(200),
  PHONE_NUMBER VARCHAR(20) NOT NULL,
  ALIASES VARCHAR(500),
  IS_ACTIVE BOOLEAN DEFAULT TRUE,
  CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  UPDATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
)`;

let tableEnsured = false;

export async function ensureTable() {
  if (tableEnsured) return;
  await execute(CREATE_TABLE_SQL);
  tableEnsured = true;
}

/**
 * Get all active directory entries, sorted by extension.
 */
export async function getActiveDirectory(): Promise<DirectoryEntry[]> {
  await ensureTable();
  return query<DirectoryEntry>(
    `SELECT * FROM VC_PHONE_DIRECTORY WHERE IS_ACTIVE = TRUE ORDER BY EXTENSION`
  );
}

/**
 * Get all directory entries (including inactive), sorted by extension.
 */
export async function getAllDirectory(): Promise<DirectoryEntry[]> {
  await ensureTable();
  return query<DirectoryEntry>(
    `SELECT * FROM VC_PHONE_DIRECTORY ORDER BY EXTENSION`
  );
}

/**
 * Convert Snowflake row to the shape used by IVR routes and UI.
 */
export function toClientEntry(row: DirectoryEntry) {
  return {
    id: row.DIRECTORY_ID,
    extension: row.EXTENSION,
    firstName: row.FIRST_NAME,
    lastName: row.LAST_NAME,
    title: row.TITLE || "",
    number: row.PHONE_NUMBER,
    aliases: row.ALIASES ? row.ALIASES.split(",").map((a) => a.trim()) : undefined,
    isActive: row.IS_ACTIVE,
  };
}

/**
 * Convert Snowflake rows to the client-facing shape.
 */
export function toClientEntries(rows: DirectoryEntry[]) {
  return rows.map(toClientEntry);
}
