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
  { agency: "State of Iowa", description: "Biennial Report", dueDate: "2025-04-01", done: true, year: 2025, recurring: "biennial", notes: "$30 online / $45 mail. LLCs file in odd-numbered years only." },
  { agency: "State of North Carolina", description: "Annual Report", dueDate: "2025-04-01", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Tennessee", description: "Annual Report", dueDate: "2025-04-01", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "Estimated Taxes", description: "Federal, IL ($4,100), MO ($250)", dueDate: "2025-04-15", done: true, year: 2025, recurring: "annual", notes: "Federal (personal) TBD, State of Illinois (Voyage) $4,100, State of Missouri (Voyage) $250. Each payment date schedules its own successor one year out." },
  { agency: "State of Maryland", description: "Annual Report", dueDate: "2025-04-15", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Florida", description: "Annual Report", dueDate: "2025-05-01", done: true, year: 2025, recurring: "annual", notes: "$138.75 LLC fee." },
  { agency: "State of Rhode Island", description: "Annual Report", dueDate: "2025-05-01", done: true, year: 2025, recurring: "annual", notes: "$50 fee." },
  { agency: "State of Delaware", description: "Franchise Tax — Voyage Advisory LLC", dueDate: "2025-06-01", done: true, year: 2025, recurring: "annual", notes: "$300 annual franchise tax." },
  { agency: "State of Delaware", description: "Franchise Tax — Voyage Business Services LLC", dueDate: "2025-06-01", done: true, year: 2025, recurring: "annual", notes: "$300 annual franchise tax." },
  { agency: "State of Delaware", description: "Franchise Tax — Edison Vehicles LLC", dueDate: "2025-06-01", done: true, year: 2025, recurring: "annual", notes: "$300 annual franchise tax." },
  { agency: "State of Maine", description: "Annual Report", dueDate: "2025-06-01", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "Estimated Taxes", description: "Federal, IL ($4,100), MO ($250)", dueDate: "2025-06-16", done: true, year: 2025, recurring: "annual", notes: "Federal (personal) TBD, State of Illinois (Voyage) $4,100, State of Missouri (Voyage) $250. Each payment date schedules its own successor one year out." },
  { agency: "Internal Revenue Service", description: "PCORI Fees", dueDate: "2025-07-31", done: true, year: 2025, recurring: "none", notes: "Level-funded plan requirement. Total fee $98.37 (avg 28.35 employees × $3.47). Filed Form 720." },
  { agency: "State of Utah", description: "Annual Report", dueDate: "2025-07-31", done: true, year: 2025, recurring: "annual", notes: "" },
  { agency: "State of Oregon", description: "Annual Report", dueDate: "2025-08-06", done: true, year: 2025, recurring: "annual", notes: "$275 foreign LLC fee. Original registration 08/06/2021." },
  { agency: "Estimated Taxes", description: "Federal, IL ($4,100), MO ($250)", dueDate: "2025-09-15", done: true, year: 2025, recurring: "annual", notes: "Federal (personal) TBD, State of Illinois (Voyage) $4,100, State of Missouri (Voyage) $250. Each payment date schedules its own successor one year out." },
  { agency: "State of Colorado", description: "Periodic Report", dueDate: "2025-09-30", done: true, year: 2025, recurring: "annual", notes: "$25 fee. Formation date 09/07/2019. Anniversary month: September." },
  { agency: "State of Illinois", description: "Annual Report (Voyage Equity)", dueDate: "2025-09-30", done: true, year: 2025, recurring: "annual", notes: "Filled out and sent in mail 8/18/2025, paid $75" },
  { agency: "State of California", description: "Statement of Information (biennial)", dueDate: "2025-10-31", done: true, year: 2025, recurring: "biennial", notes: "$20 fee." },
  { agency: "Canada (Corporations Canada)", description: "Initial Filing (Voyage Advisory Canada Inc.)", dueDate: "2025-11-09", done: true, year: 2025, recurring: "none", notes: "One-time incorporation filing" },
  { agency: "State of North Dakota", description: "Annual Report", dueDate: "2025-11-15", done: true, year: 2025, recurring: "annual", notes: "$50 fee. Due Nov 15 each year." },
  { agency: "State of Washington", description: "Annual Report", dueDate: "2025-11-30", done: true, year: 2025, recurring: "annual", notes: "Due last day of formation month (November)" },
  { agency: "State of Washington", description: "Business License", dueDate: "2025-11-30", done: false, year: 2025, recurring: "annual", notes: "" },
  { agency: "Estimated Taxes", description: "Federal, IL ($4,100), MO ($250)", dueDate: "2025-12-15", done: false, year: 2025, recurring: "annual", notes: "Federal (personal) TBD, State of Illinois (Voyage) $4,100, State of Missouri (Voyage) $250. Each payment date schedules its own successor one year out." },
  { agency: "Tracker Update", description: "Refresh tracker for 2026", dueDate: "2025-12-31", done: false, year: 2025, recurring: "annual", notes: "" },
  // 2026 — Current year (all open)
  { agency: "State of Michigan", description: "Annual Report (Voyage Advisory)", dueDate: "2026-02-15", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "State of Michigan", description: "Annual Report (Edison Vehicles)", dueDate: "2026-02-15", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "Internal Revenue Service", description: "ACA 1095 Filing", dueDate: "2026-02-28", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "Internal Revenue Service", description: "S-Corp Tax Return", dueDate: "2026-03-15", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "State of New York", description: "Annual Report (even years only)", dueDate: "2026-03-31", done: false, year: 2026, recurring: "biennial", notes: "Only required in even-numbered years" },
  { agency: "State of Wisconsin", description: "Annual Report", dueDate: "2026-03-31", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "State of Oklahoma", description: "Annual Report", dueDate: "2026-04-01", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "State of North Carolina", description: "Annual Report", dueDate: "2026-04-15", done: false, year: 2026, recurring: "annual", notes: "Due April 15 each year." },
  { agency: "Estimated Taxes", description: "Federal, IL, MO — Q1", dueDate: "2026-04-15", done: false, year: 2026, recurring: "annual", notes: "Federal (personal), State of Illinois (Voyage), State of Missouri (Voyage). Each payment date schedules its own successor one year out." },
  { agency: "State of Florida", description: "Annual Report", dueDate: "2026-05-01", done: false, year: 2026, recurring: "annual", notes: "$138.75 LLC fee. Filing window Jan 1 – May 1. $400 non-waivable late penalty. File on Sunbiz.org." },
  { agency: "State of Rhode Island", description: "Annual Report", dueDate: "2026-05-01", done: false, year: 2026, recurring: "annual", notes: "$50 fee. Filing window Feb 1 – May 1. $25 late fee after May 1." },
  { agency: "State of Virginia", description: "Annual Report", dueDate: "2026-05-01", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "State of Delaware", description: "Franchise Tax — Voyage Advisory LLC", dueDate: "2026-06-01", done: false, year: 2026, recurring: "annual", notes: "$300 due. $200 penalty + 1.5%/mo interest if late." },
  { agency: "State of Delaware", description: "Franchise Tax — Voyage Business Services LLC", dueDate: "2026-06-01", done: false, year: 2026, recurring: "annual", notes: "$300 due." },
  { agency: "State of Delaware", description: "Franchise Tax — Edison Vehicles LLC", dueDate: "2026-06-01", done: false, year: 2026, recurring: "annual", notes: "$300 due." },
  { agency: "Estimated Taxes", description: "Federal, IL, MO — Q2", dueDate: "2026-06-15", done: false, year: 2026, recurring: "annual", notes: "Federal (personal), State of Illinois (Voyage), State of Missouri (Voyage). Each payment date schedules its own successor one year out." },
  { agency: "State of Pennsylvania", description: "Annual Report (or cancel registration)", dueDate: "2026-06-30", done: false, year: 2026, recurring: "annual", notes: "$7 fee. DECISION: file report or withdraw from PA." },
  { agency: "SAM.gov", description: "UEI/CAGE Code Renewal", dueDate: "2026-07-08", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "State of Utah", description: "Annual Report", dueDate: "2026-07-15", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "State of Oregon", description: "Annual Report", dueDate: "2026-08-06", done: false, year: 2026, recurring: "annual", notes: "$275 foreign LLC fee. Re-registration pending — update anniversary date once processed." },
  { agency: "Estimated Taxes", description: "Federal, IL, MO — Q3", dueDate: "2026-09-15", done: false, year: 2026, recurring: "annual", notes: "Federal (personal), State of Illinois (Voyage), State of Missouri (Voyage). Each payment date schedules its own successor one year out." },
  { agency: "State of Colorado", description: "Periodic Report", dueDate: "2026-09-30", done: false, year: 2026, recurring: "annual", notes: "$25 fee. Formation date 09/07/2019. Anniversary month: September. Filing window Jul–Nov. File online only via CO SOS." },
  { agency: "State of Illinois", description: "Annual Report", dueDate: "2026-09-30", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "State of Illinois", description: "Annual Report (Voyage Equity)", dueDate: "2026-09-30", done: false, year: 2026, recurring: "annual", notes: "Voyage Equity LLC, organized 10/24/2022. $75 fee. Filed by mail in 2025." },
  { agency: "State of North Dakota", description: "Annual Report", dueDate: "2026-11-15", done: false, year: 2026, recurring: "annual", notes: "$50 fee. Due Nov 15 each year. $50 late penalty (doubles to $100 total). File via FirstStop portal." },
  { agency: "State of Washington", description: "Annual Report", dueDate: "2026-11-30", done: false, year: 2026, recurring: "annual", notes: "Due last day of formation month (November)" },
  { agency: "State of Washington", description: "Business License", dueDate: "2026-11-30", done: false, year: 2026, recurring: "annual", notes: "" },
  { agency: "Northwest Registered Agent", description: "Annual subscription review", dueDate: "2026-11-30", done: false, year: 2026, recurring: "annual", notes: "Review all NW state registrations. Decide which to keep, add, or cancel (e.g. AZ, SC if no longer needed). NW bulk invoice typically renews in Sep/Dec." },
  { agency: "Estimated Taxes", description: "Federal, IL, MO — Q4", dueDate: "2026-12-15", done: false, year: 2026, recurring: "annual", notes: "Federal (personal), State of Illinois (Voyage), State of Missouri (Voyage). Each payment date schedules its own successor one year out." },
  { agency: "Tracker Update", description: "Refresh tracker for 2027", dueDate: "2026-12-31", done: false, year: 2026, recurring: "annual", notes: "" },
  // 2027 — Future
  { agency: "Canada (Corporations Canada)", description: "Annual Return (Voyage Advisory Canada Inc.)", dueDate: "2027-01-08", done: false, year: 2027, recurring: "annual", notes: "Due within 60 days of Nov 9 anniversary date" },
  { agency: "City of Chicago", description: "Business License (biennial)", dueDate: "2027-03-15", done: false, year: 2027, recurring: "biennial", notes: "" },
  { agency: "State of Iowa", description: "Biennial Report", dueDate: "2027-04-01", done: false, year: 2027, recurring: "biennial", notes: "$30 online / $45 mail. LLCs file in odd-numbered years only. Filing window Jan 1 – Apr 1." },
  { agency: "State of California", description: "Statement of Information (biennial)", dueDate: "2027-10-31", done: false, year: 2027, recurring: "biennial", notes: "$20 fee. Biennial filing." },
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
