import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface ExpenseEntry {
  staff: string;
  client: string;
  project: string;
  date: string;
  weekEnd: string;
  category: string;
  note: string;
  amountInput: number;
  amountBillable: number;
  amountNoCharge: number;
  noCharge: number; // 0 or 1
  nonReimbursable: number; // 0 or 1
  receiptAttached: number; // 0 or 1
}

interface ExpenseIssue {
  staff: string;
  client: string;
  project: string;
  date: string;
  category: string;
  amount: number;
  noCharge?: string;
}

interface ExpenseReviewResult {
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

async function fetchBigTimeExpenseReport(startDate: string, endDate: string): Promise<ExpenseEntry[]> {
  const apiKey = process.env.BIGTIME_API_KEY;
  const firmId = process.env.BIGTIME_FIRM_ID;

  if (!apiKey || !firmId) {
    throw new Error("BigTime credentials not configured");
  }

  // Use report 284803 for expense data
  const response = await fetch(
    "https://iq.bigtime.net/BigtimeData/api/v2/report/data/284803",
    {
      method: "POST",
      headers: {
        "X-Auth-ApiToken": apiKey,
        "X-Auth-Realm": firmId,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        DT_BEGIN: startDate,
        DT_END: endDate,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`BigTime expense API error: ${response.status}`);
  }

  const data = await response.json();
  const rows = data.Data || [];
  const fields = data.FieldList || [];

  const colIndex: Record<string, number> = {};
  fields.forEach((field: { FieldNm: string }, idx: number) => {
    colIndex[field.FieldNm] = idx;
  });

  const entries: ExpenseEntry[] = rows.map((row: unknown[]) => ({
    staff: (row[colIndex["exsourcenm"]] as string) || "",
    client: (row[colIndex["exclientnm"]] as string) || "",
    project: (row[colIndex["exprojectnm"]] as string) || "",
    date: (row[colIndex["exdt"]] as string) || "",
    weekEnd: (row[colIndex["exweekenddt"]] as string) || "",
    category: (row[colIndex["excatnm"]] as string) || "",
    note: (row[colIndex["exnt"]] as string) || "",
    amountInput: Number(row[colIndex["excostin"]]) || 0,
    amountBillable: Number(row[colIndex["excostbill"]]) || 0,
    amountNoCharge: Number(row[colIndex["excostnc"]]) || 0,
    noCharge: Number(row[colIndex["exnc"]]) || 0,
    nonReimbursable: Number(row[colIndex["expaidbyco"]]) || 0,
    receiptAttached: Number(row[colIndex["exhasreceipt"]]) || 0,
  }));

  return entries;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const weekEnding = searchParams.get("weekEnding"); // Optional - for weekly mode

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    // Fetch expense data
    let expenses = await fetchBigTimeExpenseReport(startDate, endDate);

    // Filter by week ending if provided
    if (weekEnding) {
      expenses = expenses.filter((e) => e.weekEnd === weekEnding);
    }

    if (expenses.length === 0) {
      return NextResponse.json({
        issues: {
          incorrectContractorFees: [],
          inconsistentClassification: [],
          missingReceipts: [],
          companyPaid: [],
          nonReimbursable: [],
        },
        summary: {
          totalExpenses: 0,
          totalIssues: 0,
          incorrectContractorFees: 0,
          inconsistentClassification: 0,
          missingReceipts: 0,
          companyPaid: 0,
          nonReimbursable: 0,
          companyPaidTotal: 0,
          nonReimbursableTotal: 0,
        },
        debug: {
          uniqueCategories: [],
          uniqueStaff: [],
        },
      });
    }

    // Run compliance checks
    const issues: ExpenseReviewResult["issues"] = {
      incorrectContractorFees: [],
      inconsistentClassification: [],
      missingReceipts: [],
      companyPaid: [],
      nonReimbursable: [],
    };

    for (const expense of expenses) {
      const amount = expense.amountInput;
      const category = expense.category || "";
      const isContractorFee = category.toLowerCase().includes("contractor fee");
      const isNonBillable = category.toLowerCase().startsWith("non-billable");
      const isBillable = category.toLowerCase().startsWith("billable");

      // Check 1: Incorrect Contractor Fees
      // Contractor fees should be No-Charge (noCharge = 1)
      if (isContractorFee && expense.noCharge !== 1) {
        issues.incorrectContractorFees.push({
          staff: expense.staff,
          client: expense.client,
          project: expense.project,
          date: expense.date,
          category,
          amount,
        });
      }

      // Check 2: Inconsistent Classification
      // Non-Billable should be No-Charge (noCharge = 1)
      // Billable should NOT be No-Charge (noCharge = 0)
      if (isNonBillable && expense.noCharge !== 1) {
        issues.inconsistentClassification.push({
          staff: expense.staff,
          client: expense.client,
          project: expense.project,
          date: expense.date,
          category,
          amount,
          noCharge: expense.noCharge === 1 ? "Yes" : "No",
        });
      }
      if (isBillable && expense.noCharge === 1) {
        issues.inconsistentClassification.push({
          staff: expense.staff,
          client: expense.client,
          project: expense.project,
          date: expense.date,
          category,
          amount,
          noCharge: "Yes",
        });
      }

      // Check 3: Missing Receipts
      if (expense.receiptAttached !== 1) {
        issues.missingReceipts.push({
          staff: expense.staff,
          client: expense.client,
          project: expense.project,
          date: expense.date,
          category,
          amount,
        });
      }

      // Check 4: Company Paid Expenses (No-Charge, excluding contractor fees)
      if (expense.noCharge === 1 && !isContractorFee) {
        issues.companyPaid.push({
          staff: expense.staff,
          client: expense.client,
          project: expense.project,
          date: expense.date,
          category,
          amount,
        });
      }

      // Check 5: Non-Reimbursable Expenses (excluding contractor fees)
      if (expense.nonReimbursable === 1 && !isContractorFee) {
        issues.nonReimbursable.push({
          staff: expense.staff,
          client: expense.client,
          project: expense.project,
          date: expense.date,
          category,
          amount,
        });
      }
    }

    // Calculate totals
    const companyPaidTotal = issues.companyPaid.reduce((sum, i) => sum + i.amount, 0);
    const nonReimbursableTotal = issues.nonReimbursable.reduce((sum, i) => sum + i.amount, 0);
    const totalIssues =
      issues.incorrectContractorFees.length +
      issues.inconsistentClassification.length +
      issues.missingReceipts.length +
      issues.companyPaid.length +
      issues.nonReimbursable.length;

    // Debug info
    const uniqueCategories = [...new Set(expenses.map((e) => e.category))].sort();
    const uniqueStaff = [...new Set(expenses.map((e) => e.staff))].sort();

    const result: ExpenseReviewResult = {
      issues,
      summary: {
        totalExpenses: expenses.length,
        totalIssues,
        incorrectContractorFees: issues.incorrectContractorFees.length,
        inconsistentClassification: issues.inconsistentClassification.length,
        missingReceipts: issues.missingReceipts.length,
        companyPaid: issues.companyPaid.length,
        nonReimbursable: issues.nonReimbursable.length,
        companyPaidTotal: Math.round(companyPaidTotal * 100) / 100,
        nonReimbursableTotal: Math.round(nonReimbursableTotal * 100) / 100,
      },
      debug: {
        uniqueCategories,
        uniqueStaff,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Expense reviewer error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
