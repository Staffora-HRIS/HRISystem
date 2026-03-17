/**
 * UK Holiday Pay Calculation (52-Week Reference Period)
 *
 * Implements the Employment Rights (Employment Particulars and Paid Annual
 * Leave) (Amendment) Regulations 2018, effective April 2020. Holiday pay
 * for workers without "normal" working hours (or with variable pay) must
 * be calculated using the average weekly earnings over the last 52 paid
 * weeks. Weeks with no pay are excluded and the lookback window extends
 * further back, up to a maximum of 104 weeks.
 *
 * For workers with variable pay components (overtime, commission, bonuses),
 * all regular payments must be included in the reference period calculation,
 * per the Supreme Court ruling in British Gas Trading Ltd v Lock [2017]
 * and the Bear Scotland Ltd v Fulton [2015] EAT decision.
 *
 * References:
 * - Employment Rights Act 1996, s221-224
 * - Employment Rights (Employment Particulars and Paid Annual Leave)
 *   (Amendment) Regulations 2018 (SI 2018/1378)
 * - Working Time Regulations 1998 (SI 1998/1833) reg 16
 * - Bear Scotland Ltd v Fulton [2015] IRLR 15 (EAT)
 * - British Gas Trading Ltd v Lock [2017] UKSC 34
 */

import type { DatabaseClient } from "../plugins/db";
import type { TenantContext } from "../types/service-result";

// =============================================================================
// Constants
// =============================================================================

/**
 * Number of paid weeks to include in the reference period.
 * Changed from 12 to 52 on 6 April 2020.
 */
export const REFERENCE_WEEKS = 52;

/**
 * Maximum lookback in weeks (2x reference period).
 * If we cannot find 52 paid weeks within 104 weeks, we use however many
 * we found.
 */
export const MAX_LOOKBACK_WEEKS = 104;

/**
 * Standard UK full-time working days per week.
 */
export const STANDARD_DAYS_PER_WEEK = 5;

// =============================================================================
// Types
// =============================================================================

/**
 * Represents a single week's earnings for the reference period calculation.
 */
export interface WeeklyEarnings {
  /** ISO week start date (Monday) */
  weekStart: string;
  /** ISO week end date (Sunday) */
  weekEnd: string;
  /** Basic pay for this week */
  basicPay: number;
  /** Overtime pay for this week */
  overtimePay: number;
  /** Commission pay for this week */
  commissionPay: number;
  /** Bonus pay (pro-rated if applicable) for this week */
  bonusPay: number;
  /** Total gross earnings for this week */
  totalEarnings: number;
}

/**
 * Result of the holiday pay calculation.
 */
export interface HolidayPayResult {
  /** Average weekly pay (rounded to 2 decimal places) */
  averageWeeklyPay: number;
  /** Daily holiday pay rate (weekly / contracted days per week) */
  dailyHolidayPayRate: number;
  /** Number of paid weeks included in the calculation */
  weeksConsidered: number;
  /** Number of unpaid weeks skipped */
  weeksSkipped: number;
  /** Total lookback weeks scanned */
  totalWeeksScanned: number;
  /** The reference date used for the calculation */
  referenceDate: string;
  /** Contracted days per week used for the daily rate */
  contractedDaysPerWeek: number;
  /** Breakdown of weekly earnings included */
  weeklyBreakdown: WeeklyEarnings[];
  /** Whether the calculation used fewer than 52 weeks (employee has short tenure) */
  isPartialReference: boolean;
}

// =============================================================================
// Pure Calculation Functions
// =============================================================================

/**
 * Calculate average weekly holiday pay from an array of weekly earnings.
 *
 * This is the pure calculation function that operates on pre-fetched data.
 * It skips weeks with zero or null earnings and collects up to 52 paid
 * weeks from the most recent data, looking back up to 104 weeks maximum.
 *
 * @param weeklyEarnings Array of weekly earnings, most recent first.
 *   Entries with totalEarnings <= 0 are treated as unpaid weeks and skipped.
 * @param contractedDaysPerWeek Number of days the employee works per week
 *   (used to derive the daily rate from weekly).
 * @param referenceDate The date from which we look backwards.
 * @returns Holiday pay calculation result.
 */
export function calculateHolidayPayFromEarnings(
  weeklyEarnings: WeeklyEarnings[],
  contractedDaysPerWeek: number,
  referenceDate: string
): HolidayPayResult {
  const effectiveDays = contractedDaysPerWeek > 0
    ? contractedDaysPerWeek
    : STANDARD_DAYS_PER_WEEK;

  const includedWeeks: WeeklyEarnings[] = [];
  let weeksSkipped = 0;
  let totalWeeksScanned = 0;

  for (const week of weeklyEarnings) {
    if (totalWeeksScanned >= MAX_LOOKBACK_WEEKS) break;
    totalWeeksScanned++;

    if (week.totalEarnings <= 0) {
      weeksSkipped++;
      continue;
    }

    includedWeeks.push(week);

    if (includedWeeks.length >= REFERENCE_WEEKS) {
      break;
    }
  }

  const weeksConsidered = includedWeeks.length;
  const totalEarnings = includedWeeks.reduce(
    (sum, w) => sum + w.totalEarnings,
    0
  );

  const averageWeeklyPay =
    weeksConsidered > 0
      ? Math.round((totalEarnings / weeksConsidered) * 100) / 100
      : 0;

  const dailyHolidayPayRate =
    averageWeeklyPay > 0
      ? Math.round((averageWeeklyPay / effectiveDays) * 100) / 100
      : 0;

  return {
    averageWeeklyPay,
    dailyHolidayPayRate,
    weeksConsidered,
    weeksSkipped,
    totalWeeksScanned,
    referenceDate,
    contractedDaysPerWeek: effectiveDays,
    weeklyBreakdown: includedWeeks,
    isPartialReference: weeksConsidered < REFERENCE_WEEKS,
  };
}

// =============================================================================
// Database-Backed Calculation
// =============================================================================

/**
 * Calculate holiday pay for an employee using the 52-week reference period.
 *
 * Queries the payroll_lines table (joined with payroll_runs) to gather
 * weekly earnings data for the employee, then applies the 52-week average
 * calculation. If no payroll_lines data is available, falls back to the
 * compensation_history table to derive a basic weekly rate.
 *
 * The function includes:
 * - Basic pay
 * - Regular overtime (from approved timesheets/payroll lines)
 * - Commission (from payroll lines bonus_pay or commission fields)
 * - Bonuses (from payroll lines or bonus_payments table)
 *
 * @param db Database client
 * @param ctx Tenant context for RLS
 * @param employeeId UUID of the employee
 * @param referenceDate Date to calculate from (usually the first day of holiday)
 * @returns Holiday pay calculation result
 */
export async function calculateHolidayPay(
  db: DatabaseClient,
  ctx: TenantContext,
  employeeId: string,
  referenceDate: string
): Promise<HolidayPayResult> {
  // Step 1: Get the employee's contracted days per week from their
  // current employment contract.
  const contractedDaysPerWeek = await getContractedDaysPerWeek(
    db,
    ctx,
    employeeId,
    referenceDate
  );

  // Step 2: Try to get weekly earnings from payroll_lines.
  const weeklyEarnings = await getWeeklyEarningsFromPayroll(
    db,
    ctx,
    employeeId,
    referenceDate
  );

  if (weeklyEarnings.length > 0) {
    return calculateHolidayPayFromEarnings(
      weeklyEarnings,
      contractedDaysPerWeek,
      referenceDate
    );
  }

  // Step 3: Fallback -- derive weekly pay from compensation_history.
  const fallbackEarnings = await getWeeklyEarningsFromCompensation(
    db,
    ctx,
    employeeId,
    referenceDate
  );

  return calculateHolidayPayFromEarnings(
    fallbackEarnings,
    contractedDaysPerWeek,
    referenceDate
  );
}

// =============================================================================
// Data Access Helpers
// =============================================================================

/**
 * Get the employee's contracted working days per week from their employment
 * contract effective as of the reference date. Falls back to the standard
 * 5 days if no contract is found or working hours are not specified.
 */
async function getContractedDaysPerWeek(
  db: DatabaseClient,
  ctx: TenantContext,
  employeeId: string,
  asOfDate: string
): Promise<number> {
  const rows = await db.withTransaction(ctx, async (tx) => {
    return tx`
      SELECT
        ec.working_hours_per_week,
        ec.fte
      FROM employment_contracts ec
      WHERE ec.employee_id = ${employeeId}::uuid
        AND ec.effective_from <= ${asOfDate}::date
        AND (ec.effective_to IS NULL OR ec.effective_to >= ${asOfDate}::date)
      ORDER BY ec.effective_from DESC
      LIMIT 1
    `;
  });

  if (rows.length === 0) {
    return STANDARD_DAYS_PER_WEEK;
  }

  const contract = rows[0] as {
    workingHoursPerWeek: number | null;
    fte: number | null;
  };

  // If working hours are known, derive days (assuming 8-hour days).
  if (contract.workingHoursPerWeek && contract.workingHoursPerWeek > 0) {
    const days = contract.workingHoursPerWeek / 8;
    // Round to nearest 0.5 for practical purposes
    return Math.round(days * 2) / 2;
  }

  // Use FTE to derive days
  if (contract.fte && contract.fte > 0) {
    return Math.round(contract.fte * STANDARD_DAYS_PER_WEEK * 2) / 2;
  }

  return STANDARD_DAYS_PER_WEEK;
}

/**
 * Get weekly earnings from payroll_lines by aggregating pay run data
 * into ISO weeks. Looks back up to 104 weeks from the reference date.
 *
 * Each "week" is defined as Monday-Sunday. Payroll runs that span
 * multiple weeks have their line totals pro-rated by the number of
 * weeks in the pay period.
 */
async function getWeeklyEarningsFromPayroll(
  db: DatabaseClient,
  ctx: TenantContext,
  employeeId: string,
  referenceDate: string
): Promise<WeeklyEarnings[]> {
  const rows = await db.withTransaction(ctx, async (tx) => {
    return tx`
      WITH pay_weeks AS (
        SELECT
          date_trunc('week', gs.week_start)::date AS week_start,
          (date_trunc('week', gs.week_start) + INTERVAL '6 days')::date AS week_end,
          pl.basic_pay::numeric,
          pl.overtime_pay::numeric,
          pl.bonus_pay::numeric,
          pl.total_gross::numeric,
          -- Pro-rate if the pay period spans multiple weeks
          GREATEST(1, EXTRACT(DAY FROM (pr.pay_period_end - pr.pay_period_start + 1) * INTERVAL '1 day') / 7.0) AS weeks_in_period
        FROM payroll_lines pl
        JOIN payroll_runs pr ON pr.id = pl.payroll_run_id
        -- Generate a series of weeks covered by each payroll period
        CROSS JOIN LATERAL generate_series(
          date_trunc('week', pr.pay_period_start)::date,
          date_trunc('week', pr.pay_period_end)::date,
          '1 week'::interval
        ) AS gs(week_start)
        WHERE pl.employee_id = ${employeeId}::uuid
          AND pr.status IN ('review', 'approved', 'submitted', 'paid')
          AND pr.pay_period_start >= (${referenceDate}::date - INTERVAL '104 weeks')
          AND pr.pay_period_end < ${referenceDate}::date
      )
      SELECT
        pw.week_start::text AS week_start,
        pw.week_end::text AS week_end,
        ROUND(SUM(pw.basic_pay / pw.weeks_in_period), 2) AS basic_pay,
        ROUND(SUM(pw.overtime_pay / pw.weeks_in_period), 2) AS overtime_pay,
        ROUND(SUM(pw.bonus_pay / pw.weeks_in_period), 2) AS bonus_pay,
        ROUND(SUM(pw.total_gross / pw.weeks_in_period), 2) AS total_earnings
      FROM pay_weeks pw
      GROUP BY pw.week_start, pw.week_end
      ORDER BY pw.week_start DESC
    `;
  });

  return (rows as any[]).map((r) => ({
    weekStart: r.weekStart,
    weekEnd: r.weekEnd,
    basicPay: Number(r.basicPay) || 0,
    overtimePay: Number(r.overtimePay) || 0,
    commissionPay: 0, // Commission is included in bonus_pay in payroll_lines
    bonusPay: Number(r.bonusPay) || 0,
    totalEarnings: Number(r.totalEarnings) || 0,
  }));
}

/**
 * Fallback: derive weekly earnings from compensation_history when no
 * payroll_lines data is available. This is less accurate since it only
 * reflects base salary without overtime/commission/bonuses, but it provides
 * a baseline for employees who have not yet been through a payroll run.
 *
 * Each compensation_history record is converted to a weekly rate based
 * on its pay_frequency, and synthetic weekly entries are generated for
 * the period the record was effective.
 */
async function getWeeklyEarningsFromCompensation(
  db: DatabaseClient,
  ctx: TenantContext,
  employeeId: string,
  referenceDate: string
): Promise<WeeklyEarnings[]> {
  const rows = await db.withTransaction(ctx, async (tx) => {
    return tx`
      SELECT
        ch.base_salary::numeric AS base_salary,
        ch.pay_frequency,
        ch.effective_from::text,
        COALESCE(ch.effective_to::text, ${referenceDate}) AS effective_to
      FROM compensation_history ch
      WHERE ch.employee_id = ${employeeId}::uuid
        AND ch.effective_from < ${referenceDate}::date
        AND (ch.effective_to IS NULL OR ch.effective_to > (${referenceDate}::date - INTERVAL '104 weeks'))
      ORDER BY ch.effective_from DESC
    `;
  });

  if (rows.length === 0) return [];

  // Build synthetic weekly entries from compensation records.
  const weeklyEntries: WeeklyEarnings[] = [];
  const lookbackLimit = new Date(referenceDate);
  lookbackLimit.setDate(lookbackLimit.getDate() - MAX_LOOKBACK_WEEKS * 7);

  for (const row of rows as any[]) {
    const baseSalary = Number(row.baseSalary) || 0;
    const frequency = row.payFrequency || "monthly";

    // Convert to weekly rate
    let weeklyRate: number;
    switch (frequency) {
      case "annual":
        weeklyRate = baseSalary / 52;
        break;
      case "monthly":
        weeklyRate = (baseSalary * 12) / 52;
        break;
      case "semi_monthly":
        weeklyRate = (baseSalary * 24) / 52;
        break;
      case "bi_weekly":
        weeklyRate = baseSalary / 2;
        break;
      case "weekly":
        weeklyRate = baseSalary;
        break;
      default:
        weeklyRate = (baseSalary * 12) / 52;
    }

    weeklyRate = Math.round(weeklyRate * 100) / 100;

    // Generate weekly entries for the effective period of this record,
    // limited to the lookback window.
    const effectiveFrom = new Date(row.effectiveFrom);
    const effectiveTo = new Date(row.effectiveTo);
    const refDate = new Date(referenceDate);

    const periodEnd = effectiveTo < refDate ? effectiveTo : refDate;
    const periodStart =
      effectiveFrom > lookbackLimit ? effectiveFrom : lookbackLimit;

    // Walk backwards week by week from periodEnd
    const currentWeekStart = new Date(periodEnd);
    // Align to Monday
    const dayOfWeek = currentWeekStart.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    currentWeekStart.setDate(currentWeekStart.getDate() - daysToMonday);

    while (currentWeekStart >= periodStart && weeklyEntries.length < MAX_LOOKBACK_WEEKS) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      weeklyEntries.push({
        weekStart: currentWeekStart.toISOString().split("T")[0],
        weekEnd: weekEnd.toISOString().split("T")[0],
        basicPay: weeklyRate,
        overtimePay: 0,
        commissionPay: 0,
        bonusPay: 0,
        totalEarnings: weeklyRate,
      });

      currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    }
  }

  // Sort most recent first
  weeklyEntries.sort(
    (a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime()
  );

  return weeklyEntries;
}
