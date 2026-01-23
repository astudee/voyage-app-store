import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

interface StaffMember {
  STAFF_NAME: string;
  START_DATE: string | null;
  UTILIZATION_BONUS_TARGET: number | null;
  OTHER_BONUS_TARGET: number | null;
}

interface TimeEntry {
  staffName: string;
  project: string;
  billableHours: number;
}

interface EmployeeBonus {
  employee: string;
  startDate: string;
  daysInPeriod: number;
  proration: number;
  utilTarget: number;
  otherTarget: number;
  ytdBillable: number;
  ytdProBono: number;
  ytdProBonoCredit: number;
  ytdEligible: number;
  ytdTier: number;
  ytdUtilBonus: number;
  ytdOtherBonus: number;
  ytdTotalBonus: number;
  ytdFica: number;
  ytd401k: number;
  ytdTotalCost: number;
  projBillable: number;
  projEligible: number;
  projTier: number;
  projUtilBonus: number;
  projOtherBonus: number;
  projTotalBonus: number;
  projFica: number;
  proj401k: number;
  projTotalCost: number;
}

function calculateTierBonus(
  eligibleHours: number,
  annualTarget: number,
  proration: number
): { tier: number; bonus: number } {
  const proratedTarget = annualTarget * proration;
  const tier1Threshold = 1840 * proration;
  const tier2Threshold = 1350 * proration;

  if (eligibleHours >= tier1Threshold) {
    // Tier 1: Full bonus scaled by hours
    const bonus = tier1Threshold > 0 ? proratedTarget * (eligibleHours / tier1Threshold) : 0;
    return { tier: 1, bonus };
  } else if (eligibleHours >= tier2Threshold) {
    // Tier 2: 75% of bonus scaled by hours
    const bonus = tier1Threshold > 0 ? proratedTarget * 0.75 * (eligibleHours / tier1Threshold) : 0;
    return { tier: 2, bonus };
  } else {
    // Tier 3: No bonus
    return { tier: 3, bonus: 0 };
  }
}

async function fetchBigTimeHours(startDate: string, endDate: string): Promise<TimeEntry[]> {
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

  const colIndex: Record<string, number> = {};
  fields.forEach((field: { FieldNm: string }, idx: number) => {
    colIndex[field.FieldNm] = idx;
  });

  const entries: TimeEntry[] = rows.map((row: unknown[]) => ({
    staffName: row[colIndex["tmstaffnm"]] as string || "",
    project: row[colIndex["tmprojectnm"]] as string || "",
    billableHours: Number(row[colIndex["tmhrsbill"]]) || 0,
  }));

  return entries.filter((e) => e.billableHours > 0);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const asOfDateStr = searchParams.get("asOfDate") || new Date().toISOString().slice(0, 10);
    const asOfDate = new Date(asOfDateStr);
    const year = asOfDate.getFullYear();

    const startDate = `${year}-01-01`;
    const endDate = asOfDateStr;

    // Calculate progress through the year
    const startOfYear = new Date(year, 0, 1);
    const daysElapsed = Math.floor((asOfDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const daysInYear = isLeapYear ? 366 : 365;
    const progressPct = daysElapsed / daysInYear;

    // Fetch data in parallel
    const [staffRows, timeEntries] = await Promise.all([
      query<StaffMember>(`
        SELECT STAFF_NAME, START_DATE, UTILIZATION_BONUS_TARGET, OTHER_BONUS_TARGET
        FROM VC_STAFF
        WHERE IS_ACTIVE = TRUE
      `),
      fetchBigTimeHours(startDate, endDate),
    ]);

    // Group hours by staff, separating pro bono
    const regularHours = new Map<string, number>();
    const proBonoHours = new Map<string, number>();

    for (const entry of timeEntries) {
      const isProBono = entry.project.toLowerCase().includes("pro bono");

      if (isProBono) {
        proBonoHours.set(entry.staffName, (proBonoHours.get(entry.staffName) || 0) + entry.billableHours);
      } else {
        regularHours.set(entry.staffName, (regularHours.get(entry.staffName) || 0) + entry.billableHours);
      }
    }

    // Calculate bonuses for each employee
    const employees: EmployeeBonus[] = [];

    for (const staff of staffRows) {
      const name = staff.STAFF_NAME;
      const empStartDate = staff.START_DATE ? new Date(staff.START_DATE) : new Date(year, 0, 1);
      const utilTarget = Number(staff.UTILIZATION_BONUS_TARGET) || 0;
      const otherTarget = Number(staff.OTHER_BONUS_TARGET) || 0;

      // Get hours
      const ytdBillable = regularHours.get(name) || 0;
      const ytdProBono = proBonoHours.get(name) || 0;
      const ytdProBonoCredit = Math.min(ytdProBono, 40);
      const ytdEligible = ytdBillable + ytdProBonoCredit;

      // Calculate proration
      let proration: number;
      let daysInPeriod: number;

      if (empStartDate <= startOfYear) {
        proration = 1.0;
        daysInPeriod = daysElapsed;
      } else if (empStartDate <= asOfDate) {
        daysInPeriod = Math.floor((asOfDate.getTime() - empStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        proration = daysInPeriod / daysElapsed;
      } else {
        proration = 0;
        daysInPeriod = 0;
      }

      // YTD Bonus calculation
      const { tier: ytdTier, bonus: ytdUtilBonus } = calculateTierBonus(ytdEligible, utilTarget, proration);
      const ytdOtherBonus = otherTarget * progressPct;
      const ytdTotalBonus = ytdUtilBonus + ytdOtherBonus;

      // Employer costs
      const ytdFica = ytdTotalBonus * 0.0765;
      const ytd401k = ytdTotalBonus * 0.04;
      const ytdTotalCost = ytdTotalBonus + ytdFica + ytd401k;

      // Projected year-end
      const projBillable = progressPct > 0 ? ytdBillable / progressPct : 0;
      const projProBono = progressPct > 0 ? ytdProBono / progressPct : 0;
      const projProBonoCredit = Math.min(projProBono, 40);
      const projEligible = projBillable + projProBonoCredit;

      const { tier: projTier, bonus: projUtilBonus } = calculateTierBonus(projEligible, utilTarget, proration);
      const projOtherBonus = otherTarget;
      const projTotalBonus = projUtilBonus + projOtherBonus;

      const projFica = projTotalBonus * 0.0765;
      const proj401k = projTotalBonus * 0.04;
      const projTotalCost = projTotalBonus + projFica + proj401k;

      employees.push({
        employee: name,
        startDate: empStartDate.toISOString().slice(0, 10),
        daysInPeriod,
        proration,
        utilTarget,
        otherTarget,
        ytdBillable: Math.round(ytdBillable * 10) / 10,
        ytdProBono: Math.round(ytdProBono * 10) / 10,
        ytdProBonoCredit: Math.round(ytdProBonoCredit * 10) / 10,
        ytdEligible: Math.round(ytdEligible * 10) / 10,
        ytdTier,
        ytdUtilBonus: Math.round(ytdUtilBonus * 100) / 100,
        ytdOtherBonus: Math.round(ytdOtherBonus * 100) / 100,
        ytdTotalBonus: Math.round(ytdTotalBonus * 100) / 100,
        ytdFica: Math.round(ytdFica * 100) / 100,
        ytd401k: Math.round(ytd401k * 100) / 100,
        ytdTotalCost: Math.round(ytdTotalCost * 100) / 100,
        projBillable: Math.round(projBillable * 10) / 10,
        projEligible: Math.round(projEligible * 10) / 10,
        projTier,
        projUtilBonus: Math.round(projUtilBonus * 100) / 100,
        projOtherBonus: Math.round(projOtherBonus * 100) / 100,
        projTotalBonus: Math.round(projTotalBonus * 100) / 100,
        projFica: Math.round(projFica * 100) / 100,
        proj401k: Math.round(proj401k * 100) / 100,
        projTotalCost: Math.round(projTotalCost * 100) / 100,
      });
    }

    // Sort by employee name
    employees.sort((a, b) => a.employee.localeCompare(b.employee));

    // Calculate summary totals
    const summary = {
      year,
      asOfDate: asOfDateStr,
      progressPct,
      employeeCount: employees.length,
      ytdTotalBonuses: employees.reduce((sum, e) => sum + e.ytdTotalBonus, 0),
      ytdTotalFica: employees.reduce((sum, e) => sum + e.ytdFica, 0),
      ytdTotal401k: employees.reduce((sum, e) => sum + e.ytd401k, 0),
      ytdTotalCost: employees.reduce((sum, e) => sum + e.ytdTotalCost, 0),
      projTotalBonuses: employees.reduce((sum, e) => sum + e.projTotalBonus, 0),
      projTotalFica: employees.reduce((sum, e) => sum + e.projFica, 0),
      projTotal401k: employees.reduce((sum, e) => sum + e.proj401k, 0),
      projTotalCost: employees.reduce((sum, e) => sum + e.projTotalCost, 0),
    };

    return NextResponse.json({
      summary,
      employees,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Bonus calculation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
