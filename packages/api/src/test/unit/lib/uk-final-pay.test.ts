/**
 * Unit tests for UK Final Pay Calculation.
 *
 * Tests the pure calculation function (calculateProRataBonus)
 * without requiring database connectivity. The database-backed
 * calculateFinalPay function would be tested via integration tests.
 */

import { describe, test, expect } from "bun:test";
import {
  calculateProRataBonus,
  PILON_TAX_FREE_THRESHOLD,
} from "../../../lib/uk-final-pay";

// =============================================================================
// calculateProRataBonus
// =============================================================================

describe("calculateProRataBonus", () => {
  test("calculates full-year pro-rata correctly", () => {
    const result = calculateProRataBonus(
      12000, // 12k annual bonus
      "2025-01-01",
      "2025-12-31",
      "2025-06-30" // Terminated mid-year
    );

    // 181 days out of 365
    expect(result.daysWorked).toBe(181);
    expect(result.totalDays).toBe(365);
    expect(result.proRataAmount).toBeGreaterThan(5900);
    expect(result.proRataAmount).toBeLessThan(6100);
  });

  test("returns full bonus when termination is at end of period", () => {
    const result = calculateProRataBonus(
      10000,
      "2025-01-01",
      "2025-12-31",
      "2025-12-31"
    );

    expect(result.daysWorked).toBe(365);
    expect(result.totalDays).toBe(365);
    expect(result.proRataAmount).toBe(10000);
  });

  test("returns zero when termination is before bonus period", () => {
    const result = calculateProRataBonus(
      10000,
      "2025-04-01",
      "2026-03-31",
      "2025-03-15" // Terminated before period starts
    );

    expect(result.proRataAmount).toBe(0);
    expect(result.daysWorked).toBe(0);
  });

  test("handles termination at start of bonus period", () => {
    const result = calculateProRataBonus(
      10000,
      "2025-01-01",
      "2025-12-31",
      "2025-01-01"
    );

    expect(result.daysWorked).toBe(1);
    expect(result.totalDays).toBe(365);
    expect(result.proRataAmount).toBeGreaterThan(27);
    expect(result.proRataAmount).toBeLessThan(28);
  });

  test("handles fiscal year bonus period (Apr-Mar)", () => {
    const result = calculateProRataBonus(
      6000,
      "2025-04-01",
      "2026-03-31",
      "2025-09-30" // Terminated 183 days into fiscal year
    );

    expect(result.daysWorked).toBe(183);
    expect(result.totalDays).toBe(366); // 2025-04-01 to 2026-03-31
    expect(result.proRataAmount).toBeGreaterThan(2990);
    expect(result.proRataAmount).toBeLessThan(3010);
  });

  test("handles zero bonus amount", () => {
    const result = calculateProRataBonus(
      0,
      "2025-01-01",
      "2025-12-31",
      "2025-06-30"
    );

    expect(result.proRataAmount).toBe(0);
    expect(result.daysWorked).toBe(181);
  });

  test("rounds to 2 decimal places", () => {
    const result = calculateProRataBonus(
      1000,
      "2025-01-01",
      "2025-12-31",
      "2025-02-15"
    );

    // Check that the result has at most 2 decimal places
    const parts = result.proRataAmount.toString().split(".");
    if (parts.length > 1) {
      expect(parts[1].length).toBeLessThanOrEqual(2);
    }
  });

  test("handles termination after bonus period end (capped)", () => {
    const result = calculateProRataBonus(
      10000,
      "2025-01-01",
      "2025-06-30",
      "2025-12-31" // Terminated after period ends
    );

    // Should be capped at the full bonus amount
    expect(result.daysWorked).toBe(181); // Jan 1 to Jun 30
    expect(result.totalDays).toBe(181);
    expect(result.proRataAmount).toBe(10000);
  });
});

// =============================================================================
// PILON Constants
// =============================================================================

describe("PILON_TAX_FREE_THRESHOLD", () => {
  test("is set to GBP 30,000 per s401 ITEPA 2003", () => {
    expect(PILON_TAX_FREE_THRESHOLD).toBe(30000);
  });
});
