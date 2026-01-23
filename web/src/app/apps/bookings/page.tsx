"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import * as XLSX from "xlsx";

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

interface PeriodSummary {
  period: string;
  dealCount: number;
  totalValue: number;
  uniqueClients: number;
}

interface BookingsData {
  startDate: string;
  endDate: string;
  viewBy: string;
  summary: {
    totalBookings: number;
    totalValue: number;
    avgDealSize: number;
    uniqueClients: number;
  };
  periodSummary: PeriodSummary[];
  bookings: Booking[];
  timestamp: string;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

export default function BookingsTrackerPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BookingsData | null>(null);

  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear - 1}-01-01`);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [viewBy, setViewBy] = useState<"month" | "quarter" | "year">("month");

  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const generateReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        viewBy,
      });

      const response = await fetch(`/api/bookings?${params}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch bookings");
      }

      const result: BookingsData = await response.json();
      setData(result);
      toast.success(`Loaded ${result.summary.totalBookings} bookings`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate report";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const generateExcelWorkbook = () => {
    if (!data) return null;

    const wb = XLSX.utils.book_new();

    // Period summary sheet
    const periodHeaders = ["Period", "Deal Count", "Total Value", "Unique Clients"];
    const periodRows = data.periodSummary.map((p) => [
      p.period,
      p.dealCount,
      p.totalValue,
      p.uniqueClients,
    ]);
    const periodWs = XLSX.utils.aoa_to_sheet([periodHeaders, ...periodRows]);
    XLSX.utils.book_append_sheet(wb, periodWs, `By_${viewBy.charAt(0).toUpperCase() + viewBy.slice(1)}`);

    // All bookings sheet
    const bookingHeaders = [
      "Period", "Client", "Deal Name", "Close Date", "Value",
      "Duration (Mo)", "BT Client ID", "BT Project ID", "Bill Rate", "Budget Hours", "Start Date"
    ];
    const bookingRows = data.bookings.map((b) => [
      b.period,
      b.client,
      b.dealName,
      b.closeDate,
      b.dealValue,
      b.projectDuration,
      b.bigtimeClientId,
      b.bigtimeProjectId,
      b.billRate,
      b.budgetHours,
      b.projectStartDate,
    ]);
    const bookingWs = XLSX.utils.aoa_to_sheet([bookingHeaders, ...bookingRows]);
    XLSX.utils.book_append_sheet(wb, bookingWs, "All_Bookings");

    return wb;
  };

  const downloadExcel = () => {
    const wb = generateExcelWorkbook();
    if (!wb || !data) return;

    const filename = `bookings_report_${startDate.replace(/-/g, "")}_${endDate.replace(/-/g, "")}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Excel report downloaded!");
  };

  const downloadPDF = () => {
    if (!data) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to download PDF");
      return;
    }

    const startDateFormatted = new Date(data.startDate).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const endDateFormatted = new Date(data.endDate).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const viewLabel = viewBy.charAt(0).toUpperCase() + viewBy.slice(1);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bookings Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
          h1 { color: #336699; border-bottom: 2px solid #669999; padding-bottom: 10px; }
          h2 { color: #336699; margin-top: 30px; }
          table { border-collapse: collapse; width: 100%; margin: 15px 0; font-size: 11px; }
          th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
          th { background-color: #669999; color: white; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .summary-box { display: inline-block; margin: 10px 20px 10px 0; padding: 15px 25px; border: 2px solid #FF9800; border-radius: 8px; background: #FFF4E6; vertical-align: top; }
          .summary-label { font-size: 12px; color: #666; }
          .summary-value { font-size: 24px; font-weight: bold; color: #333; }
          .text-right { text-align: right; }
          .footer { margin-top: 40px; font-size: 12px; color: #999; }
          @media print { body { margin: 20px; } }
        </style>
      </head>
      <body>
        <h1>Bookings Report</h1>
        <p>Period: ${startDateFormatted} - ${endDateFormatted}</p>
        <p>View: By ${viewLabel}</p>
        <p>Generated: ${new Date().toLocaleString()}</p>

        <div style="margin: 20px 0;">
          <div class="summary-box">
            <div class="summary-label">Total Bookings</div>
            <div class="summary-value">${data.summary.totalBookings}</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Total Value</div>
            <div class="summary-value">${formatCurrency(data.summary.totalValue)}</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Avg Deal Size</div>
            <div class="summary-value">${formatCurrency(data.summary.avgDealSize)}</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Unique Clients</div>
            <div class="summary-value">${data.summary.uniqueClients}</div>
          </div>
        </div>

        <h2>Bookings by ${viewLabel}</h2>
        <table>
          <tr>
            <th>${viewLabel}</th>
            <th class="text-right">Deal Count</th>
            <th class="text-right">Total Value</th>
            <th class="text-right">Unique Clients</th>
          </tr>
          ${data.periodSummary.map((p) => `
            <tr>
              <td>${p.period}</td>
              <td class="text-right">${p.dealCount}</td>
              <td class="text-right">${formatCurrency(p.totalValue)}</td>
              <td class="text-right">${p.uniqueClients}</td>
            </tr>
          `).join("")}
        </table>

        <h2>Detailed Bookings</h2>
        <table>
          <tr>
            <th>${viewLabel}</th>
            <th>Client</th>
            <th>Deal Name</th>
            <th>Close Date</th>
            <th class="text-right">Value</th>
          </tr>
          ${data.bookings.map((b) => `
            <tr>
              <td>${b.period}</td>
              <td>${b.client}</td>
              <td>${b.dealName}</td>
              <td>${b.closeDate}</td>
              <td class="text-right">${formatCurrency(b.dealValue)}</td>
            </tr>
          `).join("")}
        </table>

        <div class="footer">
          <p>Voyage Advisory - Bookings Tracker</p>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
    toast.success("PDF ready to print/save!");
  };

  const sendEmail = async () => {
    if (!data) return;
    if (!emailTo || !emailTo.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSendingEmail(true);
    try {
      const wb = generateExcelWorkbook();
      if (!wb) throw new Error("Failed to generate report");

      const excelBuffer = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      const filename = `bookings_report_${startDate.replace(/-/g, "")}_${endDate.replace(/-/g, "")}.xlsx`;

      const response = await fetch("/api/bookings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          startDate: data.startDate,
          endDate: data.endDate,
          viewBy: data.viewBy,
          summary: data.summary,
          periodSummary: data.periodSummary,
          excelBase64: excelBuffer,
          filename,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send email");
      }

      toast.success(`Email sent to ${emailTo}!`);
      setShowEmailDialog(false);
      setEmailTo("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send email";
      toast.error(message);
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <span className="text-4xl">📊</span>
              Bookings Tracker
            </h1>
            <p className="text-gray-500 mt-1">
              Track won deals and bookings from Pipedrive
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl border p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">View By</label>
              <Select value={viewBy} onValueChange={(v) => setViewBy(v as "month" | "quarter" | "year")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generateReport} disabled={loading} className="h-10">
              {loading ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Loading...
                </>
              ) : (
                "Generate Report"
              )}
            </Button>
          </div>
        </div>

        {/* Results */}
        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-4">
                <h3 className="text-sm text-gray-600 mb-1">Total Bookings</h3>
                <p className="text-2xl font-bold text-gray-800">{data.summary.totalBookings}</p>
              </div>
              <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4">
                <h3 className="text-sm text-gray-600 mb-1">Total Value</h3>
                <p className="text-2xl font-bold text-gray-800">{formatCurrency(data.summary.totalValue)}</p>
              </div>
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
                <h3 className="text-sm text-gray-600 mb-1">Avg Deal Size</h3>
                <p className="text-2xl font-bold text-gray-800">{formatCurrency(data.summary.avgDealSize)}</p>
              </div>
              <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-4">
                <h3 className="text-sm text-gray-600 mb-1">Unique Clients</h3>
                <p className="text-2xl font-bold text-gray-800">{data.summary.uniqueClients}</p>
              </div>
            </div>

            {/* Period Summary */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">
                Bookings by {viewBy.charAt(0).toUpperCase() + viewBy.slice(1)}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-3 py-2">{viewBy.charAt(0).toUpperCase() + viewBy.slice(1)}</th>
                      <th className="text-right px-3 py-2">Deal Count</th>
                      <th className="text-right px-3 py-2">Total Value</th>
                      <th className="text-right px-3 py-2">Unique Clients</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.periodSummary.map((p) => (
                      <tr key={p.period} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{p.period}</td>
                        <td className="px-3 py-2 text-right">{p.dealCount}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(p.totalValue)}</td>
                        <td className="px-3 py-2 text-right">{p.uniqueClients}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detailed Bookings */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Detailed Bookings</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-3 py-2">{viewBy.charAt(0).toUpperCase() + viewBy.slice(1)}</th>
                      <th className="text-left px-3 py-2">Client</th>
                      <th className="text-left px-3 py-2">Deal Name</th>
                      <th className="text-left px-3 py-2">Close Date</th>
                      <th className="text-right px-3 py-2">Value</th>
                      <th className="text-right px-3 py-2">Duration</th>
                      <th className="text-left px-3 py-2">BT Client ID</th>
                      <th className="text-left px-3 py-2">BT Project ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.bookings.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">{b.period}</td>
                        <td className="px-3 py-2 font-medium">{b.client}</td>
                        <td className="px-3 py-2">{b.dealName}</td>
                        <td className="px-3 py-2">{b.closeDate}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(b.dealValue)}</td>
                        <td className="px-3 py-2 text-right">{b.projectDuration ?? "-"}</td>
                        <td className="px-3 py-2">{b.bigtimeClientId ?? "-"}</td>
                        <td className="px-3 py-2">{b.bigtimeProjectId ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Export Options */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={downloadExcel}>
                📊 Download Excel
              </Button>
              <Button variant="outline" onClick={downloadPDF}>
                📄 Download PDF
              </Button>
              <Button variant="outline" onClick={() => setShowEmailDialog(true)}>
                📧 Email Report
              </Button>
            </div>

            {/* Email Dialog */}
            {showEmailDialog && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
                  <h3 className="text-lg font-semibold mb-4">📧 Email Report</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Send the bookings report as an Excel attachment.
                  </p>
                  <Input
                    type="email"
                    placeholder="recipient@example.com"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    className="mb-4"
                  />
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setShowEmailDialog(false)} disabled={sendingEmail}>
                      Cancel
                    </Button>
                    <Button onClick={sendEmail} disabled={sendingEmail || !emailTo}>
                      {sendingEmail ? (
                        <>
                          <span className="animate-spin mr-2">⟳</span>
                          Sending...
                        </>
                      ) : (
                        "Send Email"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Instructions */}
        {!data && !loading && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <span className="text-6xl block mb-4">📊</span>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Bookings Tracker</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Select a date range and click Generate Report to view won deals from Pipedrive.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">Data Source:</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>Pipedrive API - Won deals with close dates in selected range</li>
                <li>Custom fields: BigTime IDs, Bill Rate, Budget Hours, Duration</li>
              </ul>
              <div className="mt-4 pt-4 border-t">
                <h4 className="font-semibold text-gray-700 mb-1">Views:</h4>
                <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                  <li><strong>Month:</strong> Group by YYYY-MM</li>
                  <li><strong>Quarter:</strong> Group by Q1-Q4</li>
                  <li><strong>Year:</strong> Group by year</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
