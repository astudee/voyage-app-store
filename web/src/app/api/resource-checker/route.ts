import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

interface Assignment {
  PROJECT_ID: number;
  CLIENT_NAME: string;
  PROJECT_NAME: string;
  STAFF_NAME: string;
  BILL_RATE: number;
  MONTH_DATE: string | Date;
  ALLOCATED_HOURS: number;
}

interface StaffMember {
  STAFF_NAME: string;
  IS_ACTIVE: boolean;
}

interface BigTimeEntry {
  staffName: string;
  projectId: number | null;
  clientId: number | null;
  projectName: string;
  clientName: string;
  hours: number;
  date: string;
}

interface ResourceResult {
  staffMember: string;
  client: string;
  projectName: string;
  projectId: string;
  totalAssigned: number;
  totalActual: number;
  percentUsed: number;
  utilizationStatus: string;
  utilizationColor: string;
  scheduleStatus: string;
  paceRatio: number;
  delta: number;
  isUnassigned: boolean;
  sortOrder: number;
}

const BIGTIME_API_KEY = process.env.BIGTIME_API_KEY;
const BIGTIME_FIRM_ID = process.env.BIGTIME_FIRM_ID;
const BIGTIME_REPORT_ID = "284796";

// Fetch BigTime time report
async function fetchBigTimeReport(startDate: Date, endDate: Date): Promise<BigTimeEntry[]> {
  const response = await fetch(
    `https://iq.bigtime.net/BigtimeData/api/v2/report/data/${BIGTIME_REPORT_ID}`,
    {
      method: "POST",
      headers: {
        "X-Auth-ApiToken": BIGTIME_API_KEY!,
        "X-Auth-Realm": BIGTIME_FIRM_ID!,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        DT_BEGIN: startDate.toISOString().slice(0, 10),
        DT_END: endDate.toISOString().slice(0, 10),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`BigTime API error: ${response.status}`);
  }

  const data = await response.json();
  const rows = data.Data || [];
  const fields = data.FieldList || [];

  // Build column index from field list
  const colIndex: Record<string, number> = {};
  fields.forEach((field: { FieldNm: string }, idx: number) => {
    colIndex[field.FieldNm] = idx;
  });

  // Parse column indices
  const staffIdx = colIndex["tmstaffnm"] ?? colIndex["Staff Member"];
  const projectIdIdx = colIndex["tmprojectnm_id"] ?? colIndex["Project_ID"];
  const clientIdIdx = colIndex["tmclientnm_id"] ?? colIndex["Client_ID"];
  const projectIdx = colIndex["tmprojectnm"] ?? colIndex["Project"];
  const clientIdx = colIndex["tmclientnm"] ?? colIndex["Client"];
  const hoursIdx = colIndex["tmhrsin"] ?? colIndex["Hours"];
  const dateIdx = colIndex["tmdt"] ?? colIndex["Date"];

  const entries: BigTimeEntry[] = rows.map((row: unknown[]) => ({
    staffName: staffIdx !== undefined ? String(row[staffIdx] || "") : "",
    projectId: projectIdIdx !== undefined ? (Number(row[projectIdIdx]) || null) : null,
    clientId: clientIdIdx !== undefined ? (Number(row[clientIdIdx]) || null) : null,
    projectName: projectIdx !== undefined ? String(row[projectIdx] || "") : "",
    clientName: clientIdx !== undefined ? String(row[clientIdx] || "") : "",
    hours: hoursIdx !== undefined ? (Number(row[hoursIdx]) || 0) : 0,
    date: dateIdx !== undefined ? String(row[dateIdx] || "") : "",
  }));

  // Filter out internal projects (client ID 5556066)
  return entries.filter((e) => e.hours !== 0 && e.clientId !== 5556066);
}

// Fetch assignments from Snowflake
async function fetchAssignments(): Promise<Assignment[]> {
  const sql = `
    SELECT
      a.PROJECT_ID,
      p.CLIENT_NAME,
      p.PROJECT_NAME,
      a.STAFF_NAME,
      a.BILL_RATE,
      a.MONTH_DATE,
      a.ALLOCATED_HOURS
    FROM VC_STAFF_ASSIGNMENTS a
    JOIN VC_PROJECTS p ON a.PROJECT_ID = p.PROJECT_ID
    WHERE a.ALLOCATED_HOURS > 0
    ORDER BY a.STAFF_NAME, a.PROJECT_ID, a.MONTH_DATE
  `;
  return await query<Assignment>(sql);
}

// Fetch active staff from Snowflake
async function fetchStaff(): Promise<Set<string>> {
  const sql = "SELECT STAFF_NAME FROM VC_STAFF WHERE IS_ACTIVE = TRUE";
  const rows = await query<StaffMember>(sql);
  return new Set(rows.map((r) => r.STAFF_NAME));
}

// Get utilization status based on percent used
function getUtilizationStatus(percentUsed: number): { status: string; color: string; sortOrder: number } {
  if (percentUsed >= 100) return { status: "Overrun", color: "red", sortOrder: 1 };
  if (percentUsed >= 95) return { status: "On Target", color: "green", sortOrder: 5 };
  if (percentUsed >= 85) return { status: "At Risk (High)", color: "yellow", sortOrder: 3 };
  if (percentUsed >= 70) return { status: "Under Target", color: "blue", sortOrder: 4 };
  return { status: "Severely Under", color: "purple", sortOrder: 2 };
}

// Get schedule status based on pace ratio
function getScheduleStatus(paceRatio: number): string {
  if (paceRatio >= 1.05) return "Ahead";
  if (paceRatio >= 0.95) return "On Schedule";
  if (paceRatio >= 0.85) return "At Risk (Late)";
  return "Late";
}

// Normalize project ID
function normalizeProjectId(pid: unknown): string | null {
  if (pid === null || pid === undefined || pid === "") return null;
  return String(pid).trim();
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!BIGTIME_API_KEY || !BIGTIME_FIRM_ID) {
    return NextResponse.json({ error: "BigTime API not configured" }, { status: 500 });
  }

  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get("startDate");
  const endDateStr = searchParams.get("endDate");

  // Default to current year
  const today = new Date();
  const startDate = startDateStr ? new Date(startDateStr) : new Date(today.getFullYear(), 0, 1);
  const endDate = endDateStr ? new Date(endDateStr) : new Date(today.getFullYear(), 11, 31);

  try {
    // Fetch data in parallel
    const [assignments, employees, btEntries] = await Promise.all([
      fetchAssignments(),
      fetchStaff(),
      fetchBigTimeReport(startDate, endDate),
    ]);

    // Build resource-project assignments
    const resources: Map<
      string, // key: staff|projectId
      {
        staffMember: string;
        client: string;
        projectName: string;
        projectId: string;
        totalAssigned: number;
        monthlyPlan: Record<string, number>;
        firstMonth: Date | null;
        lastMonth: Date | null;
      }
    > = new Map();

    for (const assignment of assignments) {
      const projectId = normalizeProjectId(assignment.PROJECT_ID);
      if (!projectId) continue;

      // Skip internal projects
      if (assignment.PROJECT_NAME?.toLowerCase().startsWith("internal:")) continue;

      const key = `${assignment.STAFF_NAME}|${projectId}`;
      const monthDate = assignment.MONTH_DATE instanceof Date
        ? assignment.MONTH_DATE
        : new Date(assignment.MONTH_DATE);
      const monthKey = monthDate.toISOString().slice(0, 7);

      if (!resources.has(key)) {
        resources.set(key, {
          staffMember: assignment.STAFF_NAME,
          client: assignment.CLIENT_NAME,
          projectName: assignment.PROJECT_NAME,
          projectId,
          totalAssigned: 0,
          monthlyPlan: {},
          firstMonth: null,
          lastMonth: null,
        });
      }

      const resource = resources.get(key)!;
      resource.totalAssigned += assignment.ALLOCATED_HOURS || 0;

      if (assignment.ALLOCATED_HOURS > 0) {
        resource.monthlyPlan[monthKey] = (resource.monthlyPlan[monthKey] || 0) + assignment.ALLOCATED_HOURS;
        if (!resource.firstMonth || monthDate < resource.firstMonth) {
          resource.firstMonth = monthDate;
        }
        if (!resource.lastMonth || monthDate > resource.lastMonth) {
          resource.lastMonth = monthDate;
        }
      }
    }

    // Aggregate BigTime actuals by staff + project
    const actuals: Map<string, { hours: number; projectName: string; clientName: string }> = new Map();

    for (const entry of btEntries) {
      const projectId = normalizeProjectId(entry.projectId);
      if (!projectId || !entry.staffName) continue;

      const key = `${entry.staffName}|${projectId}`;
      const existing = actuals.get(key) || { hours: 0, projectName: entry.projectName, clientName: entry.clientName };
      existing.hours += entry.hours;
      actuals.set(key, existing);
    }

    // Calculate metrics for each resource
    const results: ResourceResult[] = [];
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    for (const [key, resource] of resources) {
      const actual = actuals.get(key);
      const totalActual = actual?.hours || 0;

      // Calculate percent used
      let percentUsed = 0;
      let isUnassigned = false;
      if (resource.totalAssigned > 0) {
        percentUsed = (totalActual / resource.totalAssigned) * 100;
      } else if (totalActual > 0) {
        percentUsed = 999; // Flag as massive overrun
        isUnassigned = true;
      }

      // Calculate schedule metrics
      let paceRatio = 0;
      if (resource.firstMonth && resource.lastMonth && resource.totalAssigned > 0) {
        // Count months in schedule
        let totalMonths = 0;
        let elapsedMonths = 0;
        const m = new Date(resource.firstMonth);
        while (m <= resource.lastMonth) {
          totalMonths++;
          if (m <= currentMonth && m <= resource.lastMonth) {
            elapsedMonths++;
          }
          m.setMonth(m.getMonth() + 1);
        }

        if (totalMonths > 0) {
          const scheduleProgress = elapsedMonths / totalMonths;
          const expectedHoursToDate = resource.totalAssigned * scheduleProgress;
          if (expectedHoursToDate > 0) {
            paceRatio = totalActual / expectedHoursToDate;
          }
        }
      }

      const utilStatus = getUtilizationStatus(percentUsed);
      const schedStatus = getScheduleStatus(paceRatio);
      const delta = totalActual - resource.totalAssigned;

      results.push({
        staffMember: resource.staffMember,
        client: resource.client,
        projectName: resource.projectName,
        projectId: resource.projectId,
        totalAssigned: Math.round(resource.totalAssigned * 10) / 10,
        totalActual: Math.round(totalActual * 10) / 10,
        percentUsed: Math.round(percentUsed * 10) / 10,
        utilizationStatus: utilStatus.status,
        utilizationColor: utilStatus.color,
        scheduleStatus: schedStatus,
        paceRatio: Math.round(paceRatio * 100) / 100,
        delta: Math.round(delta * 10) / 10,
        isUnassigned,
        sortOrder: utilStatus.sortOrder,
      });

      // Mark as processed in actuals
      actuals.delete(key);
    }

    // Check for unassigned work (actuals with no assignment)
    for (const [key, actual] of actuals) {
      const [staffMember, projectId] = key.split("|");
      const utilStatus = getUtilizationStatus(999);

      results.push({
        staffMember,
        client: actual.clientName,
        projectName: actual.projectName,
        projectId,
        totalAssigned: 0,
        totalActual: Math.round(actual.hours * 10) / 10,
        percentUsed: 999,
        utilizationStatus: "Overrun",
        utilizationColor: "red",
        scheduleStatus: "N/A",
        paceRatio: 0,
        delta: Math.round(actual.hours * 10) / 10,
        isUnassigned: true,
        sortOrder: utilStatus.sortOrder,
      });
    }

    // Filter to only records where assigned or actual > 0
    const filteredResults = results.filter((r) => r.totalAssigned > 0 || r.totalActual > 0);

    // Sort: worst problems first
    filteredResults.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.paceRatio - b.paceRatio;
    });

    // Calculate summary
    const overruns = filteredResults.filter((r) => r.utilizationStatus === "Overrun").length;
    const severelyUnder = filteredResults.filter((r) => r.utilizationStatus === "Severely Under").length;
    const late = filteredResults.filter((r) => r.scheduleStatus === "Late").length;
    const unassigned = filteredResults.filter((r) => r.isUnassigned).length;

    return NextResponse.json({
      success: true,
      resources: filteredResults,
      summary: {
        overruns,
        severelyUnder,
        late,
        unassigned,
        totalResources: filteredResults.length,
        employeeCount: employees.size,
      },
      metadata: {
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        assignmentCount: assignments.length,
        bigTimeEntryCount: btEntries.length,
      },
    });
  } catch (error) {
    console.error("Resource checker error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
