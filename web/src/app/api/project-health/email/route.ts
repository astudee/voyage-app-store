import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

interface EmailRequest {
  to: string;
  summary: Summary;
  projects: ProjectHealth[];
  excelBase64: string;
  filename: string;
}

function getPlanBookedColor(pct: number): string {
  if (pct >= 98 && pct <= 102) return "#16a34a"; // green
  if (pct > 102) return "#dc2626"; // red
  if (pct >= 80 && pct < 98) return "#ca8a04"; // yellow
  return "#2563eb"; // blue
}

function getFeesBookedColor(feesPct: number, durationPct: number): string {
  const variance = feesPct - durationPct;
  if (Math.abs(variance) <= 3) return "#16a34a"; // green
  if (variance > 3) return "#dc2626"; // red
  if (variance >= -10 && variance < -3) return "#ca8a04"; // yellow
  return "#2563eb"; // blue
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: EmailRequest = await request.json();
    const { to, summary, projects, excelBase64, filename } = body;

    if (!to || !to.includes("@")) {
      return NextResponse.json({ error: "Valid email address required" }, { status: 400 });
    }

    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const delegatedUser = process.env.GMAIL_DELEGATED_USER || "astudee@voyageadvisory.com";

    if (!serviceAccountKey) {
      return NextResponse.json({ error: "Gmail not configured" }, { status: 500 });
    }

    let keyData;
    try {
      keyData = JSON.parse(serviceAccountKey);
    } catch {
      return NextResponse.json({ error: "Invalid service account key" }, { status: 500 });
    }

    const fmt = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; max-width: 1200px; }
    h1 { color: #336699; border-bottom: 2px solid #669999; padding-bottom: 10px; }
    h2 { color: #336699; margin-top: 30px; }
    table { border-collapse: collapse; width: 100%; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #669999; color: white; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .summary-box { display: inline-block; margin: 10px 20px 10px 0; padding: 15px 25px; border: 2px solid #336699; border-radius: 8px; background: #f0f7ff; vertical-align: top; }
    .summary-label { font-size: 12px; color: #666; }
    .summary-value { font-size: 24px; font-weight: bold; color: #333; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .no-pd { background-color: #FFF7ED; }
    .footer { margin-top: 40px; font-size: 12px; color: #999; border-top: 1px solid #ddd; padding-top: 20px; }
  </style>
</head>
<body>
  <h1>Project Health Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>

  <div style="margin: 20px 0;">
    <div class="summary-box">
      <div class="summary-label">Scoping Errors</div>
      <div class="summary-value" style="color: #dc2626;">${summary.scopingErrors}</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Over-Billed</div>
      <div class="summary-value" style="color: #ca8a04;">${summary.overBilled}</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Under-Billed</div>
      <div class="summary-value" style="color: #2563eb;">${summary.underBilled}</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Total Bookings</div>
      <div class="summary-value">${fmt(summary.totalBooking)}</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">No Pipedrive Link</div>
      <div class="summary-value" style="color: #ea580c;">${summary.projectsWithoutPipedrive}</div>
    </div>
  </div>

  <h2>Project Details (${summary.projectCount} projects)</h2>
  <table>
    <tr>
      <th>Client</th>
      <th>Project</th>
      <th class="text-right">Booking</th>
      <th class="text-right">Plan</th>
      <th class="text-right">Fees to Date</th>
      <th class="text-center">Plan/Booked</th>
      <th class="text-center">Fees/Booked</th>
      <th class="text-center">% Duration</th>
    </tr>
    ${projects.map((p) => `
      <tr class="${!p.hasPipedriveMatch ? 'no-pd' : ''}">
        <td>${p.client}</td>
        <td>${p.projectName}${!p.hasPipedriveMatch ? ' <span style="background: #fed7aa; padding: 2px 4px; border-radius: 3px; font-size: 10px;">No PD</span>' : ''}</td>
        <td class="text-right">${p.hasPipedriveMatch ? fmt(p.booking) : 'N/A'}</td>
        <td class="text-right">${fmt(p.plannedRevenue)}</td>
        <td class="text-right">${fmt(p.feesToDate)}</td>
        <td class="text-center" style="color: ${p.hasPipedriveMatch ? getPlanBookedColor(p.planBookedPct) : '#94a3b8'}; font-weight: bold;">
          ${p.hasPipedriveMatch ? p.planBookedPct.toFixed(0) + '%' : 'N/A'}
        </td>
        <td class="text-center" style="color: ${p.hasPipedriveMatch ? getFeesBookedColor(p.feesBookedPct, p.durationPct) : '#94a3b8'}; font-weight: bold;">
          ${p.hasPipedriveMatch ? p.feesBookedPct.toFixed(0) + '%' : 'N/A'}
        </td>
        <td class="text-center">${p.durationPct.toFixed(0)}%</td>
      </tr>
    `).join("")}
  </table>

  <h2>Color Legend</h2>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
    <div>
      <h3 style="font-size: 14px; color: #336699;">Plan/Booked (Scoping Accuracy)</h3>
      <ul style="font-size: 13px;">
        <li style="color: #16a34a;">98-102%: Perfect scoping</li>
        <li style="color: #ca8a04;">80-97%: Slightly under-scoped</li>
        <li style="color: #dc2626;">&gt;102%: Over-scoped</li>
        <li style="color: #2563eb;">&lt;80%: Significantly under-scoped</li>
      </ul>
    </div>
    <div>
      <h3 style="font-size: 14px; color: #336699;">Fees/Booked vs % Duration</h3>
      <ul style="font-size: 13px;">
        <li style="color: #16a34a;">Within 3%: On track</li>
        <li style="color: #ca8a04;">3-10% behind: Slightly behind</li>
        <li style="color: #dc2626;">&gt;3% ahead: Running hot</li>
        <li style="color: #2563eb;">&gt;10% behind: Significantly behind</li>
      </ul>
    </div>
  </div>

  <div class="footer">
    <p>Voyage Advisory - Project Health Monitor</p>
    <p><em>Detailed data attached as Excel file.</em></p>
  </div>
</body>
</html>`;

    const boundary = "boundary_" + Date.now();
    const mimeMessage = [
      `From: ${delegatedUser}`,
      `To: ${to}`,
      `Subject: Project Health Report - ${new Date().toLocaleDateString()}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      htmlBody,
      "",
      `--${boundary}`,
      `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      excelBase64,
      "",
      `--${boundary}--`,
    ].join("\r\n");

    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({
      credentials: keyData,
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      clientOptions: { subject: delegatedUser },
    });

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      return NextResponse.json({ error: "Failed to get Gmail access token" }, { status: 500 });
    }

    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: Buffer.from(mimeMessage).toString("base64url"),
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gmail API error:", errorText);
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Email sent to ${to}` });
  } catch (error) {
    console.error("Email error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
