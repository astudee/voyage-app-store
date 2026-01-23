import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

interface StaffMember {
  STAFF_NAME: string;
  IS_ACTIVE: boolean;
}

interface TimeEntry {
  staffName: string;
  date: string;
  billableHours: number;
  billableAmount: number;
  client: string;
  project: string;
}

interface MonthlyData {
  period: string; // "2026-01"
  displayName: string; // "Jan-26"
  hours: number;
  revenue: number;
  capacity: number;
}

interface StaffReport {
  staffName: string;
  classification: "Active Employee" | "Contractor" | "Inactive";
  months: MonthlyData[];
  totalHours: number;
  totalRevenue: number;
}

// Federal holidays by year
const FEDERAL_HOLIDAYS: Record<number, string[]> = {
  2024: [
    "2024-01-01", "2024-01-15", "2024-02-19", "2024-05-27", "2024-06-19",
    "2024-07-04", "2024-09-02", "2024-10-14", "2024-11-11", "2024-11-28", "2024-12-25"
  ],
  2025: [
    "2025-01-01", "2025-01-20", "2025-02-17", "2025-05-26", "2025-06-19",
    "2025-07-04", "2025-09-01", "2025-10-13", "2025-11-11", "2025-11-27", "2025-12-25"
  ],
  2026: [
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19",
    "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"
  ],
  2027: [
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-05-31", "2027-06-18",
    "2027-07-05", "2027-09-06", "2027-10-11", "2027-11-11", "2027-11-25", "2027-12-24"
  ],
};

function calculateMonthlyCapacity(year: number, month: number): number {
  const holidays = FEDERAL_HOLIDAYS[year] || [];
  const daysInMonth = new Date(year, month, 0).getDate();

  let weekdays = 0;
  let holidaysInMonth = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();

    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
      weekdays++;
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (holidays.includes(dateStr)) {
        holidaysInMonth++;
      }
    }
  }

  return (weekdays - holidaysInMonth) * 8;
}

function getMonthsBetween(startYear: number, startMonth: number, endYear: number, endMonth: number): { year: number; month: number; period: string; displayName: string }[] {
  const months: { year: number; month: number; period: string; displayName: string }[] = [];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push({
      year,
      month,
      period: `${year}-${String(month).padStart(2, "0")}`,
      displayName: `${monthNames[month - 1]}-${String(year).slice(-2)}`,
    });

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return months;
}

async function fetchBigTimeReport(startDate: string, endDate: string): Promise<TimeEntry[]> {
  const apiKey = process.env.BIGTIME_API_KEY;
  const firmId = process.env.BIGTIME_FIRM_ID;

  if (!apiKey || !firmId) {
    throw new Error("BigTime credentials not configured");
  }

  const response = await fetch(
    "https://iq.bigtime.net/BigtimeData/api/v2/report/data/284796",
    {
      method: "POST",
      headers: {
        "X-Auth-ApiToken": apiKey,
        "X-Auth-Realm": firmId,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        DT_BEGIN: startDate,
        DT_END: endDate,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`BigTime API error: ${response.status}`);
  }

  const data = await response.json();
  const rows = data.Data || [];
  const fields = data.FieldList || [];

  // Build column index map
  const colIndex: Record<string, number> = {};
  fields.forEach((field: { FieldNm: string }, idx: number) => {
    colIndex[field.FieldNm] = idx;
  });

  // Map rows to TimeEntry objects
  const entries: TimeEntry[] = rows.map((row: unknown[]) => ({
    staffName: row[colIndex["tmstaffnm"]] as string || "",
    date: row[colIndex["tmdt"]] as string || "",
    billableHours: Number(row[colIndex["tmhrsbill"]]) || 0,
    billableAmount: Number(row[colIndex["tmchgbillbase"]]) || 0,
    client: row[colIndex["tmclientnm"]] as string || "",
    project: row[colIndex["tmprojectnm"]] as string || "",
  }));

  return entries.filter((e) => e.billableHours > 0 || e.billableAmount > 0);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const startYear = parseInt(searchParams.get("startYear") || "2026");
    const startMonth = parseInt(searchParams.get("startMonth") || "1");
    const endYear = parseInt(searchParams.get("endYear") || "2026");
    const endMonth = parseInt(searchParams.get("endMonth") || "12");

    // Calculate date range
    const startDate = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(endYear, endMonth, 0).getDate();
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-${lastDay}`;

    // Get months for the report
    const months = getMonthsBetween(startYear, startMonth, endYear, endMonth);

    // Fetch data in parallel - get ALL staff (active and inactive) for proper classification
    const [staffRows, timeEntries] = await Promise.all([
      query<StaffMember>("SELECT STAFF_NAME, IS_ACTIVE FROM VC_STAFF"),
      fetchBigTimeReport(startDate, endDate),
    ]);

    // Build employee sets - all employees (current and former) and active only
    const allEmployees = new Set(staffRows.map((s) => s.STAFF_NAME));
    const activeEmployees = new Set(staffRows.filter((s) => s.IS_ACTIVE).map((s) => s.STAFF_NAME));

    // Group time entries by staff and month
    const staffData = new Map<string, Map<string, { hours: number; revenue: number }>>();

    for (const entry of timeEntries) {
      if (!staffData.has(entry.staffName)) {
        staffData.set(entry.staffName, new Map());
      }

      const staffMonths = staffData.get(entry.staffName)!;
      const entryDate = new Date(entry.date);
      const period = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, "0")}`;

      if (!staffMonths.has(period)) {
        staffMonths.set(period, { hours: 0, revenue: 0 });
      }

      const monthData = staffMonths.get(period)!;
      monthData.hours += entry.billableHours;
      monthData.revenue += entry.billableAmount;
    }

    // Calculate capacity for each month
    const capacityByMonth = new Map<string, number>();
    for (const m of months) {
      capacityByMonth.set(m.period, calculateMonthlyCapacity(m.year, m.month));
    }

    // Classify staff and build report
    const lastTwoMonths = months.slice(-2).map((m) => m.period);

    const staffReports: StaffReport[] = [];

    for (const [staffName, monthsData] of staffData) {
      // Classify based on employee status and recent activity
      let classification: "Active Employee" | "Contractor" | "Inactive";

      // Check if has hours in last 2 months
      const hasRecentHours = lastTwoMonths.some((period) => {
        const data = monthsData.get(period);
        return data && data.hours > 0;
      });

      if (activeEmployees.has(staffName)) {
        // Current active employee
        classification = "Active Employee";
      } else if (allEmployees.has(staffName)) {
        // Former/terminated employee - always show as Inactive
        classification = "Inactive";
      } else {
        // Not in staff table at all - true contractor or inactive contractor
        classification = hasRecentHours ? "Contractor" : "Inactive";
      }

      // Build monthly data
      const monthlyData: MonthlyData[] = months.map((m) => {
        const data = monthsData.get(m.period) || { hours: 0, revenue: 0 };
        return {
          period: m.period,
          displayName: m.displayName,
          hours: Math.round(data.hours * 10) / 10,
          revenue: Math.round(data.revenue * 100) / 100,
          capacity: capacityByMonth.get(m.period) || 0,
        };
      });

      const totalHours = monthlyData.reduce((sum, m) => sum + m.hours, 0);
      const totalRevenue = monthlyData.reduce((sum, m) => sum + m.revenue, 0);

      if (totalHours > 0 || totalRevenue > 0) {
        staffReports.push({
          staffName,
          classification,
          months: monthlyData,
          totalHours: Math.round(totalHours * 10) / 10,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
        });
      }
    }

    // Sort by name
    staffReports.sort((a, b) => a.staffName.localeCompare(b.staffName));

    // Calculate capacity reference rows
    const capacityReference = {
      monthlyCapacity: months.map((m) => ({
        period: m.period,
        displayName: m.displayName,
        capacity: capacityByMonth.get(m.period) || 0,
      })),
      capacity1840: 153.33,
      totalCapacity: months.reduce((sum, m) => sum + (capacityByMonth.get(m.period) || 0), 0),
    };

    // Group by classification
    const byClassification = {
      activeEmployees: staffReports.filter((s) => s.classification === "Active Employee"),
      contractors: staffReports.filter((s) => s.classification === "Contractor"),
      inactive: staffReports.filter((s) => s.classification === "Inactive"),
    };

    // Calculate summary
    const summary = {
      totalEntries: timeEntries.length,
      activeEmployeeCount: byClassification.activeEmployees.length,
      contractorCount: byClassification.contractors.length,
      inactiveCount: byClassification.inactive.length,
      totalHours: staffReports.reduce((sum, s) => sum + s.totalHours, 0),
      totalRevenue: staffReports.reduce((sum, s) => sum + s.totalRevenue, 0),
    };

    return NextResponse.json({
      startDate,
      endDate,
      months: months.map((m) => ({ period: m.period, displayName: m.displayName })),
      staffReports,
      byClassification,
      capacityReference,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Billable hours report error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
