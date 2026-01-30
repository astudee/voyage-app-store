import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface PipedriveDeal {
  id: number;
  title: string;
  value: number;
  currency: string;
  status: string;
  won_time: string;
  [key: string]: unknown; // Custom fields have dynamic keys
}

interface PipedriveField {
  key: string;
  name: string;
}

// GET /api/pipedrive/booking?projectId=12345
// Finds a won deal in Pipedrive that matches the BigTime Project ID
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const apiToken = process.env.PIPEDRIVE_API_TOKEN;
  if (!apiToken) {
    return NextResponse.json(
      { found: false, error: "Pipedrive API not configured" },
      { status: 200 }
    );
  }

  try {
    // First, get the custom field key for BigTime Project ID
    const fieldsResponse = await fetch(
      `https://api.pipedrive.com/v1/dealFields?api_token=${apiToken}`
    );

    if (!fieldsResponse.ok) {
      throw new Error("Failed to fetch Pipedrive fields");
    }

    const fieldsData = await fieldsResponse.json();
    const fields: PipedriveField[] = fieldsData.data || [];

    // Find the BigTime Project ID field
    let bigTimeProjectIdKey: string | null = null;
    for (const field of fields) {
      const name = field.name.toLowerCase();
      if (name.includes("bigtime") && name.includes("project") && name.includes("id")) {
        bigTimeProjectIdKey = field.key;
        break;
      }
    }

    if (!bigTimeProjectIdKey) {
      return NextResponse.json(
        { found: false, error: "BigTime Project ID field not found in Pipedrive" },
        { status: 200 }
      );
    }

    // Fetch all won deals
    let allDeals: PipedriveDeal[] = [];
    let start = 0;
    const limit = 500;
    let hasMore = true;

    while (hasMore) {
      const dealsResponse = await fetch(
        `https://api.pipedrive.com/v1/deals?api_token=${apiToken}&status=won&start=${start}&limit=${limit}`
      );

      if (!dealsResponse.ok) {
        throw new Error("Failed to fetch Pipedrive deals");
      }

      const dealsData = await dealsResponse.json();
      const deals: PipedriveDeal[] = dealsData.data || [];
      allDeals = allDeals.concat(deals);

      // Check pagination
      const pagination = dealsData.additional_data?.pagination;
      hasMore = pagination?.more_items_in_collection || false;
      start = pagination?.next_start || 0;
    }

    // Find ALL deals with matching BigTime Project ID and sum their values
    const searchProjectIdStr = String(projectId).trim();
    const matchingDeals: PipedriveDeal[] = [];

    for (const deal of allDeals) {
      const dealProjectId = deal[bigTimeProjectIdKey];
      const dealProjectIdStr = String(dealProjectId || "").trim();

      if (dealProjectIdStr === searchProjectIdStr) {
        matchingDeals.push(deal);
      }
    }

    if (matchingDeals.length > 0) {
      // Sum all deal values
      const totalValue = matchingDeals.reduce((sum, deal) => sum + (deal.value || 0), 0);

      // Get the most recent won time
      const sortedDeals = [...matchingDeals].sort((a, b) =>
        new Date(b.won_time).getTime() - new Date(a.won_time).getTime()
      );
      const mostRecentDeal = sortedDeals[0];

      // Build deal names summary
      const dealNames = matchingDeals.map(d => d.title).join(", ");

      return NextResponse.json({
        found: true,
        dealCount: matchingDeals.length,
        dealId: mostRecentDeal.id,
        dealName: matchingDeals.length > 1
          ? `${matchingDeals.length} deals: ${dealNames}`
          : mostRecentDeal.title,
        dealValue: totalValue,
        currency: mostRecentDeal.currency,
        wonTime: mostRecentDeal.won_time,
        deals: matchingDeals.map(d => ({
          id: d.id,
          title: d.title,
          value: d.value || 0,
          wonTime: d.won_time,
        })),
      });
    }

    // No matching deal found
    return NextResponse.json({
      found: false,
      searchedDeals: allDeals.length,
    });
  } catch (error) {
    console.error("Error fetching Pipedrive data:", error);
    return NextResponse.json(
      { found: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 200 }
    );
  }
}
