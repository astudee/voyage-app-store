"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";

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

interface StageSummary {
  id: number;
  name: string;
  probability: number;
  count: number;
  value: number;
  factored: number;
}

interface OwnerSummary {
  owner: string;
  stages: Record<string, { value: number; count: number }>;
  totalValue: number;
  totalCount: number;
}

interface SnapshotData {
  dateRange: {
    option: string;
    start?: string;
    end?: string;
  };
  summary: {
    allDeals: { count: number; value: number; factored: number };
    qualified: { count: number; value: number; factored: number };
    booked: { count: number; value: number };
  };
  stages: StageSummary[];
  deals: DealRow[];
  owners: OwnerSummary[];
  metadata: {
    stageCount: number;
    dealCount: number;
  };
}

type DateOption = "thisQuarter" | "lastQuarter" | "nextQuarter" | "thisYear" | "lastYear" | "allDates" | "custom";

const dateOptionLabels: Record<DateOption, string> = {
  thisQuarter: "This Quarter",
  lastQuarter: "Last Quarter",
  nextQuarter: "Next Quarter",
  thisYear: "This Year",
  lastYear: "Last Year",
  allDates: "All Dates",
  custom: "Custom Range",
};

export default function SalesSnapshotPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SnapshotData | null>(null);
  const [dateOption, setDateOption] = useState<DateOption>("thisQuarter");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const generateReport = async () => {
    setLoading(true);
    setData(null);

    try {
      const params = new URLSearchParams({ dateOption });
      if (dateOption === "custom" && customStart && customEnd) {
        params.set("startDate", customStart);
        params.set("endDate", customEnd);
      }

      const response = await fetch(`/api/sales-snapshot?${params}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate report");
      }

      const result = await response.json();
      setData(result);
      toast.success("Report generated!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate report";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  };

  const exportToExcel = () => {
    if (!data) return;

    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      { Metric: "% Factor", ...Object.fromEntries(data.stages.map((s) => [s.name, `${s.probability}%`])), Total: "" },
      { Metric: "# Deals", ...Object.fromEntries(data.stages.map((s) => [s.name, s.count])), Total: data.summary.allDeals.count },
      { Metric: "$ Pipeline", ...Object.fromEntries(data.stages.map((s) => [s.name, s.value])), Total: data.summary.allDeals.value },
      { Metric: "$ Pipeline (Factored)", ...Object.fromEntries(data.stages.map((s) => [s.name, s.factored])), Total: data.summary.allDeals.factored },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Summary");

    // Deal details sheet
    const dealData = data.deals.map((d) => {
      const row: Record<string, string | number> = {
        Client: d.client,
        Deal: d.deal,
        Owner: d.owner,
      };
      for (const stage of data.stages) {
        row[stage.name] = d.stageId === stage.id ? d.value : "";
      }
      row.Total = d.value;
      return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dealData), "Deal_Details");

    // Owner details sheet
    const ownerData = data.owners.map((o) => {
      const row: Record<string, string | number> = { Owner: o.owner };
      for (const stage of data.stages) {
        const sd = o.stages[stage.name];
        row[stage.name] = sd && sd.value > 0 ? `$${sd.value.toLocaleString()} (${sd.count})` : "";
      }
      row.Total = `$${o.totalValue.toLocaleString()} (${o.totalCount})`;
      return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ownerData), "Owner_Details");

    // Metrics sheet
    const metrics = [
      { Metric: "Report Date", Value: new Date().toLocaleDateString() },
      { Metric: "Date Range", Value: data.dateRange.start ? `${data.dateRange.start} to ${data.dateRange.end}` : "All Dates" },
      { Metric: "All Deals - Count", Value: data.summary.allDeals.count },
      { Metric: "All Deals - $ Pipeline", Value: data.summary.allDeals.value },
      { Metric: "All Deals - $ Factored", Value: data.summary.allDeals.factored },
      { Metric: "Qualified Pipeline - Count", Value: data.summary.qualified.count },
      { Metric: "Qualified Pipeline - $ Pipeline", Value: data.summary.qualified.value },
      { Metric: "Qualified Pipeline - $ Factored", Value: data.summary.qualified.factored },
      { Metric: "Booked Deals - Count", Value: data.summary.booked.count },
      { Metric: "Booked Deals - $ Pipeline", Value: data.summary.booked.value },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metrics), "Metrics");

    const filename = `sales_snapshot_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Report downloaded!");
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px]">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Sales Snapshot</h1>
          <p className="text-gray-500 mt-1">
            Pipeline report by deal stage with probability factoring
          </p>
        </div>

        {/* Configuration */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Date Range</h3>

          <div className="flex flex-wrap gap-2 mb-4">
            {(Object.keys(dateOptionLabels) as DateOption[]).map((opt) => (
              <button
                key={opt}
                onClick={() => setDateOption(opt)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  dateOption === opt
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {dateOptionLabels[opt]}
              </button>
            ))}
          </div>

          {dateOption === "custom" && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
            </div>
          )}

          <Button onClick={generateReport} disabled={loading} className="w-full">
            {loading ? (
              <>
                <span className="animate-spin mr-2">&#8635;</span>
                Generating Report...
              </>
            ) : (
              "Generate Report"
            )}
          </Button>
        </div>

        {/* Results */}
        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                <h4 className="font-medium text-blue-900 mb-2">All Deals</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Deals</span>
                    <span className="font-bold">{data.summary.allDeals.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">$ Pipeline</span>
                    <span className="font-bold">{formatCurrency(data.summary.allDeals.value)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">$ Factored</span>
                    <span className="font-bold">{formatCurrency(data.summary.allDeals.factored)}</span>
                  </div>
                </div>
              </div>
              <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                <h4 className="font-medium text-green-900 mb-2">Qualified or Later Pipeline</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Deals</span>
                    <span className="font-bold">{data.summary.qualified.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">$ Pipeline</span>
                    <span className="font-bold">{formatCurrency(data.summary.qualified.value)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">$ Factored</span>
                    <span className="font-bold">{formatCurrency(data.summary.qualified.factored)}</span>
                  </div>
                </div>
              </div>
              <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
                <h4 className="font-medium text-orange-900 mb-2">Booked Deals</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Deals</span>
                    <span className="font-bold">{data.summary.booked.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">$ Pipeline</span>
                    <span className="font-bold">{formatCurrency(data.summary.booked.value)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pipeline Chart */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4 text-center">
                Sales Pipeline by Stage - {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </h3>
              <div style={{ width: "100%", height: 400 }}>
                <ResponsiveContainer>
                  <ComposedChart
                    data={data.stages.map((s) => ({
                      name: s.name,
                      pipeline: s.value,
                      factored: s.factored,
                      deals: s.count,
                    }))}
                    margin={{ top: 30, right: 60, left: 20, bottom: 80 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      angle={-35}
                      textAnchor="end"
                      height={80}
                      interval={0}
                    />
                    <YAxis
                      yAxisId="left"
                      tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
                      tick={{ fontSize: 11 }}
                      label={{
                        value: "$ Value",
                        angle: -90,
                        position: "insideLeft",
                        style: { textAnchor: "middle", fontSize: 12 },
                      }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      label={{
                        value: "# Deals",
                        angle: 90,
                        position: "insideRight",
                        style: { textAnchor: "middle", fontSize: 12 },
                      }}
                    />
                    <Tooltip
                      formatter={(value, name) => {
                        const v = value as number;
                        if (name === "deals") return [v, "# Deals"];
                        return [`$${v.toLocaleString()}`, name === "pipeline" ? "$ Pipeline" : "$ Pipeline (Factored)"];
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      wrapperStyle={{ paddingBottom: 10 }}
                      formatter={(value) => {
                        if (value === "pipeline") return "$ Pipeline";
                        if (value === "factored") return "$ Pipeline (Factored)";
                        if (value === "deals") return "# Deals";
                        return value;
                      }}
                    />
                    <Bar yAxisId="left" dataKey="pipeline" fill="#4472C4" name="pipeline" barSize={40}>
                      <LabelList
                        dataKey="pipeline"
                        position="top"
                        formatter={(value) => `$${((value as number) / 1000).toFixed(0)}k`}
                        style={{ fontSize: 9, fill: "#333" }}
                      />
                    </Bar>
                    <Bar yAxisId="left" dataKey="factored" fill="#70AD47" name="factored" barSize={40}>
                      <LabelList
                        dataKey="factored"
                        position="top"
                        formatter={(value) => (value as number) > 0 ? `$${((value as number) / 1000).toFixed(0)}k` : ""}
                        style={{ fontSize: 9, fill: "#333" }}
                      />
                    </Bar>
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="deals"
                      stroke="#ED7D31"
                      strokeWidth={2}
                      dot={{ fill: "#ED7D31", r: 5 }}
                      name="deals"
                    >
                      <LabelList
                        dataKey="deals"
                        position="top"
                        offset={10}
                        style={{ fontSize: 11, fill: "#ED7D31", fontWeight: "bold" }}
                      />
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Summary by Stage */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Summary by Stage</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b-2 border-gray-200">
                      <th className="pb-2">Metric</th>
                      {data.stages.map((s) => (
                        <th key={s.id} className="pb-2 text-right px-2">{s.name}</th>
                      ))}
                      <th className="pb-2 text-right font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-2">% Factor</td>
                      {data.stages.map((s) => (
                        <td key={s.id} className="py-2 text-right px-2">{s.probability}%</td>
                      ))}
                      <td className="py-2 text-right font-bold"></td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2"># Deals</td>
                      {data.stages.map((s) => (
                        <td key={s.id} className="py-2 text-right px-2">{s.count}</td>
                      ))}
                      <td className="py-2 text-right font-bold">{data.summary.allDeals.count}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2">$ Pipeline</td>
                      {data.stages.map((s) => (
                        <td key={s.id} className="py-2 text-right px-2">{formatCurrency(s.value)}</td>
                      ))}
                      <td className="py-2 text-right font-bold">{formatCurrency(data.summary.allDeals.value)}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2">$ Factored</td>
                      {data.stages.map((s) => (
                        <td key={s.id} className="py-2 text-right px-2">{formatCurrency(s.factored)}</td>
                      ))}
                      <td className="py-2 text-right font-bold">{formatCurrency(data.summary.allDeals.factored)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Deal Details */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Deal Details</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b-2 border-gray-200">
                      <th className="pb-2">Client</th>
                      <th className="pb-2">Deal</th>
                      <th className="pb-2">Owner</th>
                      {data.stages.map((s) => (
                        <th key={s.id} className="pb-2 text-right px-2">{s.name}</th>
                      ))}
                      <th className="pb-2 text-right font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.deals.map((deal, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2">{deal.client}</td>
                        <td className="py-2">{deal.deal}</td>
                        <td className="py-2">{deal.owner}</td>
                        {data.stages.map((s) => (
                          <td key={s.id} className="py-2 text-right px-2">
                            {deal.stageId === s.id ? formatCurrency(deal.value) : "—"}
                          </td>
                        ))}
                        <td className="py-2 text-right font-bold">{formatCurrency(deal.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Owner Details */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Owner Details</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b-2 border-gray-200">
                      <th className="pb-2">Owner</th>
                      {data.stages.map((s) => (
                        <th key={s.id} className="pb-2 text-right px-2">{s.name}</th>
                      ))}
                      <th className="pb-2 text-right font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.owners.map((owner, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2">{owner.owner}</td>
                        {data.stages.map((s) => {
                          const sd = owner.stages[s.name];
                          return (
                            <td key={s.id} className="py-2 text-right px-2">
                              {sd && sd.value > 0 ? (
                                <span>{formatCurrency(sd.value)} <span className="text-gray-500">({sd.count})</span></span>
                              ) : (
                                "—"
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2 text-right font-bold">
                          {formatCurrency(owner.totalValue)} <span className="text-gray-500 font-normal">({owner.totalCount})</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Export */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Export Report</h3>
              <Button variant="outline" onClick={exportToExcel} className="w-full">
                Download Excel
              </Button>
            </div>
          </>
        )}

        {/* Instructions */}
        {!data && !loading && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Sales Snapshot</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Generate a pipeline report showing deals by stage with probability factoring.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">Features:</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li><strong>Date Filtering</strong>: Filter by expected close date</li>
                <li><strong>Stage Probabilities</strong>: Pulled from Pipedrive stage settings</li>
                <li><strong>Factored Values</strong>: Deal Value x Stage Probability</li>
                <li><strong>Qualified Pipeline</strong>: Qualified, Proposal, SOW, Forecast stages</li>
                <li><strong>Owner Breakdown</strong>: See deals by owner</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
