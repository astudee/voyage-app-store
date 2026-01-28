import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

// Types
interface ClientNameMapping {
  BEFORE_NAME: string;
  AFTER_NAME: string;
}

interface ClientStateMapping {
  CLIENT_NAME: string;
  YEAR: number;
  STATE_CODE: string;
}

interface QBTransaction {
  TransactionDate: string;
  Customer: string;
  Amount: number;
  Memo: string;
}

// QuickBooks token management
async function getQuickBooksToken(): Promise<string | null> {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  const refreshToken = process.env.QB_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.log("QuickBooks credentials not configured");
    return null;
  }

  const authStr = `${clientId}:${clientSecret}`;
  const authB64 = Buffer.from(authStr).toString("base64");

  try {
    const response = await fetch(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authB64}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.access_token;
    } else {
      console.error("QB token refresh failed:", await response.text());
      return null;
    }
  } catch (error) {
    console.error("QB token error:", error);
    return null;
  }
}

// Fetch QuickBooks consulting income with full details
async function fetchQuickBooksIncome(year: number): Promise<QBTransaction[]> {
  const token = await getQuickBooksToken();
  const realmId = process.env.QB_REALM_ID;

  if (!token || !realmId) {
    console.log("QuickBooks not available - token:", !!token, "realmId:", !!realmId);
    return [];
  }

  const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLossDetail`;
  const params = new URLSearchParams({
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    accounting_method: "Cash",
    minorversion: "65",
  });

  try {
    const response = await fetch(`${url}?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error("QB report error:", response.status);
      return [];
    }

    const reportData = await response.json();
    const transactions: QBTransaction[] = [];

    // Find Consulting Income section and extract transactions
    function findConsultingIncome(rows: Array<Record<string, unknown>>): Record<string, unknown> | null {
      for (const row of rows) {
        if (row && typeof row === 'object' && 'Header' in row) {
          const header = row.Header as { ColData?: Array<{ value?: string }> };
          const colData = header?.ColData;
          if (colData && colData[0]?.value?.includes("Consulting Income")) {
            return row;
          }
        }
        if (row && typeof row === 'object' && 'Rows' in row) {
          const rowData = row.Rows as { Row?: Array<Record<string, unknown>> };
          if (rowData?.Row) {
            const result = findConsultingIncome(rowData.Row);
            if (result) return result;
          }
        }
      }
      return null;
    }

    const rows = (reportData?.Rows?.Row as Array<Record<string, unknown>>) || [];
    const consultingSection = findConsultingIncome(rows);

    if (consultingSection && typeof consultingSection === 'object' && 'Rows' in consultingSection) {
      const sectionRows = consultingSection.Rows as { Row?: Array<Record<string, unknown>> };
      const detailRows = sectionRows?.Row || [];
      for (const row of detailRows) {
        if (row && typeof row === 'object' && row.type === "Data" && 'ColData' in row) {
          const cols = row.ColData as Array<{ value?: string }>;
          if (cols && cols.length >= 7) {
            // Column order: Date, Transaction Type, Num, Name/Customer, Memo/Description, Split, Amount
            transactions.push({
              TransactionDate: cols[0]?.value || "",
              Customer: cols[3]?.value || "",
              Memo: cols[4]?.value || "",
              Amount: parseFloat(cols[6]?.value || "0"),
            });
          }
        }
      }
    }

    console.log(`QB: Found ${transactions.length} consulting income transactions for ${year}`);
    return transactions;
  } catch (error) {
    console.error("QB fetch error:", error);
    return [];
  }
}

// Load client name mappings from Snowflake
async function loadClientNameMappings(): Promise<Record<string, string>> {
  const mappings = await query<ClientNameMapping>(`
    SELECT BEFORE_NAME, AFTER_NAME
    FROM VC_CLIENT_NAME_MAPPING
    WHERE SOURCE_SYSTEM = 'QuickBooks'
  `);

  const map: Record<string, string> = {};
  for (const m of mappings) {
    map[m.BEFORE_NAME] = m.AFTER_NAME;
  }
  return map;
}

// Load client state mappings from Snowflake
async function loadClientStateMappings(year: number): Promise<Record<string, string>> {
  try {
    const mappings = await query<ClientStateMapping>(`
      SELECT CLIENT_NAME, YEAR, STATE_CODE
      FROM VC_CLIENT_STATE_MAPPING
      WHERE YEAR = ?
    `, [year]);

    const map: Record<string, string> = {};
    for (const m of mappings) {
      map[m.CLIENT_NAME] = m.STATE_CODE;
    }
    return map;
  } catch (error) {
    // Table might not exist yet - that's OK, just return empty map
    console.error("Error loading state mappings (table may not exist yet):", error);
    return {};
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || "2025");

  try {
    // Load QuickBooks data and client name mappings first
    const [qbTransactions, clientNameMap] = await Promise.all([
      fetchQuickBooksIncome(year),
      loadClientNameMappings(),
    ]);

    // Load state mappings separately (to avoid any Snowflake interference)
    const clientStateMap = await loadClientStateMappings(year);

    // Group transactions by client
    const clientData: Map<string, {
      revenue: number;
      transactions: number;
      details: Array<{ date: string; amount: number; memo: string }>;
    }> = new Map();

    for (const tx of qbTransactions) {
      const txYear = new Date(tx.TransactionDate).getFullYear();
      if (txYear !== year) continue;

      // Parse client name (split on ":" and take first part)
      const clientRaw = tx.Customer.split(":")[0].trim();
      const clientNormalized = clientNameMap[clientRaw] || clientRaw;

      const existing = clientData.get(clientNormalized) || {
        revenue: 0,
        transactions: 0,
        details: [],
      };
      existing.revenue += tx.Amount;
      existing.transactions += 1;
      existing.details.push({
        date: tx.TransactionDate,
        amount: tx.Amount,
        memo: tx.Memo,
      });
      clientData.set(clientNormalized, existing);
    }

    // Convert to array sorted by revenue, include state
    const clientRevenue = Array.from(clientData.entries())
      .map(([client, data]) => ({
        client,
        state: clientStateMap[client] || null,
        revenue: Math.round(data.revenue * 100) / 100,
        transactions: data.transactions,
        details: data.details.sort((a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
        ),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Calculate totals
    const totalRevenue = clientRevenue.reduce((sum, c) => sum + c.revenue, 0);
    const totalTransactions = clientRevenue.reduce((sum, c) => sum + c.transactions, 0);

    // Calculate revenue by state
    const stateRevenue: Map<string, { revenue: number; clients: number }> = new Map();
    for (const client of clientRevenue) {
      const state = client.state || "Unassigned";
      const existing = stateRevenue.get(state) || { revenue: 0, clients: 0 };
      existing.revenue += client.revenue;
      existing.clients += 1;
      stateRevenue.set(state, existing);
    }

    const revenueByState = Array.from(stateRevenue.entries())
      .map(([state, data]) => ({
        state,
        revenue: Math.round(data.revenue * 100) / 100,
        clients: data.clients,
        percentage: Math.round((data.revenue / totalRevenue) * 1000) / 10,
      }))
      .sort((a, b) => {
        // Put "Unassigned" at the end, then sort alphabetically by state
        if (a.state === "Unassigned") return 1;
        if (b.state === "Unassigned") return -1;
        return a.state.localeCompare(b.state);
      });

    return NextResponse.json({
      year,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalTransactions,
      clientCount: clientRevenue.length,
      clients: clientRevenue,
      revenueByState,
      debug: {
        qbTransactionsCount: qbTransactions.length,
        clientNameMapCount: Object.keys(clientNameMap).length,
        clientStateMapCount: Object.keys(clientStateMap).length,
        qbConfigured: !!(process.env.QB_CLIENT_ID && process.env.QB_CLIENT_SECRET && process.env.QB_REFRESH_TOKEN && process.env.QB_REALM_ID),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Revenue by client error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
