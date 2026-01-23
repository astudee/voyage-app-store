"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface NonFridayFee {
  contractor: string;
  date: string;
  day: string;
  amount: number;
  issue: string;
}

interface WeeklySummary {
  staff: string;
  weekEnding: string;
  totalHours: number;
  totalFees: number;
  avgHourlyRate: number;
  issues: string;
}

interface ContractorFeesData {
  contractors: string[];
  nonFridayFees: NonFridayFee[];
  missingInvoices: WeeklySummary[];
  weeklySummary: WeeklySummary[];
  summary: {
    totalContractors: number;
    totalNonFridayFees: number;
    totalMissingInvoices: number;
    totalWeeks: number;
  };
}

export default function ContractorFeesPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ContractorFeesData | null>(null);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  const reviewFees = async () => {
    setLoading(true);
    setData(null);

    try {
      const response = await fetch(
        `/api/contractor-fees?startDate=${startDate}&endDate=${endDate}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to review contractor fees");
      }

      const result = await response.json();
      setData(result);
      toast.success("Contractor fee review complete!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to review fees";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    if (!data) return;

    const wb = XLSX.utils.book_new();

    // Non-Friday Fees sheet
    const nonFridaySheet = XLSX.utils.json_to_sheet(
      data.nonFridayFees.map((f) => ({
        Contractor: f.contractor,
        Date: f.date,
        Day: f.day,
        Amount: f.amount,
        Issue: f.issue,
      }))
    );
    XLSX.utils.book_append_sheet(wb, nonFridaySheet, "Non_Friday_Fees");

    // Missing Invoices sheet
    const missingSheet = XLSX.utils.json_to_sheet(
      data.missingInvoices.map((m) => ({
        Contractor: m.staff,
        "Week Ending": m.weekEnding,
        Hours: m.totalHours,
        Fees: m.totalFees,
        Issue: m.issues,
      }))
    );
    XLSX.utils.book_append_sheet(wb, missingSheet, "Missing_Invoices");

    // Weekly Summary sheet
    const summarySheet = XLSX.utils.json_to_sheet(
      data.weeklySummary.map((s) => ({
        Contractor: s.staff,
        "Week Ending": s.weekEnding,
        Hours: s.totalHours,
        Fees: s.totalFees,
        "Avg Rate/Hour": s.avgHourlyRate,
      }))
    );
    XLSX.utils.book_append_sheet(wb, summarySheet, "Contractor_Summary");

    const filename = `Contractor_Fee_Review_${startDate}_${endDate}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Report downloaded!");
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD" });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Contractor Fee Reviewer</h1>
          <p className="text-gray-500 mt-1">
            Review contractor fees and hours for compliance and accuracy
          </p>
        </div>

        {/* Date Selection */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Review Period</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
          </div>

          <Button onClick={reviewFees} disabled={loading} className="w-full">
            {loading ? (
              <>
                <span className="animate-spin mr-2">⟳</span>
                Reviewing Contractor Fees...
              </>
            ) : (
              "Review Contractor Fees"
            )}
          </Button>
        </div>

        {/* Results */}
        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border p-4 text-center">
                <div className="text-2xl font-bold">{data.summary.totalContractors}</div>
                <div className="text-sm text-gray-500">Contractors</div>
              </div>
              <div className="bg-white rounded-xl border p-4 text-center">
                <div className="text-2xl font-bold">{data.summary.totalWeeks}</div>
                <div className="text-sm text-gray-500">Contractor-Weeks</div>
              </div>
              <div className="bg-white rounded-xl border p-4 text-center">
                <div className={`text-2xl font-bold ${data.summary.totalNonFridayFees > 0 ? "text-amber-600" : "text-green-600"}`}>
                  {data.summary.totalNonFridayFees}
                </div>
                <div className="text-sm text-gray-500">Non-Friday Fees</div>
              </div>
              <div className="bg-white rounded-xl border p-4 text-center">
                <div className={`text-2xl font-bold ${data.summary.totalMissingInvoices > 0 ? "text-red-600" : "text-green-600"}`}>
                  {data.summary.totalMissingInvoices}
                </div>
                <div className="text-sm text-gray-500">Missing Invoices</div>
              </div>
            </div>

            {/* Non-Friday Fees */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-2">1. Fees Charged on Non-Friday</h3>
              <p className="text-sm text-gray-500 mb-4">Contractor fees should be charged on Fridays</p>

              {data.nonFridayFees.length > 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <p className="text-amber-800 font-medium mb-2">
                    Found {data.nonFridayFees.length} fee(s) charged on non-Friday
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-amber-700 border-b border-amber-200">
                        <th className="pb-2">Contractor</th>
                        <th className="pb-2">Date</th>
                        <th className="pb-2">Day</th>
                        <th className="pb-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.nonFridayFees.map((fee, i) => (
                        <tr key={i} className="border-b border-amber-100 last:border-0">
                          <td className="py-2">{fee.contractor}</td>
                          <td className="py-2">{formatDate(fee.date)}</td>
                          <td className="py-2">{fee.day}</td>
                          <td className="py-2 text-right">{formatCurrency(fee.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800">
                  All contractor fees charged on Friday
                </div>
              )}
            </div>

            {/* Missing Invoices */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-2">2. Hours Without Invoices</h3>
              <p className="text-sm text-gray-500 mb-4">Contractors who submitted hours but no invoice for the week</p>

              {data.missingInvoices.length > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-red-800 font-medium mb-2">
                    Found {data.missingInvoices.length} week(s) with missing invoices
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-red-700 border-b border-red-200">
                        <th className="pb-2">Contractor</th>
                        <th className="pb-2">Week Ending</th>
                        <th className="pb-2 text-right">Hours</th>
                        <th className="pb-2 text-right">Fees</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.missingInvoices.map((inv, i) => (
                        <tr key={i} className="border-b border-red-100 last:border-0">
                          <td className="py-2">{inv.staff}</td>
                          <td className="py-2">{formatDate(inv.weekEnding)}</td>
                          <td className="py-2 text-right">{inv.totalHours.toFixed(1)}</td>
                          <td className="py-2 text-right">{formatCurrency(inv.totalFees)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800">
                  All contractor hours have corresponding invoices
                </div>
              )}
            </div>

            {/* Weekly Summary */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-2">3. Contractor Summary by Week</h3>
              <p className="text-sm text-gray-500 mb-4">Hours, fees, and average hourly rates</p>

              {data.weeklySummary.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b-2 border-gray-200">
                        <th className="pb-2">Contractor</th>
                        <th className="pb-2">Week Ending</th>
                        <th className="pb-2 text-right">Hours</th>
                        <th className="pb-2 text-right">Fees</th>
                        <th className="pb-2 text-right">Avg Rate/Hour</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.weeklySummary.map((row, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-2">{row.staff}</td>
                          <td className="py-2">{formatDate(row.weekEnding)}</td>
                          <td className="py-2 text-right">{row.totalHours.toFixed(1)}</td>
                          <td className="py-2 text-right">{formatCurrency(row.totalFees)}</td>
                          <td className="py-2 text-right">{formatCurrency(row.avgHourlyRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No contractor data found for this period</p>
              )}
            </div>

            {/* Export Button */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Export Report</h3>
              <Button variant="outline" onClick={exportToExcel} className="w-full">
                Download Excel Report
              </Button>
            </div>
          </>
        )}

        {/* Instructions */}
        {!data && !loading && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Contractor Fee Reviewer</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Select a date range and click the button to review contractor fees for compliance.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">Checks Performed:</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li><strong>Non-Friday Fees</strong> - Flags contractor fees charged on days other than Friday</li>
                <li><strong>Missing Invoices</strong> - Identifies weeks where contractor worked but did not submit invoice</li>
                <li><strong>Hourly Rates</strong> - Calculates average hourly billing rate per contractor per week</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
