import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

// Types
interface PipedriveDeal {
  id: number;
  title: string;
  value: number;
  currency: string;
  status: string;
  won_time: string;
  [key: string]: unknown;
}

interface PipedriveField {
  key: string;
  name: string;
}

interface Assignment {
  PROJECT_ID: number;
  CLIENT_NAME: string;
  PROJECT_NAME: string;
  PROJECT_STATUS: string;
  STAFF_NAME: string;
  BILL_RATE: number;
  MONTH_DATE: string | Date;
  ALLOCATED_HOURS: number;
}

interface BigTimeEntry {
  tmclientnm_id?: number;
  tmprojectnm_id?: number;
  tmhrsin?: number;
  tmdt?: string;
}

interface ProjectHealth {
  projectId: string;
  client: string;
  projectName: string;
  timeline: string;
  booking: number;
  plannedRevenue: number;
  feesToDate: number;
  planBookedPct: number;
  feesBookedPct: number;
  durationPct: number;
  projectStatus: string;
  startDate: string;
  endDate: string;
  totalPlannedHours: number;
  totalActualHours: number;
  hasPipedriveMatch: boolean;
}

const BIGTIME_API_KEY = process.env.BIGTIME_API_KEY;
const BIGTIME_FIRM_ID = process.env.BIGTIME_FIRM_ID;
const BIGTIME_REPORT_ID = "284796";
const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;

// Fetch BigTime time report
async function fetchBigTimeReport(year: number): Promise<BigTimeEntry[]> {
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
        DT_BEGIN: `${year}-01-01`,
        DT_END: `${year}-12-31`,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`BigTime API error: ${response.status}`);
  }

  const data = await response.json();
  return data.Data || [];
}

// Fetch Pipedrive custom field keys
async function getPipedriveCustomFields(): Promise<Record<string, string>> {
  const response = await fetch(
    `https://api.pipedrive.com/v1/dealFields?api_token=${PIPEDRIVE_API_TOKEN}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch Pipedrive fields");
  }

  const data = await response.json();
  const fields: PipedriveField[] = data.data || [];

  const fieldMap: Record<string, string> = {};
  for (const field of fields) {
    const name = field.name.toLowerCase();
    if (name.includes("bigtime") && name.includes("project") && name.includes("id")) {
      fieldMap.bigtime_project_id = field.key;
    } else if (name.includes("project") && name.includes("start") && name.includes("date")) {
      fieldMap.project_start_date = field.key;
    } else if (name.includes("project") && name.includes("duration")) {
      fieldMap.project_duration = field.key;
    }
  }

  return fieldMap;
}

// Fetch Pipedrive won deals
async function fetchPipedriveDeals(): Promise<PipedriveDeal[]> {
  const allDeals: PipedriveDeal[] = [];
  let start = 0;
  const limit = 500;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `https://api.pipedrive.com/v1/deals?api_token=${PIPEDRIVE_API_TOKEN}&status=won&start=${start}&limit=${limit}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch Pipedrive deals");
    }

    const data = await response.json();
    const deals: PipedriveDeal[] = data.data || [];
    allDeals.push(...deals);

    const pagination = data.additional_data?.pagination;
    hasMore = pagination?.more_items_in_collection || false;
    start = pagination?.next_start || 0;
  }

  return allDeals;
}

// Fetch assignments from Snowflake
async function fetchAssignments(): Promise<Assignment[]> {
  const sql = `
    SELECT
      a.PROJECT_ID,
      p.CLIENT_NAME,
      p.PROJECT_NAME,
      p.PROJECT_STATUS,
      a.STAFF_NAME,
      a.BILL_RATE,
      a.MONTH_DATE,
      a.ALLOCATED_HOURS
    FROM VC_STAFF_ASSIGNMENTS a
    JOIN VC_PROJECTS p ON a.PROJECT_ID = p.PROJECT_ID
    ORDER BY a.PROJECT_ID, a.STAFF_NAME, a.MONTH_DATE
  `;

  const rows = await query<Assignment>(sql);
  return rows;
}

// Normalize project ID
function normalizeProjectId(pid: unknown): string | null {
  if (pid === null || pid === undefined || pid === "") return null;
  return String(pid).trim();
}

// Calculate project status based on dates
function getProjectStatus(startDate: Date, endDate: Date, today: Date): string {
  if (today < startDate) return "Not Started";
  if (today > endDate) return "Completed";
  return "Active";
}

// GET /api/project-health
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check required credentials
  if (!BIGTIME_API_KEY || !BIGTIME_FIRM_ID) {
    return NextResponse.json({ error: "BigTime API not configured" }, { status: 500 });
  }

  if (!PIPEDRIVE_API_TOKEN) {
    return NextResponse.json({ error: "Pipedrive API not configured" }, { status: 500 });
  }

  // Parse query parameters
  const searchParams = request.nextUrl.searchParams;
  const statusFilter = searchParams.get("status") || "Active Only";

  try {
    // Fetch data from all three sources in parallel
    const currentYear = new Date().getFullYear();
    const [
      assignments,
      pipedriveDeals,
      customFields,
      btTimeCurrentYear,
      btTimePreviousYear,
    ] = await Promise.all([
      fetchAssignments(),
      fetchPipedriveDeals(),
      getPipedriveCustomFields(),
      fetchBigTimeReport(currentYear),
      fetchBigTimeReport(currentYear - 1),
    ]);

    // Combine BigTime data
    const btTime = [...btTimeCurrentYear, ...btTimePreviousYear];

    // Filter out Internal projects (client ID 5556066)
    const filteredBtTime = btTime.filter(
      (entry) => entry.tmclientnm_id !== 5556066
    );

    // Group assignments by project
    const projectsMap: Record<
      string,
      {
        projectId: string;
        client: string;
        projectName: string;
        projectStatus: string;
        totalPlannedHours: number;
        weightedHoursRates: { rate: number; hours: number }[];
        monthlyPlan: Record<string, number>;
        firstMonth: Date | null;
        lastMonth: Date | null;
      }
    > = {};

    for (const assignment of assignments) {
      const projectId = normalizeProjectId(assignment.PROJECT_ID);
      if (!projectId) continue;

      if (!projectsMap[projectId]) {
        projectsMap[projectId] = {
          projectId,
          client: assignment.CLIENT_NAME,
          projectName: assignment.PROJECT_NAME,
          projectStatus: assignment.PROJECT_STATUS,
          totalPlannedHours: 0,
          weightedHoursRates: [],
          monthlyPlan: {},
          firstMonth: null,
          lastMonth: null,
        };
      }

      const hours = assignment.ALLOCATED_HOURS || 0;
      const rate = assignment.BILL_RATE || 0;

      projectsMap[projectId].totalPlannedHours += hours;

      if (rate > 0 && hours > 0) {
        projectsMap[projectId].weightedHoursRates.push({ rate, hours });
      }

      // Track monthly distribution
      if (hours > 0 && assignment.MONTH_DATE) {
        // Handle MONTH_DATE as either string or Date object
        const monthDate = assignment.MONTH_DATE instanceof Date
          ? assignment.MONTH_DATE
          : new Date(assignment.MONTH_DATE);
        const monthKey = monthDate.toISOString().substring(0, 7); // YYYY-MM

        projectsMap[projectId].monthlyPlan[monthKey] =
          (projectsMap[projectId].monthlyPlan[monthKey] || 0) + hours;

        if (!projectsMap[projectId].firstMonth || monthDate < projectsMap[projectId].firstMonth) {
          projectsMap[projectId].firstMonth = monthDate;
        }
        if (!projectsMap[projectId].lastMonth || monthDate > projectsMap[projectId].lastMonth) {
          projectsMap[projectId].lastMonth = monthDate;
        }
      }
    }

    // Calculate weighted average bill rate per project
    for (const project of Object.values(projectsMap)) {
      const totalWeighted = project.weightedHoursRates.reduce(
        (sum, br) => sum + br.rate * br.hours,
        0
      );
      const totalHours = project.weightedHoursRates.reduce(
        (sum, br) => sum + br.hours,
        0
      );
      (project as Record<string, unknown>).weightedBillRate =
        totalHours > 0 ? totalWeighted / totalHours : 0;
    }

    // Match with Pipedrive deals
    const btProjectIdKey = customFields.bigtime_project_id;

    for (const deal of pipedriveDeals) {
      const btProjectId = normalizeProjectId(deal[btProjectIdKey]);
      if (btProjectId && projectsMap[btProjectId]) {
        const project = projectsMap[btProjectId];
        if (!(project as Record<string, unknown>).dealValue) {
          (project as Record<string, unknown>).dealValue = 0;
          (project as Record<string, unknown>).dealTitles = [];
        }
        (project as Record<string, unknown>).dealValue =
          ((project as Record<string, unknown>).dealValue as number) + (deal.value || 0);
        ((project as Record<string, unknown>).dealTitles as string[]).push(deal.title);

        if (!(project as Record<string, unknown>).wonDate) {
          (project as Record<string, unknown>).wonDate = deal.won_time;
        }
      }
    }

    // Calculate actuals from BigTime
    const actualsByProject: Record<
      string,
      { hours: number; earliestDate: Date | null }
    > = {};

    for (const entry of filteredBtTime) {
      const projectId = normalizeProjectId(entry.tmprojectnm_id);
      if (!projectId) continue;

      if (!actualsByProject[projectId]) {
        actualsByProject[projectId] = { hours: 0, earliestDate: null };
      }

      actualsByProject[projectId].hours += entry.tmhrsin || 0;

      if (entry.tmdt) {
        const entryDate = new Date(entry.tmdt);
        if (
          !actualsByProject[projectId].earliestDate ||
          entryDate < actualsByProject[projectId].earliestDate
        ) {
          actualsByProject[projectId].earliestDate = entryDate;
        }
      }
    }

    // Merge actuals into projects
    for (const [projectId, actuals] of Object.entries(actualsByProject)) {
      if (projectsMap[projectId]) {
        (projectsMap[projectId] as Record<string, unknown>).totalActualHours =
          actuals.hours;
        (projectsMap[projectId] as Record<string, unknown>).earliestActualDate =
          actuals.earliestDate;
      }
    }

    // Build results
    const results: ProjectHealth[] = [];
    const today = new Date();

    for (const project of Object.values(projectsMap)) {
      const p = project as Record<string, unknown>;

      // Check if project has Pipedrive match
      const hasPipedriveMatch = !!(p.dealValue && (p.dealValue as number) > 0);

      // Determine timeline
      let startDate: Date | null = null;
      let endDate: Date | null = null;

      // Start: Use earliest BigTime date if available
      if (p.earliestActualDate) {
        startDate = p.earliestActualDate as Date;
      }

      // If no actuals yet, use first month from Assignments
      if (!startDate && project.firstMonth) {
        startDate = project.firstMonth;
      }

      // End: Use last month from Assignments (end of month)
      if (project.lastMonth) {
        const lastMonth = new Date(project.lastMonth);
        endDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
      }

      // Skip if we can't determine timeline
      if (!startDate || !endDate) {
        continue;
      }

      // Calculate metrics
      const totalPlannedHours = project.totalPlannedHours;
      const totalActualHours = (p.totalActualHours as number) || 0;
      const billRate = (p.weightedBillRate as number) || 0;
      const dealValue = (p.dealValue as number) || 0;

      // Fees to date (real-time calculation from hours × rate)
      const feesToDate = totalActualHours * billRate;

      // Planned revenue
      const plannedRevenue = totalPlannedHours * billRate;

      // Plan / Booked % (N/A if no Pipedrive match)
      const planBookedPct =
        hasPipedriveMatch && dealValue > 0 ? (plannedRevenue / dealValue) * 100 : 0;

      // Fees / Booked % (N/A if no Pipedrive match)
      const feesBookedPct =
        hasPipedriveMatch && dealValue > 0 ? (feesToDate / dealValue) * 100 : 0;

      // % of Duration (days-based)
      const totalDays = Math.floor(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const elapsedDays = Math.floor(
        (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      let durationPct = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0;

      // Cap at 100% if project is completed
      if (today > endDate) {
        durationPct = 100;
      } else if (today < startDate) {
        durationPct = 0;
      }

      // Status
      const projectStatus = getProjectStatus(startDate, endDate, today);

      // Calculate timeline display
      const startMonth = startDate.toLocaleString("default", { month: "short" });
      const endMonth = endDate.toLocaleString("default", { month: "short" });
      const durationMonths = Math.round(totalDays / 30);
      const timeline = `${startMonth}-${endMonth}(${durationMonths})`;

      results.push({
        projectId: project.projectId,
        client: project.client,
        projectName: project.projectName,
        timeline,
        booking: dealValue,
        plannedRevenue,
        feesToDate,
        planBookedPct,
        feesBookedPct,
        durationPct,
        projectStatus,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totalPlannedHours,
        totalActualHours,
        hasPipedriveMatch,
      });
    }

    // Apply status filter
    let filteredResults = results;
    if (statusFilter === "Active Only") {
      filteredResults = results.filter((r) => r.projectStatus === "Active");
    } else if (statusFilter === "Completed Only") {
      filteredResults = results.filter((r) => r.projectStatus === "Completed");
    } else if (statusFilter === "Not Started") {
      filteredResults = results.filter((r) => r.projectStatus === "Not Started");
    }

    // Calculate summary metrics (only for projects with Pipedrive matches)
    const projectsWithPipedrive = filteredResults.filter((r) => r.hasPipedriveMatch);
    const projectsWithoutPipedrive = filteredResults.filter((r) => !r.hasPipedriveMatch);

    const scopingErrors = projectsWithPipedrive.filter(
      (r) => r.planBookedPct < 85 || r.planBookedPct > 120
    ).length;
    const overBilled = projectsWithPipedrive.filter(
      (r) => r.feesBookedPct > 100
    ).length;
    const underBilled = projectsWithPipedrive.filter(
      (r) => r.durationPct > 50 && r.feesBookedPct < 50
    ).length;
    const totalBooking = projectsWithPipedrive.reduce((sum, r) => sum + r.booking, 0);

    return NextResponse.json({
      success: true,
      projects: filteredResults,
      summary: {
        scopingErrors,
        overBilled,
        underBilled,
        totalBooking,
        projectCount: filteredResults.length,
        projectsWithPipedrive: projectsWithPipedrive.length,
        projectsWithoutPipedrive: projectsWithoutPipedrive.length,
      },
      metadata: {
        assignmentCount: assignments.length,
        dealCount: pipedriveDeals.length,
        bigTimeEntryCount: filteredBtTime.length,
      },
    });
  } catch (error) {
    console.error("Project health error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
