/**
 * Date Utilities Tests
 */

import { describe, test, expect } from "bun:test";
import {
  formatDate,
  formatTimestamp,
  formatDatePattern,
  parseDate,
  parseDateStrict,
  isDateInRange,
  doDateRangesOverlap,
  isToday,
  isPast,
  isFuture,
  addDays,
  addMonths,
  addYears,
  addWeeks,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  startOfWeek,
  diffInDays,
  diffInMonths,
  diffInYears,
  isWeekend,
  addBusinessDays,
  countBusinessDays,
  getEffectiveRecord,
  getEffectiveRecordsInRange,
} from "../../utils/dates";

describe("Date Utilities", () => {
  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------
  describe("formatDate", () => {
    test("formats date to ISO date string", () => {
      const date = new Date("2024-03-15T10:30:00Z");
      expect(formatDate(date)).toBe("2024-03-15");
    });

    test("formats date at year boundary", () => {
      const date = new Date("2024-01-01T00:00:00Z");
      expect(formatDate(date)).toBe("2024-01-01");
    });

    test("formats date at end of year", () => {
      const date = new Date("2024-12-31T23:59:59Z");
      expect(formatDate(date)).toBe("2024-12-31");
    });
  });

  describe("formatTimestamp", () => {
    test("formats date to ISO timestamp string", () => {
      const date = new Date("2024-03-15T10:30:00Z");
      const result = formatTimestamp(date);
      expect(result).toBe("2024-03-15T10:30:00.000Z");
    });
  });

  describe("formatDatePattern", () => {
    test("formats with YYYY-MM-DD pattern", () => {
      const date = new Date(2024, 2, 15); // March 15, 2024
      expect(formatDatePattern(date, "YYYY-MM-DD")).toBe("2024-03-15");
    });

    test("formats with HH:mm:ss pattern", () => {
      const date = new Date(2024, 0, 1, 9, 5, 30);
      expect(formatDatePattern(date, "HH:mm:ss")).toBe("09:05:30");
    });

    test("formats with full pattern", () => {
      const date = new Date(2024, 0, 1, 14, 30, 45);
      expect(formatDatePattern(date, "YYYY/MM/DD HH:mm:ss")).toBe(
        "2024/01/01 14:30:45"
      );
    });

    test("pads single-digit months and days", () => {
      const date = new Date(2024, 0, 5); // January 5
      expect(formatDatePattern(date, "MM/DD")).toBe("01/05");
    });
  });

  // ---------------------------------------------------------------------------
  // Parsing
  // ---------------------------------------------------------------------------
  describe("parseDate", () => {
    test("parses valid ISO date string", () => {
      const result = parseDate("2024-03-15");
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2024);
    });

    test("parses valid ISO timestamp", () => {
      const result = parseDate("2024-03-15T10:30:00Z");
      expect(result).toBeInstanceOf(Date);
    });

    test("returns null for invalid date string", () => {
      expect(parseDate("not-a-date")).toBeNull();
    });

    test("returns null for empty string", () => {
      expect(parseDate("")).toBeNull();
    });
  });

  describe("parseDateStrict", () => {
    test("parses valid date string", () => {
      const result = parseDateStrict("2024-03-15");
      expect(result).toBeInstanceOf(Date);
    });

    test("throws on invalid date string", () => {
      expect(() => parseDateStrict("not-a-date")).toThrow("Invalid date string");
    });

    test("throws on empty string", () => {
      expect(() => parseDateStrict("")).toThrow("Invalid date string");
    });
  });

  // ---------------------------------------------------------------------------
  // Comparison
  // ---------------------------------------------------------------------------
  describe("isDateInRange", () => {
    test("date within range returns true", () => {
      expect(isDateInRange("2024-06-15", "2024-01-01", "2024-12-31")).toBe(true);
    });

    test("date at range start returns true (inclusive)", () => {
      expect(isDateInRange("2024-01-01", "2024-01-01", "2024-12-31")).toBe(true);
    });

    test("date at range end returns true (inclusive)", () => {
      expect(isDateInRange("2024-12-31", "2024-01-01", "2024-12-31")).toBe(true);
    });

    test("date before range returns false", () => {
      expect(isDateInRange("2023-12-31", "2024-01-01", "2024-12-31")).toBe(false);
    });

    test("date after range returns false", () => {
      expect(isDateInRange("2025-01-01", "2024-01-01", "2024-12-31")).toBe(false);
    });

    test("open-ended range (null end date) includes future dates", () => {
      expect(isDateInRange("2099-01-01", "2024-01-01", null)).toBe(true);
    });

    test("works with Date objects", () => {
      expect(
        isDateInRange(
          new Date(2024, 5, 15),
          new Date(2024, 0, 1),
          new Date(2024, 11, 31)
        )
      ).toBe(true);
    });
  });

  describe("doDateRangesOverlap", () => {
    test("overlapping ranges return true", () => {
      expect(
        doDateRangesOverlap(
          { effectiveFrom: "2024-01-01", effectiveTo: "2024-06-30" },
          { effectiveFrom: "2024-03-01", effectiveTo: "2024-09-30" }
        )
      ).toBe(true);
    });

    test("non-overlapping ranges return false", () => {
      expect(
        doDateRangesOverlap(
          { effectiveFrom: "2024-01-01", effectiveTo: "2024-03-31" },
          { effectiveFrom: "2024-07-01", effectiveTo: "2024-12-31" }
        )
      ).toBe(false);
    });

    test("adjacent ranges do overlap (touching boundaries)", () => {
      // effectiveFrom "2024-04-01" starts on the same day effectiveTo "2024-04-01" ends,
      // which means they share a point
      expect(
        doDateRangesOverlap(
          { effectiveFrom: "2024-01-01", effectiveTo: "2024-04-01" },
          { effectiveFrom: "2024-04-01", effectiveTo: "2024-06-30" }
        )
      ).toBe(true);
    });

    test("open-ended range overlaps with any subsequent range", () => {
      expect(
        doDateRangesOverlap(
          { effectiveFrom: "2024-01-01", effectiveTo: null },
          { effectiveFrom: "2024-06-01", effectiveTo: "2024-12-31" }
        )
      ).toBe(true);
    });

    test("two open-ended ranges starting at different times overlap", () => {
      expect(
        doDateRangesOverlap(
          { effectiveFrom: "2024-01-01", effectiveTo: null },
          { effectiveFrom: "2024-06-01", effectiveTo: null }
        )
      ).toBe(true);
    });

    test("range entirely within another overlaps", () => {
      expect(
        doDateRangesOverlap(
          { effectiveFrom: "2024-01-01", effectiveTo: "2024-12-31" },
          { effectiveFrom: "2024-03-01", effectiveTo: "2024-06-30" }
        )
      ).toBe(true);
    });
  });

  describe("isToday", () => {
    test("today returns true", () => {
      expect(isToday(new Date())).toBe(true);
    });

    test("yesterday returns false", () => {
      const yesterday = addDays(new Date(), -1);
      expect(isToday(yesterday)).toBe(false);
    });

    test("tomorrow returns false", () => {
      const tomorrow = addDays(new Date(), 1);
      expect(isToday(tomorrow)).toBe(false);
    });

    test("works with string input matching today", () => {
      const todayStr = formatDate(new Date());
      expect(isToday(todayStr)).toBe(true);
    });
  });

  describe("isPast", () => {
    test("yesterday is in the past", () => {
      const yesterday = addDays(new Date(), -1);
      expect(isPast(yesterday)).toBe(true);
    });

    test("today is not in the past", () => {
      expect(isPast(new Date())).toBe(false);
    });

    test("tomorrow is not in the past", () => {
      const tomorrow = addDays(new Date(), 1);
      expect(isPast(tomorrow)).toBe(false);
    });

    test("works with string input", () => {
      expect(isPast("2020-01-01")).toBe(true);
    });
  });

  describe("isFuture", () => {
    test("tomorrow is in the future", () => {
      const tomorrow = addDays(new Date(), 1);
      expect(isFuture(tomorrow)).toBe(true);
    });

    test("today is not in the future", () => {
      expect(isFuture(new Date())).toBe(false);
    });

    test("yesterday is not in the future", () => {
      const yesterday = addDays(new Date(), -1);
      expect(isFuture(yesterday)).toBe(false);
    });

    test("works with string input", () => {
      expect(isFuture("2099-12-31")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Arithmetic
  // ---------------------------------------------------------------------------
  describe("addDays", () => {
    test("adds positive days", () => {
      const date = new Date(2024, 0, 1); // Jan 1
      const result = addDays(date, 10);
      expect(result.getDate()).toBe(11);
    });

    test("subtracts negative days", () => {
      const date = new Date(2024, 0, 15);
      const result = addDays(date, -5);
      expect(result.getDate()).toBe(10);
    });

    test("crosses month boundary", () => {
      const date = new Date(2024, 0, 31); // Jan 31
      const result = addDays(date, 1);
      expect(result.getMonth()).toBe(1); // February
      expect(result.getDate()).toBe(1);
    });

    test("does not mutate original date", () => {
      const date = new Date(2024, 0, 1);
      const original = date.getTime();
      addDays(date, 10);
      expect(date.getTime()).toBe(original);
    });

    test("adding 0 days returns same date", () => {
      const date = new Date(2024, 5, 15);
      const result = addDays(date, 0);
      expect(result.getDate()).toBe(date.getDate());
    });
  });

  describe("addMonths", () => {
    test("adds positive months", () => {
      const date = new Date(2024, 0, 15); // Jan 15
      const result = addMonths(date, 3);
      expect(result.getMonth()).toBe(3); // April
      expect(result.getDate()).toBe(15);
    });

    test("subtracts negative months", () => {
      const date = new Date(2024, 5, 15); // June 15
      const result = addMonths(date, -2);
      expect(result.getMonth()).toBe(3); // April
    });

    test("handles month overflow (Jan 31 + 1 month)", () => {
      const date = new Date(2024, 0, 31); // Jan 31
      const result = addMonths(date, 1);
      // Feb doesn't have 31 days, so it should go to last day of Feb
      expect(result.getMonth()).toBe(1); // February
      expect(result.getDate()).toBe(29); // 2024 is a leap year
    });

    test("crosses year boundary", () => {
      const date = new Date(2024, 10, 15); // Nov 15
      const result = addMonths(date, 3);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(1); // February
    });

    test("does not mutate original date", () => {
      const date = new Date(2024, 0, 15);
      const original = date.getTime();
      addMonths(date, 3);
      expect(date.getTime()).toBe(original);
    });
  });

  describe("addYears", () => {
    test("adds positive years", () => {
      const date = new Date(2024, 5, 15);
      const result = addYears(date, 2);
      expect(result.getFullYear()).toBe(2026);
    });

    test("subtracts negative years", () => {
      const date = new Date(2024, 5, 15);
      const result = addYears(date, -3);
      expect(result.getFullYear()).toBe(2021);
    });

    test("does not mutate original date", () => {
      const date = new Date(2024, 0, 1);
      const original = date.getTime();
      addYears(date, 5);
      expect(date.getTime()).toBe(original);
    });
  });

  describe("addWeeks", () => {
    test("adds positive weeks", () => {
      const date = new Date(2024, 0, 1); // Jan 1
      const result = addWeeks(date, 2);
      expect(result.getDate()).toBe(15); // Jan 15
    });

    test("subtracts negative weeks", () => {
      const date = new Date(2024, 0, 15);
      const result = addWeeks(date, -1);
      expect(result.getDate()).toBe(8);
    });
  });

  // ---------------------------------------------------------------------------
  // Date Boundaries
  // ---------------------------------------------------------------------------
  describe("startOfDay", () => {
    test("sets time to 00:00:00.000", () => {
      const date = new Date(2024, 5, 15, 14, 30, 45, 123);
      const result = startOfDay(date);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    test("preserves date portion", () => {
      const date = new Date(2024, 5, 15, 14, 30);
      const result = startOfDay(date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(5);
      expect(result.getDate()).toBe(15);
    });

    test("does not mutate original date", () => {
      const date = new Date(2024, 5, 15, 14, 30);
      const original = date.getTime();
      startOfDay(date);
      expect(date.getTime()).toBe(original);
    });
  });

  describe("endOfDay", () => {
    test("sets time to 23:59:59.999", () => {
      const date = new Date(2024, 5, 15, 10, 0);
      const result = endOfDay(date);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
      expect(result.getMilliseconds()).toBe(999);
    });

    test("preserves date portion", () => {
      const date = new Date(2024, 5, 15, 10, 0);
      const result = endOfDay(date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(5);
      expect(result.getDate()).toBe(15);
    });
  });

  describe("startOfMonth", () => {
    test("sets to first day of month at midnight", () => {
      const date = new Date(2024, 5, 15, 14, 30);
      const result = startOfMonth(date);
      expect(result.getDate()).toBe(1);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
    });
  });

  describe("endOfMonth", () => {
    test("sets to last day of month", () => {
      const date = new Date(2024, 0, 15); // January
      const result = endOfMonth(date);
      expect(result.getDate()).toBe(31);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
    });

    test("handles February in leap year", () => {
      const date = new Date(2024, 1, 10); // Feb 2024
      const result = endOfMonth(date);
      expect(result.getDate()).toBe(29);
    });

    test("handles February in non-leap year", () => {
      const date = new Date(2023, 1, 10); // Feb 2023
      const result = endOfMonth(date);
      expect(result.getDate()).toBe(28);
    });

    test("handles 30-day months", () => {
      const date = new Date(2024, 3, 10); // April
      const result = endOfMonth(date);
      expect(result.getDate()).toBe(30);
    });
  });

  describe("startOfYear", () => {
    test("sets to January 1 at midnight", () => {
      const date = new Date(2024, 5, 15, 14, 30);
      const result = startOfYear(date);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(1);
      expect(result.getHours()).toBe(0);
    });
  });

  describe("endOfYear", () => {
    test("sets to December 31 at end of day", () => {
      const date = new Date(2024, 5, 15);
      const result = endOfYear(date);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(31);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
    });
  });

  describe("startOfWeek", () => {
    test("defaults to Monday start", () => {
      // Wednesday March 13, 2024
      const date = new Date(2024, 2, 13);
      const result = startOfWeek(date);
      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBe(11);
    });

    test("with Sunday start", () => {
      // Wednesday March 13, 2024
      const date = new Date(2024, 2, 13);
      const result = startOfWeek(date, 0);
      expect(result.getDay()).toBe(0); // Sunday
      expect(result.getDate()).toBe(10);
    });

    test("when date is already the week start", () => {
      // Monday March 11, 2024
      const date = new Date(2024, 2, 11);
      const result = startOfWeek(date);
      expect(result.getDay()).toBe(1);
      expect(result.getDate()).toBe(11);
    });
  });

  // ---------------------------------------------------------------------------
  // Duration Calculations
  // ---------------------------------------------------------------------------
  describe("diffInDays", () => {
    test("calculates positive difference", () => {
      const date1 = new Date(2024, 0, 15);
      const date2 = new Date(2024, 0, 10);
      expect(diffInDays(date1, date2)).toBe(5);
    });

    test("calculates negative difference", () => {
      const date1 = new Date(2024, 0, 10);
      const date2 = new Date(2024, 0, 15);
      expect(diffInDays(date1, date2)).toBe(-5);
    });

    test("same date returns 0", () => {
      const date = new Date(2024, 5, 15);
      expect(diffInDays(date, date)).toBe(0);
    });

    test("ignores time component", () => {
      const date1 = new Date(2024, 0, 15, 23, 59);
      const date2 = new Date(2024, 0, 15, 0, 0);
      expect(diffInDays(date1, date2)).toBe(0);
    });
  });

  describe("diffInMonths", () => {
    test("calculates positive difference", () => {
      const date1 = new Date(2024, 5, 15); // June
      const date2 = new Date(2024, 0, 15); // January
      expect(diffInMonths(date1, date2)).toBe(5);
    });

    test("calculates negative difference", () => {
      const date1 = new Date(2024, 0, 15);
      const date2 = new Date(2024, 5, 15);
      expect(diffInMonths(date1, date2)).toBe(-5);
    });

    test("calculates across years", () => {
      const date1 = new Date(2025, 2, 15); // March 2025
      const date2 = new Date(2024, 10, 15); // November 2024
      expect(diffInMonths(date1, date2)).toBe(4);
    });

    test("same month returns 0", () => {
      const date1 = new Date(2024, 5, 1);
      const date2 = new Date(2024, 5, 30);
      expect(diffInMonths(date1, date2)).toBe(0);
    });
  });

  describe("diffInYears", () => {
    test("calculates full years", () => {
      const date1 = new Date(2024, 5, 15);
      const date2 = new Date(2021, 5, 15);
      expect(diffInYears(date1, date2)).toBe(3);
    });

    test("incomplete year returns one less", () => {
      const date1 = new Date(2024, 3, 15); // April 2024
      const date2 = new Date(2021, 5, 15); // June 2021
      expect(diffInYears(date1, date2)).toBe(2); // Not yet 3 full years
    });

    test("same date returns 0", () => {
      const date = new Date(2024, 5, 15);
      expect(diffInYears(date, date)).toBe(0);
    });

    test("handles birthday-style calculation", () => {
      const date1 = new Date(2024, 5, 14); // June 14, 2024
      const date2 = new Date(2020, 5, 15); // June 15, 2020
      expect(diffInYears(date1, date2)).toBe(3); // Day before anniversary
    });
  });

  // ---------------------------------------------------------------------------
  // Business Days
  // ---------------------------------------------------------------------------
  describe("isWeekend", () => {
    test("Saturday is weekend", () => {
      const saturday = new Date(2024, 2, 16); // March 16, 2024 is Saturday
      expect(isWeekend(saturday)).toBe(true);
    });

    test("Sunday is weekend", () => {
      const sunday = new Date(2024, 2, 17); // March 17, 2024 is Sunday
      expect(isWeekend(sunday)).toBe(true);
    });

    test("Monday is not weekend", () => {
      const monday = new Date(2024, 2, 18);
      expect(isWeekend(monday)).toBe(false);
    });

    test("Friday is not weekend", () => {
      const friday = new Date(2024, 2, 15);
      expect(isWeekend(friday)).toBe(false);
    });
  });

  describe("addBusinessDays", () => {
    test("adds business days skipping weekends", () => {
      // Friday March 15, 2024
      const friday = new Date(2024, 2, 15);
      const result = addBusinessDays(friday, 1);
      // Should be Monday March 18
      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBe(18);
    });

    test("adds multiple business days", () => {
      // Monday March 11, 2024
      const monday = new Date(2024, 2, 11);
      const result = addBusinessDays(monday, 5);
      // Should be Monday March 18 (full work week)
      expect(result.getDate()).toBe(18);
    });

    test("subtracts business days with negative value", () => {
      // Monday March 18, 2024
      const monday = new Date(2024, 2, 18);
      const result = addBusinessDays(monday, -1);
      // Should be Friday March 15
      expect(result.getDay()).toBe(5); // Friday
      expect(result.getDate()).toBe(15);
    });

    test("adding 0 business days returns the same date", () => {
      const date = new Date(2024, 2, 15);
      const result = addBusinessDays(date, 0);
      expect(result.getDate()).toBe(date.getDate());
    });
  });

  describe("countBusinessDays", () => {
    test("counts business days in a full week", () => {
      // Monday March 11 to Friday March 15
      const monday = new Date(2024, 2, 11);
      const friday = new Date(2024, 2, 15);
      expect(countBusinessDays(monday, friday)).toBe(5);
    });

    test("counts business days including weekend days in range", () => {
      // Monday March 11 to Monday March 18
      const start = new Date(2024, 2, 11);
      const end = new Date(2024, 2, 18);
      expect(countBusinessDays(start, end)).toBe(6); // Mon-Fri + next Mon
    });

    test("same day returns 1 if it is a business day", () => {
      const monday = new Date(2024, 2, 11);
      expect(countBusinessDays(monday, monday)).toBe(1);
    });

    test("same day returns 0 if it is a weekend", () => {
      const saturday = new Date(2024, 2, 16);
      expect(countBusinessDays(saturday, saturday)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Effective Dating
  // ---------------------------------------------------------------------------
  describe("getEffectiveRecord", () => {
    const records = [
      { effectiveFrom: "2024-01-01", effectiveTo: "2024-03-31" },
      { effectiveFrom: "2024-04-01", effectiveTo: "2024-06-30" },
      { effectiveFrom: "2024-07-01", effectiveTo: null },
    ];

    test("finds record effective at given date", () => {
      const result = getEffectiveRecord(records, "2024-05-15");
      expect(result).not.toBeNull();
      expect(result!.effectiveFrom).toBe("2024-04-01");
    });

    test("finds current (open-ended) record for future date", () => {
      const result = getEffectiveRecord(records, "2024-09-01");
      expect(result).not.toBeNull();
      expect(result!.effectiveFrom).toBe("2024-07-01");
    });

    test("returns null if no record effective", () => {
      const result = getEffectiveRecord(records, "2023-06-15");
      expect(result).toBeNull();
    });

    test("returns null for empty array", () => {
      expect(getEffectiveRecord([], "2024-01-01")).toBeNull();
    });
  });

  describe("getEffectiveRecordsInRange", () => {
    const records = [
      { effectiveFrom: "2024-01-01", effectiveTo: "2024-03-31" },
      { effectiveFrom: "2024-04-01", effectiveTo: "2024-06-30" },
      { effectiveFrom: "2024-07-01", effectiveTo: null },
    ];

    test("returns records within the range", () => {
      const result = getEffectiveRecordsInRange(records, "2024-02-01", "2024-05-01");
      expect(result).toHaveLength(2);
    });

    test("returns all records for wide range", () => {
      const result = getEffectiveRecordsInRange(records, "2024-01-01", "2024-12-31");
      expect(result).toHaveLength(3);
    });

    test("returns empty for range before all records", () => {
      const result = getEffectiveRecordsInRange(records, "2023-01-01", "2023-12-31");
      expect(result).toHaveLength(0);
    });
  });
});
