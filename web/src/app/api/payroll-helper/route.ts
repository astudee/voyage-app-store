import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

interface StaffMember {
  STAFF_NAME: string;
  STAFF_TYPE: string;
}

interface TimeEntry {
  staffName: string;
  date: string;
  hours: number;
  projectId: number | null;
  projectName: string;
}

interface HourlyEmployee {
  name: string;
  type: string;
  regular: number;
  paidLeave: number;
  sickLeave: number;
  holiday: number;
  unpaidLeave: number;
}

interface FullTimeEmployee {
  name: string;
  type: string;
  paidLeave: number;
  sickLeave: number;
  holiday: number;
  unpaidLeave: number;
}

interface UnderreportedDay {
  employee: string;
  date: string;
  day: string;
  issue: string;
}

interface PolicyViolation {
  employee: string;
  policy: string;
  issue: string;
  severity: string;
}

// BigTime project IDs for leave categories
const PROJECT_IDS = {
  PAID_LEAVE: 9516373,
  SICK_LEAVE: 9516376,
  UNPAID_LEAVE: 9516379,
  HOLIDAY: 9741132,
};

async function fetchBigTimeTimeReport(year: number): Promise<TimeEntry[]> {
  const apiKey = process.env.BIGTIME_API_KEY;
  const firmId = process.env.BIGTIME_FIRM_ID;

  if (!apiKey || !firmId) {
    throw new Error("BigTime credentials not configured");
  }

  // Use report 284796 for time data
  const response = await fetch(
    "https://iq.bigtime.net/BigtimeData/api/v2/report/data/284796",
    {
      method: "POST",
      headers: {
        "X-Auth-ApiToken": apiKey,
        "X-Auth-Realm": firmId,
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
    throw new Error(`BigTime time API error: ${response.status}`);
  }

  const data = await response.json();
  const rows = data.Data || [];
  const fields = data.FieldList || [];

  const colIndex: Record<string, number> = {};
  fields.forEach((field: { FieldNm: string }, idx: number) => {
    colIndex[field.FieldNm] = idx;
  });

  const entries: TimeEntry[] = rows.map((row: unknown[]) => ({
    staffName: (row[colIndex["tmstaffnm"]] as string) || "",
    date: (row[colIndex["tmdt"]] as string) || "",
    hours: Number(row[colIndex["tmhrsin"]] || row[colIndex["tmhrsbill"]]) || 0,
    projectId: Number(row[colIndex["tmprojectsid"]]) || null,
    projectName: (row[colIndex["tmprojectnm"]] as string) || "",
  }));

  return entries.filter((e) => e.hours !== 0);
}

function formatNameLastFirst(name: string): string {
  if (!name) return name;
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    return `${last}, ${first}`;
  }
  return name;
}

function getDayName(dateStr: string): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const date = new Date(dateStr + "T00:00:00");
  return days[date.getDay()];
}

function categorizeEntry(entry: TimeEntry): string {
  if (entry.projectId === PROJECT_IDS.PAID_LEAVE) return "paidLeave";
  if (entry.projectId === PROJECT_IDS.SICK_LEAVE) return "sickLeave";
  if (entry.projectId === PROJECT_IDS.UNPAID_LEAVE) return "unpaidLeave";
  if (entry.projectId === PROJECT_IDS.HOLIDAY) return "holiday";

  // Fallback to project name matching
  const pn = entry.projectName.toLowerCase();
  if (pn.includes("paid leave")) return "paidLeave";
  if (pn.includes("sick leave")) return "sickLeave";
  if (pn.includes("unpaid leave")) return "unpaidLeave";
  if (pn.includes("holiday")) return "holiday";

  return "regular";
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");

    // Fetch staff list
    const staffRows = await query<StaffMember>(`
      SELECT STAFF_NAME, STAFF_TYPE
      FROM VC_STAFF
      WHERE IS_ACTIVE = TRUE
      ORDER BY STAFF_NAME
    `);

    // Build staff map
    const staffMap = new Map<string, string>();
    for (const s of staffRows) {
      staffMap.set(s.STAFF_NAME, s.STAFF_TYPE || "FT");
    }

    // Fetch BigTime data - handle year boundary
    let timeEntries: TimeEntry[] = [];
    if (start.getFullYear() !== end.getFullYear()) {
      const [year1Data, year2Data] = await Promise.all([
        fetchBigTimeTimeReport(start.getFullYear()),
        fetchBigTimeTimeReport(end.getFullYear()),
      ]);
      timeEntries = [...year1Data, ...year2Data];
    } else {
      timeEntries = await fetchBigTimeTimeReport(start.getFullYear());
    }

    // Filter to payroll period
    const periodEntries = timeEntries.filter((e) => {
      const d = new Date(e.date + "T00:00:00");
      return d >= start && d <= end;
    });

    // Filter YTD entries (for policy checks)
    const yearStart = new Date(end.getFullYear(), 0, 1);
    const ytdEntries = timeEntries.filter((e) => {
      const d = new Date(e.date + "T00:00:00");
      return d >= yearStart && d <= end;
    });

    // Aggregate by staff and category for period
    const staffHours = new Map<string, Record<string, number>>();

    for (const entry of periodEntries) {
      const staff = entry.staffName;
      const category = categorizeEntry(entry);

      if (!staffHours.has(staff)) {
        staffHours.set(staff, { regular: 0, paidLeave: 0, sickLeave: 0, holiday: 0, unpaidLeave: 0 });
      }

      const hours = staffHours.get(staff)!;
      hours[category] = (hours[category] || 0) + entry.hours;
    }

    // Separate hourly vs full-time employees
    const hourlyTypes = ["Hourly", "TFT", "PTE"];
    const hourlyEmployees: HourlyEmployee[] = [];
    const fullTimeEmployees: FullTimeEmployee[] = [];

    for (const [staffName, empType] of staffMap) {
      const hours = staffHours.get(staffName) || { regular: 0, paidLeave: 0, sickLeave: 0, holiday: 0, unpaidLeave: 0 };

      if (hourlyTypes.includes(empType)) {
        hourlyEmployees.push({
          name: formatNameLastFirst(staffName),
          type: empType,
          regular: Math.round(hours.regular * 100) / 100,
          paidLeave: Math.round(hours.paidLeave * 100) / 100,
          sickLeave: Math.round(hours.sickLeave * 100) / 100,
          holiday: Math.round(hours.holiday * 100) / 100,
          unpaidLeave: Math.round(hours.unpaidLeave * 100) / 100,
        });
      } else if (empType !== "International") {
        // Full-time - only show if they have leave hours
        const totalLeave = hours.paidLeave + hours.sickLeave + hours.holiday + hours.unpaidLeave;
        if (totalLeave > 0) {
          fullTimeEmployees.push({
            name: formatNameLastFirst(staffName),
            type: empType,
            paidLeave: Math.round(hours.paidLeave * 100) / 100,
            sickLeave: Math.round(hours.sickLeave * 100) / 100,
            holiday: Math.round(hours.holiday * 100) / 100,
            unpaidLeave: Math.round(hours.unpaidLeave * 100) / 100,
          });
        }
      }
    }

    // Sort by name
    hourlyEmployees.sort((a, b) => a.name.localeCompare(b.name));
    fullTimeEmployees.sort((a, b) => a.name.localeCompare(b.name));

    // Check for underreported hours
    const underreported: UnderreportedDay[] = [];
    const currentDate = new Date(start);

    while (currentDate <= end) {
      if (currentDate.getDay() >= 1 && currentDate.getDay() <= 5) {
        // Weekday
        const dateStr = currentDate.toISOString().split("T")[0];

        for (const [staffName, empType] of staffMap) {
          if (empType === "International") continue;

          const dayHours = periodEntries
            .filter((e) => e.staffName === staffName && e.date === dateStr)
            .reduce((sum, e) => sum + e.hours, 0);

          if (dayHours === 0) {
            underreported.push({
              employee: formatNameLastFirst(staffName),
              date: dateStr,
              day: getDayName(dateStr),
              issue: "No hours entered",
            });
          }
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sort underreported
    underreported.sort((a, b) => {
      if (a.employee !== b.employee) return a.employee.localeCompare(b.employee);
      return a.date.localeCompare(b.date);
    });

    // Policy violation checks
    const violations: PolicyViolation[] = [];

    // Aggregate YTD data by staff
    const ytdHoursMap = new Map<string, { holiday: Record<string, number>; sickTotal: number }>();

    for (const entry of ytdEntries) {
      const staff = entry.staffName;
      const category = categorizeEntry(entry);

      if (!ytdHoursMap.has(staff)) {
        ytdHoursMap.set(staff, { holiday: {}, sickTotal: 0 });
      }

      const data = ytdHoursMap.get(staff)!;

      if (category === "holiday") {
        const month = entry.date.slice(0, 7);
        data.holiday[month] = (data.holiday[month] || 0) + entry.hours;
      } else if (category === "sickLeave") {
        data.sickTotal += entry.hours;
      }
    }

    // Check violations
    for (const [staff, data] of ytdHoursMap) {
      // Check 1: Holiday hours by month (max 16 per month)
      for (const [month, hours] of Object.entries(data.holiday)) {
        if (hours > 16) {
          violations.push({
            employee: formatNameLastFirst(staff),
            policy: "Holiday Hours (Monthly)",
            issue: `${hours.toFixed(1)} hours in ${month} (max 16/month)`,
            severity: "warning",
          });
        }
      }

      // Check 2: Holiday hours YTD (max 72 per year = 9 holidays)
      const holidayYtd = Object.values(data.holiday).reduce((sum, h) => sum + h, 0);
      if (holidayYtd > 72) {
        violations.push({
          employee: formatNameLastFirst(staff),
          policy: "Holiday Hours (Annual)",
          issue: `${holidayYtd.toFixed(1)} hours YTD (max 72/year)`,
          severity: "warning",
        });
      }

      // Check 3: Sick leave YTD (max 40 per year)
      if (data.sickTotal > 40) {
        violations.push({
          employee: formatNameLastFirst(staff),
          policy: "Sick Leave",
          issue: `${data.sickTotal.toFixed(1)} hours YTD (max 40/year)`,
          severity: "warning",
        });
      }
    }

    return NextResponse.json({
      hourlyEmployees,
      fullTimeEmployees,
      underreported,
      violations,
      summary: {
        hourlyCount: hourlyEmployees.length,
        fullTimeCount: fullTimeEmployees.length,
        underreportedCount: underreported.length,
        violationCount: violations.length,
      },
      period: {
        start: startDate,
        end: endDate,
      },
    });
  } catch (error) {
    console.error("Payroll helper error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
