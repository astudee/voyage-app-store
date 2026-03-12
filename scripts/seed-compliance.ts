/**
 * Seed script for COMPLIANCE_ITEMS table.
 * Run with: npx tsx scripts/seed-compliance.ts
 *
 * Idempotent — checks if records exist before inserting.
 * Requires .env with Snowflake credentials.
 */

// Environment variables must be set before running.
// Run: export $(grep -v '^#' .env | xargs) && npx tsx scripts/seed-compliance.ts

import snowflake from "snowflake-sdk";

function getConnection(): Promise<snowflake.Connection> {
  return new Promise((resolve, reject) => {
    const conn = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT!,
      username: process.env.SNOWFLAKE_USER!,
      password: process.env.SNOWFLAKE_PASSWORD!,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE!,
      database: process.env.SNOWFLAKE_DATABASE!,
      schema: process.env.SNOWFLAKE_SCHEMA!,
    });
    conn.connect((err) => {
      if (err) reject(err);
      else resolve(conn);
    });
  });
}

function executeSQL(conn: snowflake.Connection, sql: string, binds: unknown[] = []): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText: sql,
      binds: binds as snowflake.Binds,
      complete: (err, _stmt, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      },
    });
  });
}

const SEED_DATA = [
  // 2024 — Historical
  { agency: "State of Washington", description: "Excise Return", dueDate: "2024-12-31", done: true, year: 2024, recurring: "none", notes: "One-time catchup filing" },
  // 2025 — Historical (mostly complete)
  { agency: "State of Alabama", description: "DOL Filing", dueDate: "2025-01-31", done: true, year: 2025, recurring: "none", notes: "Deferred item — resolved and closed" },
  { agency: "State of Iowa", description: "UI Quarterly Report Update", dueDate: "2025-01-31", done: true, year: 2025, recurring: "none", notes: "Filed Q3 and Q4 reports on 02/19/25 and paid open balance" },
  { agency: "State of Colorado (FAMLI)", description: "Filing Issue, Interest Alleged Owed", dueDate: "2025-02-05", done: true, year: 2025, recurring: "none", notes: "One-time dispute resolution" },
  { agency: "State of Michigan", description: "Annual Report (Voyage Advisory)", dueDate: "2025-02-15", done: true, year: 2025, recurring: "annual", notes: "Filed on 02/07/25 by ACS" },
  { agency: "State of Michigan", description: "Annual Report (Edison Vehicles)", dueDate: "2025-02-15", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Washington DOR", description: "Excise Return — Monthly Filer", dueDate: "2025-02-15", done: true, year: 2025, recurring: "none", notes: "" },
  { agency: "State of Tennessee", description: "Set Up New Online Account", dueDate: "2025-02-17", done: true, year: 2025, recurring: "none", notes: "One-time setup" },
  { agency: "Internal Revenue Service", description: "ACA 1095 Filing", dueDate: "2025-02-28", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "City of Chicago", description: "Business License", dueDate: "2025-03-15", done: true, year: 2025, recurring: "biennial", notes: "Next renewal: March 15, 2027" },
  { agency: "Internal Revenue Service", description: "S-Corp Tax Return", dueDate: "2025-03-15", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Washington DOR", description: "Annual Report", dueDate: "2025-03-15", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Oklahoma", description: "Annual Report", dueDate: "2025-03-29", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Illinois", description: "Annual Report (Voyage Advisory)", dueDate: "2025-03-31", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Wisconsin", description: "Annual Report", dueDate: "2025-03-31", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Iowa", description: "Annual Report", dueDate: "2025-04-01", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of North Carolina", description: "Annual Report", dueDate: "2025-04-01", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Tennessee", description: "Annual Report", dueDate: "2025-04-01", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "Estimated Taxes", description: "Federal, IL ($4,100), MO ($250)", dueDate: "2025-04-15", done: true, year: 2025, recurring: "quarterly", notes: "Federal (personal) TBD, State of Illinois (Voyage) $4,100, State of Missouri (Voyage) $250" },
  { agency: "State of Maryland", description: "Annual Report", dueDate: "2025-04-15", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Florida", description: "Annual Report", dueDate: "2025-05-01", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Rhode Island", description: "Annual Report", dueDate: "2025-05-01", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Delaware", description: "Annual Report (Voyage Advisory)", dueDate: "2025-06-01", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Delaware", description: "Annual Report (Edison Vehicles)", dueDate: "2025-06-01", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Delaware", description: "Annual Report (Voyage Business Services)", dueDate: "2025-06-01", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Maine", description: "Annual Report", dueDate: "2025-06-01", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "Estimated Taxes", description: "Federal, IL ($4,100), MO ($250)", dueDate: "2025-06-16", done: true, year: 2025, recurring: "quarterly", notes: "Federal (personal) TBD, State of Illinois (Voyage) $4,100, State of Missouri (Voyage) $250" },
  { agency: "Internal Revenue Service", description: "PCORI Fees", dueDate: "2025-07-31", done: true, year: 2025, recurring: "none", notes: "Level-funded plan requirement. Total fee $98.37 (avg 28.35 employees × $3.47). Filed Form 720." },
  { agency: "State of Utah", description: "Annual Report", dueDate: "2025-07-31", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "Estimated Taxes", description: "Federal, IL ($4,100), MO ($250)", dueDate: "2025-09-15", done: true, year: 2025, recurring: "quarterly", notes: "Federal (personal) TBD, State of Illinois (Voyage) $4,100, State of Missouri (Voyage) $250" },
  { agency: "State of Illinois", description: "Annual Report (Voyage Equity)", dueDate: "2025-09-30", done: true, year: 2025, recurring: "annual", notes: "Filled out and sent in mail 8/18/2025, paid $75" },
  { agency: "State of California", description: "Annual Report", dueDate: "2025-10-31", done: true, year: 2025, recurring: "biennial", notes: "" },
  { agency: "Canada (Corporations Canada)", description: "Initial Filing (Voyage Advisory Canada Inc.)", dueDate: "2025-11-09", done: true, year: 2025, recurring: "none", notes: "One-time incorporation filing" },
  { agency: "State of North Dakota", description: "Annual Report", dueDate: "2025-11-17", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Washington", description: "Annual Report", dueDate: "2025-11-30", done: true, year: 2025, recurring: "annual", notes: "Due last day of formation month (November)" },
  { agency: "State of Washington", description: "Business License", dueDate: "2025-11-30", done: false, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Colorado", description: "Annual Report", dueDate: "2025-11-30", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "Estimated Taxes", description: "Federal, IL ($4,100), MO ($250)", dueDate: "2025-12-15", done: false, year: 2025, recurring: "quarterly", notes: "Federal (personal) TBD, State of Illinois (Voyage) $4,100, State of Missouri (Voyage) $250" },
  { agency: "Tracker Update", description: "Refresh tracker for 2026", dueDate: "2025-12-31", done: false, year: 2025, recurring: "annual", notes: "" },
  // 2026 — Current year (all open)
  { agency: "State of Michigan", description: "Annual Report (Voyage Advisory)", dueDate: "2026-02-15", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "State of Michigan", description: "Annual Report (Edison Vehicles)", dueDate: "2026-02-15", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "Internal Revenue Service", description: "ACA 1095 Filing", dueDate: "2026-02-28", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "Internal Revenue Service", description: "S-Corp Tax Return", dueDate: "2026-03-15", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "State of New York", description: "Annual Report (even years only)", dueDate: "2026-03-31", done: false, year: 2026, recurring: "biennial", notes: "Only required in even-numbered years" },
  { agency: "State of Wisconsin", description: "Annual Report", dueDate: "2026-03-31", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "State of Oklahoma", description: "Annual Report", dueDate: "2026-04-01", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "Estimated Taxes", description: "Federal, IL, MO — Q1", dueDate: "2026-04-15", done: false, year: 2026, recurring: "quarterly", notes: "Federal (personal), State of Illinois (Voyage), State of Missouri (Voyage)" },
  { agency: "State of Virginia", description: "Annual Report", dueDate: "2026-05-01", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "Estimated Taxes", description: "Federal, IL, MO — Q2", dueDate: "2026-06-15", done: false, year: 2026, recurring: "quarterly", notes: "Federal (personal), State of Illinois (Voyage), State of Missouri (Voyage)" },
  { agency: "SAM.gov", description: "UEI/CAGE Code Renewal", dueDate: "2026-07-08", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "State of Utah", description: "Annual Report", dueDate: "2026-07-15", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "Estimated Taxes", description: "Federal, IL, MO — Q3", dueDate: "2026-09-15", done: false, year: 2026, recurring: "quarterly", notes: "Federal (personal), State of Illinois (Voyage), State of Missouri (Voyage)" },
  { agency: "State of Illinois", description: "Annual Report", dueDate: "2026-09-30", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "State of Washington", description: "Annual Report", dueDate: "2026-11-30", done: false, year: 2026, recurring: "annual", notes: "Due last day of formation month (November)" },
  { agency: "State of Washington", description: "Business License", dueDate: "2026-11-30", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "Estimated Taxes", description: "Federal, IL, MO — Q4", dueDate: "2026-12-15", done: false, year: 2026, recurring: "quarterly", notes: "Federal (personal), State of Illinois (Voyage), State of Missouri (Voyage)" },
  { agency: "Tracker Update", description: "Refresh tracker for 2027", dueDate: "2026-12-31", done: false, year: 2026, recurring: "annual", notes: "" },
  // 2027 — Future
  { agency: "Canada (Corporations Canada)", description: "Annual Return (Voyage Advisory Canada Inc.)", dueDate: "2027-01-08", done: false, year: 2027, recurring: "annual", notes: "Due within 60 days of Nov 9 anniversary date" },
  { agency: "City of Chicago", description: "Business License (biennial)", dueDate: "2027-03-15", done: false, year: 2027, recurring: "biennial", notes: "" },
  { agency: "State of California", description: "Annual Report", dueDate: "2027-10-31", done: false, year: 2027, recurring: "biennial", notes: "" },
];

async function main() {
  console.log("Connecting to Snowflake...");
  const conn = await getConnection();

  // Create table
  console.log("Creating COMPLIANCE_ITEMS table if not exists...");
  await executeSQL(conn, `
    CREATE TABLE IF NOT EXISTS COMPLIANCE_ITEMS (
      ID NUMBER AUTOINCREMENT PRIMARY KEY,
      AGENCY VARCHAR(300) NOT NULL,
      DESCRIPTION VARCHAR(500) NOT NULL,
      DUE_DATE DATE NOT NULL,
      DONE BOOLEAN DEFAULT FALSE,
      YEAR NUMBER NOT NULL,
      NOTES TEXT,
      RECURRING VARCHAR(20) DEFAULT 'annual',
      PARENT_ID NUMBER,
      COMPLETED_AT TIMESTAMP,
      CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
      UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
    )
  `);

  // Check existing count
  const countResult = await executeSQL(conn, "SELECT COUNT(*) as CNT FROM COMPLIANCE_ITEMS") as { CNT: number }[];
  const existingCount = countResult[0]?.CNT || 0;

  if (existingCount > 0) {
    console.log(`Table already has ${existingCount} records. Skipping seed.`);
    conn.destroy(() => {});
    return;
  }

  // Insert seed data
  console.log(`Inserting ${SEED_DATA.length} seed records...`);
  for (const item of SEED_DATA) {
    await executeSQL(
      conn,
      `INSERT INTO COMPLIANCE_ITEMS (AGENCY, DESCRIPTION, DUE_DATE, DONE, YEAR, NOTES, RECURRING, CREATED_AT, UPDATED_AT)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
      [item.agency, item.description, item.dueDate, item.done, item.year, item.notes || null, item.recurring]
    );
  }

  // Set COMPLETED_AT for done items
  await executeSQL(
    conn,
    `UPDATE COMPLIANCE_ITEMS SET COMPLETED_AT = CURRENT_TIMESTAMP() WHERE DONE = TRUE AND COMPLETED_AT IS NULL`
  );

  console.log(`Seeded ${SEED_DATA.length} compliance items.`);
  conn.destroy(() => {});
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
