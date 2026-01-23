import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

// Types
interface CommissionRule {
  RULE_SCOPE: string;
  CLIENT_OR_RESOURCE: string;
  SALESPERSON: string;
  CATEGORY: string;
  RATE: number;
  START_DATE: string;
  END_DATE: string | null;
  NOTE: string | null;
}

interface CommissionOffset {
  EFFECTIVE_DATE: string;
  SALESPERSON: string;
  CATEGORY: string;
  AMOUNT: number;
  NOTE: string | null;
}

interface ClientNameMapping {
  BEFORE_NAME: string;
  AFTER_NAME: string;
  SOURCE_SYSTEM: string;
}

interface QBTransaction {
  TransactionDate: string;
  Customer: string;
  Amount: number;
}

interface BTTimeEntry {
  staffName: string;
  clientName: string;
  date: string;
  revenue: number;
}

interface CommissionRecord {
  salesperson: string;
  client: string;
  category: string;
  invoiceDate: string;
  invoiceAmount: number;
  commissionRate: number;
  commissionAmount: number;
  source: string;
}

interface SalespersonSummary {
  salesperson: string;
  totalCommission: number;
  totalDue: number;
  byCategory: { category: string; amount: number }[];
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

// Fetch QuickBooks consulting income
async function fetchQuickBooksIncome(year: number): Promise<QBTransaction[]> {
  const token = await getQuickBooksToken();
  const realmId = process.env.QB_REALM_ID;

  if (!token || !realmId) {
    console.log("QuickBooks not available");
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
            transactions.push({
              TransactionDate: cols[0]?.value || "",
              Customer: cols[3]?.value || "",
              Amount: parseFloat(cols[6]?.value || "0"),
            });
          }
        }
      }
    }

    console.log(`QB: Found ${transactions.length} consulting income transactions`);
    return transactions;
  } catch (error) {
    console.error("QB fetch error:", error);
    return [];
  }
}

// Fetch BigTime time report
async function fetchBigTimeData(year: number): Promise<BTTimeEntry[]> {
  const apiKey = process.env.BIGTIME_API_KEY;
  const firmId = process.env.BIGTIME_FIRM_ID;

  if (!apiKey || !firmId) {
    console.log("BigTime not configured");
    return [];
  }

  const url = `https://iq.bigtime.net/BigtimeData/api/v2/report/data/284796`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Auth-ApiToken": apiKey,
        "X-Auth-Realm": firmId,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        DT_BEGIN: `${year}-01-01`,
        DT_END: `${year}-12-31`,
      }),
    });

    if (!response.ok) {
      console.error("BigTime error:", response.status);
      return [];
    }

    const reportData = await response.json();
    const dataRows = reportData?.Data || [];
    const fieldList = reportData?.FieldList || [];

    // Find column indices
    const columnNames: string[] = fieldList.map((f: { FieldNm: string }) => f.FieldNm);
    const staffIdx = columnNames.indexOf("tmstaffnm");
    const clientIdx = columnNames.indexOf("tmclientnm");
    const revenueIdx = columnNames.indexOf("tmchgbillbase");
    const dateIdx = columnNames.indexOf("tmdt");

    const entries: BTTimeEntry[] = [];
    for (const row of dataRows) {
      const entry: BTTimeEntry = {
        staffName: staffIdx >= 0 ? row[staffIdx] || "" : "",
        clientName: clientIdx >= 0 ? row[clientIdx] || "" : "",
        date: dateIdx >= 0 ? row[dateIdx] || "" : "",
        revenue: revenueIdx >= 0 ? parseFloat(row[revenueIdx] || "0") : 0,
      };
      entries.push(entry);
    }

    console.log(`BigTime: Found ${entries.length} time entries`);
    return entries;
  } catch (error) {
    console.error("BigTime fetch error:", error);
    return [];
  }
}

// Load config from Snowflake
async function loadConfig() {
  const [rules, offsets, mappings] = await Promise.all([
    query<CommissionRule>(`
      SELECT RULE_SCOPE, CLIENT_OR_RESOURCE, SALESPERSON, CATEGORY,
             RATE, START_DATE, END_DATE, NOTE
      FROM VC_COMMISSION_RULES
      WHERE IS_ACTIVE = TRUE
    `),
    query<CommissionOffset>(`
      SELECT EFFECTIVE_DATE, SALESPERSON, CATEGORY, AMOUNT, NOTE
      FROM VC_COMMISSION_OFFSETS
    `),
    query<ClientNameMapping>(`
      SELECT BEFORE_NAME, AFTER_NAME, SOURCE_SYSTEM
      FROM VC_CLIENT_NAME_MAPPING
      WHERE SOURCE_SYSTEM = 'QuickBooks'
    `),
  ]);

  return { rules, offsets, mappings };
}

// Parse accounting format amounts (handles parentheses for negative)
function parseAccountingAmount(val: string | number | null): number {
  if (val === null || val === undefined) return 0;
  const valStr = String(val).trim();
  const isNegative = valStr.startsWith("(") && valStr.endsWith(")");
  const valClean = valStr.replace(/[(),$]/g, "").trim();
  const amount = parseFloat(valClean) || 0;
  return isNegative ? -amount : amount;
}

// Main calculation
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());

  try {
    // Load config and API data in parallel
    const [config, qbTransactions, btEntries] = await Promise.all([
      loadConfig(),
      fetchQuickBooksIncome(year),
      fetchBigTimeData(year),
    ]);

    const { rules, offsets, mappings } = config;
    const commissionRecords: CommissionRecord[] = [];

    // Build client name mapping
    const clientNameMap: Record<string, string> = {};
    for (const m of mappings) {
      clientNameMap[m.BEFORE_NAME] = m.AFTER_NAME;
    }

    // Process QuickBooks transactions (client commissions)
    const clientRules = rules.filter((r) => r.RULE_SCOPE === "client");

    for (const tx of qbTransactions) {
      const txDate = new Date(tx.TransactionDate);
      const txYear = txDate.getFullYear();
      if (txYear !== year) continue;

      // Parse client name (split on ":" and take first part)
      const clientRaw = tx.Customer.split(":")[0].trim();
      const clientNormalized = clientNameMap[clientRaw] || clientRaw;

      // Find applicable rules
      for (const rule of clientRules) {
        if (rule.CLIENT_OR_RESOURCE !== clientNormalized) continue;

        const ruleStart = new Date(rule.START_DATE);
        const ruleEnd = rule.END_DATE ? new Date(rule.END_DATE) : null;

        if (txDate >= ruleStart && (!ruleEnd || txDate <= ruleEnd)) {
          const ruleRate = parseFloat(String(rule.RATE)) || 0;
          commissionRecords.push({
            salesperson: rule.SALESPERSON,
            client: clientNormalized,
            category: rule.CATEGORY,
            invoiceDate: tx.TransactionDate,
            invoiceAmount: tx.Amount,
            commissionRate: ruleRate,
            commissionAmount: tx.Amount * ruleRate,
            source: "QuickBooks - Client Commission",
          });
        }
      }
    }

    // Process BigTime entries (resource commissions - aggregated monthly)
    const resourceRules = rules.filter((r) => r.RULE_SCOPE === "resource");
    const monthlyAggregates: Map<string, {
      salesperson: string;
      resource: string;
      client: string;
      category: string;
      yearMonth: string;
      revenue: number;
      rate: number;
    }> = new Map();

    for (const entry of btEntries) {
      if (!entry.staffName || !entry.date || entry.revenue === 0) continue;

      const entryDate = new Date(entry.date);
      const yearMonth = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, "0")}`;

      for (const rule of resourceRules) {
        if (rule.CLIENT_OR_RESOURCE !== entry.staffName) continue;

        const ruleStart = new Date(rule.START_DATE);
        const ruleEnd = rule.END_DATE ? new Date(rule.END_DATE) : null;

        if (entryDate >= ruleStart && (!ruleEnd || entryDate <= ruleEnd)) {
          const ruleRate = parseFloat(String(rule.RATE)) || 0;
          const key = `${rule.SALESPERSON}|${entry.staffName}|${entry.clientName}|${rule.CATEGORY}|${yearMonth}`;

          const existing = monthlyAggregates.get(key);
          if (existing) {
            existing.revenue += entry.revenue;
          } else {
            monthlyAggregates.set(key, {
              salesperson: rule.SALESPERSON,
              resource: entry.staffName,
              client: entry.clientName,
              category: rule.CATEGORY,
              yearMonth,
              revenue: entry.revenue,
              rate: ruleRate,
            });
          }
        }
      }
    }

    // Convert monthly aggregates to commission records
    for (const agg of monthlyAggregates.values()) {
      const [y, m] = agg.yearMonth.split("-");
      const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
      const monthEnd = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;

      const clientDisplay =
        agg.category === "Delivery Commission" && agg.client
          ? `${agg.resource} @ ${agg.client}`
          : agg.resource;

      commissionRecords.push({
        salesperson: agg.salesperson,
        client: clientDisplay,
        category: agg.category,
        invoiceDate: monthEnd,
        invoiceAmount: agg.revenue,
        commissionRate: agg.rate,
        commissionAmount: agg.revenue * agg.rate,
        source: `BigTime - ${agg.category} (Monthly)`,
      });
    }

    // Apply offsets
    const yearOffsets = offsets.filter((o) => {
      const offsetDate = new Date(o.EFFECTIVE_DATE);
      return offsetDate.getFullYear() === year;
    });

    for (const offset of yearOffsets) {
      commissionRecords.push({
        salesperson: offset.SALESPERSON,
        client: "Offset",
        category: offset.CATEGORY,
        invoiceDate: offset.EFFECTIVE_DATE,
        invoiceAmount: 0,
        commissionRate: 0,
        commissionAmount: parseAccountingAmount(offset.AMOUNT),
        source: `Offset - ${offset.NOTE || ""}`,
      });
    }

    // Calculate summaries
    const salespersonTotals: Map<string, { total: number; byCategory: Map<string, number> }> = new Map();

    for (const record of commissionRecords) {
      if (!salespersonTotals.has(record.salesperson)) {
        salespersonTotals.set(record.salesperson, { total: 0, byCategory: new Map() });
      }
      const sp = salespersonTotals.get(record.salesperson)!;
      sp.total += record.commissionAmount;

      const currentCat = sp.byCategory.get(record.category) || 0;
      sp.byCategory.set(record.category, currentCat + record.commissionAmount);
    }

    const summaries: SalespersonSummary[] = [];
    for (const [salesperson, data] of salespersonTotals) {
      const byCategory: { category: string; amount: number }[] = [];
      for (const [category, amount] of data.byCategory) {
        byCategory.push({ category, amount });
      }
      summaries.push({
        salesperson,
        totalCommission: Math.round(data.total * 100) / 100,
        totalDue: Math.max(0, Math.round(data.total * 100) / 100),
        byCategory: byCategory.sort((a, b) => b.amount - a.amount),
      });
    }

    // Calculate revenue by client from QB
    const revenueByClient: Map<string, { revenue: number; count: number }> = new Map();
    for (const tx of qbTransactions) {
      const txYear = new Date(tx.TransactionDate).getFullYear();
      if (txYear !== year) continue;

      const clientRaw = tx.Customer.split(":")[0].trim();
      const clientNormalized = clientNameMap[clientRaw] || clientRaw;

      const existing = revenueByClient.get(clientNormalized) || { revenue: 0, count: 0 };
      existing.revenue += tx.Amount;
      existing.count += 1;
      revenueByClient.set(clientNormalized, existing);
    }

    const clientRevenue = Array.from(revenueByClient.entries())
      .map(([client, data]) => ({ client, revenue: data.revenue, transactions: data.count }))
      .sort((a, b) => b.revenue - a.revenue);

    // Debug info
    const debug = {
      rulesLoaded: rules.length,
      offsetsLoaded: offsets.length,
      mappingsLoaded: mappings.length,
      qbTransactions: qbTransactions.length,
      btEntries: btEntries.length,
      qbTotal: qbTransactions.reduce((sum, tx) => sum + tx.Amount, 0),
      commissionRecords: commissionRecords.length,
    };

    return NextResponse.json({
      year,
      summaries: summaries.sort((a, b) => b.totalCommission - a.totalCommission),
      records: commissionRecords,
      clientRevenue,
      debug,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Commission calculation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
