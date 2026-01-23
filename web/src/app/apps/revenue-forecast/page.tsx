"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ForecastRow {
  client: string;
  project: string;
  projectId?: string;
  stage?: string;
  factor?: string;
  monthly: Record<string, number>;
}

interface Section {
  title: string;
  description: string;
  rows: ForecastRow[];
  totals: Record<string, number>;
}

interface ForecastData {
  months: string[];
  metricType: string;
  sections: {
    section1: Section;
    section2: Section;
    section3: Section;
    section4: Section;
    section5: Section;
  };
  metadata: {
    projectCount: number;
    pipelineDeals: number;
    bigTimeEntries: number;
  };
}

type MetricType = "hours" | "revenue";

function getDefaultMonths(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 12, 1);
  return {
    start: start.toISOString().slice(0, 7),
    end: end.toISOString().slice(0, 7),
  };
}

export default function RevenueForecastPage() {
  const defaults = getDefaultMonths();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ForecastData | null>(null);
  const [startMonth, setStartMonth] = useState(defaults.start);
  const [endMonth, setEndMonth] = useState(defaults.end);
  const [metricType, setMetricType] = useState<MetricType>("revenue");

  // Probability overrides
  const [probQualified, setProbQualified] = useState(33);
  const [probProposal, setProbProposal] = useState(50);
  const [probForecast, setProbForecast] = useState(75);

  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    section1: true,
    section2: true,
    section3: true,
    section4: true,
    section5: true,
  });

  const generateForecast = async () => {
    if (endMonth < startMonth) {
      toast.error("End month must be after start month");
      return;
    }

    setLoading(true);
    setData(null);

    try {
      const params = new URLSearchParams({
        startMonth,
        endMonth,
        metric: metricType,
        probQualified: probQualified.toString(),
        probProposal: probProposal.toString(),
        probForecast: probForecast.toString(),
      });

      const response = await fetch(`/api/revenue-forecast?${params}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate forecast");
      }

      const result = await response.json();
      setData(result);
      toast.success("Forecast generated!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate forecast";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value: number) => {
    if (metricType === "revenue") {
      return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    }
    return value.toFixed(1);
  };

  const exportToExcel = () => {
    if (!data) return;

    const wb = XLSX.utils.book_new();

    // Helper to create sheet from section
    const createSheet = (section: Section, name: string) => {
      const rows = section.rows.map((r) => {
        const row: Record<string, string | number> = {
          Client: r.client,
          Project: r.project,
        };
        if (r.stage) row.Stage = r.stage;
        if (r.factor) row.Factor = r.factor;
        for (const month of data.months) {
          row[month] = r.monthly[month] || 0;
        }
        return row;
      });

      // Add totals row
      const totalsRow: Record<string, string | number> = { Client: "---", Project: "TOTAL" };
      for (const month of data.months) {
        totalsRow[month] = section.totals[month] || 0;
      }
      rows.push(totalsRow);

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    createSheet(data.sections.section1, "Section_1_Hours_Based");
    createSheet(data.sections.section2, "Section_2_Fixed_Fee");
    if (data.sections.section3.rows.length > 0) {
      createSheet(data.sections.section3, "Section_3_Pipeline");
    }
    if (data.sections.section4.rows.length > 0) {
      createSheet(data.sections.section4, "Section_4_Pipeline_Factored");
    }
    createSheet(data.sections.section5, "Section_5_Unified");

    const filename = `revenue_forecast_${startMonth}_${endMonth}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Report downloaded!");
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const SectionTable = ({ section, sectionKey }: { section: Section; sectionKey: string }) => {
    const isExpanded = expandedSections[sectionKey];
    const grandTotal = Object.values(section.totals).reduce((sum, v) => sum + v, 0);

    return (
      <div className="bg-white rounded-xl border mb-6">
        <div
          className="p-4 border-b cursor-pointer hover:bg-gray-50 flex items-center justify-between"
          onClick={() => toggleSection(sectionKey)}
        >
          <div>
            <h3 className="text-lg font-semibold">{section.title}</h3>
            <p className="text-sm text-gray-500">{section.description}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-lg font-bold">{formatValue(grandTotal)}</span>
            <span className="text-gray-400">{isExpanded ? "▼" : "▶"}</span>
          </div>
        </div>
        {isExpanded && (
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b-2 border-gray-200">
                  <th className="pb-2 sticky left-0 bg-white">Client</th>
                  <th className="pb-2">Project</th>
                  {section.rows[0]?.stage !== undefined && <th className="pb-2">Stage</th>}
                  {section.rows[0]?.factor !== undefined && <th className="pb-2">Factor</th>}
                  {data?.months.map((month) => (
                    <th key={month} className="pb-2 text-right px-2 whitespace-nowrap">{month}</th>
                  ))}
                  <th className="pb-2 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, i) => {
                  const rowTotal = Object.values(row.monthly).reduce((sum, v) => sum + v, 0);
                  return (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2 sticky left-0 bg-white">{row.client}</td>
                      <td className="py-2">{row.project}</td>
                      {row.stage !== undefined && <td className="py-2">{row.stage}</td>}
                      {row.factor !== undefined && <td className="py-2">{row.factor}</td>}
                      {data?.months.map((month) => (
                        <td key={month} className="py-2 text-right px-2">
                          {row.monthly[month] ? formatValue(row.monthly[month]) : "-"}
                        </td>
                      ))}
                      <td className="py-2 text-right font-semibold">{formatValue(rowTotal)}</td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr className="border-t-2 border-gray-300 font-bold bg-gray-50">
                  <td className="py-2 sticky left-0 bg-gray-50">---</td>
                  <td className="py-2">TOTAL</td>
                  {section.rows[0]?.stage !== undefined && <td className="py-2"></td>}
                  {section.rows[0]?.factor !== undefined && <td className="py-2"></td>}
                  {data?.months.map((month) => (
                    <td key={month} className="py-2 text-right px-2">
                      {formatValue(section.totals[month] || 0)}
                    </td>
                  ))}
                  <td className="py-2 text-right">{formatValue(grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1600px]">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Revenue Forecaster</h1>
          <p className="text-gray-500 mt-1">
            Project-level revenue forecast: Actuals (past) + Plan (future) + Pipeline
          </p>
        </div>

        {/* Configuration */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Forecast Period</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Month
              </label>
              <input
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Month
              </label>
              <input
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Display Metric
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="metric"
                  checked={metricType === "hours"}
                  onChange={() => setMetricType("hours")}
                />
                Billable Hours
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="metric"
                  checked={metricType === "revenue"}
                  onChange={() => setMetricType("revenue")}
                />
                Billable Revenue ($)
              </label>
            </div>
          </div>

          {/* Probability overrides */}
          <details className="mb-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
              Override Pipeline Probability Factors (Sections 4 & 5)
            </summary>
            <div className="grid grid-cols-3 gap-4 mt-3 p-3 bg-gray-50 rounded-lg">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Qualified ({probQualified}%)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={probQualified}
                  onChange={(e) => setProbQualified(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Proposal/SOW ({probProposal}%)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={probProposal}
                  onChange={(e) => setProbProposal(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Forecast ({probForecast}%)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={probForecast}
                  onChange={(e) => setProbForecast(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </details>

          <Button onClick={generateForecast} disabled={loading} className="w-full">
            {loading ? (
              <>
                <span className="animate-spin mr-2">&#8635;</span>
                Generating Forecast...
              </>
            ) : (
              "Generate Revenue Forecast"
            )}
          </Button>
        </div>

        {/* Results */}
        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border p-4 text-center">
                <div className="text-2xl font-bold">{data.metadata.projectCount}</div>
                <div className="text-sm text-gray-500">Projects</div>
              </div>
              <div className="bg-white rounded-xl border p-4 text-center">
                <div className="text-2xl font-bold">{data.metadata.pipelineDeals}</div>
                <div className="text-sm text-gray-500">Pipeline Deals</div>
              </div>
              <div className="bg-white rounded-xl border p-4 text-center">
                <div className="text-2xl font-bold">{data.months.length}</div>
                <div className="text-sm text-gray-500">Months</div>
              </div>
            </div>

            {/* Section tables */}
            <SectionTable section={data.sections.section1} sectionKey="section1" />
            <SectionTable section={data.sections.section2} sectionKey="section2" />
            {data.sections.section3.rows.length > 0 && (
              <SectionTable section={data.sections.section3} sectionKey="section3" />
            )}
            {data.sections.section4.rows.length > 0 && (
              <SectionTable section={data.sections.section4} sectionKey="section4" />
            )}
            <SectionTable section={data.sections.section5} sectionKey="section5" />

            {/* Export */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Export Forecast</h3>
              <Button variant="outline" onClick={exportToExcel} className="w-full">
                Download Excel
              </Button>
            </div>
          </>
        )}

        {/* Instructions */}
        {!data && !loading && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Revenue Forecaster</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Generate project-level revenue forecasts combining actuals with planned work and pipeline deals.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">Sections:</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li><strong>Section 1</strong>: Hours-Based (all projects use Hours x Rate)</li>
                <li><strong>Section 2</strong>: Fixed Fee Reflected (uses scheduled revenue for FF projects)</li>
                <li><strong>Section 3</strong>: Pipeline Deals (unfactored)</li>
                <li><strong>Section 4</strong>: Pipeline Deals (factored by probability)</li>
                <li><strong>Section 5</strong>: Unified Forecast (Won + Factored Pipeline)</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
