"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface EmployeePayroll {
  name: string;
  annualSalary: number;
  monthlySalary: number;
  utilizationBonus: number;
  otherBonus: number;
  monthlyUtilizationBonus: number;
  monthlyOtherBonus: number;
  phoneAllowance: number;
  firmBenefits: number;
  monthly401k: number;
  monthlyFica: number;
  totalMonthlyCost: number;
  totalAnnualCost: number;
}

interface BreakdownItem {
  component: string;
  perPayPeriod: number;
  monthly: number;
  annual: number;
}

interface PayrollData {
  employees: EmployeePayroll[];
  summary: {
    totalMonthlyCost: number;
    totalAnnualCost: number;
    perPayrollCost: number;
    totalSalaryMonthly: number;
    totalBenefits: number;
    total401k: number;
    totalFica: number;
    burdenRate: number;
    employeeCount: number;
  };
  breakdown: BreakdownItem[];
  includeBonuses: boolean;
}

type TimePeriod = "payPeriod" | "monthly" | "annual";

export default function PayrollCalcPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PayrollData | null>(null);
  const [includeBonuses, setIncludeBonuses] = useState(true);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("monthly");

  const generateReport = async () => {
    setLoading(true);
    setData(null);

    try {
      const response = await fetch(
        `/api/payroll-calc?includeBonuses=${includeBonuses}`
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

  const formatCurrency = (value: number) =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

  const getMultiplier = (): number => {
    switch (timePeriod) {
      case "payPeriod": return 0.5;
      case "monthly": return 1;
      case "annual": return 12;
    }
  };

  const getPeriodLabel = (): string => {
    switch (timePeriod) {
      case "payPeriod": return "pay period";
      case "monthly": return "month";
      case "annual": return "year";
    }
  };

  const exportToExcel = () => {
    if (!data) return;

    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      { Metric: "Total Monthly Cost", Amount: data.summary.totalMonthlyCost },
      { Metric: "Total Annual Cost", Amount: data.summary.totalAnnualCost },
      { Metric: "Base Salaries (Monthly)", Amount: data.summary.totalSalaryMonthly },
      { Metric: "Benefits (Monthly)", Amount: data.summary.totalBenefits },
      { Metric: "401(k) Match (Monthly)", Amount: data.summary.total401k },
      { Metric: "FICA (Monthly)", Amount: data.summary.totalFica },
      { Metric: "Burden Rate %", Amount: data.summary.burdenRate },
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

    // Breakdown sheet
    const breakdownSheet = XLSX.utils.json_to_sheet(data.breakdown.map((b) => ({
      Component: b.component,
      "Per Pay Period": b.perPayPeriod,
      Monthly: b.monthly,
      Annual: b.annual,
    })));
    XLSX.utils.book_append_sheet(wb, breakdownSheet, "Breakdown");

    // Employee Details sheet
    const employeeSheet = XLSX.utils.json_to_sheet(data.employees.map((e) => ({
      Name: e.name,
      "Annual Salary": e.annualSalary,
      "Monthly Salary": e.monthlySalary,
      "Utilization Bonus": e.utilizationBonus,
      "Other Bonus": e.otherBonus,
      "Phone Allowance": e.phoneAllowance,
      "Firm Benefits": e.firmBenefits,
      "401k": e.monthly401k,
      "FICA": e.monthlyFica,
      "Total Monthly": e.totalMonthlyCost,
      "Total Annual": e.totalAnnualCost,
    })));
    XLSX.utils.book_append_sheet(wb, employeeSheet, "Employee_Details");

    const filename = `payroll_calculator_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Report downloaded!");
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Payroll Calculator</h1>
          <p className="text-gray-500 mt-1">
            Calculate total employer payroll costs including salary, benefits, bonuses, and taxes
          </p>
        </div>

        {/* Configuration */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Configuration</h3>

          <div className="mb-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeBonuses}
                onChange={(e) => setIncludeBonuses(e.target.checked)}
                className="rounded"
              />
              <span className="font-medium">Include Bonuses</span>
            </label>
            <p className="text-sm text-gray-500 ml-6">
              Include utilization and other bonuses in total compensation. 401(k) and FICA will be calculated based on included components.
            </p>
          </div>

          <p className="text-sm text-gray-500 mb-4">
            401(k) match (4%) and FICA (7.65%) are calculated based on components included in the report
          </p>

          <Button onClick={generateReport} disabled={loading} className="w-full">
            {loading ? (
              <>
                <span className="animate-spin mr-2">⟳</span>
                Generating Report...
              </>
            ) : (
              "Generate Payroll Report"
            )}
          </Button>
        </div>

        {/* Results */}
        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 rounded-xl border-2 border-green-200 p-6">
                <div className="text-sm text-gray-600">Per Payroll Cost</div>
                <div className="text-2xl font-bold">{formatCurrency(data.summary.perPayrollCost)}</div>
                <div className="text-sm text-gray-500">2 pay periods/month</div>
              </div>
              <div className="bg-green-50 rounded-xl border-2 border-green-200 p-6">
                <div className="text-sm text-gray-600">Total Monthly Cost</div>
                <div className="text-2xl font-bold">{formatCurrency(data.summary.totalMonthlyCost)}</div>
                <div className="text-sm text-gray-500">Per month</div>
              </div>
              <div className="bg-green-50 rounded-xl border-2 border-green-200 p-6">
                <div className="text-sm text-gray-600">Total Annual Cost</div>
                <div className="text-2xl font-bold">{formatCurrency(data.summary.totalAnnualCost)}</div>
                <div className="text-sm text-gray-500">Per year</div>
              </div>
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border p-4">
                <div className="text-sm text-gray-600">Base Salaries (Monthly)</div>
                <div className="text-xl font-bold">{formatCurrency(data.summary.totalSalaryMonthly)}</div>
                <div className="text-sm text-gray-500">{formatCurrency(data.summary.totalSalaryMonthly * 12)}/year</div>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <div className="text-sm text-gray-600">Benefits + Taxes (Monthly)</div>
                <div className="text-xl font-bold">
                  {formatCurrency(data.summary.totalBenefits + data.summary.total401k + data.summary.totalFica)}
                </div>
                <div className="text-sm text-gray-500">
                  {formatCurrency((data.summary.totalBenefits + data.summary.total401k + data.summary.totalFica) * 12)}/year
                </div>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <div className="text-sm text-gray-600">Burden Rate</div>
                <div className="text-xl font-bold">{data.summary.burdenRate.toFixed(1)}%</div>
                <div className="text-sm text-gray-500">Above base salary</div>
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Cost Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b-2 border-gray-200">
                      <th className="pb-2">Component</th>
                      <th className="pb-2 text-right">Per Pay Period</th>
                      <th className="pb-2 text-right">Monthly</th>
                      <th className="pb-2 text-right">Annual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.breakdown.map((item, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2">{item.component}</td>
                        <td className="py-2 text-right">{formatCurrency(item.perPayPeriod)}</td>
                        <td className="py-2 text-right">{formatCurrency(item.monthly)}</td>
                        <td className="py-2 text-right">{formatCurrency(item.annual)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-gray-50">
                      <td className="py-2">TOTAL</td>
                      <td className="py-2 text-right">{formatCurrency(data.summary.perPayrollCost)}</td>
                      <td className="py-2 text-right">{formatCurrency(data.summary.totalMonthlyCost)}</td>
                      <td className="py-2 text-right">{formatCurrency(data.summary.totalAnnualCost)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Employee Details */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Employee Details</h3>

              {/* Time Period Toggle */}
              <div className="flex gap-2 mb-4">
                {[
                  { value: "payPeriod", label: "Per Pay Period" },
                  { value: "monthly", label: "Monthly" },
                  { value: "annual", label: "Annual" },
                ].map((opt) => (
                  <Button
                    key={opt.value}
                    variant={timePeriod === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTimePeriod(opt.value as TimePeriod)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b-2 border-gray-200">
                      <th className="pb-2">Staff Member</th>
                      <th className="pb-2 text-right">Base Salary</th>
                      {includeBonuses && (
                        <>
                          <th className="pb-2 text-right">Util. Bonus</th>
                          <th className="pb-2 text-right">Other Bonus</th>
                        </>
                      )}
                      <th className="pb-2 text-right">Phone</th>
                      <th className="pb-2 text-right">Benefits</th>
                      <th className="pb-2 text-right">401(k)</th>
                      <th className="pb-2 text-right">FICA</th>
                      <th className="pb-2 text-right font-bold">Total $/{getPeriodLabel()}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.employees.map((emp, i) => {
                      const mult = getMultiplier();
                      return (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-2">{emp.name}</td>
                          <td className="py-2 text-right">{formatCurrency(emp.monthlySalary * mult)}</td>
                          {includeBonuses && (
                            <>
                              <td className="py-2 text-right">{formatCurrency(emp.monthlyUtilizationBonus * mult)}</td>
                              <td className="py-2 text-right">{formatCurrency(emp.monthlyOtherBonus * mult)}</td>
                            </>
                          )}
                          <td className="py-2 text-right">{formatCurrency(emp.phoneAllowance * mult)}</td>
                          <td className="py-2 text-right">{formatCurrency(emp.firmBenefits * mult)}</td>
                          <td className="py-2 text-right">{formatCurrency(emp.monthly401k * mult)}</td>
                          <td className="py-2 text-right">{formatCurrency(emp.monthlyFica * mult)}</td>
                          <td className="py-2 text-right font-semibold">{formatCurrency(emp.totalMonthlyCost * mult)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Export */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Download Report</h3>
              <Button variant="outline" onClick={exportToExcel} className="w-full">
                Download Excel Report
              </Button>
            </div>
          </>
        )}

        {/* Instructions */}
        {!data && !loading && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Payroll Calculator</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Click the button to calculate total employer payroll costs for all active staff.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">Calculations Include:</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li><strong>Base Salaries</strong> - Annual salary from staff configuration</li>
                <li><strong>Bonuses</strong> - Utilization and other bonus targets (optional)</li>
                <li><strong>Phone Allowances</strong> - Monthly phone stipend</li>
                <li><strong>Firm Benefits</strong> - Employer-paid medical, dental, vision, STD, LTD, life</li>
                <li><strong>401(k) Match</strong> - 4% of total compensation</li>
                <li><strong>FICA</strong> - 7.65% employer contribution</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
