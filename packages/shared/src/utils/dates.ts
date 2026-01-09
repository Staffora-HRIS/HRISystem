/**
 * Date Utilities
 *
 * Helper functions for date manipulation, formatting, parsing,
 * and effective dating operations.
 */

import type { DateString, EffectiveDated, DateRange } from "../types/common";

// =============================================================================
// Date Formatting
// =============================================================================

/**
 * Format a Date object to ISO date string (YYYY-MM-DD).
 *
 * @param date - The date to format
 * @returns ISO date string
 */
export function formatDate(date: Date): DateString {
  const result = date.toISOString().split("T")[0];
  return result ?? "";
}

/**
 * Format a Date object to ISO timestamp string.
 *
 * @param date - The date to format
 * @returns ISO timestamp string
 */
export function formatTimestamp(date: Date): string {
  return date.toISOString();
}

/**
 * Format a date with a specific pattern.
 * Supports: YYYY, MM, DD, HH, mm, ss
 *
 * @param date - The date to format
 * @param pattern - The format pattern
 * @returns Formatted date string
 */
export function formatDatePattern(date: Date, pattern: string): string {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");

  return pattern
    .replace("YYYY", year)
    .replace("MM", month)
    .replace("DD", day)
    .replace("HH", hours)
    .replace("mm", minutes)
    .replace("ss", seconds);
}

// =============================================================================
// Date Parsing
// =============================================================================

/**
 * Parse an ISO date string to a Date object.
 *
 * @param dateString - The date string to parse
 * @returns Date object or null if invalid
 */
export function parseDate(dateString: string): Date | null {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return null;
  }
  return date;
}

/**
 * Parse an ISO date string to a Date object, throwing on invalid input.
 *
 * @param dateString - The date string to parse
 * @returns Date object
 * @throws Error if date string is invalid
 */
export function parseDateStrict(dateString: string): Date {
  const date = parseDate(dateString);
  if (!date) {
    throw new Error(`Invalid date string: ${dateString}`);
  }
  return date;
}

// =============================================================================
// Date Comparison
// =============================================================================

/**
 * Check if a date is within a range (inclusive).
 *
 * @param date - The date to check
 * @param startDate - Range start date
 * @param endDate - Range end date (null for open-ended)
 * @returns True if date is within range
 */
export function isDateInRange(
  date: DateString | Date,
  startDate: DateString | Date,
  endDate: DateString | Date | null
): boolean {
  const dateObj = typeof date === "string" ? parseDateStrict(date) : date;
  const startObj =
    typeof startDate === "string" ? parseDateStrict(startDate) : startDate;
  const endObj =
    endDate === null
      ? null
      : typeof endDate === "string"
        ? parseDateStrict(endDate)
        : endDate;

  const dateTime = startOfDay(dateObj).getTime();
  const startTime = startOfDay(startObj).getTime();
  const endTime = endObj ? startOfDay(endObj).getTime() : Infinity;

  return dateTime >= startTime && dateTime <= endTime;
}

/**
 * Check if two date ranges overlap.
 *
 * @param range1 - First date range
 * @param range2 - Second date range
 * @returns True if ranges overlap
 */
export function doDateRangesOverlap(
  range1: DateRange,
  range2: DateRange
): boolean {
  const start1 = parseDateStrict(range1.effectiveFrom);
  const end1 = range1.effectiveTo ? parseDateStrict(range1.effectiveTo) : null;
  const start2 = parseDateStrict(range2.effectiveFrom);
  const end2 = range2.effectiveTo ? parseDateStrict(range2.effectiveTo) : null;

  // If either range is open-ended, it extends to infinity
  const end1Time = end1 ? end1.getTime() : Infinity;
  const end2Time = end2 ? end2.getTime() : Infinity;

  return start1.getTime() <= end2Time && start2.getTime() <= end1Time;
}

/**
 * Check if a date is today.
 *
 * @param date - The date to check
 * @returns True if date is today
 */
export function isToday(date: DateString | Date): boolean {
  const dateObj = typeof date === "string" ? parseDateStrict(date) : date;
  const today = new Date();
  return formatDate(dateObj) === formatDate(today);
}

/**
 * Check if a date is in the past.
 *
 * @param date - The date to check
 * @returns True if date is before today
 */
export function isPast(date: DateString | Date): boolean {
  const dateObj = typeof date === "string" ? parseDateStrict(date) : date;
  return startOfDay(dateObj).getTime() < startOfDay(new Date()).getTime();
}

/**
 * Check if a date is in the future.
 *
 * @param date - The date to check
 * @returns True if date is after today
 */
export function isFuture(date: DateString | Date): boolean {
  const dateObj = typeof date === "string" ? parseDateStrict(date) : date;
  return startOfDay(dateObj).getTime() > startOfDay(new Date()).getTime();
}

// =============================================================================
// Effective Dating
// =============================================================================

/**
 * Get the currently effective record from an array of effective-dated records.
 *
 * @param records - Array of effective-dated records
 * @param asOfDate - Date to check effectiveness (defaults to today)
 * @returns The currently effective record or null if none found
 */
export function getEffectiveRecord<T extends EffectiveDated>(
  records: T[],
  asOfDate?: DateString | Date
): T | null {
  if (records.length === 0) {
    return null;
  }

  const checkDate = asOfDate
    ? typeof asOfDate === "string"
      ? parseDateStrict(asOfDate)
      : asOfDate
    : new Date();

  const effectiveRecords = records.filter((record) =>
    isDateInRange(checkDate, record.effectiveFrom, record.effectiveTo)
  );

  if (effectiveRecords.length === 0) {
    return null;
  }

  // If multiple records are effective (shouldn't happen), return the most recent
  const sorted = effectiveRecords.sort((a, b) => {
    const dateA = parseDateStrict(a.effectiveFrom);
    const dateB = parseDateStrict(b.effectiveFrom);
    return dateB.getTime() - dateA.getTime();
  });
  return sorted[0] ?? null;
}

/**
 * Get all effective records for a date range.
 *
 * @param records - Array of effective-dated records
 * @param startDate - Range start date
 * @param endDate - Range end date
 * @returns Array of records effective during the range
 */
export function getEffectiveRecordsInRange<T extends EffectiveDated>(
  records: T[],
  startDate: DateString | Date,
  endDate: DateString | Date
): T[] {
  const start =
    typeof startDate === "string" ? parseDateStrict(startDate) : startDate;
  const end = typeof endDate === "string" ? parseDateStrict(endDate) : endDate;

  return records.filter((record) => {
    const recordStart = parseDateStrict(record.effectiveFrom);
    const recordEnd = record.effectiveTo
      ? parseDateStrict(record.effectiveTo)
      : null;

    const recordEndTime = recordEnd ? recordEnd.getTime() : Infinity;

    return (
      recordStart.getTime() <= end.getTime() &&
      recordEndTime >= start.getTime()
    );
  });
}

// =============================================================================
// Date Arithmetic
// =============================================================================

/**
 * Add days to a date.
 *
 * @param date - The starting date
 * @param days - Number of days to add (can be negative)
 * @returns New date with days added
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add months to a date.
 *
 * @param date - The starting date
 * @param months - Number of months to add (can be negative)
 * @returns New date with months added
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  // Handle month overflow (e.g., Jan 31 + 1 month)
  if (result.getDate() !== day) {
    result.setDate(0); // Go to last day of previous month
  }
  return result;
}

/**
 * Add years to a date.
 *
 * @param date - The starting date
 * @param years - Number of years to add (can be negative)
 * @returns New date with years added
 */
export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * Add weeks to a date.
 *
 * @param date - The starting date
 * @param weeks - Number of weeks to add (can be negative)
 * @returns New date with weeks added
 */
export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

// =============================================================================
// Date Boundaries
// =============================================================================

/**
 * Get the start of day (00:00:00.000) for a date.
 *
 * @param date - The date
 * @returns Date set to start of day
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get the end of day (23:59:59.999) for a date.
 *
 * @param date - The date
 * @returns Date set to end of day
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Get the start of month for a date.
 *
 * @param date - The date
 * @returns Date set to first day of month at 00:00:00
 */
export function startOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get the end of month for a date.
 *
 * @param date - The date
 * @returns Date set to last day of month at 23:59:59
 */
export function endOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1, 0);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Get the start of year for a date.
 *
 * @param date - The date
 * @returns Date set to January 1st at 00:00:00
 */
export function startOfYear(date: Date): Date {
  const result = new Date(date);
  result.setMonth(0, 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get the end of year for a date.
 *
 * @param date - The date
 * @returns Date set to December 31st at 23:59:59
 */
export function endOfYear(date: Date): Date {
  const result = new Date(date);
  result.setMonth(11, 31);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Get the start of week for a date.
 *
 * @param date - The date
 * @param weekStartsOn - Day week starts on (0 = Sunday, 1 = Monday)
 * @returns Date set to start of week
 */
export function startOfWeek(date: Date, weekStartsOn: 0 | 1 = 1): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

// =============================================================================
// Duration Calculations
// =============================================================================

/**
 * Calculate the difference between two dates in days.
 *
 * @param date1 - First date
 * @param date2 - Second date
 * @returns Number of days between dates (can be negative)
 */
export function diffInDays(date1: Date, date2: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (startOfDay(date1).getTime() - startOfDay(date2).getTime()) / msPerDay
  );
}

/**
 * Calculate the difference between two dates in months.
 *
 * @param date1 - First date
 * @param date2 - Second date
 * @returns Number of months between dates (can be negative)
 */
export function diffInMonths(date1: Date, date2: Date): number {
  const months =
    (date1.getFullYear() - date2.getFullYear()) * 12 +
    (date1.getMonth() - date2.getMonth());
  return months;
}

/**
 * Calculate the difference between two dates in years.
 *
 * @param date1 - First date
 * @param date2 - Second date
 * @returns Number of complete years between dates
 */
export function diffInYears(date1: Date, date2: Date): number {
  const years = date1.getFullYear() - date2.getFullYear();
  // Check if the anniversary hasn't occurred yet this year
  const monthDiff = date1.getMonth() - date2.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && date1.getDate() < date2.getDate())
  ) {
    return years - 1;
  }
  return years;
}

// =============================================================================
// Business Day Utilities
// =============================================================================

/**
 * Check if a date is a weekend.
 *
 * @param date - The date to check
 * @returns True if date is Saturday or Sunday
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Add business days to a date (excludes weekends).
 *
 * @param date - The starting date
 * @param days - Number of business days to add
 * @returns New date with business days added
 */
export function addBusinessDays(date: Date, days: number): Date {
  let result = new Date(date);
  let remaining = Math.abs(days);
  const direction = days >= 0 ? 1 : -1;

  while (remaining > 0) {
    result = addDays(result, direction);
    if (!isWeekend(result)) {
      remaining--;
    }
  }

  return result;
}

/**
 * Count business days between two dates (excludes weekends).
 *
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Number of business days
 */
export function countBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  let current = new Date(startDate);

  while (current <= endDate) {
    if (!isWeekend(current)) {
      count++;
    }
    current = addDays(current, 1);
  }

  return count;
}
