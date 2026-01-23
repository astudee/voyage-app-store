"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface Issues {
  zeroHours: string[];
  notSubmitted: string[];
  under40: { name: string; hours: number }[];
  nonBillableClientWork: { staff: string; client: string; project: string; date: string; hours: number }[];
  projectOverruns: { staff: string; client: string; project: string; projectId: string; hoursUsed: number; hoursAssigned: number; percentage: number | null; issue: string }[];
  poorNotes: { staff: string; client: string; project: string; date: string; hours: number; note: string; reason: string }[];
}

interface ReviewData {
  weekEnding: string;
  weekStarting: string;
  issues: Issues;
  totalIssues: number;
  metadata: {
    employeeCount: number;
    detailedEntries: number;
    reviewedNotes: boolean;
  };
}

// Snap date to nearest Friday
function snapToFriday(date: Date): Date {
  const result = new Date(date);
  const weekday = result.getDay();
  if (weekday === 5) return result;
  if (weekday < 5) {
    result.setDate(result.getDate() + (5 - weekday));
  } else {
    result.setDate(result.getDate() - (weekday - 5));
  }
  return result;
}

function getDefaultFriday(): string {
  const today = new Date();
  let friday = snapToFriday(today);
  if (friday > today) {
    friday.setDate(friday.getDate() - 7);
  }
  return friday.toISOString().slice(0, 10);
}

export default function TimeReviewerPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReviewData | null>(null);
  const [selectedDate, setSelectedDate] = useState(getDefaultFriday());
  const [reviewNotes, setReviewNotes] = useState(false);

  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    zeroHours: false,
    notSubmitted: false,
    under40: false,
    nonBillable: false,
    overruns: false,
    poorNotes: false,
  });

  const runReview = async () => {
    setLoading(true);
    setData(null);

    try {
      const params = new URLSearchParams({
        date: selectedDate,
        reviewNotes: reviewNotes.toString(),
      });

      const response = await fetch(`/api/time-reviewer?${params}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to run review");
      }

      const result = await response.json();
      setData(result);

      // Auto-expand sections with issues
      const expanded: Record<string, boolean> = {};
      expanded.zeroHours = result.issues.zeroHours.length > 0;
      expanded.notSubmitted = result.issues.notSubmitted.length > 0;
      expanded.under40 = result.issues.under40.length > 0;
      expanded.nonBillable = result.issues.nonBillableClientWork.length > 0;
      expanded.overruns = result.issues.projectOverruns.length > 0;
      expanded.poorNotes = result.issues.poorNotes.length > 0;
      setExpandedSections(expanded);

      toast.success("Review complete!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to run review";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const exportToExcel = () => {
    if (!data) return;

    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      { Category: "Zero Hours", Count: data.issues.zeroHours.length },
      { Category: "Not Submitted", Count: data.issues.notSubmitted.length },
      { Category: "Under 40 Hours", Count: data.issues.under40.length },
      { Category: "Non-Billable Client Work", Count: data.issues.nonBillableClientWork.length },
      { Category: "Project Overruns", Count: data.issues.projectOverruns.length },
      { Category: "Poor Quality Notes", Count: data.issues.poorNotes.length },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Summary");

    // Individual sheets
    if (data.issues.zeroHours.length > 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.issues.zeroHours.map((s) => ({ Staff: s }))),
        "Zero_Hours"
      );
    }

    if (data.issues.notSubmitted.length > 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.issues.notSubmitted.map((s) => ({ Staff: s }))),
        "Not_Submitted"
      );
    }

    if (data.issues.under40.length > 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.issues.under40.map((i) => ({ Staff: i.name, Hours: i.hours }))),
        "Under_40_Hours"
      );
    }

    if (data.issues.nonBillableClientWork.length > 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.issues.nonBillableClientWork.map((i) => ({
          Staff: i.staff,
          Client: i.client,
          Project: i.project,
          Date: i.date,
          Hours: i.hours,
        }))),
        "Non_Billable"
      );
    }

    if (data.issues.projectOverruns.length > 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.issues.projectOverruns.map((i) => ({
          Staff: i.staff,
          Client: i.client,
          Project: i.project,
          "Project ID": i.projectId,
          "Hours Used": i.hoursUsed,
          "Hours Assigned": i.hoursAssigned,
          "Percentage": i.percentage !== null ? `${i.percentage}%` : "N/A",
          Issue: i.issue,
        }))),
        "Project_Overruns"
      );
    }

    if (data.issues.poorNotes.length > 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.issues.poorNotes.map((i) => ({
          Staff: i.staff,
          Client: i.client,
          Project: i.project,
          Date: i.date,
          Hours: i.hours,
          Note: i.note,
          Issue: i.reason,
        }))),
        "Poor_Notes"
      );
    }

    const filename = `time_review_${data.weekEnding}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Report downloaded!");
  };

  const formatWeekDate = (dateStr: string) => {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const IssueSection = ({
    title,
    sectionKey,
    count,
    children,
    emptyMessage,
    color = "gray",
  }: {
    title: string;
    sectionKey: string;
    count: number;
    children: React.ReactNode;
    emptyMessage: string;
    color?: string;
  }) => {
    const colors: Record<string, string> = {
      red: "border-red-200 bg-red-50",
      yellow: "border-yellow-200 bg-yellow-50",
      blue: "border-blue-200 bg-blue-50",
      orange: "border-orange-200 bg-orange-50",
      purple: "border-purple-200 bg-purple-50",
      gray: "border-gray-200 bg-gray-50",
    };

    return (
      <div className={`rounded-xl border ${count > 0 ? colors[color] : "border-gray-200 bg-white"}`}>
        <div
          className="p-4 cursor-pointer flex items-center justify-between"
          onClick={() => toggleSection(sectionKey)}
        >
          <span className="font-medium">
            {title} ({count})
          </span>
          <span className="text-gray-400">{expandedSections[sectionKey] ? "▼" : "▶"}</span>
        </div>
        {expandedSections[sectionKey] && (
          <div className="px-4 pb-4">
            {count > 0 ? children : <p className="text-green-600">{emptyMessage}</p>}
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
          <h1 className="text-3xl font-bold">Time Reviewer</h1>
          <p className="text-gray-500 mt-1">
            Review timesheets for completeness and quality
          </p>
        </div>

        {/* Configuration */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Week Selection</h3>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select a date (will snap to nearest Friday)
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                const snapped = snapToFriday(new Date(e.target.value));
                const today = new Date();
                if (snapped > today) {
                  snapped.setDate(snapped.getDate() - 7);
                }
                setSelectedDate(snapped.toISOString().slice(0, 10));
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
            <p className="text-sm text-gray-500 mt-1">
              Week Ending: {formatWeekDate(selectedDate)}
            </p>
          </div>

          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Review billing notes for quality</span>
            </label>
            <p className="text-xs text-gray-500 ml-6">
              Checks if billing notes meet Voyage professional standards
            </p>
          </div>

          <Button onClick={runReview} disabled={loading} className="w-full">
            {loading ? (
              <>
                <span className="animate-spin mr-2">&#8635;</span>
                Reviewing Timesheets...
              </>
            ) : (
              "Review Timesheets"
            )}
          </Button>
        </div>

        {/* Results */}
        {data && (
          <>
            {/* Summary */}
            <div className="bg-white rounded-xl border p-6">
              <h2 className="text-xl font-bold mb-2">
                Hours Reviewer Report
              </h2>
              <p className="text-gray-600 mb-1">
                Week Ending: {formatWeekDate(data.weekEnding)}
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Period: {new Date(data.weekStarting + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} - {new Date(data.weekEnding + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>

              {data.totalIssues === 0 ? (
                <div className="p-4 bg-green-100 text-green-800 rounded-lg">
                  All timesheets look good!
                </div>
              ) : (
                <div className="p-4 bg-yellow-100 text-yellow-800 rounded-lg">
                  Found {data.totalIssues} total issues
                </div>
              )}
            </div>

            {/* Issue Sections */}
            <div className="space-y-4">
              <IssueSection
                title="Zero Hours Reported"
                sectionKey="zeroHours"
                count={data.issues.zeroHours.length}
                emptyMessage="Everyone has reported hours"
                color="red"
              >
                <ul className="list-disc list-inside text-sm">
                  {data.issues.zeroHours.map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                </ul>
              </IssueSection>

              <IssueSection
                title="Unsubmitted or Rejected Timesheets"
                sectionKey="notSubmitted"
                count={data.issues.notSubmitted.length}
                emptyMessage="All timesheets submitted"
                color="yellow"
              >
                <ul className="list-disc list-inside text-sm">
                  {data.issues.notSubmitted.map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                </ul>
              </IssueSection>

              <IssueSection
                title="Employees Under 40 Hours"
                sectionKey="under40"
                count={data.issues.under40.length}
                emptyMessage="All employees reported 40+ hours"
                color="yellow"
              >
                <ul className="list-disc list-inside text-sm">
                  {data.issues.under40.map((item, i) => (
                    <li key={i}>{item.name}: {item.hours} hours</li>
                  ))}
                </ul>
              </IssueSection>

              <IssueSection
                title="Non-Billable Client Work"
                sectionKey="nonBillable"
                count={data.issues.nonBillableClientWork.length}
                emptyMessage="All client work is billable"
                color="blue"
              >
                <div className="text-sm space-y-1">
                  {data.issues.nonBillableClientWork.map((item, i) => (
                    <div key={i}>
                      <strong>{item.staff}</strong>, {item.client}, {item.project}, {item.date}, {item.hours} hours
                    </div>
                  ))}
                </div>
              </IssueSection>

              <IssueSection
                title="Potential Project Overruns"
                sectionKey="overruns"
                count={data.issues.projectOverruns.length}
                emptyMessage="No potential project overruns detected"
                color="orange"
              >
                <div className="text-sm space-y-2">
                  {data.issues.projectOverruns.map((item, i) => (
                    <div key={i} className="border-b border-orange-200 pb-2 last:border-0">
                      <strong>{item.staff}</strong> - {item.client} - {item.project} - {item.projectId}
                      <br />
                      <span className="text-gray-600">
                        {item.hoursAssigned === 0
                          ? `${item.hoursUsed} hours used, 0 hours assigned`
                          : `${item.hoursUsed} hours out of ${item.hoursAssigned} assigned (${item.percentage}%)`
                        }
                      </span>
                    </div>
                  ))}
                </div>
              </IssueSection>

              {data.metadata.reviewedNotes && (
                <IssueSection
                  title="Poor Quality Notes"
                  sectionKey="poorNotes"
                  count={data.issues.poorNotes.length}
                  emptyMessage="All notes meet quality standards"
                  color="purple"
                >
                  <div className="text-sm space-y-3">
                    {data.issues.poorNotes.map((item, i) => (
                      <div key={i} className="border-b border-purple-200 pb-2 last:border-0">
                        <strong>{item.staff}</strong> - {item.client}, {item.project}, {item.date}, {item.hours} hours
                        <div className="text-gray-600 mt-1">
                          Note: &quot;{item.note}&quot;
                        </div>
                        <div className="text-red-600">
                          Issue: {item.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                </IssueSection>
              )}

              {!data.metadata.reviewedNotes && (
                <div className="bg-gray-100 rounded-xl border p-4 text-center text-gray-600">
                  Note review was not enabled. Check the box above and re-run to review billing notes.
                </div>
              )}
            </div>

            {/* Export */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold mb-4">Export Report</h3>
              <Button variant="outline" onClick={exportToExcel} className="w-full">
                Download Excel
              </Button>
            </div>
          </>
        )}

        {/* Instructions */}
        {!data && !loading && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Time Reviewer</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Review timesheets for quality and completeness.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">Checks Performed:</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li><strong>Zero Hours</strong> - Staff who reported no time</li>
                <li><strong>Unsubmitted</strong> - Timesheets not yet submitted or rejected</li>
                <li><strong>Under 40 Hours</strong> - Full-time employees with less than 40 hours</li>
                <li><strong>Non-Billable Client Work</strong> - Client work marked as non-billable</li>
                <li><strong>Project Overruns</strong> - Staff/projects with 90%+ hours used</li>
                <li><strong>Poor Notes</strong> (optional) - Billing notes that don&apos;t meet professional standards</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
