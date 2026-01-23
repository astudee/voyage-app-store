"use client";

import { useState, useMemo } from "react";
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

interface MonthlyData {
  period: string;
  displayName: string;
  hours: number;
  revenue: number;
  capacity: number;
}

interface StaffReport {
  staffName: string;
  classification: "Active Employee" | "Contractor" | "Inactive";
  months: MonthlyData[];
  totalHours: number;
  totalRevenue: number;
}

interface ReportData {
  startDate: string;
  endDate: string;
  months: { period: string; displayName: string }[];
  staffReports: StaffReport[];
  byClassification: {
    activeEmployees: StaffReport[];
    contractors: StaffReport[];
    inactive: StaffReport[];
  };
  capacityReference: {
    monthlyCapacity: { period: string; displayName: string; capacity: number }[];
    capacity1840: number;
    totalCapacity: number;
  };
  summary: {
    totalEntries: number;
    activeEmployeeCount: number;
    contractorCount: number;
    inactiveCount: number;
    totalHours: number;
    totalRevenue: number;
  };
  timestamp: string;
}

type SortColumn = "staffName" | "total" | string; // string for month periods
type SortDirection = "asc" | "desc";

interface SortConfig {
  column: SortColumn;
  direction: SortDirection;
}

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const formatHours = (n: number) => n.toFixed(1);
const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

export default function BillableHoursPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);

  const currentYear = new Date().getFullYear();
  const [startMonth, setStartMonth] = useState("1");
  const [startYear, setStartYear] = useState(String(currentYear));
  const [endMonth, setEndMonth] = useState("12");
  const [endYear, setEndYear] = useState(String(currentYear));
  const [metricType, setMetricType] = useState<"hours" | "revenue">("hours");

  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // Sort state for each section
  const [activeSort, setActiveSort] = useState<SortConfig>({ column: "staffName", direction: "asc" });
  const [contractorSort, setContractorSort] = useState<SortConfig>({ column: "staffName", direction: "asc" });
  const [inactiveSort, setInactiveSort] = useState<SortConfig>({ column: "staffName", direction: "asc" });

  const generateReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startYear,
        startMonth,
        endYear,
        endMonth,
      });

      const response = await fetch(`/api/billable-hours?${params}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate report");
      }

      const result: ReportData = await response.json();
      setData(result);
      toast.success(`Loaded ${result.summary.totalEntries.toLocaleString()} time entries`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate report";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const getCapacityColor = (hours: number, capacity: number) => {
    if (capacity === 0) return "";
    const pct = hours / capacity;
    if (pct < 0.8) return "bg-blue-100";
    if (pct < 1.0) return "bg-yellow-100";
    return "bg-green-100";
  };

  const getRevenueColor = (value: number, values: number[]) => {
    if (value === 0 || values.length === 0) return "";
    const nonZero = values.filter((v) => v > 0);
    if (nonZero.length === 0) return "";
    const sorted = [...nonZero].sort((a, b) => a - b);
    const q50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const q75 = sorted[Math.floor(sorted.length * 0.75)] || 0;
    if (value >= q75) return "bg-green-100";
    if (value >= q50) return "bg-yellow-100";
    return "bg-blue-100";
  };

  const generateExcelWorkbook = () => {
    if (!data) return null;

    const wb = XLSX.utils.book_new();
    const isHours = metricType === "hours";

    // Helper to create sheet data for a classification
    const createSheetData = (staff: StaffReport[]) => {
      const headers = ["Staff Member", ...data.months.map((m) => m.displayName), "Total"];
      const rows = staff.map((s) => [
        s.staffName,
        ...s.months.map((m) => (isHours ? m.hours : m.revenue)),
        isHours ? s.totalHours : s.totalRevenue,
      ]);
      return [headers, ...rows];
    };

    // Create sheets for each classification
    if (data.byClassification.activeEmployees.length > 0) {
      const ws = XLSX.utils.aoa_to_sheet(createSheetData(data.byClassification.activeEmployees));
      XLSX.utils.book_append_sheet(wb, ws, "Active_Employees");
    }

    if (data.byClassification.contractors.length > 0) {
      const ws = XLSX.utils.aoa_to_sheet(createSheetData(data.byClassification.contractors));
      XLSX.utils.book_append_sheet(wb, ws, "Contractors");
    }

    if (data.byClassification.inactive.length > 0) {
      const ws = XLSX.utils.aoa_to_sheet(createSheetData(data.byClassification.inactive));
      XLSX.utils.book_append_sheet(wb, ws, "Inactive");
    }

    // Capacity reference (only for hours)
    if (isHours) {
      const capData = [
        ["Capacity Reference", ...data.capacityReference.monthlyCapacity.map((m) => m.displayName), "Total"],
        [
          "Monthly Capacity",
          ...data.capacityReference.monthlyCapacity.map((m) => m.capacity),
          data.capacityReference.totalCapacity,
        ],
        [
          "Capacity @ 1840",
          ...data.months.map(() => 153.3),
          Math.round(153.3 * data.months.length * 10) / 10,
        ],
        [
          "Capacity × 80%",
          ...data.capacityReference.monthlyCapacity.map((m) => Math.round(m.capacity * 0.8 * 10) / 10),
          Math.round(data.capacityReference.totalCapacity * 0.8 * 10) / 10,
        ],
      ];
      const ws = XLSX.utils.aoa_to_sheet(capData);
      XLSX.utils.book_append_sheet(wb, ws, "Capacity_Reference");
    }

    return wb;
  };

  const downloadExcel = () => {
    const wb = generateExcelWorkbook();
    if (!wb) return;

    const metricLabel = metricType === "hours" ? "hours" : "revenue";
    const filename = `billable_${metricLabel}_report_${startYear}${startMonth.padStart(2, "0")}-${endYear}${endMonth.padStart(2, "0")}.xlsx`;
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

    const isHours = metricType === "hours";
    const valueLabel = isHours ? "Hours" : "Revenue";
    const formatValue = isHours ? formatHours : formatCurrency;

    const renderStaffTable = (staff: StaffReport[], title: string) => {
      if (staff.length === 0) return "";
      return `
        <h2>${title} (${staff.length})</h2>
        <table>
          <tr>
            <th>Staff Member</th>
            ${data.months.map((m) => `<th class="text-right">${m.displayName}</th>`).join("")}
            <th class="text-right">Total</th>
          </tr>
          ${staff.map((s) => `
            <tr>
              <td>${s.staffName}</td>
              ${s.months.map((m) => `<td class="text-right">${formatValue(isHours ? m.hours : m.revenue)}</td>`).join("")}
              <td class="text-right font-bold">${formatValue(isHours ? s.totalHours : s.totalRevenue)}</td>
            </tr>
          `).join("")}
        </table>
      `;
    };

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Billable ${valueLabel} Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
          h1 { color: #336699; border-bottom: 2px solid #669999; padding-bottom: 10px; }
          h2 { color: #336699; margin-top: 30px; }
          table { border-collapse: collapse; width: 100%; margin: 15px 0; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
          th { background-color: #669999; color: white; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .text-right { text-align: right; }
          .font-bold { font-weight: bold; }
          .summary-box { display: inline-block; margin: 10px 20px 10px 0; padding: 15px 25px; border: 2px solid #FF9800; border-radius: 8px; background: #FFF4E6; }
          .summary-label { font-size: 12px; color: #666; }
          .summary-value { font-size: 24px; font-weight: bold; color: #333; }
          .footer { margin-top: 40px; font-size: 12px; color: #999; }
          @media print { body { margin: 20px; } }
        </style>
      </head>
      <body>
        <h1>Billable ${valueLabel} Report</h1>
        <p>Period: ${new Date(data.startDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })} - ${new Date(data.endDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
        <p>Generated: ${new Date().toLocaleString()}</p>

        <div style="margin: 20px 0;">
          <div class="summary-box">
            <div class="summary-label">Total ${valueLabel}</div>
            <div class="summary-value">${formatValue(isHours ? data.summary.totalHours : data.summary.totalRevenue)}</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Active Employees</div>
            <div class="summary-value">${data.summary.activeEmployeeCount}</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Contractors</div>
            <div class="summary-value">${data.summary.contractorCount}</div>
          </div>
        </div>

        ${renderStaffTable(data.byClassification.activeEmployees, "Active Employees")}
        ${renderStaffTable(data.byClassification.contractors, "Contractors")}
        ${renderStaffTable(data.byClassification.inactive, "Inactive")}

        <div class="footer">
          <p>Voyage Advisory - Billable ${valueLabel} Report</p>
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
      const metricLabel = metricType === "hours" ? "hours" : "revenue";
      const filename = `billable_${metricLabel}_report_${startYear}${startMonth.padStart(2, "0")}-${endYear}${endMonth.padStart(2, "0")}.xlsx`;

      const response = await fetch("/api/billable-hours/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          startDate: data.startDate,
          endDate: data.endDate,
          metricType,
          summary: data.summary,
          activeEmployees: data.byClassification.activeEmployees.map((s) => ({
            staffName: s.staffName,
            classification: s.classification,
            totalHours: s.totalHours,
            totalRevenue: s.totalRevenue,
          })),
          contractors: data.byClassification.contractors.map((s) => ({
            staffName: s.staffName,
            classification: s.classification,
            totalHours: s.totalHours,
            totalRevenue: s.totalRevenue,
          })),
          inactive: data.byClassification.inactive.map((s) => ({
            staffName: s.staffName,
            classification: s.classification,
            totalHours: s.totalHours,
            totalRevenue: s.totalRevenue,
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

  // Sorting function
  const sortStaff = (staff: StaffReport[], sortConfig: SortConfig): StaffReport[] => {
    const isHours = metricType === "hours";
    return [...staff].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      if (sortConfig.column === "staffName") {
        aVal = a.staffName.toLowerCase();
        bVal = b.staffName.toLowerCase();
      } else if (sortConfig.column === "total") {
        aVal = isHours ? a.totalHours : a.totalRevenue;
        bVal = isHours ? b.totalHours : b.totalRevenue;
      } else {
        // Month period
        const aMonth = a.months.find((m) => m.period === sortConfig.column);
        const bMonth = b.months.find((m) => m.period === sortConfig.column);
        aVal = aMonth ? (isHours ? aMonth.hours : aMonth.revenue) : 0;
        bVal = bMonth ? (isHours ? bMonth.hours : bMonth.revenue) : 0;
      }

      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  };

  // Sorted data for each section
  const sortedActiveEmployees = useMemo(() => {
    if (!data) return [];
    return sortStaff(data.byClassification.activeEmployees, activeSort);
  }, [data, activeSort, metricType]);

  const sortedContractors = useMemo(() => {
    if (!data) return [];
    return sortStaff(data.byClassification.contractors, contractorSort);
  }, [data, contractorSort, metricType]);

  const sortedInactive = useMemo(() => {
    if (!data) return [];
    return sortStaff(data.byClassification.inactive, inactiveSort);
  }, [data, inactiveSort, metricType]);

  // Compute column revenue values for percentile coloring
  const columnRevenueValues = useMemo(() => {
    if (!data) return new Map<string, number[]>();
    const map = new Map<string, number[]>();
    for (const staff of data.staffReports) {
      for (const m of staff.months) {
        if (!map.has(m.period)) map.set(m.period, []);
        if (m.revenue > 0) map.get(m.period)!.push(m.revenue);
      }
    }
    return map;
  }, [data]);

  const SortIndicator = ({ column, sortConfig }: { column: SortColumn; sortConfig: SortConfig }) => {
    if (sortConfig.column !== column) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="ml-1">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const handleSort = (
    column: SortColumn,
    sortConfig: SortConfig,
    setSortConfig: React.Dispatch<React.SetStateAction<SortConfig>>
  ) => {
    if (sortConfig.column === column) {
      setSortConfig({ column, direction: sortConfig.direction === "asc" ? "desc" : "asc" });
    } else {
      setSortConfig({ column, direction: column === "staffName" ? "asc" : "desc" });
    }
  };

  const renderStaffTable = (
    staff: StaffReport[],
    title: string,
    sortConfig: SortConfig,
    setSortConfig: React.Dispatch<React.SetStateAction<SortConfig>>
  ) => {
    if (staff.length === 0) return null;

    const isHours = metricType === "hours";

    return (
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-3">
          {title} ({staff.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th
                  className="text-left px-3 py-2 sticky left-0 bg-gray-50 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort("staffName", sortConfig, setSortConfig)}
                >
                  Staff Member
                  <SortIndicator column="staffName" sortConfig={sortConfig} />
                </th>
                {data?.months.map((m) => (
                  <th
                    key={m.period}
                    className="text-right px-2 py-2 min-w-[70px] cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort(m.period, sortConfig, setSortConfig)}
                  >
                    {m.displayName}
                    <SortIndicator column={m.period} sortConfig={sortConfig} />
                  </th>
                ))}
                <th
                  className="text-right px-3 py-2 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort("total", sortConfig, setSortConfig)}
                >
                  Total
                  <SortIndicator column="total" sortConfig={sortConfig} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {staff.map((s) => (
                <tr key={s.staffName} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium sticky left-0 bg-white">{s.staffName}</td>
                  {s.months.map((m) => {
                    const value = isHours ? m.hours : m.revenue;
                    const colorClass = isHours
                      ? getCapacityColor(m.hours, m.capacity)
                      : getRevenueColor(m.revenue, columnRevenueValues.get(m.period) || []);
                    return (
                      <td
                        key={m.period}
                        className={`px-2 py-2 text-right ${colorClass}`}
                      >
                        {isHours ? formatHours(value) : formatCurrency(value)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-bold">
                    {isHours ? formatHours(s.totalHours) : formatCurrency(s.totalRevenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <span className="text-4xl">📊</span>
              Billable Hours Report
            </h1>
            <p className="text-gray-500 mt-1">
              Monthly billable hours and revenue with capacity analysis
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl border p-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 items-end">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Start Month</label>
              <Select value={startMonth} onValueChange={setStartMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Start Year</label>
              <Input
                type="number"
                min={2020}
                max={2035}
                value={startYear}
                onChange={(e) => setStartYear(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">End Month</label>
              <Select value={endMonth} onValueChange={setEndMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">End Year</label>
              <Input
                type="number"
                min={2020}
                max={2035}
                value={endYear}
                onChange={(e) => setEndYear(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Metric</label>
              <Select value={metricType} onValueChange={(v) => setMetricType(v as "hours" | "revenue")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">Billable Hours</SelectItem>
                  <SelectItem value="revenue">Billable Revenue ($)</SelectItem>
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
                <h3 className="text-sm text-gray-600 mb-1">
                  Total {metricType === "hours" ? "Hours" : "Revenue"}
                </h3>
                <p className="text-2xl font-bold text-gray-800">
                  {metricType === "hours"
                    ? formatHours(data.summary.totalHours)
                    : formatCurrency(data.summary.totalRevenue)}
                </p>
              </div>
              <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4">
                <h3 className="text-sm text-gray-600 mb-1">Active Employees</h3>
                <p className="text-2xl font-bold text-gray-800">{data.summary.activeEmployeeCount}</p>
              </div>
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
                <h3 className="text-sm text-gray-600 mb-1">Contractors</h3>
                <p className="text-2xl font-bold text-gray-800">{data.summary.contractorCount}</p>
              </div>
              <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4">
                <h3 className="text-sm text-gray-600 mb-1">Inactive</h3>
                <p className="text-2xl font-bold text-gray-800">{data.summary.inactiveCount}</p>
              </div>
            </div>

            {/* Color Legend */}
            <div className="flex gap-6 text-sm">
              {metricType === "hours" ? (
                <>
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-green-100 border rounded"></span> ≥100% capacity
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-yellow-100 border rounded"></span> 80-99% capacity
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-blue-100 border rounded"></span> &lt;80% capacity
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-green-100 border rounded"></span> Top 25%
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-yellow-100 border rounded"></span> 25-50th percentile
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-blue-100 border rounded"></span> Bottom 50%
                  </span>
                </>
              )}
            </div>

            {/* Staff Tables */}
            <div className="bg-white rounded-xl border p-6">
              {renderStaffTable(sortedActiveEmployees, "Active Employees", activeSort, setActiveSort)}
              {renderStaffTable(sortedContractors, "Contractors", contractorSort, setContractorSort)}
              {renderStaffTable(sortedInactive, "Inactive", inactiveSort, setInactiveSort)}
            </div>

            {/* Capacity Reference (hours only) */}
            {metricType === "hours" && (
              <div className="bg-white rounded-xl border p-6">
                <h3 className="text-lg font-semibold mb-3">Monthly Capacity Reference</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left px-3 py-2">Metric</th>
                        {data.capacityReference.monthlyCapacity.map((m) => (
                          <th key={m.period} className="text-right px-2 py-2 min-w-[70px]">
                            {m.displayName}
                          </th>
                        ))}
                        <th className="text-right px-3 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <td className="px-3 py-2 font-medium">Monthly Capacity</td>
                        {data.capacityReference.monthlyCapacity.map((m) => (
                          <td key={m.period} className="px-2 py-2 text-right">
                            {m.capacity}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-bold">
                          {data.capacityReference.totalCapacity}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">Capacity @ 1840</td>
                        {data.months.map((m) => (
                          <td key={m.period} className="px-2 py-2 text-right">
                            153.3
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-bold">
                          {(153.3 * data.months.length).toFixed(1)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">Capacity × 80%</td>
                        {data.capacityReference.monthlyCapacity.map((m) => (
                          <td key={m.period} className="px-2 py-2 text-right">
                            {(m.capacity * 0.8).toFixed(1)}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-bold">
                          {(data.capacityReference.totalCapacity * 0.8).toFixed(1)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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
                    Send the billable {metricType} report as an Excel attachment.
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
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Billable Hours & Revenue Report</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Select a date range and click Generate Report to view billable hours by staff member.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">Staff Classification:</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li><strong>Active Employees:</strong> Listed in Staff configuration</li>
                <li><strong>Contractors:</strong> Have billable hours but not in Staff config</li>
                <li><strong>Inactive:</strong> No billable hours in last 2 months of report</li>
              </ul>
              <div className="mt-4 pt-4 border-t">
                <h4 className="font-semibold text-gray-700 mb-1">Color Coding (Hours):</h4>
                <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                  <li><strong>Green:</strong> ≥100% of monthly capacity</li>
                  <li><strong>Yellow:</strong> 80-99% of capacity</li>
                  <li><strong>Blue:</strong> &lt;80% of capacity</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
