import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

// Types
interface StaffMember {
  STAFF_NAME: string;
  SALARY: number;
  MEDICAL_PLAN_CODE: string | null;
  DENTAL_PLAN_CODE: string | null;
  VISION_PLAN_CODE: string | null;
  STD_CODE: string | null;
  LTD_CODE: string | null;
  LIFE_CODE: string | null;
}

interface Benefit {
  CODE: string;
  DESCRIPTION: string;
  BENEFIT_TYPE: string;
  IS_FORMULA_BASED: boolean;
  TOTAL_MONTHLY_COST: number;
  EE_MONTHLY_COST: number;
  FIRM_MONTHLY_COST: number;
}

interface BenefitCost {
  total: number;
  ee: number;
  firm: number;
}

interface EmployeeBenefits {
  staffName: string;
  salary: number;
  medical: { code: string; cost: BenefitCost };
  dental: { code: string; cost: BenefitCost };
  vision: { code: string; cost: BenefitCost };
  std: { code: string; cost: BenefitCost };
  ltd: { code: string; cost: BenefitCost };
  life: { code: string; cost: BenefitCost };
  totalMonthly: number;
  eeMonthly: number;
  firmMonthly: number;
  totalYearly: number;
  eeYearly: number;
  firmYearly: number;
  notes: string[];
}

interface BenefitBreakdown {
  benefitType: string;
  eeMonthly: number;
  firmMonthly: number;
  totalMonthly: number;
  eeYearly: number;
  firmYearly: number;
  totalYearly: number;
}

// Calculate STD monthly cost based on salary
function calculateStdCost(salary: number): number {
  const weeklySalary = salary / 52;
  const weeklyBenefit = Math.min(weeklySalary * 0.6667, 2100);
  const monthlyCost = (weeklyBenefit / 10) * 0.18;
  return Math.round(monthlyCost * 100) / 100;
}

// Calculate LTD monthly cost based on salary
function calculateLtdCost(salary: number): number {
  const monthlySalary = salary / 12;
  const monthlyCost = (monthlySalary / 100) * 0.21;
  return Math.round(monthlyCost * 100) / 100;
}

// Resolve benefit cost
function resolveBenefitCost(
  code: string | null,
  salary: number,
  benefitsLookup: Map<string, Benefit>
): { cost: BenefitCost; note: string | null } {
  const safeCode = (code || "").trim();

  if (!safeCode) {
    return { cost: { total: 0, ee: 0, firm: 0 }, note: null };
  }

  const benefit = benefitsLookup.get(safeCode);
  if (!benefit) {
    return {
      cost: { total: 0, ee: 0, firm: 0 },
      note: `Unknown code: ${safeCode}`,
    };
  }

  // Formula-based benefits (STD/LTD)
  const isFormula = safeCode.startsWith("SE") || safeCode.startsWith("LE");

  if (isFormula) {
    if (safeCode.startsWith("SE")) {
      // STD
      const total = calculateStdCost(salary);
      if (safeCode === "SE1") {
        // Firm paid
        return { cost: { total, ee: 0, firm: total }, note: null };
      }
      if (safeCode === "SE2") {
        // Employee paid
        return { cost: { total, ee: total, firm: 0 }, note: null };
      }
      return { cost: { total: 0, ee: 0, firm: 0 }, note: null };
    }

    if (safeCode.startsWith("LE")) {
      // LTD
      const total = calculateLtdCost(salary);
      if (safeCode === "LE1") {
        // Firm paid
        return { cost: { total, ee: 0, firm: total }, note: null };
      }
      if (safeCode === "LE2") {
        // Employee paid
        return { cost: { total, ee: total, firm: 0 }, note: null };
      }
      return { cost: { total: 0, ee: 0, firm: 0 }, note: null };
    }

    return { cost: { total: 0, ee: 0, firm: 0 }, note: null };
  }

  // Fixed cost from lookup
  return {
    cost: {
      total: benefit.TOTAL_MONTHLY_COST || 0,
      ee: benefit.EE_MONTHLY_COST || 0,
      firm: benefit.FIRM_MONTHLY_COST || 0,
    },
    note: null,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Load staff and benefits data from Snowflake
    const [staffRows, benefitRows] = await Promise.all([
      query<StaffMember>(`
        SELECT STAFF_NAME, SALARY, MEDICAL_PLAN_CODE, DENTAL_PLAN_CODE,
               VISION_PLAN_CODE, STD_CODE, LTD_CODE, LIFE_CODE
        FROM VC_STAFF
        WHERE IS_ACTIVE = TRUE
        ORDER BY STAFF_NAME
      `),
      query<Benefit>(`
        SELECT CODE, DESCRIPTION, BENEFIT_TYPE, IS_FORMULA_BASED,
               TOTAL_MONTHLY_COST, EE_MONTHLY_COST, FIRM_MONTHLY_COST
        FROM VC_BENEFITS
        WHERE IS_ACTIVE = TRUE
      `),
    ]);

    // Build benefits lookup
    const benefitsLookup = new Map<string, Benefit>();
    const benefitsLegend: Array<{
      code: string;
      description: string;
      benefitType: string;
      isFormula: boolean;
      totalCost: number;
      eeCost: number;
      firmCost: number;
    }> = [];

    for (const b of benefitRows) {
      benefitsLookup.set(b.CODE, b);
      const isFormula = b.CODE.startsWith("SE") || b.CODE.startsWith("LE");
      benefitsLegend.push({
        code: b.CODE,
        description: b.DESCRIPTION,
        benefitType: b.BENEFIT_TYPE,
        isFormula,
        totalCost: b.TOTAL_MONTHLY_COST || 0,
        eeCost: b.EE_MONTHLY_COST || 0,
        firmCost: b.FIRM_MONTHLY_COST || 0,
      });
    }

    // Calculate benefits for each employee
    const employees: EmployeeBenefits[] = [];

    for (const staff of staffRows) {
      const salary = Number(staff.SALARY) || 0;
      const notes: string[] = [];

      const medical = resolveBenefitCost(staff.MEDICAL_PLAN_CODE, salary, benefitsLookup);
      const dental = resolveBenefitCost(staff.DENTAL_PLAN_CODE, salary, benefitsLookup);
      const vision = resolveBenefitCost(staff.VISION_PLAN_CODE, salary, benefitsLookup);
      const std = resolveBenefitCost(staff.STD_CODE, salary, benefitsLookup);
      const ltd = resolveBenefitCost(staff.LTD_CODE, salary, benefitsLookup);
      const life = resolveBenefitCost(staff.LIFE_CODE, salary, benefitsLookup);

      // Collect notes
      [medical, dental, vision, std, ltd, life].forEach((b) => {
        if (b.note) notes.push(b.note);
      });

      const totalMonthly =
        medical.cost.total +
        dental.cost.total +
        vision.cost.total +
        std.cost.total +
        ltd.cost.total +
        life.cost.total;

      const eeMonthly =
        medical.cost.ee +
        dental.cost.ee +
        vision.cost.ee +
        std.cost.ee +
        ltd.cost.ee +
        life.cost.ee;

      const firmMonthly =
        medical.cost.firm +
        dental.cost.firm +
        vision.cost.firm +
        std.cost.firm +
        ltd.cost.firm +
        life.cost.firm;

      employees.push({
        staffName: staff.STAFF_NAME,
        salary,
        medical: { code: staff.MEDICAL_PLAN_CODE || "", cost: medical.cost },
        dental: { code: staff.DENTAL_PLAN_CODE || "", cost: dental.cost },
        vision: { code: staff.VISION_PLAN_CODE || "", cost: vision.cost },
        std: { code: staff.STD_CODE || "", cost: std.cost },
        ltd: { code: staff.LTD_CODE || "", cost: ltd.cost },
        life: { code: staff.LIFE_CODE || "", cost: life.cost },
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        eeMonthly: Math.round(eeMonthly * 100) / 100,
        firmMonthly: Math.round(firmMonthly * 100) / 100,
        totalYearly: Math.round(totalMonthly * 12 * 100) / 100,
        eeYearly: Math.round(eeMonthly * 12 * 100) / 100,
        firmYearly: Math.round(firmMonthly * 12 * 100) / 100,
        notes,
      });
    }

    // Calculate breakdown by benefit type
    const breakdownMap = new Map<string, { ee: number; firm: number }>();
    const benefitTypes = ["Medical", "Dental", "Vision", "STD", "LTD", "Life/AD&D"];

    for (const type of benefitTypes) {
      breakdownMap.set(type, { ee: 0, firm: 0 });
    }

    for (const emp of employees) {
      const add = (type: string, cost: BenefitCost) => {
        const current = breakdownMap.get(type)!;
        current.ee += cost.ee;
        current.firm += cost.firm;
      };

      add("Medical", emp.medical.cost);
      add("Dental", emp.dental.cost);
      add("Vision", emp.vision.cost);
      add("STD", emp.std.cost);
      add("LTD", emp.ltd.cost);
      add("Life/AD&D", emp.life.cost);
    }

    const breakdown: BenefitBreakdown[] = benefitTypes.map((type) => {
      const data = breakdownMap.get(type)!;
      const totalMonthly = data.ee + data.firm;
      return {
        benefitType: type,
        eeMonthly: Math.round(data.ee * 100) / 100,
        firmMonthly: Math.round(data.firm * 100) / 100,
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        eeYearly: Math.round(data.ee * 12 * 100) / 100,
        firmYearly: Math.round(data.firm * 12 * 100) / 100,
        totalYearly: Math.round(totalMonthly * 12 * 100) / 100,
      };
    });

    // Add totals row
    const totals = breakdown.reduce(
      (acc, b) => ({
        eeMonthly: acc.eeMonthly + b.eeMonthly,
        firmMonthly: acc.firmMonthly + b.firmMonthly,
        totalMonthly: acc.totalMonthly + b.totalMonthly,
        eeYearly: acc.eeYearly + b.eeYearly,
        firmYearly: acc.firmYearly + b.firmYearly,
        totalYearly: acc.totalYearly + b.totalYearly,
      }),
      { eeMonthly: 0, firmMonthly: 0, totalMonthly: 0, eeYearly: 0, firmYearly: 0, totalYearly: 0 }
    );

    // Calculate summary
    const summary = {
      totalMonthly: employees.reduce((sum, e) => sum + e.totalMonthly, 0),
      totalYearly: employees.reduce((sum, e) => sum + e.totalYearly, 0),
      eeMonthly: employees.reduce((sum, e) => sum + e.eeMonthly, 0),
      eeYearly: employees.reduce((sum, e) => sum + e.eeYearly, 0),
      firmMonthly: employees.reduce((sum, e) => sum + e.firmMonthly, 0),
      firmYearly: employees.reduce((sum, e) => sum + e.firmYearly, 0),
      staffCount: employees.length,
      benefitOptionsCount: benefitRows.length,
    };

    return NextResponse.json({
      summary,
      breakdown,
      totals,
      employees,
      legend: benefitsLegend.sort((a, b) => a.code.localeCompare(b.code)),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Benefits calculation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
