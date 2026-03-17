/**
 * Unit tests for the UK Holiday Pay 52-week reference period calculation.
 *
 * Tests the pure calculation function (calculateHolidayPayFromEarnings)
 * without requiring database connectivity. The database-backed
 * calculateHolidayPay function is tested via integration tests.
 */

import { describe, test, expect } from "bun:test";
import {
  calculateHolidayPayFromEarnings,
  REFERENCE_WEEKS,
  MAX_LOOKBACK_WEEKS,
  STANDARD_DAYS_PER_WEEK,
  type WeeklyEarnings,
} from "../../../lib/uk-holiday-pay";

// =============================================================================
// Helper to generate weekly earnings data
// =============================================================================

function makeWeek(
  weekStart: string,
  totalEarnings: number,
  overrides?: Partial<WeeklyEarnings>
): WeeklyEarnings {
  return {
    weekStart,
    weekEnd: weekStart, // Simplified for tests
    basicPay: totalEarnings * 0.7,
    overtimePay: totalEarnings * 0.2,
    commissionPay: 0,
    bonusPay: totalEarnings * 0.1,
    totalEarnings,
    ...overrides,
  };
}

function generateWeeks(
  count: number,
  weeklyPay: number,
  startDate: string = "2026-01-05"
): WeeklyEarnings[] {
  const weeks: WeeklyEarnings[] = [];
  const start = new Date(startDate);
  for (let i = 0; i < count; i++) {
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() - i * 7);
    weeks.push(makeWeek(weekStart.toISOString().split("T")[0], weeklyPay));
  }
  return weeks;
}

// =============================================================================
// calculateHolidayPayFromEarnings
// =============================================================================

describe("calculateHolidayPayFromEarnings", () => {
  test("calculates average from exactly 52 paid weeks", () => {
    const weeks = generateWeeks(52, 500);
    const result = calculateHolidayPayFromEarnings(weeks, 5, "2026-03-01");

    expect(result.averageWeeklyPay).toBe(500);
    expect(result.dailyHolidayPayRate).toBe(100);
    expect(result.weeksConsidered).toBe(52);
    expect(result.weeksSkipped).toBe(0);
    expect(result.isPartialReference).toBe(false);
    expect(result.contractedDaysPerWeek).toBe(5);
  });

  test("calculates average from variable earnings", () => {
    const weeks: WeeklyEarnings[] = [];
    // 26 weeks at 400, 26 weeks at 600
    for (let i = 0; i < 26; i++) {
      weeks.push(makeWeek(`2026-01-${String(5 + i).padStart(2, "0")}`, 400));
    }
    for (let i = 0; i < 26; i++) {
      weeks.push(makeWeek(`2025-07-${String(1 + i).padStart(2, "0")}`, 600));
    }

    const result = calculateHolidayPayFromEarnings(weeks, 5, "2026-03-01");

    expect(result.averageWeeklyPay).toBe(500); // (400*26 + 600*26) / 52
    expect(result.weeksConsidered).toBe(52);
  });

  test("skips unpaid weeks and extends lookback", () => {
    const weeks: WeeklyEarnings[] = [];
    // 30 paid weeks, 10 unpaid, 22 more paid = 52 paid + 10 skipped
    for (let i = 0; i < 30; i++) {
      weeks.push(makeWeek(`week-${i}`, 500));
    }
    for (let i = 0; i < 10; i++) {
      weeks.push(makeWeek(`unpaid-${i}`, 0)); // Unpaid weeks
    }
    for (let i = 0; i < 22; i++) {
      weeks.push(makeWeek(`older-${i}`, 500));
    }

    const result = calculateHolidayPayFromEarnings(weeks, 5, "2026-03-01");

    expect(result.weeksConsidered).toBe(52);
    expect(result.weeksSkipped).toBe(10);
    expect(result.totalWeeksScanned).toBe(62); // 30 + 10 + 22
    expect(result.averageWeeklyPay).toBe(500);
    expect(result.isPartialReference).toBe(false);
  });

  test("handles fewer than 52 paid weeks (new employee)", () => {
    const weeks = generateWeeks(20, 600);
    const result = calculateHolidayPayFromEarnings(weeks, 5, "2026-03-01");

    expect(result.weeksConsidered).toBe(20);
    expect(result.isPartialReference).toBe(true);
    expect(result.averageWeeklyPay).toBe(600);
    expect(result.dailyHolidayPayRate).toBe(120);
  });

  test("handles empty earnings array", () => {
    const result = calculateHolidayPayFromEarnings([], 5, "2026-03-01");

    expect(result.averageWeeklyPay).toBe(0);
    expect(result.dailyHolidayPayRate).toBe(0);
    expect(result.weeksConsidered).toBe(0);
    expect(result.isPartialReference).toBe(true);
  });

  test("handles all unpaid weeks", () => {
    const weeks = generateWeeks(60, 0);
    const result = calculateHolidayPayFromEarnings(weeks, 5, "2026-03-01");

    expect(result.averageWeeklyPay).toBe(0);
    expect(result.weeksConsidered).toBe(0);
    expect(result.weeksSkipped).toBe(60);
  });

  test("uses part-time contracted days for daily rate", () => {
    const weeks = generateWeeks(52, 300);
    const result = calculateHolidayPayFromEarnings(weeks, 3, "2026-03-01");

    expect(result.averageWeeklyPay).toBe(300);
    expect(result.dailyHolidayPayRate).toBe(100); // 300 / 3
    expect(result.contractedDaysPerWeek).toBe(3);
  });

  test("defaults to 5 days per week when contracted days is 0", () => {
    const weeks = generateWeeks(52, 500);
    const result = calculateHolidayPayFromEarnings(weeks, 0, "2026-03-01");

    expect(result.contractedDaysPerWeek).toBe(STANDARD_DAYS_PER_WEEK);
    expect(result.dailyHolidayPayRate).toBe(100); // 500 / 5
  });

  test("respects 104-week maximum lookback", () => {
    // Create 120 weeks of data but only 40 are paid
    const weeks: WeeklyEarnings[] = [];
    for (let i = 0; i < 120; i++) {
      if (i % 3 === 0) {
        weeks.push(makeWeek(`week-${i}`, 600));
      } else {
        weeks.push(makeWeek(`week-${i}`, 0)); // unpaid
      }
    }

    const result = calculateHolidayPayFromEarnings(weeks, 5, "2026-03-01");

    // Should scan up to 104 weeks max
    expect(result.totalWeeksScanned).toBeLessThanOrEqual(MAX_LOOKBACK_WEEKS);
  });

  test("stops at exactly 52 paid weeks even with more data", () => {
    const weeks = generateWeeks(80, 500);
    const result = calculateHolidayPayFromEarnings(weeks, 5, "2026-03-01");

    expect(result.weeksConsidered).toBe(REFERENCE_WEEKS);
    expect(result.weeklyBreakdown.length).toBe(52);
  });

  test("includes overtime, commission, and bonuses in total", () => {
    const weeks: WeeklyEarnings[] = [];
    for (let i = 0; i < 52; i++) {
      weeks.push({
        weekStart: `week-${i}`,
        weekEnd: `week-${i}`,
        basicPay: 350,
        overtimePay: 100,
        commissionPay: 30,
        bonusPay: 20,
        totalEarnings: 500,
      });
    }

    const result = calculateHolidayPayFromEarnings(weeks, 5, "2026-03-01");

    expect(result.averageWeeklyPay).toBe(500);
    // The weekly breakdown should contain all components
    expect(result.weeklyBreakdown[0].overtimePay).toBe(100);
    expect(result.weeklyBreakdown[0].bonusPay).toBe(20);
  });

  test("rounds to 2 decimal places", () => {
    // 3 weeks at 333.33 => average 333.33
    const weeks = [
      makeWeek("w1", 333.33),
      makeWeek("w2", 333.33),
      makeWeek("w3", 333.34),
    ];

    const result = calculateHolidayPayFromEarnings(weeks, 5, "2026-03-01");

    // Should be rounded to 2 decimal places
    const decimalPlaces = result.averageWeeklyPay.toString().split(".")[1]?.length || 0;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });

  test("null earnings entries are treated as unpaid", () => {
    const weeks: WeeklyEarnings[] = [
      makeWeek("w1", 500),
      makeWeek("w2", -10), // negative treated as unpaid
      makeWeek("w3", 500),
    ];

    const result = calculateHolidayPayFromEarnings(weeks, 5, "2026-03-01");

    expect(result.weeksConsidered).toBe(2);
    expect(result.weeksSkipped).toBe(1);
    expect(result.averageWeeklyPay).toBe(500);
  });
});
