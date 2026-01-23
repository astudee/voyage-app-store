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

interface FixedFeeEntry {
  PROJECT_ID: number;
  MONTH_DATE: string | Date;
  REVENUE: number;
}

interface PipedriveDeal {
  id: number;
  title: string;
  value: number;
  status: string;
  stage_id: number;
  expected_close_date: string;
  org_id: { name: string } | null;
  [key: string]: unknown;
}

interface PipedriveStage {
  id: number;
  name: string;
  pipeline_id: number;
}

interface BigTimeEntry {
  projectId: number | null;
  hours: number;
  date: string;
}

interface ForecastRow {
  client: string;
  project: string;
  projectId?: string;
  stage?: string;
  factor?: string;
  monthly: Record<string, number>;
}

const BIGTIME_API_KEY = process.env.BIGTIME_API_KEY;
const BIGTIME_FIRM_ID = process.env.BIGTIME_FIRM_ID;
const BIGTIME_REPORT_ID = "284796";
const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;

// Fetch BigTime report for a year
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
  const rows = data.Data || [];
  const fields = data.FieldList || [];

  const colIndex: Record<string, number> = {};
  fields.forEach((field: { FieldNm: string }, idx: number) => {
    colIndex[field.FieldNm] = idx;
  });

  const projectIdIdx = colIndex["tmprojectnm_id"] ?? colIndex["Project_ID"];
  const hoursIdx = colIndex["tmhrsin"] ?? colIndex["Hours"];
  const dateIdx = colIndex["tmdt"] ?? colIndex["Date"];
  const clientIdIdx = colIndex["tmclientnm_id"] ?? colIndex["Client_ID"];

  const entries: BigTimeEntry[] = rows
    .map((row: unknown[]) => ({
      projectId: projectIdIdx !== undefined ? (Number(row[projectIdIdx]) || null) : null,
      clientId: clientIdIdx !== undefined ? (Number(row[clientIdIdx]) || null) : null,
      hours: hoursIdx !== undefined ? (Number(row[hoursIdx]) || 0) : 0,
      date: dateIdx !== undefined ? String(row[dateIdx] || "") : "",
    }))
    .filter((e: { clientId?: number | null; hours: number }) => e.hours !== 0 && e.clientId !== 5556066);

  return entries;
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
    ORDER BY a.PROJECT_ID, a.MONTH_DATE
  `;
  return await query<Assignment>(sql);
}

// Fetch fixed fee entries from Snowflake
async function fetchFixedFee(): Promise<FixedFeeEntry[]> {
  const sql = `
    SELECT PROJECT_ID, MONTH_DATE, REVENUE
    FROM VC_FIXED_FEE
    WHERE REVENUE > 0
  `;
  try {
    return await query<FixedFeeEntry>(sql);
  } catch {
    return [];
  }
}

// Fetch Pipedrive stages
async function fetchPipedriveStages(): Promise<Map<number, PipedriveStage>> {
  const response = await fetch(
    `https://api.pipedrive.com/v1/stages?api_token=${PIPEDRIVE_API_TOKEN}`
  );
  if (!response.ok) return new Map();

  const data = await response.json();
  const stages = new Map<number, PipedriveStage>();
  for (const stage of data.data || []) {
    stages.set(stage.id, stage);
  }
  return stages;
}

// Fetch Pipedrive custom field keys
async function getPipedriveCustomFields(): Promise<Record<string, string>> {
  const response = await fetch(
    `https://api.pipedrive.com/v1/dealFields?api_token=${PIPEDRIVE_API_TOKEN}`
  );
  if (!response.ok) return {};

  const data = await response.json();
  const fields: { key: string; name: string }[] = data.data || [];
  const fieldMap: Record<string, string> = {};

  for (const field of fields) {
    const name = field.name.toLowerCase();
    if (name.includes("project start date") || name.includes("start date")) {
      fieldMap.project_start_date = field.key;
    } else if (name.includes("project duration") || name.includes("duration")) {
      fieldMap.project_duration = field.key;
    }
  }
  return fieldMap;
}

// Fetch Pipedrive open deals
async function fetchPipedriveDeals(): Promise<PipedriveDeal[]> {
  const allDeals: PipedriveDeal[] = [];
  let start = 0;
  const limit = 500;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `https://api.pipedrive.com/v1/deals?api_token=${PIPEDRIVE_API_TOKEN}&status=open&start=${start}&limit=${limit}`
    );
    if (!response.ok) break;

    const data = await response.json();
    allDeals.push(...(data.data || []));
    hasMore = data.additional_data?.pagination?.more_items_in_collection || false;
    start = data.additional_data?.pagination?.next_start || 0;
  }

  return allDeals;
}

// Get stage info with probability
function getDealStageInfo(
  stageName: string,
  probOverrides: { qualified: number; proposal: number; forecast: number }
): { include: boolean; probability: number } {
  const lower = stageName.toLowerCase();

  // Exclude early stages
  if (lower.includes("early") || lower.includes("qualification in progress")) {
    return { include: false, probability: 0 };
  }

  if (lower.includes("forecast")) {
    return { include: true, probability: probOverrides.forecast };
  }
  if (lower.includes("proposal") || lower.includes("sow") || lower.includes("resourcing")) {
    return { include: true, probability: probOverrides.proposal };
  }
  if (lower.includes("qualified")) {
    return { include: true, probability: probOverrides.qualified };
  }

  return { include: true, probability: probOverrides.qualified };
}

function normalizeProjectId(pid: unknown): string | null {
  if (pid === null || pid === undefined || pid === "") return null;
  return String(pid).trim();
}

function generateMonths(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  const start = new Date(startMonth + "-01");
  const end = new Date(endMonth + "-01");

  const current = new Date(start);
  while (current <= end) {
    months.push(current.toISOString().slice(0, 7));
    current.setMonth(current.getMonth() + 1);
  }
  return months;
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
  const startMonth = searchParams.get("startMonth") || new Date().toISOString().slice(0, 7);
  const endMonth = searchParams.get("endMonth") || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7);
  const metricType = searchParams.get("metric") || "revenue"; // "hours" or "revenue"

  // Probability overrides (percentages)
  const probQualified = parseInt(searchParams.get("probQualified") || "33") / 100;
  const probProposal = parseInt(searchParams.get("probProposal") || "50") / 100;
  const probForecast = parseInt(searchParams.get("probForecast") || "75") / 100;

  try {
    const forecastMonths = generateMonths(startMonth, endMonth);
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Determine years needed for BigTime
    const yearsNeeded = new Set<number>();
    for (const m of forecastMonths) {
      yearsNeeded.add(parseInt(m.slice(0, 4)));
    }

    // Fetch all data in parallel
    const [assignments, fixedFee, stages, customFields, ...btByYear] = await Promise.all([
      fetchAssignments(),
      fetchFixedFee(),
      PIPEDRIVE_API_TOKEN ? fetchPipedriveStages() : Promise.resolve(new Map()),
      PIPEDRIVE_API_TOKEN ? getPipedriveCustomFields() : Promise.resolve({} as Record<string, string>),
      ...Array.from(yearsNeeded).map((y) => fetchBigTimeReport(y)),
    ]);

    const btActuals = btByYear.flat();

    // Aggregate BigTime actuals by project and month
    const actualsByProjectMonth: Map<string, Map<string, number>> = new Map();
    for (const entry of btActuals) {
      const projectId = normalizeProjectId(entry.projectId);
      if (!projectId || !entry.date) continue;

      const month = entry.date.slice(0, 7);
      if (!actualsByProjectMonth.has(projectId)) {
        actualsByProjectMonth.set(projectId, new Map());
      }
      const projectActuals = actualsByProjectMonth.get(projectId)!;
      projectActuals.set(month, (projectActuals.get(month) || 0) + entry.hours);
    }

    // Build project data from assignments
    type ProjectData = {
      client: string;
      projectName: string;
      projectId: string;
      monthlyPlan: Map<string, { hours: number; weightedRates: { rate: number; hours: number }[] }>;
    };

    const projects: Map<string, ProjectData> = new Map();

    for (const assignment of assignments) {
      const projectId = normalizeProjectId(assignment.PROJECT_ID);
      if (!projectId) continue;

      if (!projects.has(projectId)) {
        projects.set(projectId, {
          client: assignment.CLIENT_NAME,
          projectName: assignment.PROJECT_NAME,
          projectId,
          monthlyPlan: new Map(),
        });
      }

      const project = projects.get(projectId)!;
      const monthDate = assignment.MONTH_DATE instanceof Date
        ? assignment.MONTH_DATE
        : new Date(assignment.MONTH_DATE);
      const month = monthDate.toISOString().slice(0, 7);
      const hours = assignment.ALLOCATED_HOURS || 0;
      const rate = assignment.BILL_RATE || 0;

      if (!project.monthlyPlan.has(month)) {
        project.monthlyPlan.set(month, { hours: 0, weightedRates: [] });
      }

      const monthPlan = project.monthlyPlan.get(month)!;
      monthPlan.hours += hours;
      if (rate > 0 && hours > 0) {
        monthPlan.weightedRates.push({ rate, hours });
      }
    }

    // Calculate weighted average rates
    for (const project of projects.values()) {
      for (const [, monthPlan] of project.monthlyPlan) {
        if (monthPlan.weightedRates.length > 0) {
          const totalWeighted = monthPlan.weightedRates.reduce((s, r) => s + r.rate * r.hours, 0);
          const totalHours = monthPlan.weightedRates.reduce((s, r) => s + r.hours, 0);
          (monthPlan as Record<string, unknown>).avgRate = totalHours > 0 ? totalWeighted / totalHours : 0;
        } else {
          (monthPlan as Record<string, unknown>).avgRate = 0;
        }
      }
    }

    // Build fixed fee lookup
    const fixedFeeLookup: Map<string, Map<string, number>> = new Map();
    for (const entry of fixedFee) {
      const projectId = normalizeProjectId(entry.PROJECT_ID);
      if (!projectId) continue;

      const monthDate = entry.MONTH_DATE instanceof Date
        ? entry.MONTH_DATE
        : new Date(entry.MONTH_DATE);
      const month = monthDate.toISOString().slice(0, 7);

      if (!fixedFeeLookup.has(projectId)) {
        fixedFeeLookup.set(projectId, new Map());
      }
      fixedFeeLookup.get(projectId)!.set(month, entry.REVENUE);
    }

    // Section 1: Hours-Based Revenue
    const section1: ForecastRow[] = [];
    for (const project of projects.values()) {
      const row: ForecastRow = {
        client: project.client,
        project: project.projectName,
        projectId: project.projectId,
        monthly: {},
      };

      for (const month of forecastMonths) {
        const monthPlan = project.monthlyPlan.get(month);
        const avgRate = (monthPlan as Record<string, unknown>)?.avgRate as number || 0;

        if (month < currentMonth) {
          // Past month - use actuals
          const actuals = actualsByProjectMonth.get(project.projectId)?.get(month) || 0;
          row.monthly[month] = metricType === "hours" ? actuals : actuals * avgRate;
        } else {
          // Current/future - use plan
          const hours = monthPlan?.hours || 0;
          row.monthly[month] = metricType === "hours" ? hours : hours * avgRate;
        }
      }

      section1.push(row);
    }

    // Section 2: Fixed Fee Reflected
    const section2: ForecastRow[] = [];
    for (const project of projects.values()) {
      const row: ForecastRow = {
        client: project.client,
        project: project.projectName,
        projectId: project.projectId,
        monthly: {},
      };

      const isFixedFee = fixedFeeLookup.has(project.projectId);

      for (const month of forecastMonths) {
        const monthPlan = project.monthlyPlan.get(month);
        const avgRate = (monthPlan as Record<string, unknown>)?.avgRate as number || 0;

        if (metricType === "hours") {
          // Hours view - same as section 1
          if (month < currentMonth) {
            row.monthly[month] = actualsByProjectMonth.get(project.projectId)?.get(month) || 0;
          } else {
            row.monthly[month] = monthPlan?.hours || 0;
          }
        } else {
          // Revenue view
          if (isFixedFee) {
            row.monthly[month] = fixedFeeLookup.get(project.projectId)?.get(month) || 0;
          } else {
            if (month < currentMonth) {
              const actuals = actualsByProjectMonth.get(project.projectId)?.get(month) || 0;
              row.monthly[month] = actuals * avgRate;
            } else {
              const hours = monthPlan?.hours || 0;
              row.monthly[month] = hours * avgRate;
            }
          }
        }
      }

      section2.push(row);
    }

    // Sections 3 & 4: Pipeline deals
    const section3: ForecastRow[] = [];
    const section4: ForecastRow[] = [];

    if (PIPEDRIVE_API_TOKEN) {
      const deals = await fetchPipedriveDeals();

      for (const deal of deals) {
        const stageName = stages.get(deal.stage_id)?.name || "Unknown";
        const stageInfo = getDealStageInfo(stageName, { qualified: probQualified, proposal: probProposal, forecast: probForecast });

        if (!stageInfo.include) continue;

        const orgName = typeof deal.org_id === "object" && deal.org_id?.name ? deal.org_id.name : "Unknown";
        const dealValue = deal.value || 0;

        // Determine start period and duration
        let startPeriod: Date;
        let durationMonths = 3;

        const startDateField = customFields.project_start_date;
        const durationField = customFields.project_duration;

        if (startDateField && deal[startDateField]) {
          try {
            startPeriod = new Date(deal[startDateField] as string);
          } catch {
            const closeDate = deal.expected_close_date ? new Date(deal.expected_close_date) : new Date();
            startPeriod = new Date(closeDate);
            startPeriod.setMonth(startPeriod.getMonth() + 1);
          }
        } else {
          const closeDate = deal.expected_close_date ? new Date(deal.expected_close_date) : new Date();
          startPeriod = new Date(closeDate);
          startPeriod.setMonth(startPeriod.getMonth() + 1);
        }

        if (durationField && deal[durationField]) {
          durationMonths = parseInt(String(deal[durationField])) || 3;
        }

        const monthlyRevenue = dealValue / durationMonths;
        const startMonth2 = startPeriod.toISOString().slice(0, 7);

        // Section 3: Unfactored
        const row3: ForecastRow = {
          client: orgName,
          project: deal.title,
          stage: stageName,
          monthly: {},
        };

        // Section 4: Factored
        const row4: ForecastRow = {
          client: orgName,
          project: deal.title,
          stage: stageName,
          factor: `${Math.round(stageInfo.probability * 100)}%`,
          monthly: {},
        };

        for (const month of forecastMonths) {
          // Check if month falls within project duration
          const monthDate = new Date(month + "-01");
          const endPeriod = new Date(startPeriod);
          endPeriod.setMonth(endPeriod.getMonth() + durationMonths);

          if (monthDate >= new Date(startMonth2 + "-01") && monthDate < endPeriod) {
            row3.monthly[month] = metricType === "hours" ? 0 : monthlyRevenue;
            row4.monthly[month] = metricType === "hours" ? 0 : monthlyRevenue * stageInfo.probability;
          } else {
            row3.monthly[month] = 0;
            row4.monthly[month] = 0;
          }
        }

        section3.push(row3);
        section4.push(row4);
      }
    }

    // Section 5: Unified Forecast (Section 2 + Section 4)
    const section5: ForecastRow[] = [];

    // Add won deals from Section 2
    for (const row of section2) {
      section5.push({
        ...row,
        stage: "Won",
        factor: "100%",
      });
    }

    // Add pipeline deals from Section 4
    for (const row of section4) {
      section5.push({ ...row });
    }

    // Calculate totals for each section
    const calcTotals = (rows: ForecastRow[]): Record<string, number> => {
      const totals: Record<string, number> = {};
      for (const month of forecastMonths) {
        totals[month] = rows.reduce((sum, r) => sum + (r.monthly[month] || 0), 0);
      }
      return totals;
    };

    return NextResponse.json({
      success: true,
      months: forecastMonths,
      metricType,
      sections: {
        section1: {
          title: "Section 1: Revenue and Hours Forecast - Based Upon Hours",
          description: "All projects: Revenue = Hours x Bill Rate",
          rows: section1,
          totals: calcTotals(section1),
        },
        section2: {
          title: "Section 2: Revenue and Hours Forecast - Fixed Fees Reflected",
          description: metricType === "hours" ? "Hours view: Same as Section 1" : "Fixed fee projects use scheduled revenue, T&M uses Hours x Rate",
          rows: section2,
          totals: calcTotals(section2),
        },
        section3: {
          title: "Section 3: Higher Probability Deals (Without Factoring)",
          description: "Pipeline deals spread evenly across duration (no probability factoring)",
          rows: section3,
          totals: calcTotals(section3),
        },
        section4: {
          title: "Section 4: Higher Probability Deals (With Factoring)",
          description: `Deal values factored by probability (Forecast=${Math.round(probForecast * 100)}%, Proposal=${Math.round(probProposal * 100)}%, Qualified=${Math.round(probQualified * 100)}%)`,
          rows: section4,
          totals: calcTotals(section4),
        },
        section5: {
          title: "Section 5: Unified Factored Forecast",
          description: "Won deals at 100% + Pipeline deals factored by probability",
          rows: section5,
          totals: calcTotals(section5),
        },
      },
      metadata: {
        projectCount: projects.size,
        pipelineDeals: section3.length,
        bigTimeEntries: btActuals.length,
      },
    });
  } catch (error) {
    console.error("Revenue forecast error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
