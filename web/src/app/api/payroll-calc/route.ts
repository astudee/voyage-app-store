import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/snowflake";

interface StaffMember {
  STAFF_NAME: string;
  SALARY: number;
  UTILIZATION_BONUS_TARGET: number | null;
  OTHER_BONUS_TARGET: number | null;
  PHONE_ALLOWANCE: number | null;
  MEDICAL_PLAN_CODE: string | null;
  DENTAL_PLAN_CODE: string | null;
  VISION_PLAN_CODE: string | null;
  STD_CODE: string | null;
  LTD_CODE: string | null;
  LIFE_CODE: string | null;
}

interface Benefit {
  CODE: string;
  TOTAL_MONTHLY_COST: number;
  EE_MONTHLY_COST: number;
  FIRM_MONTHLY_COST: number;
}

interface EmployeePayroll {
  name: string;
  annualSalary: number;
  monthlySalary: number;
  utilizationBonus: number;
  otherBonus: number;
  monthlyUtilizationBonus: number;
  monthlyOtherBonus: number;
  phoneAllowance: number;
  firmBenefits: number;
  monthly401k: number;
  monthlyFica: number;
  totalMonthlyCost: number;
  totalAnnualCost: number;
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

// Calculate firm-paid benefits for an employee
function calculateFirmBenefits(
  employee: StaffMember,
  benefitsLookup: Map<string, Benefit>
): number {
  const salary = employee.SALARY || 0;
  let totalFirm = 0;

  const codes = [
    employee.MEDICAL_PLAN_CODE,
    employee.DENTAL_PLAN_CODE,
    employee.VISION_PLAN_CODE,
    employee.STD_CODE,
    employee.LTD_CODE,
    employee.LIFE_CODE,
  ];

  for (const code of codes) {
    if (!code) continue;

    const benefit = benefitsLookup.get(code);

    // Formula-based benefits
    if (code.startsWith("SE")) {
      // STD - only SE1 is firm-paid
      if (code === "SE1") {
        totalFirm += calculateStdCost(salary);
      }
    } else if (code.startsWith("LE")) {
      // LTD - only LE1 is firm-paid
      if (code === "LE1") {
        totalFirm += calculateLtdCost(salary);
      }
    } else if (benefit) {
      // Fixed cost - add firm portion
      totalFirm += benefit.FIRM_MONTHLY_COST || 0;
    }
  }

  return Math.round(totalFirm * 100) / 100;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const includeBonuses = searchParams.get("includeBonuses") !== "false";

    // Fetch staff and benefits data
    const [staffRows, benefitRows] = await Promise.all([
      query<StaffMember>(`
        SELECT STAFF_NAME, SALARY, UTILIZATION_BONUS_TARGET, OTHER_BONUS_TARGET,
               PHONE_ALLOWANCE, MEDICAL_PLAN_CODE, DENTAL_PLAN_CODE, VISION_PLAN_CODE,
               STD_CODE, LTD_CODE, LIFE_CODE
        FROM VC_STAFF
        WHERE IS_ACTIVE = TRUE
        ORDER BY STAFF_NAME
      `),
      query<Benefit>(`
        SELECT CODE, TOTAL_MONTHLY_COST, EE_MONTHLY_COST, FIRM_MONTHLY_COST
        FROM VC_BENEFITS
        WHERE IS_ACTIVE = TRUE
      `),
    ]);

    // Build benefits lookup
    const benefitsLookup = new Map<string, Benefit>();
    for (const b of benefitRows) {
      benefitsLookup.set(b.CODE, b);
    }

    // Calculate payroll for each employee
    const employees: EmployeePayroll[] = [];

    for (const staff of staffRows) {
      const annualSalary = Number(staff.SALARY) || 0;
      const monthlySalary = annualSalary / 12;

      const utilizationBonus = includeBonuses ? (Number(staff.UTILIZATION_BONUS_TARGET) || 0) : 0;
      const otherBonus = Number(staff.OTHER_BONUS_TARGET) || 0;
      const phoneAllowance = Number(staff.PHONE_ALLOWANCE) || 0;

      const firmBenefits = calculateFirmBenefits(staff, benefitsLookup);

      // Calculate based on bonus toggle
      const totalAnnualComp = includeBonuses
        ? annualSalary + utilizationBonus + otherBonus
        : annualSalary;

      const totalMonthlyComp = includeBonuses
        ? monthlySalary + (utilizationBonus / 12) + (otherBonus / 12)
        : monthlySalary;

      // 401(k) match: 4% of compensation
      const monthly401k = (totalAnnualComp * 0.04) / 12;

      // FICA: 7.65% of compensation
      const monthlyFica = totalMonthlyComp * 0.0765;

      // Total monthly cost
      const totalMonthlyCost = totalMonthlyComp + phoneAllowance + firmBenefits + monthly401k + monthlyFica;

      employees.push({
        name: staff.STAFF_NAME,
        annualSalary,
        monthlySalary: Math.round(monthlySalary * 100) / 100,
        utilizationBonus,
        otherBonus,
        monthlyUtilizationBonus: Math.round((utilizationBonus / 12) * 100) / 100,
        monthlyOtherBonus: Math.round((otherBonus / 12) * 100) / 100,
        phoneAllowance,
        firmBenefits,
        monthly401k: Math.round(monthly401k * 100) / 100,
        monthlyFica: Math.round(monthlyFica * 100) / 100,
        totalMonthlyCost: Math.round(totalMonthlyCost * 100) / 100,
        totalAnnualCost: Math.round(totalMonthlyCost * 12 * 100) / 100,
      });
    }

    // Calculate summary
    const totalMonthlyCost = employees.reduce((sum, e) => sum + e.totalMonthlyCost, 0);
    const totalAnnualCost = employees.reduce((sum, e) => sum + e.totalAnnualCost, 0);
    const totalSalaryMonthly = employees.reduce((sum, e) => sum + e.monthlySalary, 0);
    const totalBenefits = employees.reduce((sum, e) => sum + e.firmBenefits, 0);
    const total401k = employees.reduce((sum, e) => sum + e.monthly401k, 0);
    const totalFica = employees.reduce((sum, e) => sum + e.monthlyFica, 0);
    const totalPhoneAllowance = employees.reduce((sum, e) => sum + e.phoneAllowance, 0);

    const burdenRate = totalSalaryMonthly > 0
      ? ((totalMonthlyCost - totalSalaryMonthly) / totalSalaryMonthly * 100)
      : 0;

    // Build breakdown
    const breakdown = includeBonuses ? [
      { component: "Base Salaries", perPayPeriod: totalSalaryMonthly / 2, monthly: totalSalaryMonthly, annual: totalSalaryMonthly * 12 },
      { component: "Utilization Bonuses", perPayPeriod: employees.reduce((s, e) => s + e.monthlyUtilizationBonus, 0) / 2, monthly: employees.reduce((s, e) => s + e.monthlyUtilizationBonus, 0), annual: employees.reduce((s, e) => s + e.monthlyUtilizationBonus, 0) * 12 },
      { component: "Other Bonuses", perPayPeriod: employees.reduce((s, e) => s + e.monthlyOtherBonus, 0) / 2, monthly: employees.reduce((s, e) => s + e.monthlyOtherBonus, 0), annual: employees.reduce((s, e) => s + e.monthlyOtherBonus, 0) * 12 },
      { component: "Phone Allowances", perPayPeriod: totalPhoneAllowance / 2, monthly: totalPhoneAllowance, annual: totalPhoneAllowance * 12 },
      { component: "Firm Benefits", perPayPeriod: totalBenefits / 2, monthly: totalBenefits, annual: totalBenefits * 12 },
      { component: "401(k) Match (4%)", perPayPeriod: total401k / 2, monthly: total401k, annual: total401k * 12 },
      { component: "FICA (7.65%)", perPayPeriod: totalFica / 2, monthly: totalFica, annual: totalFica * 12 },
    ] : [
      { component: "Base Salaries", perPayPeriod: totalSalaryMonthly / 2, monthly: totalSalaryMonthly, annual: totalSalaryMonthly * 12 },
      { component: "Phone Allowances", perPayPeriod: totalPhoneAllowance / 2, monthly: totalPhoneAllowance, annual: totalPhoneAllowance * 12 },
      { component: "Firm Benefits", perPayPeriod: totalBenefits / 2, monthly: totalBenefits, annual: totalBenefits * 12 },
      { component: "401(k) Match (4%)", perPayPeriod: total401k / 2, monthly: total401k, annual: total401k * 12 },
      { component: "FICA (7.65%)", perPayPeriod: totalFica / 2, monthly: totalFica, annual: totalFica * 12 },
    ];

    return NextResponse.json({
      employees,
      summary: {
        totalMonthlyCost: Math.round(totalMonthlyCost * 100) / 100,
        totalAnnualCost: Math.round(totalAnnualCost * 100) / 100,
        perPayrollCost: Math.round((totalMonthlyCost / 2) * 100) / 100,
        totalSalaryMonthly: Math.round(totalSalaryMonthly * 100) / 100,
        totalBenefits: Math.round(totalBenefits * 100) / 100,
        total401k: Math.round(total401k * 100) / 100,
        totalFica: Math.round(totalFica * 100) / 100,
        burdenRate: Math.round(burdenRate * 10) / 10,
        employeeCount: employees.length,
      },
      breakdown: breakdown.map((b) => ({
        ...b,
        perPayPeriod: Math.round(b.perPayPeriod * 100) / 100,
        monthly: Math.round(b.monthly * 100) / 100,
        annual: Math.round(b.annual * 100) / 100,
      })),
      includeBonuses,
    });
  } catch (error) {
    console.error("Payroll calculation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
