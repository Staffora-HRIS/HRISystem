/**
 * UK Final Pay Calculation
 *
 * When an employee is terminated (whether by resignation, dismissal, or
 * redundancy), their final pay must include:
 *
 * 1. **Outstanding holiday pay**: Accrued but untaken leave, calculated
 *    using the 52-week reference period for variable pay workers, or
 *    the daily rate for those with fixed hours.
 *
 * 2. **Notice pay**: If the employer pays in lieu of notice (PILON),
 *    the employee is entitled to their normal pay for the notice period.
 *    PILON can be contractual (if in the contract) or non-contractual.
 *    Tax treatment differs: contractual PILON is fully taxable; non-
 *    contractual PILON has the first GBP 30,000 tax-free under s401 ITEPA.
 *
 * 3. **Deductions owed**: Any outstanding salary advances, overpayments,
 *    or training cost clawbacks that the employer is entitled to deduct.
 *    Subject to Deduction from Wages rules under ERA 1996 s13.
 *
 * 4. **Pro-rata bonuses**: If the employee is entitled to a bonus that
 *    has been earned but not yet paid (e.g., annual bonus), it should be
 *    pro-rated to the termination date.
 *
 * References:
 * - Employment Rights Act 1996, Part II (Deduction from wages), Part VIII (Holiday)
 * - Working Time Regulations 1998, reg 14 (compensation on termination)
 * - Income Tax (Earnings and Pensions) Act 2003, ss 401-403 (termination payments)
 */

import type { DatabaseClient } from "../plugins/db";
import type { TenantContext } from "../types/service-result";
import {
  calculateHolidayPay,
  type HolidayPayResult,
} from "./uk-holiday-pay";
import {
  calculateProRataEntitlement,
  calculateAnnualEntitlement,
} from "./uk-holiday-entitlement";

// =============================================================================
// Types
// =============================================================================

/**
 * Input for the final pay calculation.
 */
export interface FinalPayInput {
  /** The employee's UUID */
  employeeId: string;
  /** Date of termination (last day of employment) */
  terminationDate: string;
  /** Whether payment in lieu of notice (PILON) is being made */
  paymentInLieu: boolean;
  /** Notice period in days (from contract or statutory minimum) */
  noticePeriodDays: number;
  /** Whether the PILON is contractual (affects tax treatment) */
  contractualPilon?: boolean;
  /**
   * Deductions to apply (salary advances, training costs, overpayments).
   * Each deduction must have a description and amount.
   */
  deductions?: Array<{
    description: string;
    amount: number;
  }>;
  /**
   * Bonus information for pro-rata calculation.
   * Expected annual bonus and the bonus year start/end dates.
   */
  bonus?: {
    /** The total expected bonus for the full bonus period */
    expectedAnnualAmount: number;
    /** Start of the bonus period (e.g., 1 Jan) */
    bonusPeriodStart: string;
    /** End of the bonus period (e.g., 31 Dec) */
    bonusPeriodEnd: string;
  };
  /**
   * Leave year boundaries. Defaults to calendar year if not provided.
   */
  leaveYearStart?: string;
  leaveYearEnd?: string;
}

/**
 * Detailed breakdown of the final pay calculation.
 */
export interface FinalPayResult {
  /** Employee UUID */
  employeeId: string;
  /** Termination date */
  terminationDate: string;

  // --- Holiday Pay ---
  /** Pro-rata annual leave entitlement in days (from year start to termination) */
  proRataEntitlementDays: number;
  /** Leave days already taken this year */
  leaveDaysTaken: number;
  /** Net outstanding leave days (pro-rata minus taken) */
  outstandingLeaveDays: number;
  /** Daily holiday pay rate from 52-week reference */
  dailyHolidayPayRate: number;
  /** Total outstanding holiday pay */
  outstandingHolidayPay: number;
  /** Full holiday pay calculation details */
  holidayPayDetails: HolidayPayResult | null;

  // --- Notice Pay ---
  /** Notice period in days */
  noticePeriodDays: number;
  /** Whether PILON is being applied */
  paymentInLieu: boolean;
  /** Whether PILON is contractual */
  contractualPilon: boolean;
  /** Daily pay rate for notice calculation */
  dailyPayRate: number;
  /** Total notice pay (PILON amount, or 0 if employee works notice) */
  noticePay: number;
  /**
   * Tax-free threshold for non-contractual PILON (first 30k under s401).
   * Only relevant if contractualPilon is false.
   */
  pilonTaxFreeThreshold: number;

  // --- Deductions ---
  /** Itemised deductions */
  deductions: Array<{
    description: string;
    amount: number;
  }>;
  /** Total deductions */
  totalDeductions: number;

  // --- Pro-rata Bonus ---
  /** Whether a pro-rata bonus is included */
  bonusIncluded: boolean;
  /** Days worked in the bonus period */
  bonusDaysWorked: number;
  /** Total days in the bonus period */
  bonusTotalDays: number;
  /** Pro-rata bonus amount */
  proRataBonus: number;

  // --- Totals ---
  /** Gross final pay (holiday + notice + bonus) */
  grossFinalPay: number;
  /** Net final pay (gross minus deductions) */
  netFinalPay: number;
  /** Currency */
  currency: string;

  // --- Warnings ---
  /** Any warnings or notes about the calculation */
  warnings: string[];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Non-contractual PILON tax-free threshold under s401 ITEPA 2003.
 * The first GBP 30,000 of termination payments is tax-free.
 */
export const PILON_TAX_FREE_THRESHOLD = 30000;

// =============================================================================
// Pure Calculation
// =============================================================================

/**
 * Calculate the pro-rata bonus based on days worked in the bonus period.
 *
 * @param expectedAnnualAmount Full bonus amount for the complete period
 * @param bonusPeriodStart Start of the bonus period
 * @param bonusPeriodEnd End of the bonus period
 * @param terminationDate Employee's last day
 * @returns Pro-rata bonus amount, days worked, and total days
 */
export function calculateProRataBonus(
  expectedAnnualAmount: number,
  bonusPeriodStart: string,
  bonusPeriodEnd: string,
  terminationDate: string
): { proRataAmount: number; daysWorked: number; totalDays: number } {
  const start = new Date(bonusPeriodStart);
  const end = new Date(bonusPeriodEnd);
  const termDate = new Date(terminationDate);

  // Ensure termination is within the bonus period
  const effectiveEnd = termDate < end ? termDate : end;
  if (effectiveEnd < start) {
    return { proRataAmount: 0, daysWorked: 0, totalDays: 0 };
  }

  const totalDays = daysBetween(start, end) + 1;
  const daysWorked = daysBetween(start, effectiveEnd) + 1;

  if (totalDays <= 0) {
    return { proRataAmount: 0, daysWorked: 0, totalDays: 0 };
  }

  const proRataAmount = Math.round(
    (expectedAnnualAmount * (daysWorked / totalDays)) * 100
  ) / 100;

  return { proRataAmount, daysWorked, totalDays };
}

// =============================================================================
// Database-Backed Calculation
// =============================================================================

/**
 * Calculate the complete final pay for a terminated employee.
 *
 * This function:
 * 1. Calculates outstanding holiday pay using the 52-week reference period
 * 2. Calculates notice pay (PILON) if applicable
 * 3. Applies any deductions
 * 4. Calculates pro-rata bonus if applicable
 *
 * @param db Database client
 * @param ctx Tenant context
 * @param input Final pay calculation parameters
 * @returns Detailed final pay breakdown
 */
export async function calculateFinalPay(
  db: DatabaseClient,
  ctx: TenantContext,
  input: FinalPayInput
): Promise<FinalPayResult> {
  const warnings: string[] = [];

  // =========================================================================
  // Step 1: Get employee data
  // =========================================================================

  const empData = await getEmployeeData(db, ctx, input.employeeId, input.terminationDate);

  const annualSalary = empData.annualSalary;
  const currency = empData.currency;
  const contractedDaysPerWeek = empData.contractedDaysPerWeek;
  const hireDate = empData.hireDate;
  const noticePeriodDays = input.noticePeriodDays > 0
    ? input.noticePeriodDays
    : empData.noticePeriodDays;

  if (annualSalary <= 0) {
    warnings.push(
      "No active compensation record found; salary-dependent values will be zero."
    );
  }

  // =========================================================================
  // Step 2: Calculate outstanding holiday pay
  // =========================================================================

  // Determine leave year boundaries
  const termYear = new Date(input.terminationDate).getFullYear();
  const leaveYearStart = input.leaveYearStart || `${termYear}-01-01`;
  const leaveYearEnd = input.leaveYearEnd || `${termYear}-12-31`;

  // Calculate annual entitlement and pro-rata to termination date
  const fullAnnualEntitlement = calculateAnnualEntitlement(contractedDaysPerWeek);

  const proRataEntitlementDays = calculateProRataEntitlement(
    new Date(Math.max(new Date(hireDate).getTime(), new Date(leaveYearStart).getTime())),
    new Date(input.terminationDate),
    fullAnnualEntitlement,
    new Date(leaveYearStart),
    new Date(leaveYearEnd)
  );

  // Get leave days already taken
  const leaveDaysTaken = await getLeaveDaysTaken(
    db,
    ctx,
    input.employeeId,
    leaveYearStart,
    input.terminationDate
  );

  const outstandingLeaveDays = Math.max(
    0,
    Math.round((proRataEntitlementDays - leaveDaysTaken) * 10) / 10
  );

  // Calculate holiday pay using the 52-week reference period
  let holidayPayDetails: HolidayPayResult | null = null;
  let dailyHolidayPayRate = 0;

  try {
    holidayPayDetails = await calculateHolidayPay(
      db,
      ctx,
      input.employeeId,
      input.terminationDate
    );
    dailyHolidayPayRate = holidayPayDetails.dailyHolidayPayRate;
  } catch {
    // Fallback: use annual salary / (52 * days per week)
    if (annualSalary > 0 && contractedDaysPerWeek > 0) {
      dailyHolidayPayRate = Math.round(
        (annualSalary / (52 * contractedDaysPerWeek)) * 100
      ) / 100;
      warnings.push(
        "Holiday pay calculated from salary rate as 52-week reference data was unavailable."
      );
    }
  }

  const outstandingHolidayPay = Math.round(
    outstandingLeaveDays * dailyHolidayPayRate * 100
  ) / 100;

  // If the employee has taken more leave than pro-rata entitlement,
  // note the overpayment but do not automatically deduct (ERA 1996 s13
  // restrictions apply).
  if (proRataEntitlementDays < leaveDaysTaken) {
    const overusedDays = Math.round((leaveDaysTaken - proRataEntitlementDays) * 10) / 10;
    warnings.push(
      `Employee has taken ${overusedDays} day(s) more than pro-rata entitlement. ` +
      `Check contract for holiday overpayment recovery clause before deducting.`
    );
  }

  // =========================================================================
  // Step 3: Calculate notice pay (PILON)
  // =========================================================================

  const dailyPayRate =
    annualSalary > 0 && contractedDaysPerWeek > 0
      ? Math.round((annualSalary / (52 * contractedDaysPerWeek)) * 100) / 100
      : 0;

  const noticePay = input.paymentInLieu
    ? Math.round(dailyPayRate * noticePeriodDays * 100) / 100
    : 0;

  const contractualPilon = input.contractualPilon ?? false;
  const pilonTaxFreeThreshold =
    input.paymentInLieu && !contractualPilon ? PILON_TAX_FREE_THRESHOLD : 0;

  if (input.paymentInLieu && !contractualPilon && noticePay > PILON_TAX_FREE_THRESHOLD) {
    warnings.push(
      `Non-contractual PILON of ${noticePay.toFixed(2)} exceeds the ` +
      `${PILON_TAX_FREE_THRESHOLD.toFixed(2)} tax-free threshold. ` +
      `Amount above threshold is subject to income tax and NI.`
    );
  }

  // =========================================================================
  // Step 4: Deductions
  // =========================================================================

  const deductions = input.deductions || [];
  const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);

  if (totalDeductions > 0) {
    warnings.push(
      `Deductions of ${totalDeductions.toFixed(2)} applied. Ensure all deductions ` +
      `are authorised under ERA 1996 s13 or covered by a written agreement.`
    );
  }

  // =========================================================================
  // Step 5: Pro-rata bonus
  // =========================================================================

  let bonusIncluded = false;
  let bonusDaysWorked = 0;
  let bonusTotalDays = 0;
  let proRataBonus = 0;

  if (input.bonus && input.bonus.expectedAnnualAmount > 0) {
    const bonusCalc = calculateProRataBonus(
      input.bonus.expectedAnnualAmount,
      input.bonus.bonusPeriodStart,
      input.bonus.bonusPeriodEnd,
      input.terminationDate
    );
    proRataBonus = bonusCalc.proRataAmount;
    bonusDaysWorked = bonusCalc.daysWorked;
    bonusTotalDays = bonusCalc.totalDays;
    bonusIncluded = proRataBonus > 0;

    if (bonusIncluded) {
      warnings.push(
        `Pro-rata bonus of ${proRataBonus.toFixed(2)} included. ` +
        `Verify the employee's contract entitles them to a pro-rata ` +
        `bonus on termination (not all bonus schemes guarantee this).`
      );
    }
  }

  // =========================================================================
  // Step 6: Calculate totals
  // =========================================================================

  const grossFinalPay = Math.round(
    (outstandingHolidayPay + noticePay + proRataBonus) * 100
  ) / 100;

  const netFinalPay = Math.round(
    (grossFinalPay - totalDeductions) * 100
  ) / 100;

  return {
    employeeId: input.employeeId,
    terminationDate: input.terminationDate,

    proRataEntitlementDays,
    leaveDaysTaken,
    outstandingLeaveDays,
    dailyHolidayPayRate,
    outstandingHolidayPay,
    holidayPayDetails,

    noticePeriodDays,
    paymentInLieu: input.paymentInLieu,
    contractualPilon,
    dailyPayRate,
    noticePay,
    pilonTaxFreeThreshold,

    deductions,
    totalDeductions,

    bonusIncluded,
    bonusDaysWorked,
    bonusTotalDays,
    proRataBonus,

    grossFinalPay,
    netFinalPay,
    currency,

    warnings,
  };
}

// =============================================================================
// Data Access Helpers
// =============================================================================

interface EmployeeData {
  annualSalary: number;
  currency: string;
  contractedDaysPerWeek: number;
  hireDate: string;
  noticePeriodDays: number;
}

/**
 * Get the employee's salary, contract details, and hire date for final pay.
 */
async function getEmployeeData(
  db: DatabaseClient,
  ctx: TenantContext,
  employeeId: string,
  asOfDate: string
): Promise<EmployeeData> {
  const rows = await db.withTransaction(ctx, async (tx) => {
    return tx`
      SELECT
        e.hire_date::text AS hire_date,
        COALESCE(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency), 0) AS annual_salary,
        COALESCE(ch.currency, 'GBP') AS currency,
        COALESCE(ec.working_hours_per_week / 8.0, ec.fte * 5, 5) AS days_per_week,
        COALESCE(ec.notice_period_days, 0) AS notice_period_days
      FROM employees e
      LEFT JOIN LATERAL (
        SELECT base_salary, pay_frequency, currency
        FROM compensation_history
        WHERE employee_id = e.id
          AND effective_from <= ${asOfDate}::date
          AND (effective_to IS NULL OR effective_to >= ${asOfDate}::date)
        ORDER BY effective_from DESC
        LIMIT 1
      ) ch ON true
      LEFT JOIN LATERAL (
        SELECT working_hours_per_week, fte, notice_period_days
        FROM employment_contracts
        WHERE employee_id = e.id
          AND effective_from <= ${asOfDate}::date
          AND (effective_to IS NULL OR effective_to >= ${asOfDate}::date)
        ORDER BY effective_from DESC
        LIMIT 1
      ) ec ON true
      WHERE e.id = ${employeeId}::uuid
    `;
  });

  if (rows.length === 0) {
    return {
      annualSalary: 0,
      currency: "GBP",
      contractedDaysPerWeek: 5,
      hireDate: asOfDate,
      noticePeriodDays: 0,
    };
  }

  const row = rows[0] as any;
  return {
    annualSalary: Number(row.annualSalary) || 0,
    currency: row.currency || "GBP",
    contractedDaysPerWeek:
      Math.round((Number(row.daysPerWeek) || 5) * 2) / 2,
    hireDate: row.hireDate || asOfDate,
    noticePeriodDays: Number(row.noticePeriodDays) || 0,
  };
}

/**
 * Get the total number of leave days taken by the employee between two dates.
 * Counts approved leave requests only.
 */
async function getLeaveDaysTaken(
  db: DatabaseClient,
  ctx: TenantContext,
  employeeId: string,
  fromDate: string,
  toDate: string
): Promise<number> {
  const rows = await db.withTransaction(ctx, async (tx) => {
    return tx`
      SELECT
        COALESCE(SUM(lr.duration), 0) AS total_days
      FROM leave_requests lr
      JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.employee_id = ${employeeId}::uuid
        AND lr.status IN ('approved', 'completed')
        AND lr.start_date >= ${fromDate}::date
        AND lr.end_date <= ${toDate}::date
        AND lt.category = 'annual'
    `;
  });

  return Number((rows[0] as any)?.totalDays) || 0;
}

// =============================================================================
// Date Utility
// =============================================================================

/**
 * Count days between two dates (inclusive of start, exclusive of end).
 */
function daysBetween(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const utcStart = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate()
  );
  const utcEnd = Date.UTC(
    end.getFullYear(),
    end.getMonth(),
    end.getDate()
  );
  return Math.floor((utcEnd - utcStart) / msPerDay);
}
