"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface StaffMonthData {
  staff: string;
  classification: "Employee" | "Contractor";
  months: Record<string, number>;
  total: number;
}

interface ForecastData {
  months: string[];
  employees: StaffMonthData[];
  contractors: StaffMonthData[];
  monthlyTotals: Record<string, number>;
  grandTotal: number;
  metricType: string;
  summary: {
    totalStaff: number;
    employeeCount: number;
    contractorCount: number;
    monthCount: number;
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

export default function ForecastedHoursPage() {
  const defaults = getDefaultMonths();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ForecastData | null>(null);

  const [startMonth, setStartMonth] = useState(defaults.start);
  const [endMonth, setEndMonth] = useState(defaults.end);
  const [metricType, setMetricType] = useState<MetricType>("hours");

  const generateForecast = async () => {
    if (endMonth < startMonth) {
      toast.error("End month must be after start month");
      return;
    }

    setLoading(true);
    setData(null);

    try {
      const response = await fetch(
        `/api/forecasted-hours?startMonth=${startMonth}&endMonth=${endMonth}&metric=${metricType}`
      );

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

    // Employees sheet
    if (data.employees.length > 0) {
      const empData = data.employees.map((e) => {
        const row: Record<string, string | number> = { Staff: e.staff };
        for (const month of data.months) {
          row[month] = e.months[month] || 0;
        }
        row.Total = e.total;
        return row;
      });
      const empSheet = XLSX.utils.json_to_sheet(empData);
      XLSX.utils.book_append_sheet(wb, empSheet, "Employees");
    }

    // Contractors sheet
    if (data.contractors.length > 0) {
      const conData = data.contractors.map((c) => {
        const row: Record<string, string | number> = { Staff: c.staff };
        for (const month of data.months) {
          row[month] = c.months[month] || 0;
        }
        row.Total = c.total;
        return row;
      });
      const conSheet = XLSX.utils.json_to_sheet(conData);
      XLSX.utils.book_append_sheet(wb, conSheet, "Contractors");
    }

    // Monthly Totals sheet
    const totalsRow: Record<string, string | number> = { Metric: metricType === "hours" ? "Billable Hours" : "Revenue" };
    for (const month of data.months) {
      totalsRow[month] = data.monthlyTotals[month] || 0;
    }
    totalsRow.Total = data.grandTotal;
    const totalsSheet = XLSX.utils.json_to_sheet([totalsRow]);
    XLSX.utils.book_append_sheet(wb, totalsSheet, "Monthly_Totals");

    const metricSlug = metricType === "hours" ? "hours" : "revenue";
    const filename = `forecast_${metricSlug}_${startMonth}_${endMonth}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Report downloaded!");
  };

  const StaffTable = ({ title, staffData }: { title: string; staffData: StaffMonthData[] }) => (
    <div className="bg-white rounded-xl border p-6">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      {staffData.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b-2 border-gray-200">
                <th className="pb-2 sticky left-0 bg-white">Staff</th>
                {data?.months.map((month) => (
                  <th key={month} className="pb-2 text-right px-2">{month}</th>
                ))}
                <th className="pb-2 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {staffData.map((staff, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 sticky left-0 bg-white">{staff.staff}</td>
                  {data?.months.map((month) => (
                    <td key={month} className="py-2 text-right px-2">
                      {staff.months[month] ? formatValue(staff.months[month]) : "-"}
                    </td>
                  ))}
                  <td className="py-2 text-right font-semibold">{formatValue(staff.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500">No data for this period</p>
      )}
    </div>
  );

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Forecasted Billable Hours & Revenue</h1>
          <p className="text-gray-500 mt-1">
            Forward-looking forecast based on project assignments
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

          <Button onClick={generateForecast} disabled={loading} className="w-full">
            {loading ? (
              <>
                <span className="animate-spin mr-2">⟳</span>
                Generating Forecast...
              </>
            ) : (
              "Generate Forecast"
            )}
          </Button>
        </div>

        {/* Results */}
        {data && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border p-4 text-center">
                <div className="text-2xl font-bold">{data.summary.employeeCount}</div>
                <div className="text-sm text-gray-500">Employees</div>
              </div>
              <div className="bg-white rounded-xl border p-4 text-center">
                <div className="text-2xl font-bold">{data.summary.contractorCount}</div>
                <div className="text-sm text-gray-500">Contractors</div>
              </div>
              <div className="bg-white rounded-xl border p-4 text-center">
                <div className="text-2xl font-bold">{data.summary.monthCount}</div>
                <div className="text-sm text-gray-500">Months</div>
              </div>
              <div className="bg-white rounded-xl border p-4 text-center">
                <div className="text-2xl font-bold">{formatValue(data.grandTotal)}</div>
                <div className="text-sm text-gray-500">
                  Total {metricType === "hours" ? "Hours" : "Revenue"}
                </div>
              </div>
            </div>

            {/* Employees */}
            <StaffTable title="1. Active Employees" staffData={data.employees} />

            {/* Contractors */}
            <StaffTable title="2. Contractors" staffData={data.contractors} />

            {/* Monthly Totals */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">3. Monthly Totals</h3>
              <p className="text-sm text-gray-500 mb-4">
                Total {metricType === "hours" ? "hours" : "revenue"} by month across all staff
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b-2 border-gray-200">
                      <th className="pb-2">Metric</th>
                      {data.months.map((month) => (
                        <th key={month} className="pb-2 text-right px-2">{month}</th>
                      ))}
                      <th className="pb-2 text-right font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 font-medium">
                        {metricType === "hours" ? "Billable Hours" : "Revenue"}
                      </td>
                      {data.months.map((month) => (
                        <td key={month} className="py-2 text-right px-2">
                          {formatValue(data.monthlyTotals[month] || 0)}
                        </td>
                      ))}
                      <td className="py-2 text-right font-bold">{formatValue(data.grandTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

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
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Forecasted Billable Hours</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Select a forecast period and click the button to generate forward-looking billable hours or revenue.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">Key Features:</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li><strong>Forward-Looking Only</strong> - Forecasts based on project assignments</li>
                <li><strong>Employee vs Contractor</strong> - Automatically categorized from Staff list</li>
                <li><strong>Hours or Revenue</strong> - Toggle between billable hours and revenue</li>
                <li><strong>Default Range</strong> - Current month + 12 months</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
