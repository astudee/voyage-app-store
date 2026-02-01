"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface HourlyEmployee {
  name: string;
  type: string;
  regular: number;
  paidLeave: number;
  sickLeave: number;
  holiday: number;
  unpaidLeave: number;
}

interface FullTimeEmployee {
  name: string;
  type: string;
  paidLeave: number;
  sickLeave: number;
  holiday: number;
  unpaidLeave: number;
}

interface UnderreportedDay {
  employee: string;
  date: string;
  day: string;
  issue: string;
}

interface PolicyViolation {
  employee: string;
  policy: string;
  issue: string;
  severity: string;
}

interface PayrollHelperData {
  hourlyEmployees: HourlyEmployee[];
  fullTimeEmployees: FullTimeEmployee[];
  underreported: UnderreportedDay[];
  violations: PolicyViolation[];
  summary: {
    hourlyCount: number;
    fullTimeCount: number;
    underreportedCount: number;
    violationCount: number;
  };
  period: {
    start: string;
    end: string;
  };
}

// Calculate default payroll period (the period that just ended)
function getDefaultPayrollPeriod(): { start: string; end: string } {
  const today = new Date();
  const currentDay = today.getDate();
  const year = today.getFullYear();
  const month = today.getMonth();

  let startDate: Date;
  let endDate: Date;

  if (currentDay >= 26) {
    // Past 25th, so 10th-25th period just ended
    startDate = new Date(year, month, 10);
    endDate = new Date(year, month, 25);
  } else if (currentDay >= 10) {
    // Past 9th, so 26th-9th period just ended
    if (month === 0) {
      startDate = new Date(year - 1, 11, 26);
    } else {
      startDate = new Date(year, month - 1, 26);
    }
    endDate = new Date(year, month, 9);
  } else {
    // First 9 days, so 10th-25th of LAST month just ended
    if (month === 0) {
      startDate = new Date(year - 1, 11, 10);
      endDate = new Date(year - 1, 11, 25);
    } else {
      startDate = new Date(year, month - 1, 10);
      endDate = new Date(year, month - 1, 25);
    }
  }

  return {
    start: startDate.toISOString().split("T")[0],
    end: endDate.toISOString().split("T")[0],
  };
}

export default function PayrollHelperPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PayrollHelperData | null>(null);

  const defaultPeriod = getDefaultPayrollPeriod();
  const [startDate, setStartDate] = useState(defaultPeriod.start);
  const [endDate, setEndDate] = useState(defaultPeriod.end);

  const generateReport = async () => {
    setLoading(true);
    setData(null);

    try {
      const response = await fetch(
        `/api/payroll-helper?startDate=${startDate}&endDate=${endDate}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate report");
      }

      const result = await response.json();
      setData(result);
      toast.success("Payroll report generated!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate report";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  };

  const exportToExcel = () => {
    if (!data) return;

    const wb = XLSX.utils.book_new();

    // Hourly/TFT/PTE sheet
    const hourlySheet = XLSX.utils.json_to_sheet(data.hourlyEmployees.map((e) => ({
      Name: e.name,
      Type: e.type,
      Regular: e.regular,
      "Paid Leave": e.paidLeave,
      "Sick Leave": e.sickLeave,
      Holiday: e.holiday,
      "Unpaid Leave": e.unpaidLeave,
    })));
    XLSX.utils.book_append_sheet(wb, hourlySheet, "Hourly_TFT_PTE");

    // Full-Time sheet
    const ftSheet = XLSX.utils.json_to_sheet(data.fullTimeEmployees.map((e) => ({
      Name: e.name,
      Type: e.type,
      "Paid Leave": e.paidLeave,
      "Sick Leave": e.sickLeave,
      Holiday: e.holiday,
      "Unpaid Leave": e.unpaidLeave,
    })));
    XLSX.utils.book_append_sheet(wb, ftSheet, "Full_Time");

    // Underreported Hours sheet
    const underSheet = XLSX.utils.json_to_sheet(data.underreported.map((u) => ({
      Employee: u.employee,
      Date: u.date,
      Day: u.day,
      Issue: u.issue,
    })));
    XLSX.utils.book_append_sheet(wb, underSheet, "Underreported_Hours");

    // Policy Violations sheet
    const violSheet = XLSX.utils.json_to_sheet(data.violations.map((v) => ({
      Employee: v.employee,
      Policy: v.policy,
      Issue: v.issue,
    })));
    XLSX.utils.book_append_sheet(wb, violSheet, "Policy_Violations");

    const filename = `Payroll_Report_${startDate}_${endDate}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Report downloaded!");
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Payroll Helper</h1>
          <p className="text-gray-500 mt-1">
            Prepare payroll data from BigTime for Gusto entry
          </p>
        </div>

        {/* Configuration */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Payroll Period</h3>

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

          <Button onClick={generateReport} disabled={loading} className="w-full">
            {loading ? (
              <>
                <span className="animate-spin mr-2">⟳</span>
                Generating Payroll Report...
              </>
            ) : (
              "Generate Payroll Report"
            )}
          </Button>
        </div>

        {/* Results */}
        {data && (
          <>
            {/* Period Header */}
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-center">
              <h3 className="text-lg font-semibold text-blue-800">
                Pay Period: {formatDate(data.period.start)} - {formatDate(data.period.end)}
              </h3>
            </div>

            {/* Hourly/TFT/PTE Employees */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-2">1. Hourly/TFT/PTE Employees</h3>
              <p className="text-sm text-gray-500 mb-4">Shows regular hours + all leave types</p>

              {data.hourlyEmployees.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b-2 border-gray-200">
                        <th className="pb-2">Name</th>
                        <th className="pb-2">Type</th>
                        <th className="pb-2 text-right">Regular</th>
                        <th className="pb-2 text-right">Paid Leave</th>
                        <th className="pb-2 text-right">Sick Leave</th>
                        <th className="pb-2 text-right">Holiday</th>
                        <th className="pb-2 text-right">Unpaid Leave</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.hourlyEmployees.map((emp, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-2">{emp.name}</td>
                          <td className="py-2">{emp.type}</td>
                          <td className="py-2 text-right">{emp.regular.toFixed(2)}</td>
                          <td className="py-2 text-right">{emp.paidLeave.toFixed(2)}</td>
                          <td className="py-2 text-right">{emp.sickLeave.toFixed(2)}</td>
                          <td className="py-2 text-right">{emp.holiday.toFixed(2)}</td>
                          <td className="py-2 text-right">{emp.unpaidLeave.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No hourly/TFT/PTE employees found</p>
              )}
            </div>

            {/* Full-Time Employees */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-2">2. Full-Time Employees</h3>
              <p className="text-sm text-gray-500 mb-4">Shows leave hours only (Gusto pre-fills 86.67 hours)</p>

              {data.fullTimeEmployees.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b-2 border-gray-200">
                        <th className="pb-2">Name</th>
                        <th className="pb-2">Type</th>
                        <th className="pb-2 text-right">Paid Leave</th>
                        <th className="pb-2 text-right">Sick Leave</th>
                        <th className="pb-2 text-right">Holiday</th>
                        <th className="pb-2 text-right">Unpaid Leave</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.fullTimeEmployees.map((emp, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-2">{emp.name}</td>
                          <td className="py-2">{emp.type}</td>
                          <td className="py-2 text-right">{emp.paidLeave.toFixed(2)}</td>
                          <td className="py-2 text-right">{emp.sickLeave.toFixed(2)}</td>
                          <td className="py-2 text-right">{emp.holiday.toFixed(2)}</td>
                          <td className="py-2 text-right">{emp.unpaidLeave.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No full-time employees with leave hours found</p>
              )}
            </div>

            {/* Potentially Underreported Hours */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-2">3. Potentially Underreported Hours</h3>
              <p className="text-sm text-gray-500 mb-4">Employees with no hours on weekdays in the payroll period</p>

              {data.underreported.length > 0 ? (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                    <span className="text-amber-800 font-medium">
                      Found {data.underreported.length} day(s) with no hours entered
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white">
                        <tr className="text-left border-b-2 border-gray-200">
                          <th className="pb-2">Employee</th>
                          <th className="pb-2">Date</th>
                          <th className="pb-2">Day</th>
                          <th className="pb-2">Issue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.underreported.map((item, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="py-2">{item.employee}</td>
                            <td className="py-2">{item.date}</td>
                            <td className="py-2">{item.day}</td>
                            <td className="py-2">{item.issue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-800">
                  No underreported hours detected
                </div>
              )}
            </div>

            {/* Policy Violations */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-2">4. Policy Violations</h3>
              <p className="text-sm text-gray-500 mb-4">Holiday and sick leave policy checks</p>

              {data.violations.length > 0 ? (
                <>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <span className="text-red-800 font-medium">
                      Found {data.violations.length} policy violation(s)
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b-2 border-gray-200">
                          <th className="pb-2">Employee</th>
                          <th className="pb-2">Policy</th>
                          <th className="pb-2">Issue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.violations.map((v, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="py-2">{v.employee}</td>
                            <td className="py-2">{v.policy}</td>
                            <td className="py-2">{v.issue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-800">
                  No policy violations detected
                </div>
              )}
            </div>

            {/* Export */}
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
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Payroll Helper</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Select a payroll period and click the button to generate the report for Gusto entry.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">Sections:</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li><strong>Hourly/TFT/PTE Employees</strong> - Shows regular hours + all leave types</li>
                <li><strong>Full-Time Employees</strong> - Shows leave hours only (Gusto pre-fills 86.67 hours)</li>
                <li><strong>Underreported Hours</strong> - Employees with no hours on weekdays</li>
                <li><strong>Policy Violations</strong> - Flags issues:
                  <ul className="ml-6 mt-1 list-disc">
                    <li>More than 16 holiday hours in a single month</li>
                    <li>More than 72 holiday hours per year (9 holidays)</li>
                    <li>More than 40 sick leave hours per year</li>
                  </ul>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
