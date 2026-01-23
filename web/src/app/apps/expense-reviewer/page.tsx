"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ExpenseIssue {
  staff: string;
  client: string;
  project: string;
  date: string;
  category: string;
  amount: number;
  noCharge?: string;
}

interface ExpenseReviewData {
  issues: {
    incorrectContractorFees: ExpenseIssue[];
    inconsistentClassification: ExpenseIssue[];
    missingReceipts: ExpenseIssue[];
    companyPaid: ExpenseIssue[];
    nonReimbursable: ExpenseIssue[];
  };
  summary: {
    totalExpenses: number;
    totalIssues: number;
    incorrectContractorFees: number;
    inconsistentClassification: number;
    missingReceipts: number;
    companyPaid: number;
    nonReimbursable: number;
    companyPaidTotal: number;
    nonReimbursableTotal: number;
  };
  debug: {
    uniqueCategories: string[];
    uniqueStaff: string[];
  };
}

type DateMode = "weekly" | "custom";

function getFriday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (5 - day + 7) % 7; // Days until Friday
  d.setDate(d.getDate() + diff);
  return d;
}

function getMonday(friday: Date): Date {
  const d = new Date(friday);
  d.setDate(d.getDate() - 4); // Monday is 4 days before Friday
  return d;
}

export default function ExpenseReviewerPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ExpenseReviewData | null>(null);
  const [dateMode, setDateMode] = useState<DateMode>("weekly");

  // Weekly mode - default to current/recent Friday
  const [weekEnding, setWeekEnding] = useState(() => {
    const friday = getFriday(new Date());
    return friday.toISOString().split("T")[0];
  });

  // Custom mode
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    incorrectContractorFees: true,
    inconsistentClassification: true,
    missingReceipts: true,
    companyPaid: true,
    nonReimbursable: true,
    debug: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const reviewExpenses = async () => {
    // Validate weekly mode is a Friday
    if (dateMode === "weekly") {
      const weekDate = new Date(weekEnding + "T00:00:00");
      if (weekDate.getDay() !== 5) {
        toast.error("Please select a Friday for week ending date");
        return;
      }
    }

    setLoading(true);
    setData(null);

    try {
      let url: string;
      if (dateMode === "weekly") {
        const friday = new Date(weekEnding + "T00:00:00");
        const monday = getMonday(friday);
        url = `/api/expense-reviewer?startDate=${monday.toISOString().split("T")[0]}&endDate=${weekEnding}&weekEnding=${weekEnding}`;
      } else {
        url = `/api/expense-reviewer?startDate=${startDate}&endDate=${endDate}`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to review expenses");
      }

      const result = await response.json();
      setData(result);
      toast.success("Expense review complete!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to review expenses";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString("en-US", { style: "currency", currency: "USD" });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const IssueSection = ({
    title,
    count,
    issues,
    sectionKey,
    color,
    description,
    showTotal,
    total,
  }: {
    title: string;
    count: number;
    issues: ExpenseIssue[];
    sectionKey: string;
    color: "red" | "amber" | "blue" | "green";
    description: string;
    showTotal?: boolean;
    total?: number;
  }) => {
    const isExpanded = expandedSections[sectionKey];
    const colorClasses = {
      red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", header: "text-red-700" },
      amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", header: "text-amber-700" },
      blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", header: "text-blue-700" },
      green: { bg: "bg-green-50", border: "border-green-200", text: "text-green-800", header: "text-green-700" },
    };
    const c = colorClasses[color];

    return (
      <div className="border rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection(sectionKey)}
          className={`w-full flex items-center justify-between p-4 text-left ${count > 0 ? c.bg : "bg-green-50"}`}
        >
          <div className="flex items-center gap-2">
            <span className={count > 0 ? c.header : "text-green-700"}>{title}</span>
            <span className={`px-2 py-0.5 rounded text-sm ${count > 0 ? `${c.bg} ${c.text}` : "bg-green-100 text-green-700"}`}>
              {count}
            </span>
          </div>
          <span className="text-gray-500">{isExpanded ? "▼" : "▶"}</span>
        </button>
        {isExpanded && (
          <div className="p-4 border-t">
            <p className="text-sm text-gray-500 mb-3">{description}</p>
            {issues.length > 0 ? (
              <>
                {showTotal && total !== undefined && (
                  <div className={`${c.bg} ${c.border} border rounded p-3 mb-3`}>
                    <span className={`font-medium ${c.text}`}>Total: {formatCurrency(total)}</span>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="pb-2">Staff</th>
                        <th className="pb-2">Client</th>
                        <th className="pb-2">Project</th>
                        <th className="pb-2">Date</th>
                        <th className="pb-2">Category</th>
                        <th className="pb-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issues.map((issue, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2">{issue.staff}</td>
                          <td className="py-2">{issue.client}</td>
                          <td className="py-2">{issue.project}</td>
                          <td className="py-2">{formatDate(issue.date)}</td>
                          <td className="py-2">{issue.category}</td>
                          <td className="py-2 text-right">{formatCurrency(issue.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded p-3 text-green-800">
                No issues found
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Expense Reviewer</h1>
          <p className="text-gray-500 mt-1">
            Review expenses for compliance and quality
          </p>
        </div>

        {/* Date Selection */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Report Configuration</h3>

          {/* Date Mode Toggle */}
          <div className="flex gap-2 mb-4">
            <Button
              variant={dateMode === "weekly" ? "default" : "outline"}
              onClick={() => setDateMode("weekly")}
              size="sm"
            >
              Weekly (Week Ending)
            </Button>
            <Button
              variant={dateMode === "custom" ? "default" : "outline"}
              onClick={() => setDateMode("custom")}
              size="sm"
            >
              Custom Date Range
            </Button>
          </div>

          {dateMode === "weekly" ? (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Week Ending Date (Friday)
              </label>
              <input
                type="date"
                value={weekEnding}
                onChange={(e) => setWeekEnding(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
              <p className="text-sm text-gray-500 mt-1">
                {new Date(weekEnding + "T00:00:00").getDay() !== 5 && (
                  <span className="text-red-600">Please select a Friday</span>
                )}
              </p>
            </div>
          ) : (
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
          )}

          <Button onClick={reviewExpenses} disabled={loading} className="w-full">
            {loading ? (
              <>
                <span className="animate-spin mr-2">⟳</span>
                Reviewing Expenses...
              </>
            ) : (
              "Review Expenses"
            )}
          </Button>
        </div>

        {/* Results */}
        {data && (
          <>
            {/* Summary */}
            <div className={`rounded-xl border p-6 ${data.summary.totalIssues === 0 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
              <h3 className="text-lg font-semibold mb-2">
                {data.summary.totalIssues === 0 ? (
                  <span className="text-green-800">No compliance issues found!</span>
                ) : (
                  <span className="text-amber-800">Found {data.summary.totalIssues} total compliance issues</span>
                )}
              </h3>
              <p className="text-sm text-gray-600">
                Analyzed {data.summary.totalExpenses} expense entries
              </p>
            </div>

            {/* Issue Sections */}
            <div className="space-y-4">
              <IssueSection
                title="Incorrect Contractor Fees"
                count={data.summary.incorrectContractorFees}
                issues={data.issues.incorrectContractorFees}
                sectionKey="incorrectContractorFees"
                color="red"
                description="Contractor fees should always be marked as No-Charge"
              />

              <IssueSection
                title="Inconsistent Classification"
                count={data.summary.inconsistentClassification}
                issues={data.issues.inconsistentClassification}
                sectionKey="inconsistentClassification"
                color="amber"
                description="Non-Billable expenses should be No-Charge. Billable expenses should not be No-Charge."
              />

              <IssueSection
                title="Missing Receipts"
                count={data.summary.missingReceipts}
                issues={data.issues.missingReceipts}
                sectionKey="missingReceipts"
                color="amber"
                description="All expenses must have receipts attached"
              />

              <IssueSection
                title="Company Paid Expenses"
                count={data.summary.companyPaid}
                issues={data.issues.companyPaid}
                sectionKey="companyPaid"
                color="blue"
                description="Expenses being paid by the company (No-Charge=Yes, excluding contractor fees)"
                showTotal
                total={data.summary.companyPaidTotal}
              />

              <IssueSection
                title="Non-Reimbursable Expenses"
                count={data.summary.nonReimbursable}
                issues={data.issues.nonReimbursable}
                sectionKey="nonReimbursable"
                color="blue"
                description="Expenses marked as non-reimbursable (excluding contractor fees)"
                showTotal
                total={data.summary.nonReimbursableTotal}
              />
            </div>

            {/* Debug Info */}
            <div className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection("debug")}
                className="w-full flex items-center justify-between p-4 text-left bg-gray-50"
              >
                <span className="text-gray-700">Debug Information</span>
                <span className="text-gray-500">{expandedSections.debug ? "▼" : "▶"}</span>
              </button>
              {expandedSections.debug && (
                <div className="p-4 border-t">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-gray-700 mb-2">Unique Categories ({data.debug.uniqueCategories.length})</h4>
                      <div className="text-sm text-gray-600 max-h-40 overflow-y-auto">
                        {data.debug.uniqueCategories.map((cat, i) => (
                          <div key={i}>{cat}</div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-700 mb-2">Unique Staff ({data.debug.uniqueStaff.length})</h4>
                      <div className="text-sm text-gray-600 max-h-40 overflow-y-auto">
                        {data.debug.uniqueStaff.map((staff, i) => (
                          <div key={i}>{staff}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Instructions */}
        {!data && !loading && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Expense Reviewer</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Select a date range and click the button to review expenses for compliance.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">Checks Performed:</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li><strong>Incorrect Contractor Fees</strong> - Must be marked No-Charge</li>
                <li><strong>Inconsistent Classification</strong> - Non-Billable must be No-Charge, Billable must be charged</li>
                <li><strong>Missing Receipts</strong> - All expenses must have receipts attached</li>
                <li><strong>Company Paid Expenses</strong> - Track when company pays (No-Charge=Yes)</li>
                <li><strong>Non-Reimbursable Expenses</strong> - Track expenses marked non-reimbursable</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
