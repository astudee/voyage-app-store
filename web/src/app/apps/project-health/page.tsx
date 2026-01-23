"use client";

import { useState, useMemo } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ProjectHealth {
  projectId: string;
  client: string;
  projectName: string;
  timeline: string;
  booking: number;
  plannedRevenue: number;
  feesToDate: number;
  planBookedPct: number;
  feesBookedPct: number;
  durationPct: number;
  projectStatus: string;
  startDate: string;
  endDate: string;
  totalPlannedHours: number;
  totalActualHours: number;
  hasPipedriveMatch: boolean;
}

interface Summary {
  scopingErrors: number;
  overBilled: number;
  underBilled: number;
  totalBooking: number;
  projectCount: number;
  projectsWithPipedrive: number;
  projectsWithoutPipedrive: number;
}

interface ApiResponse {
  success: boolean;
  projects: ProjectHealth[];
  summary: Summary;
  metadata: {
    assignmentCount: number;
    dealCount: number;
    bigTimeEntryCount: number;
    bigTimeYears?: string;
    bigTimeProjectsWithActuals?: number;
    pipedriveFieldKey?: string;
    matchedDeals?: number;
    unmatchedDeals?: number;
  };
  error?: string;
}

type SortKey = "client" | "projectName" | "booking" | "plannedRevenue" | "feesToDate" | "planBookedPct" | "feesBookedPct" | "durationPct";
type SortDirection = "asc" | "desc";

function getPlanBookedColor(pct: number): string {
  if (pct >= 98 && pct <= 102) return "text-green-600";
  if (pct > 102) return "text-red-600";
  if (pct >= 80 && pct < 98) return "text-yellow-600";
  return "text-blue-600";
}

function getFeesBookedColor(feesPct: number, durationPct: number): string {
  const variance = feesPct - durationPct;
  if (Math.abs(variance) <= 3) return "text-green-600";
  if (variance > 3) return "text-red-600";
  if (variance >= -10 && variance < -3) return "text-yellow-600";
  return "text-blue-600";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (!direction) return <span className="ml-1 text-slate-300">↕</span>;
  return <span className="ml-1">{direction === "asc" ? "↑" : "↓"}</span>;
}

export default function ProjectHealthPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState("Active Only");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [emailTo, setEmailTo] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const fetchProjectHealth = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/project-health?status=${encodeURIComponent(statusFilter)}`
      );
      const result: ApiResponse = await response.json();

      if (result.success) {
        setData(result);
        toast.success(`Analyzed ${result.summary.projectCount} projects`);
      } else {
        toast.error(result.error || "Failed to fetch project health data");
      }
    } catch (error) {
      toast.error("Failed to fetch project health data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const sortedProjects = useMemo(() => {
    if (!data || !sortKey) return data?.projects || [];

    return [...data.projects].sort((a, b) => {
      let aVal: string | number = a[sortKey];
      let bVal: string | number = b[sortKey];

      // Handle N/A cases for percentage columns
      if (sortKey === "planBookedPct" || sortKey === "feesBookedPct") {
        if (!a.hasPipedriveMatch) aVal = -1;
        if (!b.hasPipedriveMatch) bVal = -1;
      }
      if (sortKey === "booking") {
        if (!a.hasPipedriveMatch) aVal = -1;
        if (!b.hasPipedriveMatch) bVal = -1;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortDirection === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [data, sortKey, sortDirection]);

  const downloadExcel = () => {
    if (!data) return;

    const wb = XLSX.utils.book_new();

    // Projects sheet
    const projectData = data.projects.map((p) => ({
      Client: p.client,
      Project: p.projectName,
      "BT Project ID": p.projectId,
      Timeline: p.timeline,
      "Pipedrive Linked": p.hasPipedriveMatch ? "Yes" : "No",
      Booking: p.hasPipedriveMatch ? p.booking : "N/A",
      Plan: p.plannedRevenue,
      "Fees to Date": p.feesToDate,
      "Plan/Booked %": p.hasPipedriveMatch ? p.planBookedPct : "N/A",
      "Fees/Booked %": p.hasPipedriveMatch ? p.feesBookedPct : "N/A",
      "% Duration": p.durationPct,
      Status: p.projectStatus,
      "Total Planned Hours": p.totalPlannedHours,
      "Total Actual Hours": p.totalActualHours,
    }));

    const ws = XLSX.utils.json_to_sheet(projectData);
    XLSX.utils.book_append_sheet(wb, ws, "Project Health");

    // Summary sheet
    const summaryData = [
      { Metric: "Total Projects", Value: data.summary.projectCount },
      { Metric: "Projects with Pipedrive", Value: data.summary.projectsWithPipedrive },
      { Metric: "Projects without Pipedrive", Value: data.summary.projectsWithoutPipedrive },
      { Metric: "Scoping Errors", Value: data.summary.scopingErrors },
      { Metric: "Over-Billed", Value: data.summary.overBilled },
      { Metric: "Under-Billed", Value: data.summary.underBilled },
      { Metric: "Total Bookings", Value: data.summary.totalBooking },
    ];
    const summaryWs = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    const filename = `project_health_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Excel file downloaded!");
  };

  const downloadPDF = () => {
    window.print();
  };

  const sendEmail = async () => {
    if (!data) return;
    if (!emailTo || !emailTo.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSendingEmail(true);
    try {
      // Generate Excel as base64
      const wb = XLSX.utils.book_new();
      const projectData = data.projects.map((p) => ({
        Client: p.client,
        Project: p.projectName,
        "BT Project ID": p.projectId,
        Timeline: p.timeline,
        "Pipedrive Linked": p.hasPipedriveMatch ? "Yes" : "No",
        Booking: p.hasPipedriveMatch ? p.booking : "N/A",
        Plan: p.plannedRevenue,
        "Fees to Date": p.feesToDate,
        "Plan/Booked %": p.hasPipedriveMatch ? p.planBookedPct : "N/A",
        "Fees/Booked %": p.hasPipedriveMatch ? p.feesBookedPct : "N/A",
        "% Duration": p.durationPct,
        Status: p.projectStatus,
      }));
      const ws = XLSX.utils.json_to_sheet(projectData);
      XLSX.utils.book_append_sheet(wb, ws, "Project Health");

      const excelBuffer = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

      const response = await fetch("/api/project-health/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          summary: data.summary,
          projects: data.projects,
          excelBase64: excelBuffer,
          filename: `project_health_${new Date().toISOString().split("T")[0]}.xlsx`,
        }),
      });

      const result = await response.json();
      if (result.success) {
        toast.success(`Email sent to ${emailTo}`);
        setEmailTo("");
      } else {
        toast.error(result.error || "Failed to send email");
      }
    } catch (error) {
      toast.error("Failed to send email");
      console.error(error);
    } finally {
      setSendingEmail(false);
    }
  };

  const SortableHeader = ({ label, sortKeyName, align = "left" }: { label: string; sortKeyName: SortKey; align?: "left" | "right" | "center" }) => (
    <th
      className={`p-3 font-medium text-slate-700 cursor-pointer hover:bg-slate-100 select-none ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      }`}
      onClick={() => handleSort(sortKeyName)}
    >
      {label}
      <SortIcon direction={sortKey === sortKeyName ? sortDirection : null} />
    </th>
  );

  return (
    <AppLayout>
      <div className="space-y-8 max-w-7xl print:space-y-4">
        {/* Header */}
        <div className="print:mb-4">
          <h1 className="text-3xl font-bold flex items-center gap-3 print:text-2xl">
            <span className="text-4xl print:hidden">📊</span>
            Project Health Monitor
          </h1>
          <p className="text-gray-500 mt-1">
            Track project health: Bookings vs Plan vs Delivery
          </p>
        </div>

        {/* Options */}
        <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm print:hidden">
          <div className="flex flex-wrap gap-6 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-700 font-medium">
                Project Status:
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Projects">All Projects</SelectItem>
                  <SelectItem value="Active Only">Active Only</SelectItem>
                  <SelectItem value="Completed Only">Completed Only</SelectItem>
                  <SelectItem value="Not Started">Not Started</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={fetchProjectHealth}
              disabled={loading}
              size="lg"
            >
              {loading ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Analyzing...
                </>
              ) : (
                "📊 Generate Project Health Report"
              )}
            </Button>
          </div>

          {!data && !loading && (
            <p className="text-sm text-slate-500 mt-4">
              Click the button to analyze project health across Pipedrive
              (bookings), Snowflake (plan), and BigTime (actuals).
            </p>
          )}
        </div>

        {data && (
          <>
            {/* Metadata */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600 print:hidden">
              <div>
                Data sources: {data.metadata.dealCount} Pipedrive deals |{" "}
                {data.metadata.assignmentCount} assignments |{" "}
                {data.metadata.bigTimeEntryCount.toLocaleString()} BigTime entries
              </div>
              <div className="mt-1 text-xs">
                BigTime years: {data.metadata.bigTimeYears} |{" "}
                Projects with actuals: {data.metadata.bigTimeProjectsWithActuals ?? 0}
              </div>
              {data.metadata.pipedriveFieldKey && (
                <div className="mt-1 text-xs">
                  Pipedrive BigTime ID field: {data.metadata.pipedriveFieldKey} |{" "}
                  Matched deals: {data.metadata.matchedDeals ?? 0} |{" "}
                  Unmatched: {data.metadata.unmatchedDeals ?? 0}
                </div>
              )}
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 print:grid-cols-5 print:gap-2">
              <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm print:p-3">
                <p className="text-3xl font-bold text-red-600 print:text-xl">
                  {data.summary.scopingErrors}
                </p>
                <p className="text-sm text-slate-500 mt-1 print:text-xs">
                  🔴 Scoping Errors
                </p>
              </div>
              <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm print:p-3">
                <p className="text-3xl font-bold text-yellow-600 print:text-xl">
                  {data.summary.overBilled}
                </p>
                <p className="text-sm text-slate-500 mt-1 print:text-xs">
                  ⚠️ Over-Billed
                </p>
              </div>
              <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm print:p-3">
                <p className="text-3xl font-bold text-blue-600 print:text-xl">
                  {data.summary.underBilled}
                </p>
                <p className="text-sm text-slate-500 mt-1 print:text-xs">
                  🔵 Under-Billed
                </p>
              </div>
              <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm print:p-3">
                <p className="text-3xl font-bold text-slate-800 print:text-xl">
                  {formatCurrency(data.summary.totalBooking)}
                </p>
                <p className="text-sm text-slate-500 mt-1 print:text-xs">
                  💰 Total Bookings
                </p>
              </div>
              <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm print:p-3">
                <p className="text-3xl font-bold text-orange-600 print:text-xl">
                  {data.summary.projectsWithoutPipedrive}
                </p>
                <p className="text-sm text-slate-500 mt-1 print:text-xs">
                  ⚠️ No Pipedrive Link
                </p>
              </div>
            </div>

            {/* Project Table */}
            <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm print:p-2 print:border">
              <div className="flex items-center justify-between mb-4 print:mb-2">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800 print:text-lg">
                    📋 Project Details
                  </h2>
                  <p className="text-sm text-slate-500 print:text-xs">
                    {data.summary.projectCount} projects (click column headers to sort)
                  </p>
                </div>
                <div className="flex gap-2 print:hidden">
                  <Button variant="outline" onClick={downloadExcel}>
                    📥 Excel
                  </Button>
                  <Button variant="outline" onClick={downloadPDF}>
                    📄 PDF
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm print:text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <SortableHeader label="Client" sortKeyName="client" />
                      <SortableHeader label="Project" sortKeyName="projectName" />
                      <th className="text-left p-3 font-medium text-slate-700 print:p-1">
                        BT ID
                      </th>
                      <th className="text-left p-3 font-medium text-slate-700 print:hidden">
                        Timeline
                      </th>
                      <SortableHeader label="Booking" sortKeyName="booking" align="right" />
                      <SortableHeader label="Plan" sortKeyName="plannedRevenue" align="right" />
                      <SortableHeader label="Fees to Date" sortKeyName="feesToDate" align="right" />
                      <SortableHeader label="Plan/Booked" sortKeyName="planBookedPct" align="center" />
                      <SortableHeader label="Fees/Booked" sortKeyName="feesBookedPct" align="center" />
                      <SortableHeader label="% Duration" sortKeyName="durationPct" align="center" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProjects.map((project) => (
                      <tr
                        key={project.projectId}
                        className={`border-t border-slate-100 hover:bg-slate-50 print:hover:bg-transparent ${
                          !project.hasPipedriveMatch ? "bg-orange-50" : ""
                        }`}
                      >
                        <td className="p-3 print:p-1">{project.client}</td>
                        <td className="p-3 print:p-1">
                          {project.projectName}
                          {!project.hasPipedriveMatch && (
                            <span className="ml-2 text-xs bg-orange-200 text-orange-800 px-1 rounded">
                              No PD
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-blue-600 print:p-1 print:text-xs">
                          {project.projectId}
                        </td>
                        <td className="p-3 print:hidden">{project.timeline}</td>
                        <td className="p-3 text-right print:p-1">
                          {project.hasPipedriveMatch
                            ? formatCurrency(project.booking)
                            : "N/A"}
                        </td>
                        <td className="p-3 text-right print:p-1">
                          {formatCurrency(project.plannedRevenue)}
                        </td>
                        <td className="p-3 text-right print:p-1">
                          {formatCurrency(project.feesToDate)}
                        </td>
                        <td
                          className={`p-3 text-center font-medium print:p-1 ${
                            project.hasPipedriveMatch
                              ? getPlanBookedColor(project.planBookedPct)
                              : "text-slate-400"
                          }`}
                        >
                          {project.hasPipedriveMatch
                            ? `${project.planBookedPct.toFixed(0)}%`
                            : "N/A"}
                        </td>
                        <td
                          className={`p-3 text-center font-medium print:p-1 ${
                            project.hasPipedriveMatch
                              ? getFeesBookedColor(
                                  project.feesBookedPct,
                                  project.durationPct
                                )
                              : "text-slate-400"
                          }`}
                        >
                          {project.hasPipedriveMatch
                            ? `${project.feesBookedPct.toFixed(0)}%`
                            : "N/A"}
                        </td>
                        <td className="p-3 text-center print:p-1">
                          {project.durationPct.toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                    {sortedProjects.length === 0 && (
                      <tr>
                        <td
                          colSpan={10}
                          className="p-8 text-center text-slate-500"
                        >
                          No projects match the selected filter
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Email Section */}
            <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm print:hidden">
              <h3 className="font-semibold text-slate-800 mb-4">
                📧 Email Report
              </h3>
              <div className="flex gap-4 items-center">
                <input
                  type="email"
                  placeholder="recipient@example.com"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button
                  onClick={sendEmail}
                  disabled={sendingEmail || !emailTo}
                >
                  {sendingEmail ? "Sending..." : "Send Email"}
                </Button>
              </div>
            </div>

            {/* Legend */}
            <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm print:p-3 print:border">
              <h3 className="font-semibold text-slate-800 mb-4 print:mb-2 print:text-sm">
                📚 Color Legend
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm print:text-xs print:gap-2">
                <div>
                  <h4 className="font-medium text-slate-700 mb-2 print:mb-1">
                    Plan/Booked (Scoping Accuracy)
                  </h4>
                  <ul className="space-y-1">
                    <li className="text-green-600">
                      🟢 98-102%: Perfect scoping
                    </li>
                    <li className="text-yellow-600">
                      🟡 80-97%: Slightly under-scoped
                    </li>
                    <li className="text-red-600">
                      🔴 &gt;102%: Over-scoped
                    </li>
                    <li className="text-blue-600">
                      🔵 &lt;80%: Significantly under-scoped
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-slate-700 mb-2 print:mb-1">
                    Fees/Booked vs % Duration
                  </h4>
                  <ul className="space-y-1">
                    <li className="text-green-600">
                      🟢 Within 3%: On track
                    </li>
                    <li className="text-yellow-600">
                      🟡 3-10% behind: Slightly behind schedule
                    </li>
                    <li className="text-red-600">
                      🔴 &gt;3% ahead: Running hot
                    </li>
                    <li className="text-blue-600">
                      🔵 &gt;10% behind: Significantly behind
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Help Section */}
        {!data && (
          <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm print:hidden">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              ℹ️ How it works
            </h2>
            <div className="space-y-4 text-sm text-slate-600">
              <div>
                <h3 className="font-medium text-slate-700">
                  Three-Way Project Health Analysis
                </h3>
                <p className="mt-2">
                  This app reconciles data from three sources to assess project
                  health:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                  <li>
                    <strong>Bookings (Pipedrive)</strong> - What we sold
                  </li>
                  <li>
                    <strong>Plan (Snowflake)</strong> - What we planned to
                    deliver
                  </li>
                  <li>
                    <strong>Delivery (BigTime)</strong> - What we actually
                    delivered
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-slate-700">Key Metrics</h3>
                <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                  <li>
                    <strong>Plan/Booked</strong> - Compares planned revenue
                    (hours × rate) to booking value
                  </li>
                  <li>
                    <strong>Fees/Booked</strong> - Actual fees billed vs booking
                    value
                  </li>
                  <li>
                    <strong>% Duration</strong> - How far through the project
                    timeline
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-slate-700">What to Look For</h3>
                <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                  <li>
                    <strong>Scoping Errors</strong> - Plan/Booked outside
                    85-120% range
                  </li>
                  <li>
                    <strong>Over-Billed</strong> - Fees/Booked exceeds 100%
                  </li>
                  <li>
                    <strong>Under-Billed</strong> - More than 50% through
                    timeline but less than 50% billed
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
