import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface EmployeeSummary {
  employee: string;
  ytdEligible: number;
  ytdTier: number;
  ytdTotalBonus: number;
  ytdTotalCost: number;
  projEligible: number;
  projTier: number;
  projTotalBonus: number;
  projTotalCost: number;
}

interface EmailRequest {
  to: string;
  summary: {
    year: number;
    asOfDate: string;
    progressPct: number;
    employeeCount: number;
    ytdTotalBonuses: number;
    ytdTotalFica: number;
    ytdTotal401k: number;
    ytdTotalCost: number;
    projTotalBonuses: number;
    projTotalFica: number;
    projTotal401k: number;
    projTotalCost: number;
  };
  employees: EmployeeSummary[];
  excelBase64: string;
  filename: string;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: EmailRequest = await request.json();
    const { to, summary, employees, excelBase64, filename } = body;

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
    const fmtHours = (n: number) => n.toFixed(1);

    const getTierColor = (tier: number) => {
      if (tier === 1) return "#D5F4E6";
      if (tier === 2) return "#FCF3CF";
      return "#D6EAF8";
    };

    const asOfDateFormatted = new Date(summary.asOfDate).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; max-width: 900px; }
    h1 { color: #336699; border-bottom: 2px solid #669999; padding-bottom: 10px; }
    h2 { color: #336699; margin-top: 30px; }
    table { border-collapse: collapse; width: 100%; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #669999; color: white; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .summary-box { display: inline-block; margin: 10px 20px 10px 0; padding: 15px 25px; border: 2px solid #FF9800; border-radius: 8px; background: #FFF4E6; vertical-align: top; }
    .summary-label { font-size: 12px; color: #666; }
    .summary-value { font-size: 24px; font-weight: bold; color: #333; }
    .summary-sub { font-size: 11px; color: #666; margin-top: 5px; }
    .text-right { text-align: right; }
    .tier-1 { background-color: #D5F4E6; }
    .tier-2 { background-color: #FCF3CF; }
    .tier-3 { background-color: #D6EAF8; }
    .footer { margin-top: 40px; font-size: 12px; color: #999; border-top: 1px solid #ddd; padding-top: 20px; }
  </style>
</head>
<body>
  <h1>Bonus Report - ${summary.year}</h1>
  <p>As of: ${asOfDateFormatted} (${(summary.progressPct * 100).toFixed(1)}% of year)</p>
  <p>Generated: ${new Date().toLocaleString()}</p>

  <div style="margin: 20px 0;">
    <div class="summary-box">
      <div class="summary-label">YTD Total Cost</div>
      <div class="summary-value">${fmt(summary.ytdTotalCost)}</div>
      <div class="summary-sub">
        Bonuses: ${fmt(summary.ytdTotalBonuses)}<br>
        FICA: ${fmt(summary.ytdTotalFica)}<br>
        401k: ${fmt(summary.ytdTotal401k)}
      </div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Projected Year-End Cost</div>
      <div class="summary-value">${fmt(summary.projTotalCost)}</div>
      <div class="summary-sub">
        Bonuses: ${fmt(summary.projTotalBonuses)}<br>
        FICA: ${fmt(summary.projTotalFica)}<br>
        401k: ${fmt(summary.projTotal401k)}
      </div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Employees</div>
      <div class="summary-value">${summary.employeeCount}</div>
    </div>
  </div>

  <h2>Employee Details</h2>
  <table>
    <tr>
      <th>Employee</th>
      <th class="text-right">YTD Eligible Hrs</th>
      <th class="text-right">YTD Tier</th>
      <th class="text-right">YTD Bonus</th>
      <th class="text-right">YTD Cost</th>
      <th class="text-right">Proj Eligible Hrs</th>
      <th class="text-right">Proj Tier</th>
      <th class="text-right">Proj Bonus</th>
      <th class="text-right">Proj Cost</th>
    </tr>
    ${employees.map((e) => `
      <tr>
        <td>${e.employee}</td>
        <td class="text-right">${fmtHours(e.ytdEligible)}</td>
        <td class="text-right" style="background-color: ${getTierColor(e.ytdTier)}">${e.ytdTier}</td>
        <td class="text-right">${fmt(e.ytdTotalBonus)}</td>
        <td class="text-right">${fmt(e.ytdTotalCost)}</td>
        <td class="text-right">${fmtHours(e.projEligible)}</td>
        <td class="text-right" style="background-color: ${getTierColor(e.projTier)}">${e.projTier}</td>
        <td class="text-right">${fmt(e.projTotalBonus)}</td>
        <td class="text-right">${fmt(e.projTotalCost)}</td>
      </tr>
    `).join("")}
  </table>

  <h2>Tier Legend</h2>
  <ul>
    <li><span style="background-color: #D5F4E6; padding: 2px 8px;">Tier 1</span> - ≥1,840 hours (full bonus)</li>
    <li><span style="background-color: #FCF3CF; padding: 2px 8px;">Tier 2</span> - 1,350-1,839 hours (75% bonus)</li>
    <li><span style="background-color: #D6EAF8; padding: 2px 8px;">Tier 3</span> - &lt;1,350 hours (no bonus)</li>
  </ul>

  <div class="footer">
    <p>Voyage Advisory - Bonus Calculator</p>
    <p><em>Detailed data attached as Excel file.</em></p>
  </div>
</body>
</html>`;

    const boundary = "boundary_" + Date.now();
    const mimeMessage = [
      `From: ${delegatedUser}`,
      `To: ${to}`,
      `Subject: Bonus Report - YTD through ${asOfDateFormatted}`,
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
