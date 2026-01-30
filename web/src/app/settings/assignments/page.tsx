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

interface BookingData {
  dealValue: number;
  dealName: string;
  wonTime: string;
}

interface ActualsData {
  projectId: string;
  staffActuals: { staffName: string; billRate: number; months: Record<string, number> }[];
  months: string[];
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
  const [addMonthOpen, setAddMonthOpen] = useState(false);
  const [newMonthYear, setNewMonthYear] = useState<string>("");
  const [newMonthMonth, setNewMonthMonth] = useState<string>("");
  const [yearError, setYearError] = useState<string>("");
  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [actualsData, setActualsData] = useState<ActualsData | null>(null);
  const [actualsLoading, setActualsLoading] = useState(false);

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

  // Fetch booking data from Pipedrive
  const fetchBookingData = useCallback(async (projectId: string) => {
    setBookingLoading(true);
    try {
      const response = await fetch(`/api/pipedrive/booking?projectId=${projectId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.found) {
          setBookingData({
            dealValue: data.dealValue,
            dealName: data.dealName,
            wonTime: data.wonTime,
          });
        } else {
          setBookingData(null);
        }
      } else {
        setBookingData(null);
      }
    } catch (error) {
      console.error("Error fetching booking data:", error);
      setBookingData(null);
    } finally {
      setBookingLoading(false);
    }
  }, []);

  // Fetch actuals from BigTime
  const fetchActuals = useCallback(async (projectId: string) => {
    setActualsLoading(true);
    try {
      const response = await fetch(`/api/assignments/actuals?projectId=${projectId}`);
      if (response.ok) {
        const data: ActualsData = await response.json();
        setActualsData(data);
        return data;
      } else {
        setActualsData(null);
        return null;
      }
    } catch (error) {
      console.error("Error fetching actuals:", error);
      setActualsData(null);
      return null;
    } finally {
      setActualsLoading(false);
    }
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
      fetchBookingData(selectedProjectId);
      fetchActuals(selectedProjectId);
    } else {
      setSelectedProject(null);
      setAssignments([]);
      setStaffRows([]);
      setMonths([]);
      setBookingData(null);
      setActualsData(null);
    }
  }, [selectedProjectId, projects, fetchAssignments, fetchBookingData, fetchActuals]);

  // Auto-add missing months from actuals to the estimates table
  useEffect(() => {
    if (actualsData && actualsData.months.length > 0) {
      const actualsMonths = actualsData.months;
      const missingMonths = actualsMonths.filter((m) => !months.includes(m));

      if (missingMonths.length > 0) {
        // Add missing months and sort
        const updatedMonths = [...months, ...missingMonths].sort();
        setMonths(updatedMonths);

        // Add empty entries for all staff rows for new months
        setStaffRows((prev) =>
          prev.map((row) => {
            const newMonthsData = { ...row.months };
            for (const m of missingMonths) {
              if (!newMonthsData[m]) {
                newMonthsData[m] = { assignmentId: null, hours: 0 };
              }
            }
            return { ...row, months: newMonthsData };
          })
        );
      }
    }
  }, [actualsData, months]);

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
    if (!newMonthYear || !newMonthMonth) {
      toast.error("Please select year and month");
      return;
    }

    const newMonth = `${newMonthYear}-${newMonthMonth}`;

    // Check if month already exists
    if (months.includes(newMonth)) {
      toast.error("This month already exists");
      return;
    }

    // Add month and sort
    const updatedMonths = [...months, newMonth].sort();
    setMonths(updatedMonths);

    // Add empty entries for all staff rows
    setStaffRows((prev) =>
      prev.map((row) => ({
        ...row,
        months: {
          ...row.months,
          [newMonth]: { assignmentId: null, hours: 0 },
        },
      }))
    );

    setAddMonthOpen(false);
    setNewMonthYear("");
    setNewMonthMonth("");
    toast.success(`Added ${formatMonth(newMonth)}`);
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

  // Calculate variance from booking
  const variance = bookingData ? grandTotalRevenue - bookingData.dealValue : null;
  const variancePercent = bookingData && bookingData.dealValue > 0
    ? ((grandTotalRevenue - bookingData.dealValue) / bookingData.dealValue) * 100
    : null;

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

  // Month options
  const monthOptions = [
    { value: "01", label: "January" },
    { value: "02", label: "February" },
    { value: "03", label: "March" },
    { value: "04", label: "April" },
    { value: "05", label: "May" },
    { value: "06", label: "June" },
    { value: "07", label: "July" },
    { value: "08", label: "August" },
    { value: "09", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];

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

        {/* Project Info Bar with Booking Validation */}
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
                <p className="text-sm text-gray-500">Total Hours</p>
                <p className="text-xl font-bold">{grandTotalHours.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Calculated Revenue</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(grandTotalRevenue)}</p>
              </div>
              {bookingLoading ? (
                <div>
                  <p className="text-sm text-gray-500">Booking Amount</p>
                  <p className="text-sm text-gray-400">Loading...</p>
                </div>
              ) : bookingData ? (
                <>
                  <div>
                    <p className="text-sm text-gray-500">Bookings (Pipedrive)</p>
                    <p className="text-xl font-bold text-blue-600">{formatCurrency(bookingData.dealValue)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Variance</p>
                    <p className={`text-xl font-bold ${variance && variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {variance !== null ? formatCurrency(variance) : "-"}
                      {variancePercent !== null && (
                        <span className="text-sm font-normal ml-1">
                          ({variancePercent >= 0 ? "+" : ""}{variancePercent.toFixed(1)}%)
                        </span>
                      )}
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <p className="text-sm text-gray-500">Booking</p>
                  <p className="text-sm text-gray-400">No Pipedrive deal found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Assignment Grid */}
        {selectedProjectId && (
          <>
            <div className="flex gap-2">
              <Button onClick={() => setAddStaffOpen(true)}>+ Add Staff</Button>
              <Button variant="outline" onClick={() => setAddMonthOpen(true)}>
                + Add Month
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="text-sm border-collapse">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="sticky left-0 z-10 bg-gray-100 w-[180px] min-w-[180px] px-3 py-3 text-left font-medium border-r">
                      Staff Member
                    </th>
                    <th className="w-[90px] min-w-[90px] px-2 py-3 text-center font-medium">Bill Rate</th>
                    {months.map((month) => (
                      <th key={month} className="w-[85px] min-w-[85px] px-2 py-3 text-center font-medium">
                        {formatMonth(month)}
                      </th>
                    ))}
                    <th className="w-[90px] min-w-[90px] px-2 py-3 text-right font-medium">Total Hrs</th>
                    <th className="w-[100px] min-w-[100px] px-2 py-3 text-right font-medium">Revenue</th>
                    <th className="w-[40px] min-w-[40px] px-1 py-3"></th>
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
                          <td className="sticky left-0 z-10 bg-white w-[180px] min-w-[180px] px-3 py-2 font-medium border-r">
                            {row.staffName}
                          </td>
                          <td className="w-[90px] min-w-[90px] px-2 py-1 text-center">
                            <Input
                              type="number"
                              className="w-full text-center h-8"
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
                              <td key={month} className="w-[85px] min-w-[85px] px-2 py-1 text-center">
                                <Input
                                  type="number"
                                  className="w-full text-center h-8"
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
                          <td className="w-[90px] min-w-[90px] px-2 py-2 text-right font-medium">
                            {Object.values(row.months).reduce((sum, m) => sum + (m?.hours || 0), 0).toLocaleString()}
                          </td>
                          <td className="w-[100px] min-w-[100px] px-2 py-2 text-right font-medium text-green-600">
                            {formatCurrency(
                              Object.values(row.months).reduce((sum, m) => sum + (m?.hours || 0), 0) *
                                row.billRate
                            )}
                          </td>
                          <td className="w-[40px] min-w-[40px] px-1 py-2 text-center">
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
                        <td className="sticky left-0 z-10 bg-gray-100 w-[180px] min-w-[180px] px-3 py-3 border-r">TOTALS</td>
                        <td className="w-[90px] min-w-[90px] px-2 py-3"></td>
                        {months.map((month) => (
                          <td key={month} className="w-[85px] min-w-[85px] px-2 py-3 text-center">
                            {columnTotals[month]?.hours.toLocaleString() || 0}
                          </td>
                        ))}
                        <td className="w-[90px] min-w-[90px] px-2 py-3 text-right">{grandTotalHours.toLocaleString()}</td>
                        <td className="w-[100px] min-w-[100px] px-2 py-3 text-right text-green-600">
                          {formatCurrency(grandTotalRevenue)}
                        </td>
                        <td className="w-[40px] min-w-[40px]"></td>
                      </tr>

                      {/* Revenue Row */}
                      <tr className="bg-gray-50 text-green-600">
                        <td className="sticky left-0 z-10 bg-gray-50 w-[180px] min-w-[180px] px-3 py-2 font-medium border-r">REVENUE</td>
                        <td className="w-[90px] min-w-[90px] px-2 py-2"></td>
                        {months.map((month) => (
                          <td key={month} className="w-[85px] min-w-[85px] px-2 py-2 text-center text-xs">
                            {formatCurrency(columnTotals[month]?.revenue || 0)}
                          </td>
                        ))}
                        <td className="w-[90px] min-w-[90px] px-2 py-2"></td>
                        <td className="w-[100px] min-w-[100px] px-2 py-2"></td>
                        <td className="w-[40px] min-w-[40px]"></td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* Actuals Table */}
            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-2">Actual Hours (BigTime)</h2>
              <p className="text-sm text-gray-500 mb-4">
                Actual hours logged and bill rates established in BigTime for this project. Read-only.
              </p>

              {actualsLoading ? (
                <div className="rounded-md border p-8 text-center text-gray-500">
                  Loading actuals...
                </div>
              ) : actualsData && actualsData.staffActuals.length > 0 ? (
                <div className="overflow-x-auto rounded-md border">
                  <table className="text-sm border-collapse">
                    <thead className="bg-blue-50">
                      <tr>
                        <th className="sticky left-0 z-10 bg-blue-50 w-[180px] min-w-[180px] px-3 py-3 text-left font-medium border-r">
                          Staff Member
                        </th>
                        <th className="w-[90px] min-w-[90px] px-2 py-3 text-center font-medium">Bill Rate</th>
                        {months.map((month) => (
                          <th key={month} className="w-[85px] min-w-[85px] px-2 py-3 text-center font-medium">
                            {formatMonth(month)}
                          </th>
                        ))}
                        <th className="w-[90px] min-w-[90px] px-2 py-3 text-right font-medium">Total Hrs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actualsData.staffActuals.map((staff) => {
                        const totalHours = Object.values(staff.months).reduce((sum, h) => sum + h, 0);
                        return (
                          <tr key={staff.staffName} className="border-t hover:bg-blue-50/50">
                            <td className="sticky left-0 z-10 bg-white w-[180px] min-w-[180px] px-3 py-2 font-medium border-r">
                              {staff.staffName}
                            </td>
                            <td className="w-[90px] min-w-[90px] px-2 py-2 text-center text-gray-600">
                              {staff.billRate ? `$${staff.billRate}` : "-"}
                            </td>
                            {months.map((month) => (
                              <td key={month} className="w-[85px] min-w-[85px] px-2 py-2 text-center">
                                {staff.months[month] ? staff.months[month].toLocaleString(undefined, { maximumFractionDigits: 1 }) : "-"}
                              </td>
                            ))}
                            <td className="w-[90px] min-w-[90px] px-2 py-2 text-right font-medium">
                              {totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Totals Row */}
                      <tr className="border-t-2 bg-blue-100 font-bold">
                        <td className="sticky left-0 z-10 bg-blue-100 w-[180px] min-w-[180px] px-3 py-3 border-r">TOTALS</td>
                        <td className="w-[90px] min-w-[90px] px-2 py-3"></td>
                        {months.map((month) => {
                          const monthTotal = actualsData.staffActuals.reduce(
                            (sum, staff) => sum + (staff.months[month] || 0),
                            0
                          );
                          return (
                            <td key={month} className="w-[85px] min-w-[85px] px-2 py-3 text-center">
                              {monthTotal > 0 ? monthTotal.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "-"}
                            </td>
                          );
                        })}
                        <td className="w-[90px] min-w-[90px] px-2 py-3 text-right">
                          {actualsData.staffActuals
                            .reduce((sum, staff) => sum + Object.values(staff.months).reduce((s, h) => s + h, 0), 0)
                            .toLocaleString(undefined, { maximumFractionDigits: 1 })}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-8 text-center text-gray-500">
                  No actual hours found for this project in BigTime
                </div>
              )}
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

      {/* Add Month Dialog */}
      <Dialog open={addMonthOpen} onOpenChange={(open) => {
        setAddMonthOpen(open);
        if (!open) {
          setYearError("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Month Column</DialogTitle>
            <DialogDescription>
              Select a month to add to the grid. You can add past or future months.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">Year</label>
                <Input
                  type="number"
                  placeholder="e.g. 2025"
                  value={newMonthYear}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewMonthYear(value);
                    const yearNum = parseInt(value);
                    if (value && (isNaN(yearNum) || yearNum < 2001 || yearNum > 2098)) {
                      setYearError("Year must be between 2001 and 2098");
                    } else {
                      setYearError("");
                    }
                  }}
                />
                {yearError && (
                  <p className="text-sm text-red-500">{yearError}</p>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">Month</label>
                <Select value={newMonthMonth} onValueChange={setNewMonthMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select month..." />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {newMonthYear && newMonthMonth && !yearError && (
              <p className="text-sm text-gray-600">
                Will add: <strong>{formatMonth(`${newMonthYear}-${newMonthMonth}`)}</strong>
                {months.includes(`${newMonthYear}-${newMonthMonth}`) && (
                  <span className="text-red-500 ml-2">(already exists)</span>
                )}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMonthOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddMonth}
              disabled={!newMonthYear || !newMonthMonth || !!yearError || months.includes(`${newMonthYear}-${newMonthMonth}`)}
            >
              Add Month
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
