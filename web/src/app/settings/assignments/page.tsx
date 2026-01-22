"use client";

import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Project {
  PROJECT_ID: number;
  CLIENT_NAME: string;
  PROJECT_NAME: string;
  PROJECT_STATUS: string;
  PROJECT_TYPE: string;
  BILL_RATE: number;
}

interface Assignment {
  ASSIGNMENT_ID: number;
  PROJECT_ID: number;
  STAFF_NAME: string;
  MONTH_DATE: string;
  ALLOCATED_HOURS: number;
  BILL_RATE: number;
  NOTES: string | null;
}

interface StaffRow {
  staffName: string;
  billRate: number;
  months: { [monthKey: string]: { assignmentId: number | null; hours: number } };
  totalHours: number;
  totalRevenue: number;
}

export default function AssignmentsSettingsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [staffRows, setStaffRows] = useState<StaffRow[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffRate, setNewStaffRate] = useState("");
  const [staffList, setStaffList] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Fetch projects on mount
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch("/api/projects");
        if (!response.ok) throw new Error("Failed to fetch projects");
        const data = await response.json();
        setProjects(data);
      } catch (error) {
        console.error("Error fetching projects:", error);
        toast.error("Failed to load projects");
      } finally {
        setLoading(false);
      }
    };

    const fetchStaffList = async () => {
      try {
        const response = await fetch("/api/staff");
        if (!response.ok) throw new Error("Failed to fetch staff");
        const data = await response.json();
        setStaffList(data.map((s: { NAME: string }) => s.NAME));
      } catch (error) {
        console.error("Error fetching staff:", error);
      }
    };

    fetchProjects();
    fetchStaffList();
  }, []);

  // Fetch assignments when project is selected
  const fetchAssignments = useCallback(async (projectId: string) => {
    if (!projectId) return;

    try {
      const response = await fetch(`/api/assignments?projectId=${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch assignments");
      const data: Assignment[] = await response.json();
      setAssignments(data);

      // Process assignments into grid structure
      processAssignments(data);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      toast.error("Failed to load assignments");
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      const project = projects.find((p) => p.PROJECT_ID.toString() === selectedProjectId);
      setSelectedProject(project || null);
      fetchAssignments(selectedProjectId);
    } else {
      setSelectedProject(null);
      setAssignments([]);
      setStaffRows([]);
      setMonths([]);
    }
  }, [selectedProjectId, projects, fetchAssignments]);

  // Process flat assignment data into grid structure
  const processAssignments = (data: Assignment[]) => {
    if (data.length === 0) {
      setStaffRows([]);
      setMonths([]);
      return;
    }

    // Get unique months and sort them
    const uniqueMonths = [...new Set(data.map((a) => a.MONTH_DATE.substring(0, 7)))].sort();
    setMonths(uniqueMonths);

    // Group by staff
    const staffMap = new Map<string, StaffRow>();

    for (const assignment of data) {
      const monthKey = assignment.MONTH_DATE.substring(0, 7);

      if (!staffMap.has(assignment.STAFF_NAME)) {
        staffMap.set(assignment.STAFF_NAME, {
          staffName: assignment.STAFF_NAME,
          billRate: assignment.BILL_RATE,
          months: {},
          totalHours: 0,
          totalRevenue: 0,
        });
      }

      const row = staffMap.get(assignment.STAFF_NAME)!;
      row.months[monthKey] = {
        assignmentId: assignment.ASSIGNMENT_ID,
        hours: assignment.ALLOCATED_HOURS,
      };
    }

    // Calculate totals
    const rows = Array.from(staffMap.values()).map((row) => {
      row.totalHours = Object.values(row.months).reduce((sum, m) => sum + m.hours, 0);
      row.totalRevenue = row.totalHours * row.billRate;
      return row;
    });

    // Sort by staff name
    rows.sort((a, b) => a.staffName.localeCompare(b.staffName));
    setStaffRows(rows);
  };

  // Handle cell edit (hours)
  const handleHoursChange = async (
    staffName: string,
    monthKey: string,
    newHours: number,
    assignmentId: number | null
  ) => {
    if (!selectedProjectId) return;

    const row = staffRows.find((r) => r.staffName === staffName);
    if (!row) return;

    setSaving(true);

    try {
      if (assignmentId) {
        // Update existing
        const response = await fetch(`/api/assignments/${assignmentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: parseInt(selectedProjectId),
            staff_name: staffName,
            month_date: `${monthKey}-01`,
            allocated_hours: newHours,
            bill_rate: row.billRate,
          }),
        });
        if (!response.ok) throw new Error("Failed to update");
      } else {
        // Create new
        const response = await fetch("/api/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: parseInt(selectedProjectId),
            staff_name: staffName,
            month_date: `${monthKey}-01`,
            allocated_hours: newHours,
            bill_rate: row.billRate,
          }),
        });
        if (!response.ok) throw new Error("Failed to create");
      }

      // Refresh data
      await fetchAssignments(selectedProjectId);
      toast.success("Updated");
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  // Handle bill rate change
  const handleRateChange = async (staffName: string, newRate: number) => {
    if (!selectedProjectId) return;

    const row = staffRows.find((r) => r.staffName === staffName);
    if (!row) return;

    setSaving(true);

    try {
      // Update all assignments for this staff/project with new rate
      const assignmentIds = Object.values(row.months)
        .filter((m) => m.assignmentId)
        .map((m) => m.assignmentId!);

      if (assignmentIds.length > 0) {
        // Bulk update using individual calls (could optimize with bulk endpoint)
        for (const month of Object.keys(row.months)) {
          const monthData = row.months[month];
          if (monthData.assignmentId) {
            await fetch(`/api/assignments/${monthData.assignmentId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                project_id: parseInt(selectedProjectId),
                staff_name: staffName,
                month_date: `${month}-01`,
                allocated_hours: monthData.hours,
                bill_rate: newRate,
              }),
            });
          }
        }
      }

      await fetchAssignments(selectedProjectId);
      toast.success("Rate updated");
    } catch (error) {
      console.error("Error updating rate:", error);
      toast.error("Failed to update rate");
    } finally {
      setSaving(false);
    }
  };

  // Add new staff member
  const handleAddStaff = async () => {
    if (!newStaffName || !selectedProjectId) return;

    const rate = parseFloat(newStaffRate) || selectedProject?.BILL_RATE || 0;

    // Add a placeholder row (will create actual assignments when hours are entered)
    setStaffRows((prev) => [
      ...prev,
      {
        staffName: newStaffName,
        billRate: rate,
        months: Object.fromEntries(months.map((m) => [m, { assignmentId: null, hours: 0 }])),
        totalHours: 0,
        totalRevenue: 0,
      },
    ]);

    setAddStaffOpen(false);
    setNewStaffName("");
    setNewStaffRate("");
    toast.success(`Added ${newStaffName}`);
  };

  // Delete staff from project
  const handleDeleteStaff = async (staffName: string) => {
    if (!selectedProjectId) return;

    const row = staffRows.find((r) => r.staffName === staffName);
    if (!row) return;

    const assignmentIds = Object.values(row.months)
      .filter((m) => m.assignmentId)
      .map((m) => m.assignmentId!);

    if (assignmentIds.length > 0) {
      try {
        await fetch("/api/assignments/bulk", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignment_ids: assignmentIds }),
        });
      } catch (error) {
        console.error("Error deleting:", error);
        toast.error("Failed to delete");
        return;
      }
    }

    setStaffRows((prev) => prev.filter((r) => r.staffName !== staffName));
    setDeleteConfirm(null);
    toast.success(`Removed ${staffName} from project`);
  };

  // Add month column
  const handleAddMonth = () => {
    // Find the next month after the last one
    const lastMonth = months[months.length - 1];
    let nextMonth: string;

    if (lastMonth) {
      const [year, month] = lastMonth.split("-").map(Number);
      if (month === 12) {
        nextMonth = `${year + 1}-01`;
      } else {
        nextMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
      }
    } else {
      // Default to current month
      const now = new Date();
      nextMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    setMonths((prev) => [...prev, nextMonth]);

    // Add empty entries for all staff rows
    setStaffRows((prev) =>
      prev.map((row) => ({
        ...row,
        months: {
          ...row.months,
          [nextMonth]: { assignmentId: null, hours: 0 },
        },
      }))
    );
  };

  // Calculate column totals
  const columnTotals = months.reduce(
    (acc, month) => {
      let hours = 0;
      let revenue = 0;
      for (const row of staffRows) {
        const monthData = row.months[month];
        if (monthData) {
          hours += monthData.hours;
          revenue += monthData.hours * row.billRate;
        }
      }
      acc[month] = { hours, revenue };
      return acc;
    },
    {} as { [key: string]: { hours: number; revenue: number } }
  );

  const grandTotalHours = staffRows.reduce((sum, r) => sum + r.totalHours, 0);
  const grandTotalRevenue = staffRows.reduce((sum, r) => sum + r.totalRevenue, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatMonth = (monthKey: string) => {
    const [year, month] = monthKey.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="py-8 text-center text-gray-500">Loading...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Staff Assignments</h1>
          <p className="text-gray-500">
            Allocate staff hours to projects by month
          </p>
        </div>

        {/* Project Selector */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Project:</label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-[400px]">
                <SelectValue placeholder="Select a project..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.PROJECT_ID} value={project.PROJECT_ID.toString()}>
                    {project.CLIENT_NAME} | {project.PROJECT_NAME}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {saving && <span className="text-sm text-gray-500">Saving...</span>}
        </div>

        {/* Project Info Bar */}
        {selectedProject && (
          <div className="rounded-lg border bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Client</p>
                <p className="font-medium">{selectedProject.CLIENT_NAME}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <p className="font-medium">{selectedProject.PROJECT_STATUS}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Type</p>
                <p className="font-medium">{selectedProject.PROJECT_TYPE}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Hours</p>
                <p className="text-xl font-bold">{grandTotalHours.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(grandTotalRevenue)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Assignment Grid */}
        {selectedProjectId && (
          <>
            <div className="flex gap-2">
              <Button onClick={() => setAddStaffOpen(true)}>+ Add Staff</Button>
              <Button variant="outline" onClick={handleAddMonth}>
                + Add Month
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="sticky left-0 bg-gray-100 px-4 py-3 text-left font-medium">
                      Staff Member
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Bill Rate</th>
                    {months.map((month) => (
                      <th key={month} className="px-4 py-3 text-center font-medium min-w-[80px]">
                        {formatMonth(month)}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right font-medium">Total Hrs</th>
                    <th className="px-4 py-3 text-right font-medium">Revenue</th>
                    <th className="px-4 py-3 text-center font-medium w-[60px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {staffRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={months.length + 5}
                        className="py-8 text-center text-gray-500"
                      >
                        No staff assigned. Click &quot;+ Add Staff&quot; to get started.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {staffRows.map((row) => (
                        <tr key={row.staffName} className="border-t hover:bg-gray-50">
                          <td className="sticky left-0 bg-white px-4 py-2 font-medium">
                            {row.staffName}
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              className="w-20 text-right"
                              value={row.billRate}
                              onChange={(e) => {
                                const newRate = parseFloat(e.target.value) || 0;
                                setStaffRows((prev) =>
                                  prev.map((r) =>
                                    r.staffName === row.staffName
                                      ? { ...r, billRate: newRate }
                                      : r
                                  )
                                );
                              }}
                              onBlur={(e) => {
                                const newRate = parseFloat(e.target.value) || 0;
                                if (newRate !== row.billRate) {
                                  handleRateChange(row.staffName, newRate);
                                }
                              }}
                            />
                          </td>
                          {months.map((month) => {
                            const monthData = row.months[month] || { assignmentId: null, hours: 0 };
                            return (
                              <td key={month} className="px-1 py-1">
                                <Input
                                  type="number"
                                  className="w-16 text-center"
                                  value={monthData.hours || ""}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const newHours = parseFloat(e.target.value) || 0;
                                    setStaffRows((prev) =>
                                      prev.map((r) =>
                                        r.staffName === row.staffName
                                          ? {
                                              ...r,
                                              months: {
                                                ...r.months,
                                                [month]: { ...monthData, hours: newHours },
                                              },
                                            }
                                          : r
                                      )
                                    );
                                  }}
                                  onBlur={(e) => {
                                    const newHours = parseFloat(e.target.value) || 0;
                                    handleHoursChange(
                                      row.staffName,
                                      month,
                                      newHours,
                                      monthData.assignmentId
                                    );
                                  }}
                                />
                              </td>
                            );
                          })}
                          <td className="px-4 py-2 text-right font-medium">
                            {Object.values(row.months).reduce((sum, m) => sum + (m?.hours || 0), 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-green-600">
                            {formatCurrency(
                              Object.values(row.months).reduce((sum, m) => sum + (m?.hours || 0), 0) *
                                row.billRate
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 h-8 w-8 p-0"
                              onClick={() => setDeleteConfirm(row.staffName)}
                            >
                              &times;
                            </Button>
                          </td>
                        </tr>
                      ))}

                      {/* Totals Row */}
                      <tr className="border-t-2 bg-gray-100 font-bold">
                        <td className="sticky left-0 bg-gray-100 px-4 py-3">TOTALS</td>
                        <td className="px-4 py-3"></td>
                        {months.map((month) => (
                          <td key={month} className="px-4 py-3 text-center">
                            {columnTotals[month]?.hours.toLocaleString() || 0}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right">{grandTotalHours.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-green-600">
                          {formatCurrency(grandTotalRevenue)}
                        </td>
                        <td></td>
                      </tr>

                      {/* Revenue Row */}
                      <tr className="bg-gray-50 text-green-600">
                        <td className="sticky left-0 bg-gray-50 px-4 py-2 font-medium">REVENUE</td>
                        <td className="px-4 py-2"></td>
                        {months.map((month) => (
                          <td key={month} className="px-4 py-2 text-center text-xs">
                            {formatCurrency(columnTotals[month]?.revenue || 0)}
                          </td>
                        ))}
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2"></td>
                        <td></td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!selectedProjectId && (
          <div className="rounded-lg border border-dashed p-12 text-center text-gray-500">
            Select a project above to manage staff assignments
          </div>
        )}
      </div>

      {/* Add Staff Dialog */}
      <Dialog open={addStaffOpen} onOpenChange={setAddStaffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Staff to Project</DialogTitle>
            <DialogDescription>
              Select a staff member and set their bill rate for this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Staff Member</label>
              <Select value={newStaffName} onValueChange={setNewStaffName}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member..." />
                </SelectTrigger>
                <SelectContent>
                  {staffList
                    .filter((name) => !staffRows.some((r) => r.staffName === name))
                    .map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Bill Rate ($/hr)</label>
              <Input
                type="number"
                placeholder={selectedProject?.BILL_RATE?.toString() || "0"}
                value={newStaffRate}
                onChange={(e) => setNewStaffRate(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Leave blank to use project default rate (${selectedProject?.BILL_RATE || 0})
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStaffOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddStaff} disabled={!newStaffName}>
              Add Staff
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Staff from Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {deleteConfirm} from this project? All their hour
              allocations will be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDeleteStaff(deleteConfirm)}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
