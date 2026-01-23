"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface EmployeeBonus {
  employee: string;
  startDate: string;
  daysInPeriod: number;
  proration: number;
  utilTarget: number;
  otherTarget: number;
  ytdBillable: number;
  ytdProBono: number;
  ytdProBonoCredit: number;
  ytdEligible: number;
  ytdTier: number;
  ytdUtilBonus: number;
  ytdOtherBonus: number;
  ytdTotalBonus: number;
  ytdFica: number;
  ytd401k: number;
  ytdTotalCost: number;
  projBillable: number;
  projEligible: number;
  projTier: number;
  projUtilBonus: number;
  projOtherBonus: number;
  projTotalBonus: number;
  projFica: number;
  proj401k: number;
  projTotalCost: number;
}

interface BonusData {
  summary: {
    year: number;
    asOfDate: string;
    progressPct: number;
    employeeCount: number;
    ytdTotalBonuses: number;
    ytdTotalFica: number;
    ytdTotal401k: number;
    ytdTotalCost: number;
    projTotalBonuses: number;
    projTotalFica: number;
    projTotal401k: number;
    projTotalCost: number;
  };
  employees: EmployeeBonus[];
  timestamp: string;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const formatHours = (n: number) => n.toFixed(1);

const getTierColor = (tier: number) => {
  if (tier === 1) return "bg-green-100";
  if (tier === 2) return "bg-yellow-100";
  return "bg-blue-100";
};

export default function BonusCalculatorPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BonusData | null>(null);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));

  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const generateReport = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/bonus?asOfDate=${asOfDate}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate report");
      }

      const result: BonusData = await response.json();
      setData(result);
      toast.success(`Loaded bonus data for ${result.summary.employeeCount} employees`);
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

    // Summary sheet
    const summaryData = [
      ["Bonus Report"],
      ["As of Date", data.summary.asOfDate],
      ["Progress %", `${(data.summary.progressPct * 100).toFixed(1)}%`],
      ["Employees", data.summary.employeeCount],
      [],
      ["YTD Summary"],
      ["Total Bonuses", data.summary.ytdTotalBonuses],
      ["FICA (7.65%)", data.summary.ytdTotalFica],
      ["401k (4%)", data.summary.ytdTotal401k],
      ["Total Cost", data.summary.ytdTotalCost],
      [],
      ["Projected Year-End"],
      ["Total Bonuses", data.summary.projTotalBonuses],
      ["FICA (7.65%)", data.summary.projTotalFica],
      ["401k (4%)", data.summary.projTotal401k],
      ["Total Cost", data.summary.projTotalCost],
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    // Employee details sheet
    const employeeHeaders = [
      "Employee", "Start Date", "Days in Period", "Proration %",
      "Util Target", "Other Target",
      "YTD Billable", "YTD Pro Bono", "YTD Eligible", "YTD Tier",
      "YTD Util Bonus", "YTD Other Bonus", "YTD Total Bonus",
      "YTD FICA", "YTD 401k", "YTD Total Cost",
      "Proj Billable", "Proj Eligible", "Proj Tier",
      "Proj Util Bonus", "Proj Other Bonus", "Proj Total Bonus",
      "Proj FICA", "Proj 401k", "Proj Total Cost"
    ];

    const employeeRows = data.employees.map((e) => [
      e.employee, e.startDate, e.daysInPeriod, `${(e.proration * 100).toFixed(1)}%`,
      e.utilTarget, e.otherTarget,
      e.ytdBillable, e.ytdProBono, e.ytdEligible, e.ytdTier,
      e.ytdUtilBonus, e.ytdOtherBonus, e.ytdTotalBonus,
      e.ytdFica, e.ytd401k, e.ytdTotalCost,
      e.projBillable, e.projEligible, e.projTier,
      e.projUtilBonus, e.projOtherBonus, e.projTotalBonus,
      e.projFica, e.proj401k, e.projTotalCost
    ]);

    const employeeWs = XLSX.utils.aoa_to_sheet([employeeHeaders, ...employeeRows]);
    XLSX.utils.book_append_sheet(wb, employeeWs, "Employee_Details");

    return wb;
  };

  const downloadExcel = () => {
    const wb = generateExcelWorkbook();
    if (!wb || !data) return;

    const filename = `bonus_report_${data.summary.year}_${data.summary.asOfDate.replace(/-/g, "")}.xlsx`;
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

    const asOfDateFormatted = new Date(data.summary.asOfDate).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bonus Report - ${data.summary.year}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
          h1 { color: #336699; border-bottom: 2px solid #669999; padding-bottom: 10px; }
          h2 { color: #336699; margin-top: 30px; }
          table { border-collapse: collapse; width: 100%; margin: 15px 0; font-size: 11px; }
          th, td { border: 1px solid #ddd; padding: 5px; text-align: left; }
          th { background-color: #669999; color: white; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .summary-box { display: inline-block; margin: 10px 20px 10px 0; padding: 15px 25px; border: 2px solid #FF9800; border-radius: 8px; background: #FFF4E6; vertical-align: top; }
          .summary-label { font-size: 12px; color: #666; }
          .summary-value { font-size: 24px; font-weight: bold; color: #333; }
          .summary-sub { font-size: 11px; color: #666; margin-top: 5px; }
          .text-right { text-align: right; }
          .tier-1 { background-color: #D5F4E6; }
          .tier-2 { background-color: #FCF3CF; }
          .tier-3 { background-color: #D6EAF8; }
          .footer { margin-top: 40px; font-size: 12px; color: #999; }
          @media print { body { margin: 20px; } }
        </style>
      </head>
      <body>
        <h1>Bonus Report - ${data.summary.year}</h1>
        <p>As of: ${asOfDateFormatted} (${(data.summary.progressPct * 100).toFixed(1)}% of year)</p>
        <p>Generated: ${new Date().toLocaleString()}</p>

        <div style="margin: 20px 0;">
          <div class="summary-box">
            <div class="summary-label">YTD Total Cost</div>
            <div class="summary-value">${formatCurrency(data.summary.ytdTotalCost)}</div>
            <div class="summary-sub">
              Bonuses: ${formatCurrency(data.summary.ytdTotalBonuses)}<br>
              FICA: ${formatCurrency(data.summary.ytdTotalFica)}<br>
              401k: ${formatCurrency(data.summary.ytdTotal401k)}
            </div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Projected Year-End</div>
            <div class="summary-value">${formatCurrency(data.summary.projTotalCost)}</div>
            <div class="summary-sub">
              Bonuses: ${formatCurrency(data.summary.projTotalBonuses)}<br>
              FICA: ${formatCurrency(data.summary.projTotalFica)}<br>
              401k: ${formatCurrency(data.summary.projTotal401k)}
            </div>
          </div>
        </div>

        <h2>Employee Details</h2>
        <table>
          <tr>
            <th>Employee</th>
            <th>Proration</th>
            <th class="text-right">Util Target</th>
            <th class="text-right">Other Target</th>
            <th class="text-right">YTD Eligible</th>
            <th>YTD Tier</th>
            <th class="text-right">YTD Util</th>
            <th class="text-right">YTD Other</th>
            <th class="text-right">YTD Total</th>
            <th class="text-right">YTD Cost</th>
            <th class="text-right">Proj Eligible</th>
            <th>Proj Tier</th>
            <th class="text-right">Proj Util</th>
            <th class="text-right">Proj Other</th>
            <th class="text-right">Proj Total</th>
            <th class="text-right">Proj Cost</th>
          </tr>
          ${data.employees.map((e) => `
            <tr>
              <td>${e.employee}</td>
              <td>${(e.proration * 100).toFixed(0)}%</td>
              <td class="text-right">${formatCurrency(e.utilTarget)}</td>
              <td class="text-right">${formatCurrency(e.otherTarget)}</td>
              <td class="text-right">${formatHours(e.ytdEligible)}</td>
              <td class="tier-${e.ytdTier}">${e.ytdTier}</td>
              <td class="text-right">${formatCurrency(e.ytdUtilBonus)}</td>
              <td class="text-right">${formatCurrency(e.ytdOtherBonus)}</td>
              <td class="text-right">${formatCurrency(e.ytdTotalBonus)}</td>
              <td class="text-right">${formatCurrency(e.ytdTotalCost)}</td>
              <td class="text-right">${formatHours(e.projEligible)}</td>
              <td class="tier-${e.projTier}">${e.projTier}</td>
              <td class="text-right">${formatCurrency(e.projUtilBonus)}</td>
              <td class="text-right">${formatCurrency(e.projOtherBonus)}</td>
              <td class="text-right">${formatCurrency(e.projTotalBonus)}</td>
              <td class="text-right">${formatCurrency(e.projTotalCost)}</td>
            </tr>
          `).join("")}
        </table>

        <div class="footer">
          <p>Voyage Advisory - Bonus Calculator</p>
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
      const filename = `bonus_report_${data.summary.year}_${data.summary.asOfDate.replace(/-/g, "")}.xlsx`;

      const response = await fetch("/api/bonus/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          summary: data.summary,
          employees: data.employees.map((e) => ({
            employee: e.employee,
            ytdEligible: e.ytdEligible,
            ytdTier: e.ytdTier,
            ytdTotalBonus: e.ytdTotalBonus,
            ytdTotalCost: e.ytdTotalCost,
            projEligible: e.projEligible,
            projTier: e.projTier,
            projTotalBonus: e.projTotalBonus,
            projTotalCost: e.projTotalCost,
          })),
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
              <span className="text-4xl">💰</span>
              Bonus Calculator
            </h1>
            <p className="text-gray-500 mt-1">
              Calculate employee bonuses based on billable hours and utilization targets
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-end gap-4">
            <div>
              <label className="text-sm text-gray-600 block mb-1">As of Date</label>
              <Input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="w-48"
              />
            </div>
            <Button onClick={generateReport} disabled={loading}>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-5">
                <h3 className="text-sm text-gray-600 mb-1">YTD Total Cost</h3>
                <p className="text-3xl font-bold text-gray-800">{formatCurrency(data.summary.ytdTotalCost)}</p>
                <div className="text-sm text-gray-500 mt-2 space-y-1">
                  <p>Bonuses: {formatCurrency(data.summary.ytdTotalBonuses)}</p>
                  <p>FICA (7.65%): {formatCurrency(data.summary.ytdTotalFica)}</p>
                  <p>401k (4%): {formatCurrency(data.summary.ytdTotal401k)}</p>
                </div>
              </div>
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-5">
                <h3 className="text-sm text-gray-600 mb-1">Projected Year-End Cost</h3>
                <p className="text-3xl font-bold text-gray-800">{formatCurrency(data.summary.projTotalCost)}</p>
                <div className="text-sm text-gray-500 mt-2 space-y-1">
                  <p>Bonuses: {formatCurrency(data.summary.projTotalBonuses)}</p>
                  <p>FICA (7.65%): {formatCurrency(data.summary.projTotalFica)}</p>
                  <p>401k (4%): {formatCurrency(data.summary.projTotal401k)}</p>
                </div>
              </div>
              <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-5">
                <h3 className="text-sm text-gray-600 mb-1">Report Progress</h3>
                <p className="text-3xl font-bold text-gray-800">{(data.summary.progressPct * 100).toFixed(1)}%</p>
                <div className="text-sm text-gray-500 mt-2 space-y-1">
                  <p>Year: {data.summary.year}</p>
                  <p>Employees: {data.summary.employeeCount}</p>
                </div>
              </div>
            </div>

            {/* Tier Legend */}
            <div className="flex gap-6 text-sm">
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 bg-green-100 border rounded"></span> Tier 1: ≥1,840 hrs (full bonus)
              </span>
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 bg-yellow-100 border rounded"></span> Tier 2: 1,350-1,839 hrs (75%)
              </span>
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 bg-blue-100 border rounded"></span> Tier 3: &lt;1,350 hrs (no bonus)
              </span>
            </div>

            {/* Employee Details Table */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Employee Details</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-3 py-2 sticky left-0 bg-gray-50">Employee</th>
                      <th className="text-right px-2 py-2">Proration</th>
                      <th className="text-right px-2 py-2">Util Target</th>
                      <th className="text-right px-2 py-2">Other Target</th>
                      <th className="text-right px-2 py-2">YTD Billable</th>
                      <th className="text-right px-2 py-2">YTD Pro Bono</th>
                      <th className="text-right px-2 py-2">YTD Eligible</th>
                      <th className="text-center px-2 py-2">YTD Tier</th>
                      <th className="text-right px-2 py-2">YTD Util Bonus</th>
                      <th className="text-right px-2 py-2">YTD Other Bonus</th>
                      <th className="text-right px-2 py-2">YTD Total</th>
                      <th className="text-right px-2 py-2">YTD Cost</th>
                      <th className="text-right px-2 py-2">Proj Eligible</th>
                      <th className="text-center px-2 py-2">Proj Tier</th>
                      <th className="text-right px-2 py-2">Proj Util Bonus</th>
                      <th className="text-right px-2 py-2">Proj Other Bonus</th>
                      <th className="text-right px-2 py-2">Proj Total</th>
                      <th className="text-right px-2 py-2">Proj Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.employees.map((e) => (
                      <tr key={e.employee} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium sticky left-0 bg-white">{e.employee}</td>
                        <td className="px-2 py-2 text-right">{(e.proration * 100).toFixed(0)}%</td>
                        <td className="px-2 py-2 text-right">{formatCurrency(e.utilTarget)}</td>
                        <td className="px-2 py-2 text-right">{formatCurrency(e.otherTarget)}</td>
                        <td className="px-2 py-2 text-right">{formatHours(e.ytdBillable)}</td>
                        <td className="px-2 py-2 text-right">{formatHours(e.ytdProBono)}</td>
                        <td className="px-2 py-2 text-right font-medium">{formatHours(e.ytdEligible)}</td>
                        <td className={`px-2 py-2 text-center ${getTierColor(e.ytdTier)}`}>{e.ytdTier}</td>
                        <td className="px-2 py-2 text-right">{formatCurrency(e.ytdUtilBonus)}</td>
                        <td className="px-2 py-2 text-right">{formatCurrency(e.ytdOtherBonus)}</td>
                        <td className="px-2 py-2 text-right font-medium">{formatCurrency(e.ytdTotalBonus)}</td>
                        <td className="px-2 py-2 text-right font-medium">{formatCurrency(e.ytdTotalCost)}</td>
                        <td className="px-2 py-2 text-right">{formatHours(e.projEligible)}</td>
                        <td className={`px-2 py-2 text-center ${getTierColor(e.projTier)}`}>{e.projTier}</td>
                        <td className="px-2 py-2 text-right">{formatCurrency(e.projUtilBonus)}</td>
                        <td className="px-2 py-2 text-right">{formatCurrency(e.projOtherBonus)}</td>
                        <td className="px-2 py-2 text-right font-medium">{formatCurrency(e.projTotalBonus)}</td>
                        <td className="px-2 py-2 text-right font-medium">{formatCurrency(e.projTotalCost)}</td>
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
                  <h3 className="text-lg font-semibold mb-4">📧 Email Bonus Report</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Send the bonus report as an Excel attachment.
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
            <span className="text-6xl block mb-4">💰</span>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Bonus Calculator</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Select an as-of date and click Generate Report to calculate employee bonuses.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">How Bonuses Are Calculated:</h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li><strong>Eligible Hours:</strong> Billable Hours + Pro Bono (max 40)</li>
                <li><strong>Tier 1 (≥1,840 hrs):</strong> Full bonus × (hours / 1,840)</li>
                <li><strong>Tier 2 (1,350-1,839 hrs):</strong> 75% × (hours / 1,840)</li>
                <li><strong>Tier 3 (&lt;1,350 hrs):</strong> No bonus</li>
              </ul>
              <div className="mt-4 pt-4 border-t">
                <h4 className="font-semibold text-gray-700 mb-1">Employer Costs:</h4>
                <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                  <li>FICA: 7.65% of total bonus</li>
                  <li>401k Match: 4% of total bonus</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
