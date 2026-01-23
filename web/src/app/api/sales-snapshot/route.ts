import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface PipedriveStage {
  id: number;
  name: string;
  deal_probability: number;
  order_nr: number;
  pipeline_id: number;
}

interface PipedriveDeal {
  id: number;
  title: string;
  value: number;
  status: string;
  stage_id: number;
  expected_close_date: string;
  owner_id: { id: number; name: string } | number | null;
  user_id?: { id: number; name: string } | number | null;
  org_id: { name: string } | null;
}

interface PipedriveUser {
  id: number;
  name: string;
}

interface DealRow {
  client: string;
  deal: string;
  owner: string;
  stage: string;
  stageId: number;
  value: number;
  factoredValue: number;
  probability: number;
  status: string;
}

interface StageTotal {
  count: number;
  value: number;
  factored: number;
}

const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;
const PIPEDRIVE_BASE_URL = "https://api.pipedrive.com/v1";

// Fetch Pipedrive stages
async function fetchStages(): Promise<Map<number, PipedriveStage>> {
  const response = await fetch(
    `${PIPEDRIVE_BASE_URL}/stages?api_token=${PIPEDRIVE_API_TOKEN}`
  );
  if (!response.ok) throw new Error("Failed to fetch stages");

  const data = await response.json();
  const stages = new Map<number, PipedriveStage>();
  for (const stage of data.data || []) {
    stages.set(stage.id, {
      id: stage.id,
      name: stage.name,
      deal_probability: (stage.deal_probability || 0) / 100,
      order_nr: stage.order_nr || 0,
      pipeline_id: stage.pipeline_id,
    });
  }
  return stages;
}

// Fetch Pipedrive users
async function fetchUsers(): Promise<Map<number, string>> {
  const response = await fetch(
    `${PIPEDRIVE_BASE_URL}/users?api_token=${PIPEDRIVE_API_TOKEN}`
  );
  if (!response.ok) return new Map();

  const data = await response.json();
  const users = new Map<number, string>();
  for (const user of data.data || []) {
    users.set(user.id, user.name);
  }
  return users;
}

// Fetch Pipedrive deals with optional date filter
async function fetchDeals(startDate?: string, endDate?: string): Promise<PipedriveDeal[]> {
  const allDeals: PipedriveDeal[] = [];
  let start = 0;
  const limit = 500;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `${PIPEDRIVE_BASE_URL}/deals?api_token=${PIPEDRIVE_API_TOKEN}&start=${start}&limit=${limit}&status=all_not_deleted`
    );
    if (!response.ok) break;

    const data = await response.json();
    allDeals.push(...(data.data || []));
    hasMore = data.additional_data?.pagination?.more_items_in_collection || false;
    start = data.additional_data?.pagination?.next_start || 0;
  }

  // Filter by expected close date if specified
  if (startDate || endDate) {
    return allDeals.filter((deal) => {
      if (!deal.expected_close_date) return false;
      const closeDate = new Date(deal.expected_close_date);
      if (startDate && closeDate < new Date(startDate)) return false;
      if (endDate && closeDate > new Date(endDate)) return false;
      return true;
    });
  }

  return allDeals;
}

// Get quarter dates
function getQuarterDates(year: number, quarter: number): { start: string; end: string } {
  const quarterStarts: Record<number, [number, number]> = {
    1: [0, 1], 2: [3, 1], 3: [6, 1], 4: [9, 1],
  };
  const quarterEnds: Record<number, [number, number]> = {
    1: [2, 31], 2: [5, 30], 3: [8, 30], 4: [11, 31],
  };

  const [startMonth, startDay] = quarterStarts[quarter];
  const [endMonth, endDay] = quarterEnds[quarter];

  return {
    start: new Date(year, startMonth, startDay).toISOString().slice(0, 10),
    end: new Date(year, endMonth, endDay).toISOString().slice(0, 10),
  };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!PIPEDRIVE_API_TOKEN) {
    return NextResponse.json({ error: "Pipedrive API not configured" }, { status: 500 });
  }

  const searchParams = request.nextUrl.searchParams;
  const dateOption = searchParams.get("dateOption") || "thisQuarter";

  // Determine date range
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentQuarter = Math.floor(today.getMonth() / 3) + 1;

  let startDate: string | undefined;
  let endDate: string | undefined;

  switch (dateOption) {
    case "thisQuarter": {
      const dates = getQuarterDates(currentYear, currentQuarter);
      startDate = dates.start;
      endDate = dates.end;
      break;
    }
    case "lastQuarter": {
      let quarter = currentQuarter - 1;
      let year = currentYear;
      if (quarter < 1) { quarter = 4; year--; }
      const dates = getQuarterDates(year, quarter);
      startDate = dates.start;
      endDate = dates.end;
      break;
    }
    case "nextQuarter": {
      let quarter = currentQuarter + 1;
      let year = currentYear;
      if (quarter > 4) { quarter = 1; year++; }
      const dates = getQuarterDates(year, quarter);
      startDate = dates.start;
      endDate = dates.end;
      break;
    }
    case "thisYear":
      startDate = `${currentYear}-01-01`;
      endDate = `${currentYear}-12-31`;
      break;
    case "lastYear":
      startDate = `${currentYear - 1}-01-01`;
      endDate = `${currentYear - 1}-12-31`;
      break;
    case "allDates":
      startDate = undefined;
      endDate = undefined;
      break;
    case "custom":
      startDate = searchParams.get("startDate") || undefined;
      endDate = searchParams.get("endDate") || undefined;
      break;
  }

  try {
    // Fetch data in parallel
    const [stages, users, deals] = await Promise.all([
      fetchStages(),
      fetchUsers(),
      fetchDeals(startDate, endDate),
    ]);

    // Sort stages by order, but put Lost last
    const orderedStages = Array.from(stages.values()).sort((a, b) => {
      const aIsLost = a.name.toLowerCase().includes("lost");
      const bIsLost = b.name.toLowerCase().includes("lost");
      if (aIsLost && !bIsLost) return 1;
      if (!aIsLost && bIsLost) return -1;
      return a.order_nr - b.order_nr;
    });

    // Process deals
    const stageTotals: Map<number, StageTotal> = new Map();
    for (const stage of orderedStages) {
      stageTotals.set(stage.id, { count: 0, value: 0, factored: 0 });
    }

    const dealRows: DealRow[] = [];

    for (const deal of deals) {
      const value = deal.value || 0;
      const status = deal.status || "open";

      // Determine owner
      let ownerName = "Unknown";
      if (typeof deal.owner_id === "object" && deal.owner_id?.name) {
        ownerName = deal.owner_id.name;
      } else if (typeof deal.owner_id === "number") {
        ownerName = users.get(deal.owner_id) || "Unknown";
      } else if (typeof deal.user_id === "object" && deal.user_id?.name) {
        ownerName = deal.user_id.name;
      } else if (typeof deal.user_id === "number") {
        ownerName = users.get(deal.user_id) || "Unknown";
      }

      // Determine stage and probability
      let stageId = deal.stage_id;
      let stageName = stages.get(stageId)?.name || "Unknown";
      let probability = stages.get(stageId)?.deal_probability || 0;

      if (status === "lost") {
        stageName = "Lost";
        probability = 0;
        // Find lost stage ID
        const lostStage = orderedStages.find((s) => s.name.toLowerCase().includes("lost"));
        if (lostStage) stageId = lostStage.id;
      } else if (status === "won") {
        stageName = "Won";
        probability = 1;
        const wonStage = orderedStages.find((s) => s.name.toLowerCase().includes("won"));
        if (wonStage) stageId = wonStage.id;
      }

      const factoredValue = value * probability;
      const client = typeof deal.org_id === "object" ? deal.org_id?.name || "" : "";

      dealRows.push({
        client,
        deal: deal.title,
        owner: ownerName,
        stage: stageName,
        stageId,
        value,
        factoredValue,
        probability,
        status,
      });

      // Update stage totals
      const totals = stageTotals.get(stageId);
      if (totals) {
        totals.count++;
        totals.value += value;
        totals.factored += factoredValue;
      }
    }

    // Sort deals: Won first, then by stage order, then by value descending
    const stagePriority = (stageName: string, status: string): number => {
      const lower = stageName.toLowerCase();
      if (status === "won" || lower.includes("won")) return 0;
      if (lower.includes("forecast")) return 1;
      if (lower.includes("proposal") || lower.includes("sow") || lower.includes("resourcing")) return 2;
      if (lower === "qualified") return 3;
      if (lower.includes("qualification")) return 4;
      if (lower.includes("early")) return 5;
      if (status === "lost" || lower.includes("lost")) return 99;
      return 50;
    };

    dealRows.sort((a, b) => {
      const aPriority = stagePriority(a.stage, a.status);
      const bPriority = stagePriority(b.stage, b.status);
      if (aPriority !== bPriority) return aPriority - bPriority;
      return b.value - a.value;
    });

    // Calculate summary metrics
    const allDealsCount = dealRows.length;
    const allDealsValue = dealRows.reduce((sum, d) => sum + d.value, 0);
    const allDealsFactored = dealRows.reduce((sum, d) => sum + d.factoredValue, 0);

    // Qualified or later pipeline (Qualified, Proposal, SOW, Resourcing, Forecast - not Won/Lost)
    const qualifiedStageNames = ["qualified", "proposal", "sow", "resourcing", "forecast"];
    const qualifiedDeals = dealRows.filter((d) => {
      const lower = d.stage.toLowerCase();
      return d.status === "open" &&
        qualifiedStageNames.some((q) => lower.includes(q)) &&
        !lower.includes("won") &&
        !lower.includes("lost");
    });
    const qualifiedCount = qualifiedDeals.length;
    const qualifiedValue = qualifiedDeals.reduce((sum, d) => sum + d.value, 0);
    const qualifiedFactored = qualifiedDeals.reduce((sum, d) => sum + d.factoredValue, 0);

    // Booked (Won) deals
    const bookedDeals = dealRows.filter((d) => d.status === "won");
    const bookedCount = bookedDeals.length;
    const bookedValue = bookedDeals.reduce((sum, d) => sum + d.value, 0);

    // Build stage summary
    const stageSummary = orderedStages.map((stage) => {
      const totals = stageTotals.get(stage.id) || { count: 0, value: 0, factored: 0 };
      return {
        id: stage.id,
        name: stage.name,
        probability: Math.round(stage.deal_probability * 100),
        count: totals.count,
        value: totals.value,
        factored: totals.factored,
      };
    });

    // Owner summary
    const ownerMap = new Map<string, Map<number, { value: number; count: number }>>();
    for (const deal of dealRows) {
      if (!ownerMap.has(deal.owner)) {
        ownerMap.set(deal.owner, new Map());
      }
      const ownerStages = ownerMap.get(deal.owner)!;
      if (!ownerStages.has(deal.stageId)) {
        ownerStages.set(deal.stageId, { value: 0, count: 0 });
      }
      const stageData = ownerStages.get(deal.stageId)!;
      stageData.value += deal.value;
      stageData.count++;
    }

    const ownerSummary = Array.from(ownerMap.entries())
      .map(([owner, stagesMap]) => {
        const stageData: Record<string, { value: number; count: number }> = {};
        let totalValue = 0;
        let totalCount = 0;

        for (const stage of orderedStages) {
          const data = stagesMap.get(stage.id) || { value: 0, count: 0 };
          stageData[stage.name] = data;
          totalValue += data.value;
          totalCount += data.count;
        }

        return {
          owner,
          stages: stageData,
          totalValue,
          totalCount,
        };
      })
      .sort((a, b) => a.owner.localeCompare(b.owner));

    return NextResponse.json({
      success: true,
      dateRange: {
        option: dateOption,
        start: startDate,
        end: endDate,
      },
      summary: {
        allDeals: { count: allDealsCount, value: allDealsValue, factored: allDealsFactored },
        qualified: { count: qualifiedCount, value: qualifiedValue, factored: qualifiedFactored },
        booked: { count: bookedCount, value: bookedValue },
      },
      stages: stageSummary,
      deals: dealRows,
      owners: ownerSummary,
      metadata: {
        stageCount: stages.size,
        dealCount: deals.length,
      },
    });
  } catch (error) {
    console.error("Sales snapshot error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
