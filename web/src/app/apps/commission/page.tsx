"use client";

import { useState, useMemo } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface CommissionRecord {
  salesperson: string;
  client: string;
  category: string;
  invoiceDate: string;
  invoiceAmount: number;
  commissionRate: number;
  commissionAmount: number;
  source: string;
}

interface SalespersonSummary {
  salesperson: string;
  totalCommission: number;
  totalDue: number;
  byCategory: { category: string; amount: number }[];
}

interface ClientRevenue {
  client: string;
  revenue: number;
  transactions: number;
}

interface DebugInfo {
  rulesLoaded: number;
  offsetsLoaded: number;
  mappingsLoaded: number;
  qbTransactions: number;
  btEntries: number;
  qbTotal: number;
  commissionRecords: number;
}

interface CommissionData {
  year: number;
  summaries: SalespersonSummary[];
  records: CommissionRecord[];
  clientRevenue: ClientRevenue[];
  debug: DebugInfo;
  timestamp: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatPercent = (rate: number) => {
  return `${(rate * 100).toFixed(1)}%`;
};

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
};

export default function CommissionCalculatorPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear.toString());
  const [yearError, setYearError] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CommissionData | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "category" | "clients" | "ledger">("summary");
  const [showDebug, setShowDebug] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<string>("all");

  // Get list of salespeople for the filter
  const salespeople = useMemo(() => {
    if (!data) return [];
    return data.summaries.map((s) => s.salesperson).sort();
  }, [data]);

  // Filter data based on selected person
  const filteredData = useMemo(() => {
    if (!data || selectedPerson === "all") return data;

    const filteredSummaries = data.summaries.filter((s) => s.salesperson === selectedPerson);
    const filteredRecords = data.records.filter((r) => r.salesperson === selectedPerson);

    return {
      ...data,
      summaries: filteredSummaries,
      records: filteredRecords,
    };
  }, [data, selectedPerson]);

  const validateYear = (value: string) => {
    const numYear = parseInt(value);
    if (isNaN(numYear)) {
      setYearError("Enter a valid year");
      return false;
    }
    if (numYear < 2000 || numYear > 2100) {
      setYearError("Year must be between 2000 and 2100");
      return false;
    }
    setYearError("");
    return true;
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setYear(value);
    if (value) validateYear(value);
  };

  const calculateCommissions = async () => {
    if (!validateYear(year)) return;

    setLoading(true);
    setSelectedPerson("all"); // Reset filter when recalculating
    try {
      const response = await fetch(`/api/commission?year=${year}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to calculate commissions");
      }

      const result: CommissionData = await response.json();
      setData(result);

      if (result.debug.qbTransactions === 0 && result.debug.btEntries === 0) {
        toast.warning("No data from APIs. Check QuickBooks and BigTime credentials.");
      } else {
        toast.success("Commissions calculated successfully!");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Calculation failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const generateExcelWorkbook = (forPerson?: string) => {
    if (!data) return null;

    const targetData = forPerson && forPerson !== "all"
      ? {
          ...data,
          summaries: data.summaries.filter((s) => s.salesperson === forPerson),
          records: data.records.filter((r) => r.salesperson === forPerson),
        }
      : filteredData;

    if (!targetData) return null;

    const wb = XLSX.utils.book_new();
    const personLabel = forPerson && forPerson !== "all" ? forPerson : (selectedPerson !== "all" ? selectedPerson : "All");

    // Summary sheet
    const summaryTotal = targetData.summaries.reduce((sum, s) => sum + s.totalCommission, 0);
    const dueTotal = targetData.summaries.reduce((sum, s) => sum + s.totalDue, 0);
    const summaryData = [
      [`Commission Summary - ${personLabel}`, "", ""],
      ["Salesperson", "Total Commission", "Total Due"],
      ...targetData.summaries.map((s) => [s.salesperson, s.totalCommission, s.totalDue]),
      [],
      ["Totals", summaryTotal, dueTotal],
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    // Category breakdown sheet
    const categoryData = [["Salesperson", "Category", "Commission Amount"]];
    for (const sp of targetData.summaries) {
      for (const cat of sp.byCategory) {
        categoryData.push([sp.salesperson, cat.category, cat.amount.toString()]);
      }
    }
    const categoryWs = XLSX.utils.aoa_to_sheet(categoryData);
    XLSX.utils.book_append_sheet(wb, categoryWs, "By Category");

    // Per-salesperson summary sheets
    for (const sp of targetData.summaries) {
      const spRecords = targetData.records.filter((r) => r.salesperson === sp.salesperson);
      const grouped: Record<string, { client: string; category: string; rate: number; revenue: number; commission: number }> = {};

      for (const r of spRecords) {
        const key = `${r.client}|${r.category}|${r.commissionRate}`;
        if (!grouped[key]) {
          grouped[key] = { client: r.client, category: r.category, rate: r.commissionRate, revenue: 0, commission: 0 };
        }
        grouped[key].revenue += r.invoiceAmount;
        grouped[key].commission += r.commissionAmount;
      }

      const spData = [
        ["Client or Resource", "Category", "Factor", "Revenue ($)", "Commission ($)"],
        ...Object.values(grouped)
          .sort((a, b) => b.commission - a.commission)
          .map((g) => [g.client, g.category, g.rate, g.revenue, g.commission]),
      ];
      const spWs = XLSX.utils.aoa_to_sheet(spData);
      const sheetName = sp.salesperson.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 31);
      XLSX.utils.book_append_sheet(wb, spWs, sheetName);
    }

    // Full ledger sheet
    const ledgerData = [
      ["Salesperson", "Client or Resource", "Category", "Date", "Invoice Amount", "Rate", "Commission", "Source"],
      ...targetData.records
        .sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime())
        .map((r) => [
          r.salesperson,
          r.client,
          r.category,
          r.invoiceDate,
          r.invoiceAmount,
          r.commissionRate,
          r.commissionAmount,
          r.source,
        ]),
    ];
    const ledgerWs = XLSX.utils.aoa_to_sheet(ledgerData);
    XLSX.utils.book_append_sheet(wb, ledgerWs, "Full Ledger");

    return wb;
  };

  const downloadExcel = () => {
    const wb = generateExcelWorkbook();
    if (!wb || !filteredData) return;

    const personSuffix = selectedPerson !== "all" ? `_${selectedPerson.replace(/\s+/g, "_")}` : "";
    const filename = `Commission_Report_${filteredData.year}${personSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Excel report downloaded!");
  };

  const downloadPDF = () => {
    if (!filteredData) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to download PDF");
      return;
    }

    const personLabel = selectedPerson !== "all" ? selectedPerson : "All Salespeople";
    const totalComm = filteredData.summaries.reduce((sum, s) => sum + s.totalCommission, 0);
    const totalD = filteredData.summaries.reduce((sum, s) => sum + s.totalDue, 0);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Commission Report - ${filteredData.year} - ${personLabel}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
          h1 { color: #336699; border-bottom: 2px solid #669999; padding-bottom: 10px; }
          h2 { color: #336699; margin-top: 30px; }
          table { border-collapse: collapse; width: 100%; margin: 15px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #669999; color: white; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          .summary-box { display: inline-block; margin: 10px 20px 10px 0; padding: 15px 25px; border: 2px solid #336699; border-radius: 8px; }
          .summary-label { font-size: 12px; color: #666; }
          .summary-value { font-size: 24px; font-weight: bold; color: #336699; }
          .text-right { text-align: right; }
          .footer { margin-top: 40px; font-size: 12px; color: #999; }
          @media print { body { margin: 20px; } }
        </style>
      </head>
      <body>
        <h1>Commission Report - ${filteredData.year}</h1>
        <p><strong>${personLabel}</strong> | Generated: ${new Date().toLocaleString()}</p>

        <div style="margin: 20px 0;">
          <div class="summary-box">
            <div class="summary-label">Total Commission</div>
            <div class="summary-value">${formatCurrency(totalComm)}</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Total Due</div>
            <div class="summary-value">${formatCurrency(totalD)}</div>
          </div>
        </div>

        ${selectedPerson === "all" ? `
        <h2>Summary by Salesperson</h2>
        <table>
          <tr><th>Salesperson</th><th class="text-right">Total Commission</th><th class="text-right">Total Due</th></tr>
          ${filteredData.summaries.map((s) => `<tr><td>${s.salesperson}</td><td class="text-right">${formatCurrency(s.totalCommission)}</td><td class="text-right">${formatCurrency(s.totalDue)}</td></tr>`).join("")}
        </table>
        ` : ""}

        ${filteredData.summaries.map((sp) => {
          const spRecords = filteredData.records.filter((r) => r.salesperson === sp.salesperson);
          const grouped: Record<string, { client: string; category: string; rate: number; revenue: number; commission: number }> = {};
          for (const r of spRecords) {
            const key = `${r.client}|${r.category}|${r.commissionRate}`;
            if (!grouped[key]) grouped[key] = { client: r.client, category: r.category, rate: r.commissionRate, revenue: 0, commission: 0 };
            grouped[key].revenue += r.invoiceAmount;
            grouped[key].commission += r.commissionAmount;
          }
          const rows = Object.values(grouped).sort((a, b) => b.commission - a.commission);
          return `
            <h2>${sp.salesperson} - ${formatCurrency(sp.totalCommission)}</h2>
            <table>
              <tr><th>Client or Resource</th><th>Category</th><th class="text-right">Factor</th><th class="text-right">Revenue</th><th class="text-right">Commission</th></tr>
              ${rows.map((g) => `<tr><td>${g.client}</td><td>${g.category}</td><td class="text-right">${formatPercent(g.rate)}</td><td class="text-right">${formatCurrency(g.revenue)}</td><td class="text-right">${formatCurrency(g.commission)}</td></tr>`).join("")}
            </table>
          `;
        }).join("")}

        <div class="footer">
          <p>Voyage Advisory - Commission Calculator</p>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
    toast.success("PDF ready to print/save!");
  };

  const sendEmail = async () => {
    if (!filteredData) return;
    if (!emailTo || !emailTo.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSendingEmail(true);
    try {
      // Generate Excel file as base64 for the selected person
      const wb = generateExcelWorkbook(selectedPerson);
      if (!wb) throw new Error("Failed to generate report");

      const excelBuffer = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      const personSuffix = selectedPerson !== "all" ? `_${selectedPerson.replace(/\s+/g, "_")}` : "";
      const filename = `Commission_Report_${filteredData.year}${personSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;

      const summariesToSend = selectedPerson !== "all"
        ? filteredData.summaries
        : data?.summaries || [];

      const totalComm = filteredData.summaries.reduce((sum, s) => sum + s.totalCommission, 0);
      const totalD = filteredData.summaries.reduce((sum, s) => sum + s.totalDue, 0);

      // Calculate category totals for the email
      const categoryTotals = new Map<string, number>();
      for (const item of filteredData.records) {
        const current = categoryTotals.get(item.category) || 0;
        categoryTotals.set(item.category, current + item.commissionAmount);
      }
      const byCategory = Array.from(categoryTotals.entries()).map(([category, amount]) => ({
        category,
        amount,
      }));

      const response = await fetch("/api/commission/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          year: filteredData.year,
          totalCommission: totalComm,
          totalDue: totalD,
          summaries: summariesToSend.map((s) => ({
            salesperson: s.salesperson,
            totalCommission: s.totalCommission,
            totalOffset: s.totalCommission - s.totalDue,
            totalDue: s.totalDue,
          })),
          byCategory,
          excelBase64: excelBuffer,
          filename,
          personFilter: selectedPerson !== "all" ? selectedPerson : null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send email");
      }

      toast.success(`Email sent to ${emailTo}!`);
      setShowEmailDialog(false);
      setEmailTo("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send email";
      toast.error(message);
    } finally {
      setSendingEmail(false);
    }
  };

  const totalCommission = filteredData?.summaries.reduce((sum, s) => sum + s.totalCommission, 0) || 0;
  const totalDue = filteredData?.summaries.reduce((sum, s) => sum + s.totalDue, 0) || 0;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <span className="text-4xl">💰</span>
              Commission Calculator
            </h1>
            <p className="text-gray-500 mt-1">
              Calculate sales commissions from QuickBooks and BigTime data
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <Input
                type="number"
                value={year}
                onChange={handleYearChange}
                placeholder="Year"
                className={`w-[100px] ${yearError ? "border-red-500" : ""}`}
                min={2000}
                max={2100}
              />
              {yearError && <span className="text-xs text-red-500 mt-1">{yearError}</span>}
            </div>
            <Button onClick={calculateCommissions} disabled={loading || !!yearError} size="lg">
              {loading ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Calculating...
                </>
              ) : (
                "🚀 Calculate Commissions"
              )}
            </Button>
          </div>
        </div>

        {/* Results */}
        {data && (
          <>
            {/* Person Filter */}
            <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="font-medium text-blue-800">View:</span>
              <Select value={selectedPerson} onValueChange={setSelectedPerson}>
                <SelectTrigger className="w-[200px] bg-white">
                  <SelectValue placeholder="Select person" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Salespeople</SelectItem>
                  {salespeople.map((person) => (
                    <SelectItem key={person} value={person}>
                      {person}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPerson !== "all" && (
                <span className="text-sm text-blue-600">
                  Showing data for {selectedPerson} only
                </span>
              )}
            </div>

            {/* Debug Log */}
            <div className="border rounded-lg">
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="w-full px-4 py-3 text-left font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 flex items-center justify-between rounded-lg"
              >
                <span>🔍 Debug Log</span>
                <span>{showDebug ? "▼" : "▶"}</span>
              </button>
              {showDebug && (
                <div className="p-4 space-y-1 text-sm bg-gray-50 border-t">
                  <p className="text-green-600">✅ Loaded {data.debug.rulesLoaded} rules, {data.debug.offsetsLoaded} offsets, {data.debug.mappingsLoaded} mappings</p>
                  <p className={data.debug.qbTransactions > 0 ? "text-green-600" : "text-red-600"}>
                    {data.debug.qbTransactions > 0 ? "✅" : "❌"} QB: {data.debug.qbTransactions} transactions ({formatCurrency(data.debug.qbTotal)})
                  </p>
                  <p className={data.debug.btEntries > 0 ? "text-green-600" : "text-red-600"}>
                    {data.debug.btEntries > 0 ? "✅" : "❌"} BT: {data.debug.btEntries} time entries
                  </p>
                  <p className="text-blue-600">📊 Generated {data.debug.commissionRecords} commission records</p>
                </div>
              )}
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-5 text-center">
                <p className="text-3xl font-bold text-blue-700">{formatCurrency(totalCommission)}</p>
                <p className="text-sm text-blue-600 mt-1">Total Commission</p>
              </div>
              <div className="rounded-xl border-2 border-green-200 bg-green-50 p-5 text-center">
                <p className="text-3xl font-bold text-green-700">{formatCurrency(totalDue)}</p>
                <p className="text-sm text-green-600 mt-1">Total Due</p>
              </div>
              {filteredData?.summaries.map((sp) => (
                <div key={sp.salesperson} className="rounded-xl border bg-white p-5 text-center">
                  <p className="text-2xl font-bold text-gray-800">{formatCurrency(sp.totalCommission)}</p>
                  <p className="text-sm text-gray-500 mt-1">{sp.salesperson}</p>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="border-b">
              <nav className="flex gap-4">
                {[
                  { id: "summary", label: "📊 Commission Summary" },
                  { id: "category", label: "💰 By Category" },
                  { id: "clients", label: "🏢 Revenue by Client" },
                  { id: "ledger", label: "📋 Full Ledger" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`px-4 py-2 -mb-px font-medium transition-colors ${
                      activeTab === tab.id
                        ? "border-b-2 border-blue-500 text-blue-600"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-xl border p-6">
              {activeTab === "summary" && filteredData && (
                <div className="space-y-6">
                  {filteredData.summaries.map((sp) => {
                    const spRecords = filteredData.records.filter((r) => r.salesperson === sp.salesperson);
                    const grouped = spRecords.reduce((acc, r) => {
                      const key = `${r.client}|${r.category}|${r.commissionRate}`;
                      if (!acc[key]) {
                        acc[key] = {
                          client: r.client,
                          category: r.category,
                          rate: r.commissionRate,
                          revenue: 0,
                          commission: 0,
                        };
                      }
                      acc[key].revenue += r.invoiceAmount;
                      acc[key].commission += r.commissionAmount;
                      return acc;
                    }, {} as Record<string, { client: string; category: string; rate: number; revenue: number; commission: number }>);

                    const sortedGroups = Object.values(grouped).sort((a, b) => b.commission - a.commission);

                    return (
                      <div key={sp.salesperson} className="border rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 flex justify-between items-center">
                          <h3 className="font-semibold text-lg">{sp.salesperson}</h3>
                          <span className="text-lg font-bold text-green-600">{formatCurrency(sp.totalCommission)}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-gray-600">
                              <tr>
                                <th className="text-left px-4 py-2">Client or Resource</th>
                                <th className="text-left px-4 py-2">Category</th>
                                <th className="text-right px-4 py-2">Factor</th>
                                <th className="text-right px-4 py-2">Revenue ($)</th>
                                <th className="text-right px-4 py-2">Commission ($)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {sortedGroups.map((g, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  <td className="px-4 py-2">{g.client}</td>
                                  <td className="px-4 py-2 text-gray-600">{g.category}</td>
                                  <td className="px-4 py-2 text-right">{formatPercent(g.rate)}</td>
                                  <td className="px-4 py-2 text-right">{formatCurrency(g.revenue)}</td>
                                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(g.commission)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === "category" && filteredData && (
                <div className="space-y-6">
                  {filteredData.summaries.map((sp) => (
                    <div key={sp.salesperson} className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 flex justify-between items-center">
                        <h3 className="font-semibold text-lg">{sp.salesperson}</h3>
                        <span className="text-lg font-bold text-green-600">{formatCurrency(sp.totalCommission)}</span>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                          <tr>
                            <th className="text-left px-4 py-2">Category</th>
                            <th className="text-right px-4 py-2">Commission Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {sp.byCategory.map((cat) => (
                            <tr key={cat.category} className="hover:bg-gray-50">
                              <td className="px-4 py-2">{cat.category}</td>
                              <td className="px-4 py-2 text-right font-medium">{formatCurrency(cat.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "clients" && data && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <span className="font-medium">Total Clients:</span> {data.clientRevenue.length} |{" "}
                      <span className="font-medium">Total Revenue:</span>{" "}
                      {formatCurrency(data.clientRevenue.reduce((sum, c) => sum + c.revenue, 0))}
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600 sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2">Client</th>
                          <th className="text-right px-4 py-2">Total Revenue</th>
                          <th className="text-right px-4 py-2">Transactions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.clientRevenue.map((c) => (
                          <tr key={c.client} className="hover:bg-gray-50">
                            <td className="px-4 py-2">{c.client}</td>
                            <td className="px-4 py-2 text-right font-medium">{formatCurrency(c.revenue)}</td>
                            <td className="px-4 py-2 text-right text-gray-500">{c.transactions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === "ledger" && filteredData && (
                <div>
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600 sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2">Salesperson</th>
                          <th className="text-left px-4 py-2">Client or Resource</th>
                          <th className="text-left px-4 py-2">Category</th>
                          <th className="text-left px-4 py-2">Date</th>
                          <th className="text-right px-4 py-2">Invoice Amt</th>
                          <th className="text-right px-4 py-2">Rate</th>
                          <th className="text-right px-4 py-2">Commission</th>
                          <th className="text-left px-4 py-2">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredData.records
                          .sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime())
                          .map((r, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-4 py-2">{r.salesperson}</td>
                              <td className="px-4 py-2">{r.client}</td>
                              <td className="px-4 py-2 text-gray-600">{r.category}</td>
                              <td className="px-4 py-2 text-gray-500">{formatDate(r.invoiceDate)}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(r.invoiceAmount)}</td>
                              <td className="px-4 py-2 text-right">{formatPercent(r.commissionRate)}</td>
                              <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.commissionAmount)}</td>
                              <td className="px-4 py-2 text-gray-500 text-xs">{r.source}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Export Options */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={downloadExcel}>
                📊 Download Excel {selectedPerson !== "all" && `(${selectedPerson})`}
              </Button>
              <Button variant="outline" onClick={downloadPDF}>
                📄 Download PDF {selectedPerson !== "all" && `(${selectedPerson})`}
              </Button>
              <Button variant="outline" onClick={() => setShowEmailDialog(true)}>
                📧 Email Report {selectedPerson !== "all" && `(${selectedPerson})`}
              </Button>
            </div>

            {/* Email Dialog */}
            {showEmailDialog && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
                  <h3 className="text-lg font-semibold mb-4">📧 Email Commission Report</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Send the commission report for {filteredData?.year}
                    {selectedPerson !== "all" && <strong> ({selectedPerson} only)</strong>} as an Excel attachment.
                  </p>
                  <Input
                    type="email"
                    placeholder="recipient@example.com"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    className="mb-4"
                  />
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setShowEmailDialog(false)} disabled={sendingEmail}>
                      Cancel
                    </Button>
                    <Button onClick={sendEmail} disabled={sendingEmail || !emailTo}>
                      {sendingEmail ? (
                        <>
                          <span className="animate-spin mr-2">⟳</span>
                          Sending...
                        </>
                      ) : (
                        "Send Email"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Instructions */}
        {!data && !loading && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <span className="text-6xl block mb-4">💰</span>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Ready to Calculate</h2>
            <p className="text-gray-500 mb-6 max-w-lg mx-auto">
              Enter a year and click the button above to calculate commissions from QuickBooks
              and BigTime data using your commission rules.
            </p>
            <div className="border rounded-lg p-4 bg-gray-50 text-left max-w-xl mx-auto">
              <h3 className="font-semibold text-gray-700 mb-2">How it works:</h3>
              <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                <li>Loads commission rules from Snowflake (migrated from Google Sheets)</li>
                <li>Pulls QuickBooks consulting income (cash basis)</li>
                <li>Pulls BigTime time entries for delivery and referral commissions</li>
                <li>Calculates commissions based on date ranges and rates</li>
                <li>Applies offsets (salaries, benefits, prior payments)</li>
              </ol>
              <div className="mt-4 pt-4 border-t">
                <h4 className="font-semibold text-gray-700 mb-1">Commission Types:</h4>
                <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                  <li><strong>Client Commission</strong> - % of revenue from specific clients</li>
                  <li><strong>Delivery Commission</strong> - % of own billable work</li>
                  <li><strong>Referral Commission</strong> - % of referred staff&apos;s work</li>
                  <li><strong>Offsets</strong> - Salaries, benefits, prior payments</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
