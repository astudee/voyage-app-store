import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

interface StaffMember {
  STAFF_NAME: string;
}

interface Assignment {
  STAFF_NAME: string;
  PROJECT_NAME: string;
  CLIENT_NAME: string;
  MONTH_DATE: string;
  ALLOCATED_HOURS: number;
  BILL_RATE: number;
}

interface StaffMonthData {
  staff: string;
  classification: "Employee" | "Contractor";
  months: Record<string, number>;
  total: number;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const startMonth = searchParams.get("startMonth"); // Format: 2026-01
    const endMonth = searchParams.get("endMonth");
    const metricType = searchParams.get("metric") || "hours"; // "hours" or "revenue"

    if (!startMonth || !endMonth) {
      return NextResponse.json(
        { error: "startMonth and endMonth are required (format: YYYY-MM)" },
        { status: 400 }
      );
    }

    // Parse months
    const startDate = new Date(startMonth + "-01");
    const endDate = new Date(endMonth + "-01");

    if (endDate < startDate) {
      return NextResponse.json(
        { error: "End month must be after start month" },
        { status: 400 }
      );
    }

    // Fetch staff list and assignments in parallel
    const [staffRows, assignmentRows] = await Promise.all([
      query<StaffMember>("SELECT STAFF_NAME FROM VC_STAFF WHERE IS_ACTIVE = TRUE"),
      query<Assignment>(`
        SELECT
          a.STAFF_NAME,
          p.PROJECT_NAME,
          p.CLIENT_NAME,
          a.MONTH_DATE,
          a.ALLOCATED_HOURS,
          a.BILL_RATE
        FROM VC_STAFF_ASSIGNMENTS a
        LEFT JOIN VC_PROJECTS p ON a.PROJECT_ID = p.PROJECT_ID
        WHERE a.MONTH_DATE >= ? AND a.MONTH_DATE <= ?
        ORDER BY a.STAFF_NAME, a.MONTH_DATE
      `, [startMonth + "-01", endMonth + "-01"]),
    ]);

    // Build employee set
    const employeeNames = new Set(staffRows.map((s) => s.STAFF_NAME));

    // Generate list of all months in range
    const months: string[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      months.push(current.toISOString().slice(0, 7)); // YYYY-MM format
      current.setMonth(current.getMonth() + 1);
    }

    // Aggregate data by staff and month
    const staffData = new Map<string, { classification: "Employee" | "Contractor"; months: Record<string, number> }>();

    for (const assignment of assignmentRows) {
      const staff = assignment.STAFF_NAME;
      // Handle MONTH_DATE as either Date object or string
      const monthKey = assignment.MONTH_DATE instanceof Date
        ? assignment.MONTH_DATE.toISOString().slice(0, 7)
        : String(assignment.MONTH_DATE).slice(0, 7); // Get YYYY-MM from date
      const value = metricType === "revenue"
        ? (assignment.ALLOCATED_HOURS || 0) * (assignment.BILL_RATE || 0)
        : (assignment.ALLOCATED_HOURS || 0);

      if (!staffData.has(staff)) {
        staffData.set(staff, {
          classification: employeeNames.has(staff) ? "Employee" : "Contractor",
          months: {},
        });
      }

      const data = staffData.get(staff)!;
      data.months[monthKey] = (data.months[monthKey] || 0) + value;
    }

    // Convert to array format
    const employees: StaffMonthData[] = [];
    const contractors: StaffMonthData[] = [];

    for (const [staff, data] of staffData) {
      const total = Object.values(data.months).reduce((sum, val) => sum + val, 0);
      const entry: StaffMonthData = {
        staff,
        classification: data.classification,
        months: data.months,
        total: Math.round(total * 100) / 100,
      };

      if (data.classification === "Employee") {
        employees.push(entry);
      } else {
        contractors.push(entry);
      }
    }

    // Sort by name
    employees.sort((a, b) => a.staff.localeCompare(b.staff));
    contractors.sort((a, b) => a.staff.localeCompare(b.staff));

    // Calculate monthly totals
    const monthlyTotals: Record<string, number> = {};
    for (const month of months) {
      monthlyTotals[month] = 0;
      for (const [, data] of staffData) {
        monthlyTotals[month] += data.months[month] || 0;
      }
      monthlyTotals[month] = Math.round(monthlyTotals[month] * 100) / 100;
    }

    const grandTotal = Object.values(monthlyTotals).reduce((sum, val) => sum + val, 0);

    return NextResponse.json({
      months,
      employees,
      contractors,
      monthlyTotals,
      grandTotal: Math.round(grandTotal * 100) / 100,
      metricType,
      summary: {
        totalStaff: employees.length + contractors.length,
        employeeCount: employees.length,
        contractorCount: contractors.length,
        monthCount: months.length,
      },
    });
  } catch (error) {
    console.error("Forecasted hours error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
