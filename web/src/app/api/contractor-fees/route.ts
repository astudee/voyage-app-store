import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

interface StaffMember {
  STAFF_NAME: string;
}

interface TimeEntry {
  staffName: string;
  date: string;
  hours: number;
}

interface ExpenseEntry {
  staffName: string;
  date: string;
  category: string;
  amount: number;
}

interface WeeklySummary {
  staff: string;
  weekEnding: string;
  totalHours: number;
  totalFees: number;
  avgHourlyRate: number;
  issues: string;
}

interface NonFridayFee {
  contractor: string;
  date: string;
  day: string;
  amount: number;
  issue: string;
}

function getWeekEnding(dateStr: string): string {
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay();
  // Friday is 5, but getDay() returns 0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  const friday = new Date(date);
  friday.setDate(date.getDate() + daysUntilFriday);
  return friday.toISOString().split("T")[0];
}

function getDayName(dateStr: string): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const date = new Date(dateStr);
  return days[date.getDay()];
}

async function fetchBigTimeTimeReport(startDate: string, endDate: string): Promise<TimeEntry[]> {
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
  }));

  return entries.filter((e) => e.hours > 0);
}

async function fetchBigTimeExpenseReport(startDate: string, endDate: string): Promise<ExpenseEntry[]> {
  const apiKey = process.env.BIGTIME_API_KEY;
  const firmId = process.env.BIGTIME_FIRM_ID;

  if (!apiKey || !firmId) {
    throw new Error("BigTime credentials not configured");
  }

  // Use report 284803 for expense data
  const response = await fetch(
    "https://iq.bigtime.net/BigtimeData/api/v2/report/data/284803",
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
    throw new Error(`BigTime expense API error: ${response.status}`);
  }

  const data = await response.json();
  const rows = data.Data || [];
  const fields = data.FieldList || [];

  const colIndex: Record<string, number> = {};
  fields.forEach((field: { FieldNm: string }, idx: number) => {
    colIndex[field.FieldNm] = idx;
  });

  const entries: ExpenseEntry[] = rows.map((row: unknown[]) => ({
    staffName: (row[colIndex["exsourcenm"]] as string) || "",
    date: (row[colIndex["exdt"]] as string) || "",
    category: (row[colIndex["excatnm"]] as string) || "",
    amount: Number(row[colIndex["excostin"]]) || 0,
  }));

  return entries;
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

    // Fetch data in parallel
    const [staffRows, timeEntries, expenseEntries] = await Promise.all([
      query<StaffMember>("SELECT STAFF_NAME FROM VC_STAFF"),
      fetchBigTimeTimeReport(startDate, endDate),
      fetchBigTimeExpenseReport(startDate, endDate),
    ]);

    // Build employee set
    const employeeNames = new Set(staffRows.map((s) => s.STAFF_NAME));

    // Filter time entries to contractors only (not on staff list)
    const contractorTime = timeEntries.filter((e) => !employeeNames.has(e.staffName));

    // Get unique contractor names
    const contractorNames = [...new Set(contractorTime.map((e) => e.staffName))];

    // Filter expense entries to contractor fees only
    const contractorFees = expenseEntries.filter(
      (e) => e.category.toLowerCase().includes("contractor fee")
    );

    // Check for non-Friday fees
    const nonFridayFees: NonFridayFee[] = [];
    for (const fee of contractorFees) {
      const date = new Date(fee.date);
      if (date.getDay() !== 5) { // 5 = Friday
        nonFridayFees.push({
          contractor: fee.staffName,
          date: fee.date,
          day: getDayName(fee.date),
          amount: fee.amount,
          issue: `Fee charged on ${getDayName(fee.date)} (should be Friday)`,
        });
      }
    }

    // Aggregate hours by contractor and week
    const weeklyHours = new Map<string, Map<string, number>>();
    for (const entry of contractorTime) {
      const weekEnding = getWeekEnding(entry.date);
      const key = entry.staffName;

      if (!weeklyHours.has(key)) {
        weeklyHours.set(key, new Map());
      }
      const staffWeeks = weeklyHours.get(key)!;
      staffWeeks.set(weekEnding, (staffWeeks.get(weekEnding) || 0) + entry.hours);
    }

    // Aggregate fees by contractor and week
    const weeklyFees = new Map<string, Map<string, number>>();
    for (const fee of contractorFees) {
      const weekEnding = getWeekEnding(fee.date);
      const key = fee.staffName;

      if (!weeklyFees.has(key)) {
        weeklyFees.set(key, new Map());
      }
      const staffWeeks = weeklyFees.get(key)!;
      staffWeeks.set(weekEnding, (staffWeeks.get(weekEnding) || 0) + fee.amount);
    }

    // Build combined summary
    const allStaffWeeks = new Set<string>();
    weeklyHours.forEach((weeks, staff) => {
      weeks.forEach((_, week) => allStaffWeeks.add(`${staff}|${week}`));
    });
    weeklyFees.forEach((weeks, staff) => {
      weeks.forEach((_, week) => allStaffWeeks.add(`${staff}|${week}`));
    });

    const weeklySummary: WeeklySummary[] = [];
    const missingInvoices: WeeklySummary[] = [];

    for (const key of allStaffWeeks) {
      const [staff, weekEnding] = key.split("|");
      const hours = weeklyHours.get(staff)?.get(weekEnding) || 0;
      const fees = weeklyFees.get(staff)?.get(weekEnding) || 0;
      const avgRate = hours > 0 ? fees / hours : 0;

      let issues = "";
      if (hours > 0 && fees === 0) {
        issues = "Hours submitted but no invoice";
      }

      const summary: WeeklySummary = {
        staff,
        weekEnding,
        totalHours: Math.round(hours * 10) / 10,
        totalFees: Math.round(fees * 100) / 100,
        avgHourlyRate: Math.round(avgRate * 100) / 100,
        issues,
      };

      weeklySummary.push(summary);

      if (issues) {
        missingInvoices.push(summary);
      }
    }

    // Sort by staff name and week
    weeklySummary.sort((a, b) => {
      if (a.staff !== b.staff) return a.staff.localeCompare(b.staff);
      return a.weekEnding.localeCompare(b.weekEnding);
    });

    missingInvoices.sort((a, b) => {
      if (a.staff !== b.staff) return a.staff.localeCompare(b.staff);
      return a.weekEnding.localeCompare(b.weekEnding);
    });

    return NextResponse.json({
      contractors: contractorNames,
      nonFridayFees,
      missingInvoices,
      weeklySummary,
      summary: {
        totalContractors: contractorNames.length,
        totalNonFridayFees: nonFridayFees.length,
        totalMissingInvoices: missingInvoices.length,
        totalWeeks: weeklySummary.length,
      },
    });
  } catch (error) {
    console.error("Contractor fees error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
