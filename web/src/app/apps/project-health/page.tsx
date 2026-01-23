"use client";

import { useState } from "react";
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
  };
  error?: string;
}

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

function getPlanBookedEmoji(pct: number): string {
  if (pct >= 98 && pct <= 102) return "";
  if (pct > 102) return "";
  if (pct >= 80 && pct < 98) return "";
  return "";
}

function getFeesBookedEmoji(feesPct: number, durationPct: number): string {
  const variance = feesPct - durationPct;
  if (Math.abs(variance) <= 3) return "";
  if (variance > 3) return "";
  if (variance >= -10 && variance < -3) return "";
  return "";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ProjectHealthPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState("Active Only");

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

  const downloadExcel = () => {
    if (!data) return;

    // Create CSV content
    const headers = [
      "Client",
      "Project",
      "BT Project ID",
      "Timeline",
      "Pipedrive Linked",
      "Booking",
      "Plan",
      "Fees to Date",
      "Plan/Booked %",
      "Fees/Booked %",
      "% Duration",
      "Status",
      "Total Planned Hours",
      "Total Actual Hours",
    ];

    const rows = data.projects.map((p) => [
      p.client,
      p.projectName,
      p.projectId,
      p.timeline,
      p.hasPipedriveMatch ? "Yes" : "No",
      p.hasPipedriveMatch ? p.booking : "N/A",
      p.plannedRevenue,
      p.feesToDate,
      p.hasPipedriveMatch ? `${p.planBookedPct.toFixed(0)}%` : "N/A",
      p.hasPipedriveMatch ? `${p.feesBookedPct.toFixed(0)}%` : "N/A",
      `${p.durationPct.toFixed(0)}%`,
      p.projectStatus,
      p.totalPlannedHours,
      p.totalActualHours,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${cell}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `project_health_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-8 max-w-7xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <span className="text-4xl">📊</span>
            Project Health Monitor
          </h1>
          <p className="text-gray-500 mt-1">
            Track project health: Bookings vs Plan vs Delivery
          </p>
        </div>

        {/* Options */}
        <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
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
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
              Data sources: {data.metadata.dealCount} Pipedrive deals |{" "}
              {data.metadata.assignmentCount} assignments |{" "}
              {data.metadata.bigTimeEntryCount.toLocaleString()} BigTime entries
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-3xl font-bold text-red-600">
                  {data.summary.scopingErrors}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  🔴 Scoping Errors
                </p>
              </div>
              <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-3xl font-bold text-yellow-600">
                  {data.summary.overBilled}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  ⚠️ Over-Billed
                </p>
              </div>
              <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-3xl font-bold text-blue-600">
                  {data.summary.underBilled}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  🔵 Under-Billed
                </p>
              </div>
              <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-3xl font-bold text-slate-800">
                  {formatCurrency(data.summary.totalBooking)}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  💰 Total Bookings
                </p>
              </div>
              <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-3xl font-bold text-orange-600">
                  {data.summary.projectsWithoutPipedrive}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  ⚠️ No Pipedrive Link
                </p>
              </div>
            </div>

            {/* Project Table */}
            <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">
                    📋 Project Details
                  </h2>
                  <p className="text-sm text-slate-500">
                    {data.summary.projectCount} projects
                  </p>
                </div>
                <Button variant="outline" onClick={downloadExcel}>
                  📥 Download CSV
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left p-3 font-medium text-slate-700">
                        Client
                      </th>
                      <th className="text-left p-3 font-medium text-slate-700">
                        Project
                      </th>
                      <th className="text-left p-3 font-medium text-slate-700">
                        BT Project ID
                      </th>
                      <th className="text-left p-3 font-medium text-slate-700">
                        Timeline
                      </th>
                      <th className="text-right p-3 font-medium text-slate-700">
                        Booking
                      </th>
                      <th className="text-right p-3 font-medium text-slate-700">
                        Plan
                      </th>
                      <th className="text-right p-3 font-medium text-slate-700">
                        Fees to Date
                      </th>
                      <th className="text-center p-3 font-medium text-slate-700">
                        Plan/Booked
                      </th>
                      <th className="text-center p-3 font-medium text-slate-700">
                        Fees/Booked
                      </th>
                      <th className="text-center p-3 font-medium text-slate-700">
                        % Duration
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.projects.map((project) => (
                      <tr
                        key={project.projectId}
                        className={`border-t border-slate-100 hover:bg-slate-50 ${
                          !project.hasPipedriveMatch ? "bg-orange-50" : ""
                        }`}
                      >
                        <td className="p-3">{project.client}</td>
                        <td className="p-3">
                          {project.projectName}
                          {!project.hasPipedriveMatch && (
                            <span className="ml-2 text-xs bg-orange-200 text-orange-800 px-1 rounded">
                              No PD
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-blue-600">
                          {project.projectId}
                        </td>
                        <td className="p-3">{project.timeline}</td>
                        <td className="p-3 text-right">
                          {project.hasPipedriveMatch
                            ? formatCurrency(project.booking)
                            : "N/A"}
                        </td>
                        <td className="p-3 text-right">
                          {formatCurrency(project.plannedRevenue)}
                        </td>
                        <td className="p-3 text-right">
                          {formatCurrency(project.feesToDate)}
                        </td>
                        <td
                          className={`p-3 text-center font-medium ${
                            project.hasPipedriveMatch
                              ? getPlanBookedColor(project.planBookedPct)
                              : "text-slate-400"
                          }`}
                        >
                          {project.hasPipedriveMatch ? (
                            <>
                              {getPlanBookedEmoji(project.planBookedPct)}{" "}
                              {project.planBookedPct.toFixed(0)}%
                            </>
                          ) : (
                            "N/A"
                          )}
                        </td>
                        <td
                          className={`p-3 text-center font-medium ${
                            project.hasPipedriveMatch
                              ? getFeesBookedColor(
                                  project.feesBookedPct,
                                  project.durationPct
                                )
                              : "text-slate-400"
                          }`}
                        >
                          {project.hasPipedriveMatch ? (
                            <>
                              {getFeesBookedEmoji(
                                project.feesBookedPct,
                                project.durationPct
                              )}{" "}
                              {project.feesBookedPct.toFixed(0)}%
                            </>
                          ) : (
                            "N/A"
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {project.durationPct.toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                    {data.projects.length === 0 && (
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

            {/* Legend */}
            <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-4">
                📚 Color Legend
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <div>
                  <h4 className="font-medium text-slate-700 mb-2">
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
                  <h4 className="font-medium text-slate-700 mb-2">
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
          <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
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
