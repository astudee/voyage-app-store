import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface NonFridayFee {
  contractor: string;
  date: string;
  day: string;
  amount: number;
}

interface WeeklySummary {
  staff: string;
  weekEnding: string;
  totalHours: number;
  totalFees: number;
  avgHourlyRate: number;
}

interface EmailRequest {
  to: string;
  startDate: string;
  endDate: string;
  summary: {
    totalContractors: number;
    totalNonFridayFees: number;
    totalMissingInvoices: number;
    totalWeeks: number;
  };
  nonFridayFees: NonFridayFee[];
  missingInvoices: WeeklySummary[];
  weeklySummary: WeeklySummary[];
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
    const { to, startDate, endDate, summary, nonFridayFees, missingInvoices, weeklySummary, excelBase64, filename } = body;

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

    const fmt = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    const startDateFormatted = fmtDate(startDate);
    const endDateFormatted = fmtDate(endDate);

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
    .summary-box { display: inline-block; margin: 10px 20px 10px 0; padding: 15px 25px; border-radius: 8px; vertical-align: top; }
    .summary-box.green { border: 2px solid #4CAF50; background: #E8F5E9; }
    .summary-box.amber { border: 2px solid #FF9800; background: #FFF4E6; }
    .summary-box.red { border: 2px solid #f44336; background: #FFEBEE; }
    .summary-label { font-size: 12px; color: #666; }
    .summary-value { font-size: 24px; font-weight: bold; color: #333; }
    .text-right { text-align: right; }
    .success { color: #4CAF50; }
    .warning { color: #FF9800; }
    .error { color: #f44336; }
    .footer { margin-top: 40px; font-size: 12px; color: #999; border-top: 1px solid #ddd; padding-top: 20px; }
  </style>
</head>
<body>
  <h1>Contractor Fee Review</h1>
  <p>Period: ${startDateFormatted} - ${endDateFormatted}</p>
  <p>Generated: ${new Date().toLocaleString()}</p>

  <div style="margin: 20px 0;">
    <div class="summary-box green">
      <div class="summary-label">Contractors</div>
      <div class="summary-value">${summary.totalContractors}</div>
    </div>
    <div class="summary-box green">
      <div class="summary-label">Contractor-Weeks</div>
      <div class="summary-value">${summary.totalWeeks}</div>
    </div>
    <div class="summary-box ${summary.totalNonFridayFees > 0 ? 'amber' : 'green'}">
      <div class="summary-label">Non-Friday Fees</div>
      <div class="summary-value">${summary.totalNonFridayFees}</div>
    </div>
    <div class="summary-box ${summary.totalMissingInvoices > 0 ? 'red' : 'green'}">
      <div class="summary-label">Missing Invoices</div>
      <div class="summary-value">${summary.totalMissingInvoices}</div>
    </div>
  </div>

  <h2>1. Fees Charged on Non-Friday</h2>
  <p><em>Contractor fees should be charged on Fridays</em></p>
  ${nonFridayFees.length > 0 ? `
    <p class="warning">Found ${nonFridayFees.length} fee(s) charged on non-Friday</p>
    <table>
      <tr>
        <th>Contractor</th>
        <th>Date</th>
        <th>Day</th>
        <th class="text-right">Amount</th>
      </tr>
      ${nonFridayFees.map((f) => `
        <tr>
          <td>${f.contractor}</td>
          <td>${fmtDate(f.date)}</td>
          <td>${f.day}</td>
          <td class="text-right">${fmt(f.amount)}</td>
        </tr>
      `).join("")}
    </table>
  ` : `<p class="success">✓ All contractor fees charged on Friday</p>`}

  <h2>2. Hours Without Invoices</h2>
  <p><em>Contractors who submitted hours but no invoice for the week</em></p>
  ${missingInvoices.length > 0 ? `
    <p class="error">Found ${missingInvoices.length} week(s) with missing invoices</p>
    <table>
      <tr>
        <th>Contractor</th>
        <th>Week Ending</th>
        <th class="text-right">Hours</th>
        <th class="text-right">Fees</th>
      </tr>
      ${missingInvoices.map((m) => `
        <tr>
          <td>${m.staff}</td>
          <td>${fmtDate(m.weekEnding)}</td>
          <td class="text-right">${m.totalHours.toFixed(1)}</td>
          <td class="text-right">${fmt(m.totalFees)}</td>
        </tr>
      `).join("")}
    </table>
  ` : `<p class="success">✓ All contractor hours have corresponding invoices</p>`}

  <h2>3. Contractor Summary by Week</h2>
  ${weeklySummary.length > 0 ? `
    <table>
      <tr>
        <th>Contractor</th>
        <th>Week Ending</th>
        <th class="text-right">Hours</th>
        <th class="text-right">Fees</th>
        <th class="text-right">Avg Rate/Hour</th>
      </tr>
      ${weeklySummary.map((s) => `
        <tr>
          <td>${s.staff}</td>
          <td>${fmtDate(s.weekEnding)}</td>
          <td class="text-right">${s.totalHours.toFixed(1)}</td>
          <td class="text-right">${fmt(s.totalFees)}</td>
          <td class="text-right">${fmt(s.avgHourlyRate)}</td>
        </tr>
      `).join("")}
    </table>
  ` : `<p>No contractor data found for this period</p>`}

  <div class="footer">
    <p>Voyage Advisory - Contractor Fee Reviewer</p>
    <p><em>Detailed data attached as Excel file.</em></p>
  </div>
</body>
</html>`;

    const boundary = "boundary_" + Date.now();
    const mimeMessage = [
      `From: ${delegatedUser}`,
      `To: ${to}`,
      `Subject: Contractor Fee Review - ${startDateFormatted} to ${endDateFormatted}`,
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
