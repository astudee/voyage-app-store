import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface BenefitBreakdown {
  benefitType: string;
  eeMonthly: number;
  firmMonthly: number;
  totalMonthly: number;
  totalYearly: number;
}

interface EmployeeSummary {
  staffName: string;
  medicalCode: string;
  dentalCode: string;
  visionCode: string;
  stdCode: string;
  ltdCode: string;
  lifeCode: string;
  totalMonthly: number;
  eeMonthly: number;
  firmMonthly: number;
}

interface EmailRequest {
  to: string;
  summary: {
    totalMonthly: number;
    totalYearly: number;
    eeMonthly: number;
    eeYearly: number;
    firmMonthly: number;
    firmYearly: number;
  };
  breakdown: BenefitBreakdown[];
  totals: BenefitBreakdown;
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
    const { to, summary, breakdown, totals, employees, excelBase64, filename } = body;

    if (!to || !to.includes("@")) {
      return NextResponse.json({ error: "Valid email address required" }, { status: 400 });
    }

    // Get Gmail credentials from environment
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const delegatedUser = process.env.GMAIL_DELEGATED_USER || "astudee@voyageadvisory.com";

    if (!serviceAccountKey) {
      return NextResponse.json({ error: "Gmail not configured" }, { status: 500 });
    }

    // Parse service account key
    let keyData;
    try {
      keyData = JSON.parse(serviceAccountKey);
    } catch {
      return NextResponse.json({ error: "Invalid service account key" }, { status: 500 });
    }

    // Format currency
    const fmt = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Build HTML email body (matching PDF styling)
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
    .summary-box { display: inline-block; margin: 10px 20px 10px 0; padding: 15px 25px; border: 2px solid #FF9800; border-radius: 8px; background: #FFF4E6; }
    .summary-label { font-size: 12px; color: #666; }
    .summary-value { font-size: 24px; font-weight: bold; color: #333; }
    .summary-sub { font-size: 12px; color: #666; margin-top: 5px; }
    .text-right { text-align: right; }
    .total-row { font-weight: bold; background-color: #f0f0f0 !important; }
    .footer { margin-top: 40px; font-size: 12px; color: #999; border-top: 1px solid #ddd; padding-top: 20px; }
  </style>
</head>
<body>
  <h1>Benefits Calculator Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>

  <div style="margin: 20px 0;">
    <div class="summary-box">
      <div class="summary-label">Total Monthly Cost</div>
      <div class="summary-value">${fmt(summary.totalMonthly)}</div>
      <div class="summary-sub">${fmt(summary.totalYearly)}/year</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Employee Paid (Monthly)</div>
      <div class="summary-value">${fmt(summary.eeMonthly)}</div>
      <div class="summary-sub">${fmt(summary.eeYearly)}/year</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Firm Paid (Monthly)</div>
      <div class="summary-value">${fmt(summary.firmMonthly)}</div>
      <div class="summary-sub">${fmt(summary.firmYearly)}/year</div>
    </div>
  </div>

  <h2>Breakdown by Benefit Type</h2>
  <table>
    <tr>
      <th>Benefit Type</th>
      <th class="text-right">Employee Monthly</th>
      <th class="text-right">Firm Monthly</th>
      <th class="text-right">Total Monthly</th>
      <th class="text-right">Total Annual</th>
    </tr>
    ${breakdown.map((b) => `
      <tr>
        <td>${b.benefitType}</td>
        <td class="text-right">${fmt(b.eeMonthly)}</td>
        <td class="text-right">${fmt(b.firmMonthly)}</td>
        <td class="text-right">${fmt(b.totalMonthly)}</td>
        <td class="text-right">${fmt(b.totalYearly)}</td>
      </tr>
    `).join("")}
    <tr class="total-row">
      <td>TOTAL</td>
      <td class="text-right">${fmt(totals.eeMonthly)}</td>
      <td class="text-right">${fmt(totals.firmMonthly)}</td>
      <td class="text-right">${fmt(totals.totalMonthly)}</td>
      <td class="text-right">${fmt(totals.totalYearly)}</td>
    </tr>
  </table>

  <h2>Employee Details</h2>
  <table>
    <tr>
      <th>Staff Member</th>
      <th>Medical</th>
      <th>Dental</th>
      <th>Vision</th>
      <th>STD</th>
      <th>LTD</th>
      <th>Life</th>
      <th class="text-right">Total $/mo</th>
      <th class="text-right">EE $/mo</th>
      <th class="text-right">Firm $/mo</th>
    </tr>
    ${employees.map((e) => `
      <tr>
        <td>${e.staffName}</td>
        <td>${e.medicalCode || "-"}</td>
        <td>${e.dentalCode || "-"}</td>
        <td>${e.visionCode || "-"}</td>
        <td>${e.stdCode || "-"}</td>
        <td>${e.ltdCode || "-"}</td>
        <td>${e.lifeCode || "-"}</td>
        <td class="text-right">${fmt(e.totalMonthly)}</td>
        <td class="text-right">${fmt(e.eeMonthly)}</td>
        <td class="text-right">${fmt(e.firmMonthly)}</td>
      </tr>
    `).join("")}
  </table>

  <div class="footer">
    <p>Voyage Advisory - Benefits Calculator</p>
    <p><em>Detailed data attached as Excel file for further analysis.</em></p>
  </div>
</body>
</html>`;

    // Create MIME message with HTML body and Excel attachment
    const boundary = "boundary_" + Date.now();
    const mimeMessage = [
      `From: ${delegatedUser}`,
      `To: ${to}`,
      `Subject: Benefits Calculator Report - ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
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

    // Get access token using service account with domain-wide delegation
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({
      credentials: keyData,
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      clientOptions: {
        subject: delegatedUser,
      },
    });

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      return NextResponse.json({ error: "Failed to get Gmail access token" }, { status: 500 });
    }

    // Send email via Gmail API
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
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
