"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ResourceResult {
  staffMember: string;
  client: string;
  projectName: string;
  projectId: string;
  totalAssigned: number;
  totalActual: number;
  percentUsed: number;
  utilizationStatus: string;
  utilizationColor: string;
  scheduleStatus: string;
  paceRatio: number;
  delta: number;
  isUnassigned: boolean;
  sortOrder: number;
}

interface Summary {
  overruns: number;
  severelyUnder: number;
  late: number;
  unassigned: number;
  totalResources: number;
  employeeCount: number;
}

interface ResourceData {
  resources: ResourceResult[];
  summary: Summary;
  metadata: {
    startDate: string;
    endDate: string;
    assignmentCount: number;
    bigTimeEntryCount: number;
  };
}

type SortKey = keyof ResourceResult;

function getDefaultDates(): { start: string; end: string } {
  const today = new Date();
  return {
    start: `${today.getFullYear()}-01-01`,
    end: `${today.getFullYear()}-12-31`,
  };
}

function getUtilizationBadge(status: string, color: string): React.ReactNode {
  const colors: Record<string, string> = {
    red: "bg-red-100 text-red-800",
    green: "bg-green-100 text-green-800",
    yellow: "bg-yellow-100 text-yellow-800",
    blue: "bg-blue-100 text-blue-800",
    purple: "bg-purple-100 text-purple-800",
  };
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[color] || colors.blue}`}>
      {status}
    </span>
  );
}

function getScheduleBadge(status: string): React.ReactNode {
  const colors: Record<string, string> = {
    "Ahead": "bg-green-100 text-green-800",
    "On Schedule": "bg-green-100 text-green-800",
    "At Risk (Late)": "bg-yellow-100 text-yellow-800",
    "Late": "bg-red-100 text-red-800",
    "N/A": "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status] || colors["N/A"]}`}>
      {status}
    </span>
  );
}

export default function ResourceCheckerPage() {
  const defaults = getDefaultDates();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ResourceData | null>(null);
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);

  // Filters
  const [staffFilter, setStaffFilter] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [utilFilter, setUtilFilter] = useState<string[]>([]);
  const [schedFilter, setSchedFilter] = useState<string[]>([]);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("sortOrder");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const runCheck = async () => {
    if (endDate < startDate) {
      toast.error("End date must be after start date");
      return;
    }

    setLoading(true);
    setData(null);

    try {
      const response = await fetch(
        `/api/resource-checker?startDate=${startDate}&endDate=${endDate}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to run resource check");
      }

      const result = await response.json();
      setData(result);
      toast.success("Resource check complete!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to run check";
      toast.error(message);
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

  const getSortIndicator = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  };

  // Get filtered and sorted resources
  const getFilteredResources = (): ResourceResult[] => {
    if (!data) return [];

    let filtered = [...data.resources];

    if (staffFilter.length > 0) {
      filtered = filtered.filter((r) => staffFilter.includes(r.staffMember));
    }
    if (clientFilter.length > 0) {
      filtered = filtered.filter((r) => clientFilter.includes(r.client));
    }
    if (utilFilter.length > 0) {
      filtered = filtered.filter((r) => utilFilter.includes(r.utilizationStatus));
    }
    if (schedFilter.length > 0) {
      filtered = filtered.filter((r) => schedFilter.includes(r.scheduleStatus));
    }

    // Sort
    filtered.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const mult = sortDirection === "asc" ? 1 : -1;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return (aVal - bVal) * mult;
      }
      return String(aVal).localeCompare(String(bVal)) * mult;
    });

    return filtered;
  };

  const exportToExcel = () => {
    if (!data) return;

    const wb = XLSX.utils.book_new();
    const resources = getFilteredResources();

    const exportData = resources.map((r) => ({
      "Staff Member": r.staffMember,
      "Client": r.client,
      "Project": r.projectName,
      "Project ID": r.projectId,
      "Assigned Hours": r.totalAssigned,
      "Actual Hours": r.totalActual,
      "% Used": r.percentUsed,
      "Utilization Status": r.utilizationStatus,
      "Schedule Status": r.scheduleStatus,
      "Pace Ratio": r.paceRatio,
      "Delta vs Target": r.delta,
      "Unassigned": r.isUnassigned ? "Yes" : "No",
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Resource Check");

    const filename = `resource_check_${startDate}_${endDate}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Report downloaded!");
  };

  // Get unique values for filters
  const uniqueStaff = data ? [...new Set(data.resources.map((r) => r.staffMember))].sort() : [];
  const uniqueClients = data ? [...new Set(data.resources.map((r) => r.client))].sort() : [];
  const utilizationStatuses = ["Overrun", "On Target", "At Risk (High)", "Under Target", "Severely Under"];
  const scheduleStatuses = ["Ahead", "On Schedule", "At Risk (Late)", "Late", "N/A"];

  const filteredResources = getFilteredResources();

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px]">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Resource Checker</h1>
          <p className="text-gray-500 mt-1">
            Monitor utilization adherence, revenue underruns, and schedule pace
          </p>
        </div>

        {/* Configuration */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Analysis Period</h3>

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

          <Button onClick={runCheck} disabled={loading} className="w-full">
            {loading ? (
              <>
                <span className="animate-spin mr-2">&#8635;</span>
                Running Resource Check...
              </>
            ) : (
              "Run Resource Check"
            )}
          </Button>
        </div>

        {/* Results */}
        {data && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
                <div className="text-2xl font-bold text-red-700">{data.summary.overruns}</div>
                <div className="text-sm text-red-600">Overruns</div>
              </div>
              <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 text-center">
                <div className="text-2xl font-bold text-purple-700">{data.summary.severelyUnder}</div>
                <div className="text-sm text-purple-600">Severely Under</div>
              </div>
              <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4 text-center">
                <div className="text-2xl font-bold text-yellow-700">{data.summary.late}</div>
                <div className="text-sm text-yellow-600">Late</div>
              </div>
              <div className="bg-orange-50 rounded-xl border border-orange-200 p-4 text-center">
                <div className="text-2xl font-bold text-orange-700">{data.summary.unassigned}</div>
                <div className="text-sm text-orange-600">Unassigned Work</div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Filters</h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member</label>
                  <select
                    multiple
                    value={staffFilter}
                    onChange={(e) => setStaffFilter(Array.from(e.target.selectedOptions, (o) => o.value))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 h-24"
                  >
                    {uniqueStaff.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                  <select
                    multiple
                    value={clientFilter}
                    onChange={(e) => setClientFilter(Array.from(e.target.selectedOptions, (o) => o.value))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 h-24"
                  >
                    {uniqueClients.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Utilization Status</label>
                  <select
                    multiple
                    value={utilFilter}
                    onChange={(e) => setUtilFilter(Array.from(e.target.selectedOptions, (o) => o.value))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 h-24"
                  >
                    {utilizationStatuses.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Schedule Status</label>
                  <select
                    multiple
                    value={schedFilter}
                    onChange={(e) => setSchedFilter(Array.from(e.target.selectedOptions, (o) => o.value))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 h-24"
                  >
                    {scheduleStatuses.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStaffFilter([]);
                    setClientFilter([]);
                    setUtilFilter([]);
                    setSchedFilter([]);
                  }}
                >
                  Clear All Filters
                </Button>
                <span className="text-sm text-gray-500 ml-auto pt-1">
                  Showing {filteredResources.length} of {data.resources.length} resources
                </span>
              </div>
            </div>

            {/* Results Table */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Resource Details</h3>
              <p className="text-sm text-gray-500 mb-4">
                Period: {data.metadata.startDate} to {data.metadata.endDate}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b-2 border-gray-200">
                      <th
                        className="pb-2 cursor-pointer hover:bg-gray-50 px-2"
                        onClick={() => handleSort("staffMember")}
                      >
                        Staff{getSortIndicator("staffMember")}
                      </th>
                      <th
                        className="pb-2 cursor-pointer hover:bg-gray-50 px-2"
                        onClick={() => handleSort("client")}
                      >
                        Client{getSortIndicator("client")}
                      </th>
                      <th
                        className="pb-2 cursor-pointer hover:bg-gray-50 px-2"
                        onClick={() => handleSort("projectName")}
                      >
                        Project{getSortIndicator("projectName")}
                      </th>
                      <th
                        className="pb-2 cursor-pointer hover:bg-gray-50 px-2 text-right"
                        onClick={() => handleSort("totalAssigned")}
                      >
                        Assigned{getSortIndicator("totalAssigned")}
                      </th>
                      <th
                        className="pb-2 cursor-pointer hover:bg-gray-50 px-2 text-right"
                        onClick={() => handleSort("totalActual")}
                      >
                        Actual{getSortIndicator("totalActual")}
                      </th>
                      <th
                        className="pb-2 cursor-pointer hover:bg-gray-50 px-2 text-right"
                        onClick={() => handleSort("percentUsed")}
                      >
                        % Used{getSortIndicator("percentUsed")}
                      </th>
                      <th
                        className="pb-2 cursor-pointer hover:bg-gray-50 px-2"
                        onClick={() => handleSort("utilizationStatus")}
                      >
                        Utilization{getSortIndicator("utilizationStatus")}
                      </th>
                      <th
                        className="pb-2 cursor-pointer hover:bg-gray-50 px-2"
                        onClick={() => handleSort("scheduleStatus")}
                      >
                        Schedule{getSortIndicator("scheduleStatus")}
                      </th>
                      <th
                        className="pb-2 cursor-pointer hover:bg-gray-50 px-2 text-right"
                        onClick={() => handleSort("paceRatio")}
                      >
                        Pace{getSortIndicator("paceRatio")}
                      </th>
                      <th
                        className="pb-2 cursor-pointer hover:bg-gray-50 px-2 text-right"
                        onClick={() => handleSort("delta")}
                      >
                        Delta{getSortIndicator("delta")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResources.map((r, i) => (
                      <tr
                        key={`${r.staffMember}-${r.projectId}-${i}`}
                        className={`border-b border-gray-100 ${r.isUnassigned ? "bg-orange-50" : ""}`}
                      >
                        <td className="py-2 px-2">
                          {r.staffMember}
                          {r.isUnassigned && (
                            <span className="ml-1 text-xs bg-orange-200 text-orange-800 px-1 rounded">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2">{r.client}</td>
                        <td className="py-2 px-2">{r.projectName}</td>
                        <td className="py-2 px-2 text-right">{r.totalAssigned.toFixed(1)}</td>
                        <td className="py-2 px-2 text-right">{r.totalActual.toFixed(1)}</td>
                        <td className="py-2 px-2 text-right">
                          {r.percentUsed >= 999 ? ">100%" : `${r.percentUsed.toFixed(0)}%`}
                        </td>
                        <td className="py-2 px-2">
                          {getUtilizationBadge(r.utilizationStatus, r.utilizationColor)}
                        </td>
                        <td className="py-2 px-2">{getScheduleBadge(r.scheduleStatus)}</td>
                        <td className="py-2 px-2 text-right">
                          {r.paceRatio > 0 ? `${r.paceRatio.toFixed(2)}x` : "N/A"}
                        </td>
                        <td className={`py-2 px-2 text-right ${r.delta > 0 ? "text-red-600" : r.delta < 0 ? "text-blue-600" : ""}`}>
                          {r.delta > 0 ? "+" : ""}{r.delta.toFixed(1)}
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

            {/* Legend */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Status Legend</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-2">Utilization Status</h4>
                  <ul className="text-sm space-y-1">
                    <li><span className="text-red-600 font-medium">Overrun (&ge;100%)</span>: Exceeded authorization</li>
                    <li><span className="text-green-600 font-medium">On Target (95-99%)</span>: Perfect</li>
                    <li><span className="text-yellow-600 font-medium">At Risk (85-94%)</span>: Trending to overrun</li>
                    <li><span className="text-blue-600 font-medium">Under Target (70-84%)</span>: Under-utilization</li>
                    <li><span className="text-purple-600 font-medium">Severely Under (&lt;70%)</span>: Revenue leakage</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Schedule Status</h4>
                  <ul className="text-sm space-y-1">
                    <li><span className="text-green-600 font-medium">Ahead (&ge;1.05x)</span>: Burning faster than plan</li>
                    <li><span className="text-green-600 font-medium">On Schedule (0.95-1.04x)</span>: Healthy</li>
                    <li><span className="text-yellow-600 font-medium">At Risk (0.85-0.94x)</span>: Starting to slip</li>
                    <li><span className="text-red-600 font-medium">Late (&lt;0.85x)</span>: Material schedule drift</li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Instructions */}
        {!data && !loading && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Resource Checker</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Monitor resource utilization and schedule adherence across projects.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">Key Features:</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li><strong>Utilization</strong> - Are total authorized hours being respected?</li>
                <li><strong>Underruns</strong> - Are we leaving billable revenue on the table?</li>
                <li><strong>Schedule Pace</strong> - Are resources consuming hours at the required rate?</li>
                <li><strong>Unassigned Work</strong> - Are there actuals without assignments?</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
