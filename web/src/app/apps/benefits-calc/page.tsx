"use client";

import { useState, useMemo } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type SortDirection = "asc" | "desc";
type EmployeeSortColumn = "staffName" | "totalMonthly" | "eeMonthly" | "firmMonthly" | "totalYearly";
type LegendSortColumn = "code" | "description" | "totalCost" | "eeCost" | "firmCost";

interface BenefitCost {
  total: number;
  ee: number;
  firm: number;
}

interface EmployeeBenefits {
  staffName: string;
  salary: number;
  medical: { code: string; cost: BenefitCost };
  dental: { code: string; cost: BenefitCost };
  vision: { code: string; cost: BenefitCost };
  std: { code: string; cost: BenefitCost };
  ltd: { code: string; cost: BenefitCost };
  life: { code: string; cost: BenefitCost };
  totalMonthly: number;
  eeMonthly: number;
  firmMonthly: number;
  totalYearly: number;
  eeYearly: number;
  firmYearly: number;
  notes: string[];
}

interface BenefitBreakdown {
  benefitType: string;
  eeMonthly: number;
  firmMonthly: number;
  totalMonthly: number;
  eeYearly: number;
  firmYearly: number;
  totalYearly: number;
}

interface BenefitLegendItem {
  code: string;
  description: string;
  benefitType: string;
  isFormula: boolean;
  totalCost: number;
  eeCost: number;
  firmCost: number;
}

interface Summary {
  totalMonthly: number;
  totalYearly: number;
  eeMonthly: number;
  eeYearly: number;
  firmMonthly: number;
  firmYearly: number;
  staffCount: number;
  benefitOptionsCount: number;
}

interface BenefitsData {
  summary: Summary;
  breakdown: BenefitBreakdown[];
  totals: BenefitBreakdown;
  employees: EmployeeBenefits[];
  legend: BenefitLegendItem[];
  timestamp: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
};

export default function BenefitsCalculatorPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BenefitsData | null>(null);
  const [activeTab, setActiveTab] = useState<"breakdown" | "employees" | "legend">("breakdown");
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // Sorting state for Employee Details
  const [employeeSort, setEmployeeSort] = useState<{ column: EmployeeSortColumn; direction: SortDirection }>({
    column: "staffName",
    direction: "asc",
  });

  // Sorting state for Legend (Medical, Dental, Vision)
  const [legendSort, setLegendSort] = useState<{ column: LegendSortColumn; direction: SortDirection }>({
    column: "code",
    direction: "asc",
  });

  // Toggle sort for a column
  const toggleEmployeeSort = (column: EmployeeSortColumn) => {
    setEmployeeSort((prev) => ({
      column,
      direction: prev.column === column && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const toggleLegendSort = (column: LegendSortColumn) => {
    setLegendSort((prev) => ({
      column,
      direction: prev.column === column && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  // Sorted employees
  const sortedEmployees = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.employees].sort((a, b) => {
      const { column, direction } = employeeSort;
      let comparison = 0;
      if (column === "staffName") {
        comparison = a.staffName.localeCompare(b.staffName);
      } else {
        comparison = a[column] - b[column];
      }
      return direction === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [data, employeeSort]);

  // Sorted legend items (Medical, Dental, Vision only)
  const sortedLegendItems = useMemo(() => {
    if (!data) return [];
    const filtered = data.legend.filter(
      (l) => !l.isFormula && (l.code.startsWith("M") || l.code.startsWith("D") || l.code.startsWith("V"))
    );
    const sorted = [...filtered].sort((a, b) => {
      const { column, direction } = legendSort;
      let comparison = 0;
      if (column === "code" || column === "description") {
        comparison = a[column].localeCompare(b[column]);
      } else {
        comparison = a[column] - b[column];
      }
      return direction === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [data, legendSort]);

  // Sort indicator component
  const SortIndicator = ({ column, currentSort }: { column: string; currentSort: { column: string; direction: SortDirection } }) => {
    if (currentSort.column !== column) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-500 ml-1">{currentSort.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const generateReport = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/benefits-calc");
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate report");
      }

      const result: BenefitsData = await response.json();
      setData(result);
      toast.success(`Loaded ${result.summary.staffCount} staff members with ${result.summary.benefitOptionsCount} benefit options`);
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
      ["Benefits Calculator Report"],
      ["Generated", new Date().toLocaleString()],
      [],
      ["Metric", "Amount"],
      ["Total Monthly Cost", data.summary.totalMonthly],
      ["Total Yearly Cost", data.summary.totalYearly],
      ["Employee Paid (Monthly)", data.summary.eeMonthly],
      ["Employee Paid (Yearly)", data.summary.eeYearly],
      ["Firm Paid (Monthly)", data.summary.firmMonthly],
      ["Firm Paid (Yearly)", data.summary.firmYearly],
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    // Breakdown sheet
    const breakdownData = [
      ["Benefit Type", "Employee Monthly", "Firm Monthly", "Total Monthly", "Employee Annual", "Firm Annual", "Total Annual"],
      ...data.breakdown.map((b) => [
        b.benefitType,
        b.eeMonthly,
        b.firmMonthly,
        b.totalMonthly,
        b.eeYearly,
        b.firmYearly,
        b.totalYearly,
      ]),
      ["TOTAL", data.totals.eeMonthly, data.totals.firmMonthly, data.totals.totalMonthly, data.totals.eeYearly, data.totals.firmYearly, data.totals.totalYearly],
    ];
    const breakdownWs = XLSX.utils.aoa_to_sheet(breakdownData);
    XLSX.utils.book_append_sheet(wb, breakdownWs, "Breakdown");

    // Employee Details sheet
    const employeeData = [
      ["Staff Member", "Medical", "Dental", "Vision", "STD", "LTD", "Life",
       "Medical Cost", "Dental Cost", "Vision Cost", "STD Cost", "LTD Cost", "Life Cost",
       "Total $/mo", "EE $/mo", "Firm $/mo", "Total $/yr", "EE $/yr", "Firm $/yr", "Notes"],
      ...data.employees.map((e) => [
        e.staffName,
        e.medical.code,
        e.dental.code,
        e.vision.code,
        e.std.code,
        e.ltd.code,
        e.life.code,
        e.medical.cost.total,
        e.dental.cost.total,
        e.vision.cost.total,
        e.std.cost.total,
        e.ltd.cost.total,
        e.life.cost.total,
        e.totalMonthly,
        e.eeMonthly,
        e.firmMonthly,
        e.totalYearly,
        e.eeYearly,
        e.firmYearly,
        e.notes.join("; "),
      ]),
    ];
    const employeeWs = XLSX.utils.aoa_to_sheet(employeeData);
    XLSX.utils.book_append_sheet(wb, employeeWs, "Employee Details");

    return wb;
  };

  const downloadExcel = () => {
    const wb = generateExcelWorkbook();
    if (!wb) return;

    const filename = `benefits_calculator_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Benefits Calculator Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
          h1 { color: #336699; border-bottom: 2px solid #669999; padding-bottom: 10px; }
          h2 { color: #336699; margin-top: 30px; }
          table { border-collapse: collapse; width: 100%; margin: 15px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #669999; color: white; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .summary-box { display: inline-block; margin: 10px 20px 10px 0; padding: 15px 25px; border: 2px solid #FF9800; border-radius: 8px; background: #FFF4E6; }
          .summary-label { font-size: 12px; color: #666; }
          .summary-value { font-size: 24px; font-weight: bold; color: #333; }
          .summary-sub { font-size: 12px; color: #666; margin-top: 5px; }
          .text-right { text-align: right; }
          .total-row { font-weight: bold; background-color: #f0f0f0 !important; }
          .footer { margin-top: 40px; font-size: 12px; color: #999; }
          @media print { body { margin: 20px; } }
        </style>
      </head>
      <body>
        <h1>Benefits Calculator Report</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>

        <div style="margin: 20px 0;">
          <div class="summary-box">
            <div class="summary-label">Total Monthly Cost</div>
            <div class="summary-value">${formatCurrency(data.summary.totalMonthly)}</div>
            <div class="summary-sub">${formatCurrency(data.summary.totalYearly)}/year</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Employee Paid (Monthly)</div>
            <div class="summary-value">${formatCurrency(data.summary.eeMonthly)}</div>
            <div class="summary-sub">${formatCurrency(data.summary.eeYearly)}/year</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Firm Paid (Monthly)</div>
            <div class="summary-value">${formatCurrency(data.summary.firmMonthly)}</div>
            <div class="summary-sub">${formatCurrency(data.summary.firmYearly)}/year</div>
          </div>
        </div>

        <h2>Breakdown by Benefit Type</h2>
        <table>
          <tr>
            <th>Benefit Type</th>
            <th class="text-right">Employee Monthly</th>
            <th class="text-right">Firm Monthly</th>
            <th class="text-right">Total Monthly</th>
            <th class="text-right">Total Annual</th>
          </tr>
          ${data.breakdown.map((b) => `
            <tr>
              <td>${b.benefitType}</td>
              <td class="text-right">${formatCurrency(b.eeMonthly)}</td>
              <td class="text-right">${formatCurrency(b.firmMonthly)}</td>
              <td class="text-right">${formatCurrency(b.totalMonthly)}</td>
              <td class="text-right">${formatCurrency(b.totalYearly)}</td>
            </tr>
          `).join("")}
          <tr class="total-row">
            <td>TOTAL</td>
            <td class="text-right">${formatCurrency(data.totals.eeMonthly)}</td>
            <td class="text-right">${formatCurrency(data.totals.firmMonthly)}</td>
            <td class="text-right">${formatCurrency(data.totals.totalMonthly)}</td>
            <td class="text-right">${formatCurrency(data.totals.totalYearly)}</td>
          </tr>
        </table>

        <h2>Employee Details</h2>
        <table>
          <tr>
            <th>Staff Member</th>
            <th>Medical</th>
            <th>Dental</th>
            <th>Vision</th>
            <th>STD</th>
            <th>LTD</th>
            <th>Life</th>
            <th class="text-right">Total $/mo</th>
            <th class="text-right">EE $/mo</th>
            <th class="text-right">Firm $/mo</th>
          </tr>
          ${data.employees.map((e) => `
            <tr>
              <td>${e.staffName}</td>
              <td>${e.medical.code}</td>
              <td>${e.dental.code}</td>
              <td>${e.vision.code}</td>
              <td>${e.std.code}</td>
              <td>${e.ltd.code}</td>
              <td>${e.life.code}</td>
              <td class="text-right">${formatCurrency(e.totalMonthly)}</td>
              <td class="text-right">${formatCurrency(e.eeMonthly)}</td>
              <td class="text-right">${formatCurrency(e.firmMonthly)}</td>
            </tr>
          `).join("")}
        </table>

        <div class="footer">
          <p>Voyage Advisory - Benefits Calculator</p>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
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
      const filename = `benefits_calculator_${new Date().toISOString().slice(0, 10)}.xlsx`;

      const response = await fetch("/api/benefits-calc/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          summary: data.summary,
          breakdown: data.breakdown,
          totals: data.totals,
          employees: data.employees.map((e) => ({
            staffName: e.staffName,
            medicalCode: e.medical.code,
            dentalCode: e.dental.code,
            visionCode: e.vision.code,
            stdCode: e.std.code,
            ltdCode: e.ltd.code,
            lifeCode: e.life.code,
            totalMonthly: e.totalMonthly,
            eeMonthly: e.eeMonthly,
            firmMonthly: e.firmMonthly,
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <span className="text-4xl">💊</span>
              Benefits Calculator
            </h1>
            <p className="text-gray-500 mt-1">
              Calculate total benefits costs based on current employee selections
            </p>
          </div>
          <Button onClick={generateReport} disabled={loading} size="lg">
            {loading ? (
              <>
                <span className="animate-spin mr-2">⟳</span>
                Loading...
              </>
            ) : (
              "📊 Generate Benefits Report"
            )}
          </Button>
        </div>

        {/* Results */}
        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-5">
                <h3 className="text-sm text-gray-600 mb-1">Total Monthly Cost</h3>
                <p className="text-3xl font-bold text-gray-800">{formatCurrency(data.summary.totalMonthly)}</p>
                <p className="text-sm text-gray-500 mt-1">{formatCurrency(data.summary.totalYearly)}/year</p>
              </div>
              <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-5">
                <h3 className="text-sm text-gray-600 mb-1">Employee Paid (Monthly)</h3>
                <p className="text-3xl font-bold text-gray-800">{formatCurrency(data.summary.eeMonthly)}</p>
                <p className="text-sm text-gray-500 mt-1">{formatCurrency(data.summary.eeYearly)}/year</p>
              </div>
              <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-5">
                <h3 className="text-sm text-gray-600 mb-1">Firm Paid (Monthly)</h3>
                <p className="text-3xl font-bold text-gray-800">{formatCurrency(data.summary.firmMonthly)}</p>
                <p className="text-sm text-gray-500 mt-1">{formatCurrency(data.summary.firmYearly)}/year</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b">
              <nav className="flex gap-4">
                {[
                  { id: "breakdown", label: "📈 Breakdown by Type" },
                  { id: "employees", label: "👥 Employee Details" },
                  { id: "legend", label: "📖 Benefits Legend" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`px-4 py-2 -mb-px font-medium transition-colors ${
                      activeTab === tab.id
                        ? "border-b-2 border-blue-500 text-blue-600"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-xl border p-6">
              {activeTab === "breakdown" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left px-4 py-3">Benefit Type</th>
                        <th className="text-right px-4 py-3">Employee Monthly</th>
                        <th className="text-right px-4 py-3">Firm Monthly</th>
                        <th className="text-right px-4 py-3">Total Monthly</th>
                        <th className="text-right px-4 py-3">Employee Annual</th>
                        <th className="text-right px-4 py-3">Firm Annual</th>
                        <th className="text-right px-4 py-3">Total Annual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.breakdown.map((b) => (
                        <tr key={b.benefitType} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{b.benefitType}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(b.eeMonthly)}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(b.firmMonthly)}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(b.totalMonthly)}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(b.eeYearly)}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(b.firmYearly)}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(b.totalYearly)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-100 font-bold">
                        <td className="px-4 py-3">TOTAL</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(data.totals.eeMonthly)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(data.totals.firmMonthly)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(data.totals.totalMonthly)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(data.totals.eeYearly)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(data.totals.firmYearly)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(data.totals.totalYearly)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "employees" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th
                          className="text-left px-4 py-3 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => toggleEmployeeSort("staffName")}
                        >
                          Staff Member
                          <SortIndicator column="staffName" currentSort={employeeSort} />
                        </th>
                        <th className="text-center px-2 py-3">Medical</th>
                        <th className="text-center px-2 py-3">Dental</th>
                        <th className="text-center px-2 py-3">Vision</th>
                        <th className="text-center px-2 py-3">STD</th>
                        <th className="text-center px-2 py-3">LTD</th>
                        <th className="text-center px-2 py-3">Life</th>
                        <th
                          className="text-right px-4 py-3 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => toggleEmployeeSort("totalMonthly")}
                        >
                          Total $/mo
                          <SortIndicator column="totalMonthly" currentSort={employeeSort} />
                        </th>
                        <th
                          className="text-right px-4 py-3 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => toggleEmployeeSort("eeMonthly")}
                        >
                          EE $/mo
                          <SortIndicator column="eeMonthly" currentSort={employeeSort} />
                        </th>
                        <th
                          className="text-right px-4 py-3 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => toggleEmployeeSort("firmMonthly")}
                        >
                          Firm $/mo
                          <SortIndicator column="firmMonthly" currentSort={employeeSort} />
                        </th>
                        <th
                          className="text-right px-4 py-3 cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => toggleEmployeeSort("totalYearly")}
                        >
                          Total $/yr
                          <SortIndicator column="totalYearly" currentSort={employeeSort} />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sortedEmployees.map((e) => (
                        <tr key={e.staffName} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{e.staffName}</td>
                          <td className="px-2 py-3 text-center text-xs text-gray-600">{e.medical.code || "-"}</td>
                          <td className="px-2 py-3 text-center text-xs text-gray-600">{e.dental.code || "-"}</td>
                          <td className="px-2 py-3 text-center text-xs text-gray-600">{e.vision.code || "-"}</td>
                          <td className="px-2 py-3 text-center text-xs text-gray-600">{e.std.code || "-"}</td>
                          <td className="px-2 py-3 text-center text-xs text-gray-600">{e.ltd.code || "-"}</td>
                          <td className="px-2 py-3 text-center text-xs text-gray-600">{e.life.code || "-"}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatCurrency(e.totalMonthly)}</td>
                          <td className="px-4 py-3 text-right text-blue-600">{formatCurrency(e.eeMonthly)}</td>
                          <td className="px-4 py-3 text-right text-green-600">{formatCurrency(e.firmMonthly)}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(e.totalYearly)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.employees.some((e) => e.notes.length > 0) && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">
                        ⚠️ Some employees have notes about benefit selections. Check the Excel export for details.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "legend" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Fixed cost benefits */}
                    <div>
                      <h3 className="font-semibold text-lg mb-3">Medical, Dental, Vision</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-gray-600">
                            <tr>
                              <th
                                className="text-left px-3 py-2 cursor-pointer hover:bg-gray-100 select-none"
                                onClick={() => toggleLegendSort("code")}
                              >
                                Code
                                <SortIndicator column="code" currentSort={legendSort} />
                              </th>
                              <th
                                className="text-left px-3 py-2 cursor-pointer hover:bg-gray-100 select-none"
                                onClick={() => toggleLegendSort("description")}
                              >
                                Description
                                <SortIndicator column="description" currentSort={legendSort} />
                              </th>
                              <th
                                className="text-right px-3 py-2 cursor-pointer hover:bg-gray-100 select-none"
                                onClick={() => toggleLegendSort("totalCost")}
                              >
                                Total
                                <SortIndicator column="totalCost" currentSort={legendSort} />
                              </th>
                              <th
                                className="text-right px-3 py-2 cursor-pointer hover:bg-gray-100 select-none"
                                onClick={() => toggleLegendSort("eeCost")}
                              >
                                EE
                                <SortIndicator column="eeCost" currentSort={legendSort} />
                              </th>
                              <th
                                className="text-right px-3 py-2 cursor-pointer hover:bg-gray-100 select-none"
                                onClick={() => toggleLegendSort("firmCost")}
                              >
                                Firm
                                <SortIndicator column="firmCost" currentSort={legendSort} />
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {sortedLegendItems.map((l) => (
                              <tr key={l.code} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-mono text-xs">{l.code}</td>
                                <td className="px-3 py-2 text-xs">{l.description}</td>
                                <td className="px-3 py-2 text-right text-xs">{formatCurrency(l.totalCost)}</td>
                                <td className="px-3 py-2 text-right text-xs">{formatCurrency(l.eeCost)}</td>
                                <td className="px-3 py-2 text-right text-xs">{formatCurrency(l.firmCost)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Formula-based benefits */}
                    <div>
                      <h3 className="font-semibold text-lg mb-3">STD, LTD, Life/AD&D</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-gray-600">
                            <tr>
                              <th className="text-left px-3 py-2">Code</th>
                              <th className="text-left px-3 py-2">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {data.legend
                              .filter((l) => l.code.startsWith("SE") || l.code.startsWith("LE") || l.code.startsWith("TE"))
                              .map((l) => (
                                <tr key={l.code} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 font-mono text-xs">{l.code}</td>
                                  <td className="px-3 py-2 text-xs">{l.description}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="font-semibold text-blue-800 mb-2">Formula-Based Benefits</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li><strong>SE1/SE2:</strong> STD cost calculated from salary (66.67% of weekly salary, max $2,100/week benefit)</li>
                      <li><strong>LE1/LE2:</strong> LTD cost calculated from salary (60% benefit cap; premium based on salary formula)</li>
                      <li><strong>SE1/LE1:</strong> 100% Firm Paid</li>
                      <li><strong>SE2/LE2:</strong> 100% Employee Paid</li>
                    </ul>
                  </div>
                </div>
              )}
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
                  <h3 className="text-lg font-semibold mb-4">📧 Email Benefits Report</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Send the benefits calculator report as an Excel attachment.
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
            <span className="text-6xl block mb-4">💊</span>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Benefits Calculator</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Click the button above to generate a comprehensive benefits cost report
              based on current employee selections from Snowflake.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">What this calculates:</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li><strong>Medical, Dental, Vision:</strong> Fixed monthly costs based on plan selection</li>
                <li><strong>STD:</strong> Formula-based (66.67% of weekly salary, max $2,100/week)</li>
                <li><strong>LTD:</strong> Formula-based (premium based on salary)</li>
                <li><strong>Life/AD&D:</strong> Fixed cost based on coverage level</li>
              </ul>
              <div className="mt-4 pt-4 border-t">
                <h4 className="font-semibold text-gray-700 mb-1">Reports include:</h4>
                <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                  <li>Summary totals (monthly and yearly)</li>
                  <li>Breakdown by benefit type</li>
                  <li>Employee-by-employee details</li>
                  <li>Employee vs Firm cost split</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
