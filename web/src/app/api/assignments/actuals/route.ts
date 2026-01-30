import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

const BIGTIME_API_KEY = process.env.BIGTIME_API_KEY;
const BIGTIME_FIRM_ID = process.env.BIGTIME_FIRM_ID;
const BIGTIME_REPORT_ID = "284796";

interface StaffBillRate {
  STAFF_NAME: string;
  BILL_RATE: number;
}

interface ActualEntry {
  staffName: string;
  month: string;
  hours: number;
}

// Fetch bill rates from Snowflake assignments for a project
async function fetchBillRatesFromSnowflake(projectId: string): Promise<Map<string, number>> {
  try {
    const sql = `
      SELECT STAFF_NAME, AVG(BILL_RATE) as BILL_RATE
      FROM VC_STAFF_ASSIGNMENTS
      WHERE PROJECT_ID = ? AND BILL_RATE > 0
      GROUP BY STAFF_NAME
    `;
    const rows = await query<StaffBillRate>(sql, [projectId]);
    const rateMap = new Map<string, number>();
    for (const row of rows) {
      rateMap.set(row.STAFF_NAME, Math.round(row.BILL_RATE));
    }
    return rateMap;
  } catch (error) {
    console.error("Error fetching bill rates from Snowflake:", error);
    return new Map();
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  // Normalize project ID for comparison (as number)
  const targetProjectId = Number(projectId);

  if (!BIGTIME_API_KEY || !BIGTIME_FIRM_ID) {
    return NextResponse.json({ error: "BigTime API not configured" }, { status: 500 });
  }

  try {
    // Fetch BigTime data for multiple years to get historical actuals
    const currentYear = new Date().getFullYear();
    const yearsToFetch = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

    const allEntries: ActualEntry[] = [];

    for (const year of yearsToFetch) {
      const response = await fetch(
        `https://iq.bigtime.net/BigtimeData/api/v2/report/data/${BIGTIME_REPORT_ID}`,
        {
          method: "POST",
          headers: {
            "X-Auth-ApiToken": BIGTIME_API_KEY,
            "X-Auth-Realm": BIGTIME_FIRM_ID,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            DT_BEGIN: `${year}-01-01`,
            DT_END: `${year}-12-31`,
          }),
        }
      );

      if (!response.ok) {
        console.error(`BigTime API error for year ${year}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const rows = data.Data || [];
      const fields = data.FieldList || [];

      // Build column index map
      const colIndex: Record<string, number> = {};
      fields.forEach((field: { FieldNm: string }, idx: number) => {
        colIndex[field.FieldNm] = idx;
      });

      // Log available columns for debugging (first year only)
      if (year === currentYear) {
        console.log(`BigTime actuals columns:`, Object.keys(colIndex).join(", "));
      }

      // Try multiple column names (different reports may use different names)
      const projectIdIdx = colIndex["tmprojectnm_id"] ?? colIndex["tmprojectsid"] ?? colIndex["Project_ID"];
      const staffNameIdx = colIndex["tmstaffnm"] ?? colIndex["exstaffnm"] ?? colIndex["Staff_Name"] ?? colIndex["Staff Member"];
      const hoursIdx = colIndex["tmhrsin"] ?? colIndex["Hours"];
      const dateIdx = colIndex["tmdt"] ?? colIndex["Date"];

      if (projectIdIdx === undefined) {
        console.error("Missing project ID column. Available:", Object.keys(colIndex).join(", "));
        continue;
      }
      if (staffNameIdx === undefined) {
        console.error("Missing staff name column. Available:", Object.keys(colIndex).join(", "));
        continue;
      }
      if (hoursIdx === undefined || dateIdx === undefined) {
        console.error("Missing hours or date column. Available:", Object.keys(colIndex).join(", "));
        continue;
      }

      // Filter and aggregate by project
      let matchCount = 0;
      for (const row of rows) {
        const rowProjectId = Number(row[projectIdIdx]) || 0;
        if (rowProjectId !== targetProjectId) continue;

        matchCount++;
        const staffName = String(row[staffNameIdx] || "Unknown");
        const hours = Number(row[hoursIdx]) || 0;
        const dateStr = String(row[dateIdx] || "");

        if (hours === 0 || !dateStr) continue;

        // Extract month from date (format: YYYY-MM)
        const month = dateStr.substring(0, 7);

        allEntries.push({
          staffName,
          month,
          hours,
        });
      }

      if (year === currentYear) {
        console.log(`BigTime actuals for project ${targetProjectId}: found ${matchCount} rows in ${year}`);
      }
    }

    // Get bill rates from Snowflake
    const billRates = await fetchBillRatesFromSnowflake(projectId);

    // Aggregate hours by staff and month
    const aggregated: Map<string, Map<string, number>> = new Map();

    for (const entry of allEntries) {
      if (!aggregated.has(entry.staffName)) {
        aggregated.set(entry.staffName, new Map());
      }
      const staffMonths = aggregated.get(entry.staffName)!;
      staffMonths.set(entry.month, (staffMonths.get(entry.month) || 0) + entry.hours);
    }

    // Convert to array format
    const result: { staffName: string; billRate: number; months: Record<string, number> }[] = [];

    for (const [staffName, monthsMap] of aggregated) {
      const months: Record<string, number> = {};
      for (const [month, hours] of monthsMap) {
        months[month] = Math.round(hours * 10) / 10; // Round to 1 decimal
      }
      // Get bill rate from Snowflake assignments
      const billRate = billRates.get(staffName) || 0;
      result.push({ staffName, billRate, months });
    }

    // Sort by staff name
    result.sort((a, b) => a.staffName.localeCompare(b.staffName));

    // Get unique months across all staff
    const allMonths = new Set<string>();
    for (const staff of result) {
      for (const month of Object.keys(staff.months)) {
        allMonths.add(month);
      }
    }
    const sortedMonths = Array.from(allMonths).sort();

    return NextResponse.json({
      projectId,
      staffActuals: result,
      months: sortedMonths,
    });
  } catch (error) {
    console.error("Error fetching actuals:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
