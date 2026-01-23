import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface PeriodSummary {
  period: string;
  dealCount: number;
  totalValue: number;
  uniqueClients: number;
}

interface BookingSummary {
  totalBookings: number;
  totalValue: number;
  avgDealSize: number;
  uniqueClients: number;
}

interface EmailRequest {
  to: string;
  startDate: string;
  endDate: string;
  viewBy: string;
  summary: BookingSummary;
  periodSummary: PeriodSummary[];
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
    const { to, startDate, endDate, viewBy, summary, periodSummary, excelBase64, filename } = body;

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

    const startDateFormatted = new Date(startDate).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const endDateFormatted = new Date(endDate).toLocaleDateString("en-US", {
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
    .text-right { text-align: right; }
    .footer { margin-top: 40px; font-size: 12px; color: #999; border-top: 1px solid #ddd; padding-top: 20px; }
  </style>
</head>
<body>
  <h1>Bookings Report</h1>
  <p>Period: ${startDateFormatted} - ${endDateFormatted}</p>
  <p>View: By ${viewBy.charAt(0).toUpperCase() + viewBy.slice(1)}</p>
  <p>Generated: ${new Date().toLocaleString()}</p>

  <div style="margin: 20px 0;">
    <div class="summary-box">
      <div class="summary-label">Total Bookings</div>
      <div class="summary-value">${summary.totalBookings}</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Total Value</div>
      <div class="summary-value">${fmt(summary.totalValue)}</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Avg Deal Size</div>
      <div class="summary-value">${fmt(summary.avgDealSize)}</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Unique Clients</div>
      <div class="summary-value">${summary.uniqueClients}</div>
    </div>
  </div>

  <h2>Bookings by ${viewBy.charAt(0).toUpperCase() + viewBy.slice(1)}</h2>
  <table>
    <tr>
      <th>${viewBy.charAt(0).toUpperCase() + viewBy.slice(1)}</th>
      <th class="text-right">Deal Count</th>
      <th class="text-right">Total Value</th>
      <th class="text-right">Unique Clients</th>
    </tr>
    ${periodSummary.map((p) => `
      <tr>
        <td>${p.period}</td>
        <td class="text-right">${p.dealCount}</td>
        <td class="text-right">${fmt(p.totalValue)}</td>
        <td class="text-right">${p.uniqueClients}</td>
      </tr>
    `).join("")}
  </table>

  <div class="footer">
    <p>Voyage Advisory - Bookings Tracker</p>
    <p><em>Detailed data attached as Excel file.</em></p>
  </div>
</body>
</html>`;

    const boundary = "boundary_" + Date.now();
    const mimeMessage = [
      `From: ${delegatedUser}`,
      `To: ${to}`,
      `Subject: Bookings Report - ${startDateFormatted} to ${endDateFormatted}`,
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
