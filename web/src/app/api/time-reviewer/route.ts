import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

interface StaffMember {
  STAFF_NAME: string;
}

interface Assignment {
  STAFF_NAME: string;
  PROJECT_ID: number;
  ALLOCATED_HOURS: number;
}

interface Issues {
  zeroHours: string[];
  notSubmitted: string[];
  under40: { name: string; hours: number }[];
  nonBillableClientWork: { staff: string; client: string; project: string; date: string; hours: number }[];
  projectOverruns: { staff: string; client: string; project: string; projectId: string; hoursUsed: number; hoursAssigned: number; percentage: number | null; issue: string }[];
  poorNotes: { staff: string; client: string; project: string; date: string; hours: number; note: string; reason: string }[];
}

const BIGTIME_API_KEY = process.env.BIGTIME_API_KEY;
const BIGTIME_FIRM_ID = process.env.BIGTIME_FIRM_ID;

// Fetch BigTime report
async function fetchBigTimeReport(reportId: string, startDate: Date, endDate: Date): Promise<{ rows: unknown[][]; columns: Record<string, number> }> {
  const response = await fetch(
    `https://iq.bigtime.net/BigtimeData/api/v2/report/data/${reportId}`,
    {
      method: "POST",
      headers: {
        "X-Auth-ApiToken": BIGTIME_API_KEY!,
        "X-Auth-Realm": BIGTIME_FIRM_ID!,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        DT_BEGIN: startDate.toISOString().slice(0, 10),
        DT_END: endDate.toISOString().slice(0, 10),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`BigTime API error: ${response.status}`);
  }

  const data = await response.json();
  const rows = data.Data || [];
  const fields = data.FieldList || [];

  const columns: Record<string, number> = {};
  fields.forEach((field: { FieldNm: string }, idx: number) => {
    columns[field.FieldNm] = idx;
  });

  return { rows, columns };
}

// Fetch active staff from Snowflake
async function fetchActiveStaff(): Promise<Set<string>> {
  const sql = "SELECT STAFF_NAME FROM VC_STAFF WHERE IS_ACTIVE = TRUE";
  const rows = await query<StaffMember>(sql);
  return new Set(rows.map((r) => r.STAFF_NAME));
}

// Fetch assignments from Snowflake
async function fetchAssignments(): Promise<Map<string, number>> {
  const sql = `
    SELECT STAFF_NAME, PROJECT_ID, SUM(ALLOCATED_HOURS) as ALLOCATED_HOURS
    FROM VC_STAFF_ASSIGNMENTS
    GROUP BY STAFF_NAME, PROJECT_ID
  `;
  const rows = await query<Assignment>(sql);
  const lookup = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.STAFF_NAME}|${row.PROJECT_ID}`;
    lookup.set(key, (lookup.get(key) || 0) + (row.ALLOCATED_HOURS || 0));
  }
  return lookup;
}

// Snap date to Friday
function snapToFriday(date: Date): Date {
  const result = new Date(date);
  const weekday = result.getDay();
  if (weekday === 5) return result; // Already Friday
  if (weekday < 5) {
    result.setDate(result.getDate() + (5 - weekday));
  } else {
    result.setDate(result.getDate() - (weekday - 5));
  }
  return result;
}

// Normalize project ID
function normalizeProjectId(pid: unknown): string {
  if (pid === null || pid === undefined || pid === "") return "";
  const str = String(pid);
  return str.endsWith(".0") ? str.slice(0, -2) : str.split(".")[0];
}

// Check note quality with basic heuristics
function checkNoteQuality(note: string): { isPoor: boolean; reason: string } {
  if (!note || note.trim().length < 10) {
    return { isPoor: true, reason: "Note too short (less than 10 characters)" };
  }

  const noteLower = note.toLowerCase().trim();

  // Check for very short notes
  if (note.length < 20) {
    return { isPoor: true, reason: "Note too short" };
  }

  // Check for single words or very brief
  if (note.split(/\s+/).length <= 3) {
    return { isPoor: true, reason: "Note too brief (3 words or less)" };
  }

  // Check for discouraged words
  const discouragedWords = ["ensure", "ensured", "ensuring", "comprehensive", "align", "aligned", "alignment", "strategy", "strategic", "key priorities"];
  for (const word of discouragedWords) {
    if (noteLower.includes(word)) {
      return { isPoor: true, reason: `Uses discouraged word: '${word}'` };
    }
  }

  // Check for vague patterns
  const vaguePatterns = ["worked on", "stuff", "things", "misc", "various"];
  for (const pattern of vaguePatterns) {
    if (noteLower.includes(pattern)) {
      return { isPoor: true, reason: `Too vague: contains '${pattern}'` };
    }
  }

  // Very short notes with specific vague words
  if (note.split(/\s+/).length <= 5) {
    if (noteLower.includes("meeting") || noteLower.includes("research")) {
      return { isPoor: true, reason: "Too vague for a brief note" };
    }
  }

  // Check for missing period
  if (!note.trim().endsWith(".")) {
    return { isPoor: true, reason: "Missing period at end" };
  }

  return { isPoor: false, reason: "" };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!BIGTIME_API_KEY || !BIGTIME_FIRM_ID) {
    return NextResponse.json({ error: "BigTime API not configured" }, { status: 500 });
  }

  const searchParams = request.nextUrl.searchParams;
  const dateStr = searchParams.get("date");
  const reviewNotes = searchParams.get("reviewNotes") === "true";

  // Calculate week ending (Friday)
  const selectedDate = dateStr ? new Date(dateStr) : new Date();
  const weekEnding = snapToFriday(selectedDate);

  // If selected date results in future Friday, go back a week
  const today = new Date();
  if (weekEnding > today) {
    weekEnding.setDate(weekEnding.getDate() - 7);
  }

  const weekStarting = new Date(weekEnding);
  weekStarting.setDate(weekStarting.getDate() - 6);

  try {
    // Fetch all data in parallel
    const [
      employees,
      assignments,
      { rows: zeroHoursRows, columns: zeroHoursCols },
      { rows: unsubmittedRows, columns: unsubmittedCols },
      { rows: detailedRows, columns: detailedCols },
    ] = await Promise.all([
      fetchActiveStaff(),
      fetchAssignments(),
      fetchBigTimeReport("288578", weekStarting, weekEnding), // Zero Hours
      fetchBigTimeReport("284828", weekStarting, weekEnding), // Unsubmitted
      fetchBigTimeReport("284796", weekStarting, weekEnding), // Detailed Time
    ]);

    const issues: Issues = {
      zeroHours: [],
      notSubmitted: [],
      under40: [],
      nonBillableClientWork: [],
      projectOverruns: [],
      poorNotes: [],
    };

    // 1. Analyze Zero Hours
    const staffNameCols = ["stname", "Name", "Staff", "Staff Member", "tmstaffnm", "staffnm"];
    let staffColIdx: number | undefined;
    for (const col of staffNameCols) {
      if (zeroHoursCols[col] !== undefined) {
        staffColIdx = zeroHoursCols[col];
        break;
      }
    }
    // Fallback: find column containing "name"
    if (staffColIdx === undefined) {
      for (const col of Object.keys(zeroHoursCols)) {
        if (col.toLowerCase().includes("name") && !col.toLowerCase().includes("_id")) {
          staffColIdx = zeroHoursCols[col];
          break;
        }
      }
    }

    if (staffColIdx !== undefined) {
      const names = new Set<string>();
      for (const row of zeroHoursRows) {
        const name = row[staffColIdx] as string;
        if (name && !String(name).toUpperCase().includes("TOTAL")) {
          names.add(name);
        }
      }
      issues.zeroHours = Array.from(names).sort();
    }

    // 2. Analyze Unsubmitted Timesheets
    let unsubStaffColIdx: number | undefined;
    for (const col of ["Staff", "Staff Member", "tmstaffnm", "Name"]) {
      if (unsubmittedCols[col] !== undefined) {
        unsubStaffColIdx = unsubmittedCols[col];
        break;
      }
    }

    if (unsubStaffColIdx !== undefined) {
      const names = new Set<string>();
      for (const row of unsubmittedRows) {
        const name = row[unsubStaffColIdx] as string;
        if (name) names.add(name);
      }
      issues.notSubmitted = Array.from(names).sort();
    }

    // 3. Analyze Detailed Time Entries
    const getColIdx = (cols: Record<string, number>, ...names: string[]): number | undefined => {
      for (const name of names) {
        if (cols[name] !== undefined) return cols[name];
      }
      return undefined;
    };

    const staffIdx = getColIdx(detailedCols, "Staff Member", "tmstaffnm", "Staff");
    const clientIdx = getColIdx(detailedCols, "Client", "tmclientnm");
    const projectIdx = getColIdx(detailedCols, "Project", "tmprojectnm");
    const hoursIdx = getColIdx(detailedCols, "tmhrsin", "Input", "tmhrs", "Hours", "Total Hours");
    const billableIdx = getColIdx(detailedCols, "tmhrsbill", "Billable");
    const dateIdx = getColIdx(detailedCols, "tmdt", "Date");
    const notesIdx = getColIdx(detailedCols, "tmnotes", "Notes");
    const projectIdIdx = getColIdx(detailedCols, "tmprojectnm_id", "Project_ID", "ProjectID");

    if (staffIdx !== undefined && hoursIdx !== undefined) {
      // Group hours by staff
      const hoursByStaff = new Map<string, number>();
      const billableEntries: { staff: string; client: string; project: string; date: string; hours: number; billable: number; note: string; projectId: string }[] = [];
      const staffProjectHours = new Map<string, { staff: string; client: string; project: string; projectId: string; hours: number }>();

      for (const row of detailedRows) {
        const staff = row[staffIdx] as string || "";
        const hours = Number(row[hoursIdx]) || 0;
        const billable = billableIdx !== undefined ? (Number(row[billableIdx]) || 0) : 0;
        const client = clientIdx !== undefined ? (row[clientIdx] as string || "") : "";
        const project = projectIdx !== undefined ? (row[projectIdx] as string || "") : "";
        const date = dateIdx !== undefined ? (row[dateIdx] as string || "") : "";
        const note = notesIdx !== undefined ? (row[notesIdx] as string || "") : "";
        const projectId = projectIdIdx !== undefined ? normalizeProjectId(row[projectIdIdx]) : "";

        // Sum hours by staff
        hoursByStaff.set(staff, (hoursByStaff.get(staff) || 0) + hours);

        // Track billable entries for note review
        if (billable > 0 && hours > 0) {
          billableEntries.push({ staff, client, project, date, hours, billable, note, projectId });
        }

        // Track non-billable client work (non-Internal clients)
        if (hours > 0 && billable === 0 && !client.toLowerCase().includes("internal")) {
          issues.nonBillableClientWork.push({
            staff,
            client,
            project,
            date,
            hours: Math.round(hours * 10) / 10,
          });
        }

        // Track hours by staff+project for overrun check
        if (hours > 0 && !client.toLowerCase().includes("internal")) {
          const key = `${staff}|${projectId}`;
          const existing = staffProjectHours.get(key) || { staff, client, project, projectId, hours: 0 };
          existing.hours += hours;
          staffProjectHours.set(key, existing);
        }
      }

      // Check under 40 hours (employees only)
      for (const [staff, totalHours] of hoursByStaff) {
        if (employees.has(staff) && totalHours < 40) {
          issues.under40.push({
            name: staff,
            hours: Math.round(totalHours * 10) / 10,
          });
        }
      }

      // Fetch all-time actuals for project overrun check
      const allTimeStart = new Date(2020, 0, 1);
      const { rows: allTimeRows, columns: allTimeCols } = await fetchBigTimeReport("284796", allTimeStart, weekEnding);

      const atStaffIdx = getColIdx(allTimeCols, "Staff Member", "tmstaffnm", "Staff");
      const atClientIdx = getColIdx(allTimeCols, "Client", "tmclientnm");
      const atProjectIdx = getColIdx(allTimeCols, "Project", "tmprojectnm");
      const atHoursIdx = getColIdx(allTimeCols, "tmhrsin", "Input", "Hours", "tmhrsbill", "Billable");
      const atProjectIdIdx = getColIdx(allTimeCols, "tmprojectnm_id", "Project_ID");

      if (atStaffIdx !== undefined && atHoursIdx !== undefined) {
        const lifetimeHours = new Map<string, { staff: string; client: string; project: string; projectId: string; hours: number }>();

        for (const row of allTimeRows) {
          const staff = row[atStaffIdx] as string || "";
          const client = atClientIdx !== undefined ? (row[atClientIdx] as string || "") : "";
          const project = atProjectIdx !== undefined ? (row[atProjectIdx] as string || "") : "";
          const hours = Number(row[atHoursIdx]) || 0;
          const projectId = atProjectIdIdx !== undefined ? normalizeProjectId(row[atProjectIdIdx]) : "";

          if (hours > 0 && !client.toLowerCase().includes("internal")) {
            const key = `${staff}|${projectId}`;
            const existing = lifetimeHours.get(key) || { staff, client, project, projectId, hours: 0 };
            existing.hours += hours;
            lifetimeHours.set(key, existing);
          }
        }

        // Check overruns only for staff/projects that had activity this week
        const thisWeekKeys = new Set(staffProjectHours.keys());

        for (const [key, data] of lifetimeHours) {
          if (!thisWeekKeys.has(key)) continue;

          const assigned = assignments.get(key) || 0;
          const hoursUsed = Math.round(data.hours * 10) / 10;

          if (hoursUsed > 0) {
            if (assigned === 0) {
              issues.projectOverruns.push({
                staff: data.staff,
                client: data.client,
                project: data.project,
                projectId: data.projectId,
                hoursUsed,
                hoursAssigned: 0,
                percentage: null,
                issue: "No hours assigned",
              });
            } else if ((hoursUsed / assigned) >= 0.9) {
              const pct = Math.round((hoursUsed / assigned) * 100);
              issues.projectOverruns.push({
                staff: data.staff,
                client: data.client,
                project: data.project,
                projectId: data.projectId,
                hoursUsed,
                hoursAssigned: Math.round(assigned * 10) / 10,
                percentage: pct,
                issue: `${pct}% of assigned hours used`,
              });
            }
          }
        }
      }

      // Check note quality if requested
      if (reviewNotes) {
        for (const entry of billableEntries) {
          const { isPoor, reason } = checkNoteQuality(entry.note);
          if (isPoor) {
            issues.poorNotes.push({
              staff: entry.staff,
              client: entry.client,
              project: entry.project,
              date: entry.date,
              hours: Math.round(entry.hours * 10) / 10,
              note: entry.note,
              reason,
            });
          }
        }
      }
    }

    // Sort under40
    issues.under40.sort((a, b) => a.hours - b.hours);

    // Calculate total issues
    const totalIssues =
      issues.zeroHours.length +
      issues.notSubmitted.length +
      issues.under40.length +
      issues.nonBillableClientWork.length +
      issues.projectOverruns.length +
      issues.poorNotes.length;

    return NextResponse.json({
      success: true,
      weekEnding: weekEnding.toISOString().slice(0, 10),
      weekStarting: weekStarting.toISOString().slice(0, 10),
      issues,
      totalIssues,
      metadata: {
        employeeCount: employees.size,
        detailedEntries: detailedRows.length,
        reviewedNotes: reviewNotes,
      },
    });
  } catch (error) {
    console.error("Time reviewer error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
