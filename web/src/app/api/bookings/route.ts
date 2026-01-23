import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface PipedriveDeal {
  id: number;
  title: string;
  value: number;
  won_time: string;
  org_id: { name: string } | null;
  [key: string]: unknown;
}

interface CustomFieldMap {
  bigtime_client_id?: string;
  bigtime_project_id?: string;
  bill_rate?: string;
  budget_hours?: string;
  project_duration?: string;
  project_start_date?: string;
}

interface Booking {
  id: number;
  client: string;
  dealName: string;
  closeDate: string;
  dealValue: number;
  projectDuration: number | null;
  bigtimeClientId: string | null;
  bigtimeProjectId: string | null;
  billRate: number | null;
  budgetHours: number | null;
  projectStartDate: string | null;
  period: string;
}

async function fetchCustomFieldKeys(apiToken: string): Promise<CustomFieldMap> {
  const response = await fetch(
    `https://api.pipedrive.com/v1/dealFields?api_token=${apiToken}`,
    { method: "GET" }
  );

  if (!response.ok) return {};

  const data = await response.json();
  if (!data.success) return {};

  const fieldMap: CustomFieldMap = {};
  for (const field of data.data || []) {
    const name = (field.name || "").toLowerCase();
    const key = field.key;

    if (name.includes("bigtime client id")) fieldMap.bigtime_client_id = key;
    else if (name.includes("bigtime project id") || name.includes("project id")) fieldMap.bigtime_project_id = key;
    else if (name.includes("bill rate")) fieldMap.bill_rate = key;
    else if (name.includes("budget hours") || name.includes("total budget hours")) fieldMap.budget_hours = key;
    else if (name.includes("project duration") || name.includes("duration")) fieldMap.project_duration = key;
    else if (name.includes("project start date") || name.includes("start date")) fieldMap.project_start_date = key;
  }

  return fieldMap;
}

async function fetchWonDeals(
  apiToken: string,
  startDate: string,
  endDate: string
): Promise<PipedriveDeal[]> {
  const allDeals: PipedriveDeal[] = [];
  let start = 0;
  const limit = 500;

  while (true) {
    const response = await fetch(
      `https://api.pipedrive.com/v1/deals?api_token=${apiToken}&status=won&start=${start}&limit=${limit}`,
      { method: "GET" }
    );

    if (!response.ok) {
      throw new Error(`Pipedrive API error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(`Pipedrive error: ${data.error || "Unknown"}`);
    }

    const deals = data.data || [];
    if (deals.length === 0) break;

    allDeals.push(...deals);

    const pagination = data.additional_data?.pagination;
    if (!pagination?.more_items_in_collection) break;
    start = pagination.next_start || 0;
  }

  // Filter by won_time date range
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);

  return allDeals.filter((deal) => {
    if (!deal.won_time) return false;
    const wonDate = new Date(deal.won_time.split(" ")[0]);
    return wonDate >= startDateObj && wonDate <= endDateObj;
  });
}

function formatPeriod(dateStr: string, viewBy: string): string {
  const date = new Date(dateStr);
  if (viewBy === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  } else if (viewBy === "quarter") {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `${date.getFullYear()}Q${quarter}`;
  } else {
    return String(date.getFullYear());
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const apiToken = process.env.PIPEDRIVE_API_TOKEN;
    if (!apiToken) {
      return NextResponse.json({ error: "Pipedrive API token not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate") || new Date().toISOString().slice(0, 10);
    const endDate = searchParams.get("endDate") || new Date().toISOString().slice(0, 10);
    const viewBy = searchParams.get("viewBy") || "month";

    // Fetch custom field mappings and deals in parallel
    const [customFields, deals] = await Promise.all([
      fetchCustomFieldKeys(apiToken),
      fetchWonDeals(apiToken, startDate, endDate),
    ]);

    // Process deals into bookings
    const bookings: Booking[] = deals.map((deal) => {
      const closeDate = deal.won_time ? deal.won_time.split(" ")[0] : "";

      return {
        id: deal.id,
        client: deal.org_id?.name || "Unknown",
        dealName: deal.title || "Untitled",
        closeDate,
        dealValue: deal.value || 0,
        projectDuration: customFields.project_duration
          ? (deal[customFields.project_duration] as number | null)
          : null,
        bigtimeClientId: customFields.bigtime_client_id
          ? (deal[customFields.bigtime_client_id] as string | null)
          : null,
        bigtimeProjectId: customFields.bigtime_project_id
          ? (deal[customFields.bigtime_project_id] as string | null)
          : null,
        billRate: customFields.bill_rate
          ? (deal[customFields.bill_rate] as number | null)
          : null,
        budgetHours: customFields.budget_hours
          ? (deal[customFields.budget_hours] as number | null)
          : null,
        projectStartDate: customFields.project_start_date
          ? (deal[customFields.project_start_date] as string | null)
          : null,
        period: formatPeriod(closeDate, viewBy),
      };
    });

    // Sort by close date
    bookings.sort((a, b) => a.closeDate.localeCompare(b.closeDate));

    // Calculate period summary
    const periodMap = new Map<string, { count: number; value: number; clients: Set<string> }>();
    for (const booking of bookings) {
      const existing = periodMap.get(booking.period) || { count: 0, value: 0, clients: new Set() };
      existing.count++;
      existing.value += booking.dealValue;
      existing.clients.add(booking.client);
      periodMap.set(booking.period, existing);
    }

    const periodSummary = Array.from(periodMap.entries())
      .map(([period, data]) => ({
        period,
        dealCount: data.count,
        totalValue: data.value,
        uniqueClients: data.clients.size,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    // Calculate overall summary
    const uniqueClients = new Set(bookings.map((b) => b.client));
    const summary = {
      totalBookings: bookings.length,
      totalValue: bookings.reduce((sum, b) => sum + b.dealValue, 0),
      avgDealSize: bookings.length > 0
        ? bookings.reduce((sum, b) => sum + b.dealValue, 0) / bookings.length
        : 0,
      uniqueClients: uniqueClients.size,
    };

    return NextResponse.json({
      startDate,
      endDate,
      viewBy,
      summary,
      periodSummary,
      bookings,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Bookings tracker error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
