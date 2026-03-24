/**
 * Holiday Pay 52-Week Reference Period Calculator
 *
 * Implements UK Employment Rights Act 1996 holiday pay calculation
 * using the 52-week reference period (excluding weeks with no pay).
 *
 * Provides:
 *   - calculateHolidayPay() for variable-hours workers (simple gross-pay model)
 *   - calculateHolidayDayRate() for payroll with itemised earnings breakdown
 *
 * References:
 *   - Employment Rights Act 1996, s221-224
 *   - Employment Rights (Employment Particulars and Paid Annual Leave)
 *     (Amendment) Regulations 2018 (SI 2018/1378)
 *   - Working Time Regulations 1998 (SI 1998/1833) reg 16
 *   - Bear Scotland Ltd v Fulton [2015] IRLR 15 (EAT)
 *   - British Gas Trading Ltd v Lock [2017] UKSC 34
 */

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
// Types — Simple Gross-Pay Model
// =============================================================================

export interface WeeklyPayRecord {
  weekStarting: Date;
  grossPay: number;
  hoursWorked: number;
}

export interface HolidayPayResult {
  weeklyRate: number;
  dailyRate: number;
  weeksUsed: number;
  referenceStartDate: Date;
  referenceEndDate: Date;
}

/**
 * Calculate holiday pay using the 52-week reference period.
 *
 * Per UK Employment Rights Act 1996 (as amended by the Employment Rights
 * (Employment Particulars and Paid Annual Leave) (Amendment) Regulations 2018),
 * holiday pay for workers with variable hours/pay must be calculated using
 * the average pay over the previous 52 weeks in which the worker was paid.
 *
 * Weeks in which no remuneration was payable are skipped, and earlier weeks
 * are included instead (up to a maximum look-back of 104 weeks).
 */
export function calculateHolidayPay(
  payRecords: WeeklyPayRecord[],
  calculationDate: Date,
  workingDaysPerWeek: number = 5,
): HolidayPayResult {
  const referenceWeeks = 52;
  const maxLookbackWeeks = 104;

  // Filter records within the max lookback period
  const lookbackStart = new Date(calculationDate);
  lookbackStart.setDate(lookbackStart.getDate() - maxLookbackWeeks * 7);

  const eligibleRecords = payRecords
    .filter(
      (r) =>
        r.grossPay > 0 &&
        r.weekStarting >= lookbackStart &&
        r.weekStarting < calculationDate,
    )
    .sort((a, b) => b.weekStarting.getTime() - a.weekStarting.getTime())
    .slice(0, referenceWeeks);

  if (eligibleRecords.length === 0) {
    return {
      weeklyRate: 0,
      dailyRate: 0,
      weeksUsed: 0,
      referenceStartDate: calculationDate,
      referenceEndDate: calculationDate,
    };
  }

  const totalPay = eligibleRecords.reduce((sum, r) => sum + r.grossPay, 0);
  const weeklyRate = totalPay / eligibleRecords.length;
  const dailyRate = weeklyRate / workingDaysPerWeek;

  return {
    weeklyRate,
    dailyRate,
    weeksUsed: eligibleRecords.length,
    referenceStartDate: eligibleRecords[eligibleRecords.length - 1].weekStarting,
    referenceEndDate: eligibleRecords[0].weekStarting,
  };
}

// =============================================================================
// Types — Itemised Earnings Model (used by payroll)
// =============================================================================

/**
 * Represents a single week's itemised earnings for the 52-week reference
 * period calculation. Used when payroll data provides a breakdown of pay
 * components (basic, overtime, commission, bonus).
 */
export interface WeeklyEarnings {
  /** ISO date string for the week start (Monday) */
  weekStart: string;
  /** ISO date string for the week end (Sunday) */
  weekEnd: string;
  /** Basic pay for this week */
  basicPay: number;
  /** Overtime pay for this week */
  overtimePay: number;
  /** Commission pay for this week */
  commission: number;
  /** Regular bonus (pro-rated if applicable) for this week */
  regularBonus: number;
}

/**
 * Breakdown of average pay components across the qualifying weeks.
 */
export interface HolidayDayRateBreakdown {
  averageBasicPay: number;
  averageOvertimePay: number;
  averageCommission: number;
  averageRegularBonus: number;
}

/**
 * Result of the itemised holiday day-rate calculation.
 */
export interface HolidayDayRateResult {
  /** Average weekly pay (rounded to 2 decimal places) */
  averageWeeklyPay: number;
  /** Daily holiday pay rate (weekly / working days per week) */
  averageDailyRate: number;
  /** Number of paid weeks included in the calculation */
  qualifyingWeeks: number;
  /** Total weeks scanned (including skipped unpaid weeks) */
  totalWeeksExamined: number;
  /** Whether fewer than 52 qualifying weeks were found */
  isIncomplete: boolean;
  /** Per-component average breakdown */
  breakdown: HolidayDayRateBreakdown;
  /** ISO date string of the earliest qualifying week start */
  referenceStart: string;
  /** ISO date string of the most recent qualifying week start */
  referenceEnd: string;
}

// =============================================================================
// Itemised Calculation Function
// =============================================================================

/**
 * Calculate the holiday day-rate from itemised weekly earnings.
 *
 * Implements the 52-week reference period calculation per UK Employment
 * Rights Act 1996 s221-224 using an itemised earnings breakdown. Weeks
 * where total pay is zero are skipped, and earlier weeks are examined
 * instead (up to MAX_LOOKBACK_WEEKS = 104).
 *
 * @param earnings Array of weekly earnings, most recent first.
 *   Weeks where all components sum to zero are treated as unpaid.
 * @param workingDaysPerWeek Number of contracted working days per week
 *   (used to derive the daily rate). Defaults to 5.
 * @returns Holiday day-rate calculation result with per-component breakdown.
 */
export function calculateHolidayDayRate(
  earnings: WeeklyEarnings[],
  workingDaysPerWeek: number = STANDARD_DAYS_PER_WEEK,
): HolidayDayRateResult {
  const effectiveDays = workingDaysPerWeek > 0
    ? workingDaysPerWeek
    : STANDARD_DAYS_PER_WEEK;

  const qualifying: WeeklyEarnings[] = [];
  let totalWeeksExamined = 0;

  for (const week of earnings) {
    if (totalWeeksExamined >= MAX_LOOKBACK_WEEKS) break;
    totalWeeksExamined++;

    const total =
      week.basicPay + week.overtimePay + week.commission + week.regularBonus;
    if (total <= 0) continue;

    qualifying.push(week);
    if (qualifying.length >= REFERENCE_WEEKS) break;
  }

  const count = qualifying.length;

  if (count === 0) {
    return {
      averageWeeklyPay: 0,
      averageDailyRate: 0,
      qualifyingWeeks: 0,
      totalWeeksExamined,
      isIncomplete: true,
      breakdown: {
        averageBasicPay: 0,
        averageOvertimePay: 0,
        averageCommission: 0,
        averageRegularBonus: 0,
      },
      referenceStart: "",
      referenceEnd: "",
    };
  }

  const sumBasic = qualifying.reduce((s, w) => s + w.basicPay, 0);
  const sumOvertime = qualifying.reduce((s, w) => s + w.overtimePay, 0);
  const sumCommission = qualifying.reduce((s, w) => s + w.commission, 0);
  const sumBonus = qualifying.reduce((s, w) => s + w.regularBonus, 0);
  const totalPay = sumBasic + sumOvertime + sumCommission + sumBonus;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const averageWeeklyPay = round2(totalPay / count);
  const averageDailyRate = round2(averageWeeklyPay / effectiveDays);

  return {
    averageWeeklyPay,
    averageDailyRate,
    qualifyingWeeks: count,
    totalWeeksExamined,
    isIncomplete: count < REFERENCE_WEEKS,
    breakdown: {
      averageBasicPay: round2(sumBasic / count),
      averageOvertimePay: round2(sumOvertime / count),
      averageCommission: round2(sumCommission / count),
      averageRegularBonus: round2(sumBonus / count),
    },
    referenceStart: qualifying[qualifying.length - 1].weekStart,
    referenceEnd: qualifying[0].weekStart,
  };
}
