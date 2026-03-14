/**
 * UK Holiday Entitlement Calculations
 *
 * Implements the Working Time Regulations 1998 requirements for statutory
 * holiday entitlement in the UK. All workers are entitled to 5.6 weeks of
 * paid annual leave per year. For a full-time worker doing 5 days per week,
 * this equals 28 days. The statutory maximum is capped at 28 days even for
 * workers doing more than 5 days per week.
 *
 * References:
 * - Working Time Regulations 1998 (SI 1998/1833)
 * - Working Time (Amendment) Regulations 2007 (SI 2007/2079)
 * - Employment Rights Act 1996 (Part VIII)
 */

// =============================================================================
// UK Statutory Constants
// =============================================================================

export const UK_STATUTORY = {
  /** Full-time annual leave entitlement in days (5.6 weeks x 5 days) */
  FULL_TIME_MIN_DAYS: 28,

  /** Statutory weeks entitlement under Working Time Regulations 1998 */
  WEEKS_ENTITLEMENT: 5.6,

  /** EU Working Time Directive minimum (4 weeks), relevant for carryover */
  EU_MINIMUM_WEEKS: 4,

  /** EU minimum in days for a 5-day worker (4 weeks x 5 days) */
  EU_MINIMUM_DAYS: 20,

  /** Standard full-time hours per week */
  FULL_TIME_HOURS: 40,

  /** Standard full-time days per week */
  FULL_TIME_DAYS: 5,

  /** Maximum statutory cap in days (even for 6-7 day workers) */
  MAX_STATUTORY_DAYS: 28,

  /**
   * Maximum carryover days under EU Working Time Directive.
   * Only applicable when employee was prevented from taking leave
   * due to sickness, maternity, or other protected reasons.
   */
  MAX_CARRYOVER_DAYS: 20,

  /**
   * Holiday pay reference period in weeks (changed from 12 to 52
   * in April 2020 under the Employment Rights (Employment
   * Particulars and Paid Annual Leave) (Amendment) Regulations 2018).
   */
  HOLIDAY_PAY_REFERENCE_WEEKS: 52,
} as const;

// =============================================================================
// Carryover Reasons
// =============================================================================

/**
 * Reasons that permit carryover of unused statutory leave beyond the
 * normal year-end. Under the EU Working Time Directive (retained in UK
 * law post-Brexit), employees may carry over up to 20 days (4 weeks)
 * if they were unable to take leave for one of these protected reasons.
 */
export const CARRYOVER_PROTECTED_REASONS = [
  "sickness",
  "maternity",
  "paternity",
  "adoption",
  "shared_parental",
  "family_related",
] as const;

export type CarryoverProtectedReason = (typeof CARRYOVER_PROTECTED_REASONS)[number];

// =============================================================================
// Bank Holiday Definitions (Default UK Calendar)
// =============================================================================

/**
 * Represents a single bank holiday entry.
 */
export interface BankHoliday {
  name: string;
  date: string; // ISO date string YYYY-MM-DD
  region: string | null; // null = whole UK, 'SCT' = Scotland only, etc.
}

/**
 * Returns the default UK bank holidays for a given year.
 *
 * These are the standard England & Wales bank holidays. Scotland and
 * Northern Ireland have additional holidays which are returned with
 * their region code set. Tenants can override these by managing their
 * own bank_holidays table entries.
 *
 * Note: Some bank holidays (Easter, Spring Bank Holiday) have variable
 * dates that depend on the year. This function computes them using the
 * Anonymous Gregorian algorithm for Easter.
 */
export function getDefaultUKBankHolidays(year: number): BankHoliday[] {
  const holidays: BankHoliday[] = [];

  // --- Fixed holidays (England & Wales) ---

  // New Year's Day (1 January, or next Monday if weekend)
  holidays.push({
    name: "New Year's Day",
    date: substituteIfWeekend(year, 1, 1),
    region: null,
  });

  // 2 January (Scotland only)
  holidays.push({
    name: "2nd January",
    date: substituteIfWeekend(year, 1, 2),
    region: "SCT",
  });

  // St Patrick's Day (Northern Ireland only, 17 March)
  holidays.push({
    name: "St Patrick's Day",
    date: substituteIfWeekend(year, 3, 17),
    region: "NIR",
  });

  // --- Easter-based holidays ---
  const easter = calculateEasterDate(year);

  // Good Friday (2 days before Easter Sunday)
  const goodFriday = addDays(easter, -2);
  holidays.push({
    name: "Good Friday",
    date: formatDate(goodFriday),
    region: null,
  });

  // Easter Monday (1 day after Easter Sunday)
  const easterMonday = addDays(easter, 1);
  holidays.push({
    name: "Easter Monday",
    date: formatDate(easterMonday),
    region: null, // Not observed in Scotland but included for simplicity; tenants filter by region
  });

  // --- May holidays ---

  // Early May Bank Holiday (first Monday in May)
  holidays.push({
    name: "Early May Bank Holiday",
    date: firstMondayInMonth(year, 5),
    region: null,
  });

  // Spring Bank Holiday (last Monday in May)
  holidays.push({
    name: "Spring Bank Holiday",
    date: lastMondayInMonth(year, 5),
    region: null,
  });

  // Battle of the Boyne / Orangemen's Day (12 July, Northern Ireland)
  holidays.push({
    name: "Battle of the Boyne",
    date: substituteIfWeekend(year, 7, 12),
    region: "NIR",
  });

  // --- August ---

  // Summer Bank Holiday (last Monday in August for England/Wales/NI)
  holidays.push({
    name: "Summer Bank Holiday",
    date: lastMondayInMonth(year, 8),
    region: null, // Scotland uses first Monday in August but tenants can adjust
  });

  // St Andrew's Day (30 November, Scotland only)
  holidays.push({
    name: "St Andrew's Day",
    date: substituteIfWeekend(year, 11, 30),
    region: "SCT",
  });

  // --- Winter ---

  // Christmas Day (25 December)
  holidays.push({
    name: "Christmas Day",
    date: christmasSubstitute(year, 25),
    region: null,
  });

  // Boxing Day (26 December)
  holidays.push({
    name: "Boxing Day",
    date: christmasSubstitute(year, 26),
    region: null,
  });

  return holidays;
}

/**
 * Filter bank holidays to only those applicable to a specific region.
 * Returns holidays where region is null (UK-wide) or matches the given region.
 */
export function filterBankHolidaysByRegion(
  holidays: BankHoliday[],
  region: string | null
): BankHoliday[] {
  if (!region) {
    // No region specified: return only UK-wide holidays
    return holidays.filter((h) => h.region === null);
  }
  return holidays.filter((h) => h.region === null || h.region === region);
}

// =============================================================================
// Entitlement Calculations
// =============================================================================

/**
 * Calculate the annual statutory holiday entitlement based on the employee's
 * contracted working pattern.
 *
 * UK law: 5.6 weeks x days per week, capped at 28 days.
 *
 * Examples:
 * - 5 days/week (full-time): 5.6 x 5 = 28 days
 * - 3 days/week (part-time): 5.6 x 3 = 16.8, ceil = 17 days
 * - 2 days/week: 5.6 x 2 = 11.2, ceil = 12 days
 * - 6 days/week: 5.6 x 6 = 33.6, capped at 28 days
 *
 * @param contractedDaysPerWeek Number of days the employee works per week
 * @returns Statutory minimum entitlement in days (rounded up, capped at 28)
 */
export function calculateAnnualEntitlement(contractedDaysPerWeek: number): number {
  if (contractedDaysPerWeek <= 0) {
    return 0;
  }
  const rawEntitlement =
    UK_STATUTORY.WEEKS_ENTITLEMENT * contractedDaysPerWeek;
  return Math.ceil(Math.min(rawEntitlement, UK_STATUTORY.MAX_STATUTORY_DAYS));
}

/**
 * Calculate the annual statutory entitlement from FTE (Full-Time Equivalent).
 *
 * This is an alternative to calculateAnnualEntitlement for when the FTE
 * ratio is known rather than days per week.
 *
 * @param fte FTE ratio (0.0 to 1.0+)
 * @returns Statutory minimum entitlement in days (rounded up, capped at 28)
 */
export function calculateAnnualEntitlementFromFte(fte: number): number {
  if (fte <= 0) {
    return 0;
  }
  const rawEntitlement = UK_STATUTORY.FULL_TIME_MIN_DAYS * fte;
  return Math.ceil(Math.min(rawEntitlement, UK_STATUTORY.MAX_STATUTORY_DAYS));
}

/**
 * Calculate pro-rata entitlement for employees who start or leave mid-year.
 *
 * Under UK law, entitlement accrues from day one. When an employee starts
 * or leaves part-way through the leave year, their entitlement is pro-rated
 * based on the proportion of the leave year they have worked.
 *
 * Formula: (days in employment during leave year / total days in leave year) x annual entitlement
 *
 * @param startDate Employee's start date (or leave year start, whichever is later)
 * @param endDate Employee's end date (or leave year end, whichever is earlier)
 * @param annualEntitlement Full annual entitlement in days
 * @param leaveYearStart Start of the leave year (e.g., 1 Jan or 1 Apr)
 * @param leaveYearEnd End of the leave year
 * @returns Pro-rata entitlement rounded to 1 decimal place
 */
export function calculateProRataEntitlement(
  startDate: Date,
  endDate: Date,
  annualEntitlement: number,
  leaveYearStart: Date,
  leaveYearEnd: Date
): number {
  // Clamp employment period to leave year boundaries
  const effectiveStart =
    startDate > leaveYearStart ? startDate : leaveYearStart;
  const effectiveEnd = endDate < leaveYearEnd ? endDate : leaveYearEnd;

  if (effectiveStart > effectiveEnd) {
    return 0;
  }

  const totalDaysInYear = daysBetween(leaveYearStart, leaveYearEnd) + 1;
  const daysEmployed = daysBetween(effectiveStart, effectiveEnd) + 1;

  const proRata = (daysEmployed / totalDaysInYear) * annualEntitlement;

  // Round to 1 decimal place (half up)
  return Math.round(proRata * 10) / 10;
}

/**
 * Validate that a leave policy's annual allowance meets the UK statutory
 * minimum entitlement.
 *
 * Returns a validation result with warnings if the policy is below the
 * statutory minimum. This considers:
 * - The employee's contracted days per week (or FTE)
 * - Whether bank holidays are included in or additional to the entitlement
 * - The number of applicable bank holidays
 *
 * @param annualAllowance The policy's annual allowance in days
 * @param contractedDaysPerWeek Working days per week
 * @param bankHolidaysAdditional Whether bank holidays are on top of the allowance
 * @param bankHolidayCount Number of applicable bank holidays
 * @returns Validation result with details
 */
export function validateMinimumEntitlement(
  annualAllowance: number,
  contractedDaysPerWeek: number,
  bankHolidaysAdditional: boolean = true,
  bankHolidayCount: number = 0
): {
  valid: boolean;
  statutoryMinimum: number;
  effectiveEntitlement: number;
  shortfall: number;
  message: string | null;
} {
  const statutoryMinimum = calculateAnnualEntitlement(contractedDaysPerWeek);

  // If bank holidays are additional, the employee gets both the allowance
  // and the bank holidays, so the effective entitlement is the sum.
  // If bank holidays are included, the allowance must cover both.
  const effectiveEntitlement = bankHolidaysAdditional
    ? annualAllowance + bankHolidayCount
    : annualAllowance;

  const shortfall = Math.max(0, statutoryMinimum - effectiveEntitlement);

  if (shortfall > 0) {
    const inclusionNote = bankHolidaysAdditional
      ? ` (${annualAllowance} days allowance + ${bankHolidayCount} bank holidays = ${effectiveEntitlement} effective days)`
      : ` (${annualAllowance} days including bank holidays)`;

    return {
      valid: false,
      statutoryMinimum,
      effectiveEntitlement,
      shortfall,
      message:
        `Annual leave entitlement of ${effectiveEntitlement} days${inclusionNote} ` +
        `is below the UK statutory minimum of ${statutoryMinimum} days ` +
        `for a ${contractedDaysPerWeek}-day working week. ` +
        `Shortfall: ${shortfall} day${shortfall !== 1 ? "s" : ""}.`,
    };
  }

  return {
    valid: true,
    statutoryMinimum,
    effectiveEntitlement,
    shortfall: 0,
    message: null,
  };
}

/**
 * Calculate eligible carryover for an employee.
 *
 * Under the Working Time Regulations 1998 as amended, employees generally
 * cannot carry over unused statutory leave. However, the EU Working Time
 * Directive (retained in UK law) allows carryover of up to 20 days
 * (the 4-week EU minimum) if the employee was prevented from taking leave
 * due to sickness, maternity, or other protected reasons.
 *
 * The additional 1.6 weeks (8 days for a full-time worker) cannot be carried
 * over under any circumstances unless the employer contractually agrees.
 *
 * @param unusedDays Total unused leave days at year end
 * @param contractedDaysPerWeek Working days per week
 * @param maxContractualCarryover Maximum contractual carryover allowed by employer policy
 * @param protectedReason If set, allows EU carryover of up to 20 days
 * @returns Breakdown of eligible carryover
 */
export function calculateCarryover(
  unusedDays: number,
  contractedDaysPerWeek: number,
  maxContractualCarryover: number = 0,
  protectedReason: CarryoverProtectedReason | null = null
): {
  contractualCarryover: number;
  statutoryCarryover: number;
  totalCarryover: number;
  forfeitedDays: number;
  reason: string;
} {
  if (unusedDays <= 0) {
    return {
      contractualCarryover: 0,
      statutoryCarryover: 0,
      totalCarryover: 0,
      forfeitedDays: 0,
      reason: "No unused leave to carry over",
    };
  }

  // Calculate the EU minimum (4 weeks pro-rated)
  const euMinimumDays = Math.ceil(
    UK_STATUTORY.EU_MINIMUM_WEEKS * contractedDaysPerWeek
  );
  // Cap at the EU maximum (20 days)
  const cappedEuMinimum = Math.min(euMinimumDays, UK_STATUTORY.MAX_CARRYOVER_DAYS);

  let statutoryCarryover = 0;
  let reason: string;

  if (protectedReason) {
    // Employee was prevented from taking leave for a protected reason.
    // They can carry over up to the EU minimum (20 days for full-time).
    statutoryCarryover = Math.min(unusedDays, cappedEuMinimum);
    reason = `Protected carryover due to ${protectedReason}: up to ${cappedEuMinimum} days allowed`;
  } else {
    // No protected reason: no statutory carryover of the 4-week EU minimum.
    // The employer may still allow contractual carryover.
    statutoryCarryover = 0;
    reason = "No protected reason for statutory carryover";
  }

  // Contractual carryover (employer-agreed, on top of or instead of statutory)
  const remainingAfterStatutory = unusedDays - statutoryCarryover;
  const contractualCarryover = Math.min(
    Math.max(remainingAfterStatutory, 0),
    maxContractualCarryover
  );

  const totalCarryover = statutoryCarryover + contractualCarryover;
  const forfeitedDays = Math.max(0, unusedDays - totalCarryover);

  return {
    contractualCarryover,
    statutoryCarryover,
    totalCarryover,
    forfeitedDays,
    reason,
  };
}

/**
 * Calculate holiday pay reference period earnings.
 *
 * Since April 2020, holiday pay for workers without normal working hours
 * must be calculated based on average earnings over the previous 52 weeks
 * where pay was received. Weeks with no pay are skipped and the window
 * extends further back (up to 104 weeks).
 *
 * @param weeklyEarnings Array of weekly earnings (most recent first). Null/zero
 *                       entries represent weeks with no pay (e.g., unpaid leave).
 * @returns Average weekly pay for holiday pay calculation
 */
export function calculateHolidayPayRate(
  weeklyEarnings: (number | null)[]
): {
  averageWeeklyPay: number;
  weeksConsidered: number;
  weeksSkipped: number;
} {
  const targetWeeks = UK_STATUTORY.HOLIDAY_PAY_REFERENCE_WEEKS;
  const maxLookback = targetWeeks * 2; // 104 weeks maximum lookback

  let weeksConsidered = 0;
  let totalEarnings = 0;
  let weeksSkipped = 0;

  for (let i = 0; i < Math.min(weeklyEarnings.length, maxLookback); i++) {
    const earnings = weeklyEarnings[i];
    if (earnings === null || earnings === undefined || earnings <= 0) {
      weeksSkipped++;
      continue;
    }

    totalEarnings += earnings;
    weeksConsidered++;

    if (weeksConsidered >= targetWeeks) {
      break;
    }
  }

  const averageWeeklyPay =
    weeksConsidered > 0 ? totalEarnings / weeksConsidered : 0;

  return {
    averageWeeklyPay: Math.round(averageWeeklyPay * 100) / 100,
    weeksConsidered,
    weeksSkipped,
  };
}

// =============================================================================
// Zero-Hours / Irregular Workers
// =============================================================================

/**
 * Calculate holiday entitlement for zero-hours or irregular workers.
 *
 * For workers without fixed hours, the accrual method is used:
 * entitlement accrues at the rate of 12.07% of hours worked.
 *
 * The 12.07% figure comes from: 5.6 / (52 - 5.6) = 5.6 / 46.4 = 0.1207
 *
 * @param hoursWorked Total hours worked in the reference period
 * @returns Holiday hours accrued
 */
export function calculateIrregularWorkerEntitlement(hoursWorked: number): {
  holidayHoursAccrued: number;
  accrualRate: number;
} {
  const accrualRate = 0.1207; // 12.07%
  const holidayHoursAccrued =
    Math.round(hoursWorked * accrualRate * 100) / 100;

  return {
    holidayHoursAccrued,
    accrualRate,
  };
}

// =============================================================================
// Date Utility Functions (Private)
// =============================================================================

/**
 * Calculate Easter Sunday using the Anonymous Gregorian algorithm.
 */
function calculateEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
}

/**
 * If the date falls on a Saturday, substitute to the following Monday.
 * If it falls on a Sunday, substitute to the following Monday.
 */
function substituteIfWeekend(year: number, month: number, day: number): string {
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();

  if (dayOfWeek === 6) {
    // Saturday -> Monday
    return formatDate(addDays(date, 2));
  }
  if (dayOfWeek === 0) {
    // Sunday -> Monday
    return formatDate(addDays(date, 1));
  }
  return formatDate(date);
}

/**
 * Handle Christmas/Boxing Day substitution.
 * If both 25th and 26th fall on weekend days, they roll forward to Monday + Tuesday.
 */
function christmasSubstitute(year: number, day: number): string {
  const christmas = new Date(year, 11, 25);
  const christmasDow = christmas.getDay();

  if (day === 25) {
    // Christmas Day
    if (christmasDow === 6) return formatDate(new Date(year, 11, 27)); // Sat -> Mon
    if (christmasDow === 0) return formatDate(new Date(year, 11, 27)); // Sun -> Tue (Boxing on Mon)
    return formatDate(new Date(year, 11, 25));
  }

  // Boxing Day
  if (christmasDow === 5) return formatDate(new Date(year, 11, 28)); // Christmas Fri -> Boxing Sat -> Mon
  if (christmasDow === 6) return formatDate(new Date(year, 11, 28)); // Christmas Sat -> Boxing Mon is taken, Tue
  if (christmasDow === 0) return formatDate(new Date(year, 11, 26)); // Christmas Sun -> Boxing Mon stays Mon (Christmas moves to Tue)

  // If Boxing Day itself falls on Sat/Sun
  const boxing = new Date(year, 11, 26);
  const boxingDow = boxing.getDay();
  if (boxingDow === 6) return formatDate(new Date(year, 11, 28)); // Sat -> Mon
  if (boxingDow === 0) return formatDate(new Date(year, 11, 28)); // Sun -> Mon
  return formatDate(boxing);
}

/**
 * Find the first Monday of a given month.
 */
function firstMondayInMonth(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  const dayOfWeek = date.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
  return formatDate(addDays(date, daysUntilMonday));
}

/**
 * Find the last Monday of a given month.
 */
function lastMondayInMonth(year: number, month: number): string {
  // Start from the last day of the month
  const lastDay = new Date(year, month, 0);
  const dayOfWeek = lastDay.getDay();
  const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return formatDate(addDays(lastDay, -daysBack));
}

/**
 * Add days to a date (returns a new Date).
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Count days between two dates (inclusive of start, exclusive of end).
 */
function daysBetween(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  // Use UTC to avoid DST issues
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

/**
 * Format a Date as an ISO date string (YYYY-MM-DD).
 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
