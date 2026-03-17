/**
 * Statutory Notice Period Calculator — Unit Tests
 *
 * Covers UK Employment Rights Act 1996, s.86 requirements.
 */

import { describe, it, expect } from "bun:test";
import { calculateStatutoryNoticePeriod } from "../../utils/statutory-notice";

describe("calculateStatutoryNoticePeriod", () => {
  // -----------------------------------------------------------------------
  // Service length thresholds
  // -----------------------------------------------------------------------

  it("returns 0 weeks for < 1 month service", () => {
    const result = calculateStatutoryNoticePeriod({
      hireDate: "2025-12-01",
      referenceDate: "2025-12-15",
    });
    expect(result.statutoryNoticeWeeks).toBe(0);
    expect(result.statutoryNoticeDays).toBe(0);
    expect(result.monthsOfService).toBe(0);
  });

  it("returns 1 week for 1 month service", () => {
    const result = calculateStatutoryNoticePeriod({
      hireDate: "2025-01-01",
      referenceDate: "2025-02-15",
    });
    expect(result.statutoryNoticeWeeks).toBe(1);
    expect(result.statutoryNoticeDays).toBe(7);
    expect(result.monthsOfService).toBeGreaterThanOrEqual(1);
  });

  it("returns 1 week for ~1 year service (< 2 years)", () => {
    const result = calculateStatutoryNoticePeriod({
      hireDate: "2024-06-01",
      referenceDate: "2025-06-15",
    });
    expect(result.statutoryNoticeWeeks).toBe(1);
    expect(result.yearsOfService).toBe(1);
  });

  it("returns 2 weeks for 2 years service", () => {
    const result = calculateStatutoryNoticePeriod({
      hireDate: "2023-01-01",
      referenceDate: "2025-01-15",
    });
    expect(result.statutoryNoticeWeeks).toBe(2);
    expect(result.statutoryNoticeDays).toBe(14);
    expect(result.yearsOfService).toBe(2);
  });

  it("returns 5 weeks for 5 years service", () => {
    const result = calculateStatutoryNoticePeriod({
      hireDate: "2020-01-01",
      referenceDate: "2025-06-01",
    });
    expect(result.statutoryNoticeWeeks).toBe(5);
    expect(result.statutoryNoticeDays).toBe(35);
  });

  it("caps at 12 weeks for 12+ years service", () => {
    const result = calculateStatutoryNoticePeriod({
      hireDate: "2010-01-01",
      referenceDate: "2025-06-01",
    });
    expect(result.statutoryNoticeWeeks).toBe(12);
    expect(result.statutoryNoticeDays).toBe(84);
  });

  it("caps at 12 weeks for 20 years service", () => {
    const result = calculateStatutoryNoticePeriod({
      hireDate: "2005-01-01",
      referenceDate: "2025-06-01",
    });
    expect(result.statutoryNoticeWeeks).toBe(12);
    expect(result.statutoryNoticeDays).toBe(84);
    expect(result.yearsOfService).toBeGreaterThanOrEqual(20);
  });

  // -----------------------------------------------------------------------
  // Compliance checks
  // -----------------------------------------------------------------------

  it("is compliant when no contract and < 1 month service", () => {
    const result = calculateStatutoryNoticePeriod({
      hireDate: "2025-12-01",
      referenceDate: "2025-12-10",
      contractualNoticeDays: null,
    });
    expect(result.isCompliant).toBe(true);
    expect(result.complianceMessage).toContain("less than 1 month");
  });

  it("is non-compliant when no contract and >= 1 month service", () => {
    const result = calculateStatutoryNoticePeriod({
      hireDate: "2024-01-01",
      referenceDate: "2025-06-01",
      contractualNoticeDays: null,
    });
    expect(result.isCompliant).toBe(false);
    expect(result.complianceMessage).toContain("No contractual notice");
  });

  it("is compliant when contractual >= statutory", () => {
    const result = calculateStatutoryNoticePeriod({
      hireDate: "2022-01-01",
      referenceDate: "2025-01-15",
      contractualNoticeDays: 30,
    });
    // 3 years = 3 weeks = 21 days; 30 >= 21
    expect(result.statutoryNoticeWeeks).toBe(3);
    expect(result.isCompliant).toBe(true);
    expect(result.complianceMessage).toContain("meets or exceeds");
  });

  it("is non-compliant when contractual < statutory", () => {
    const result = calculateStatutoryNoticePeriod({
      hireDate: "2015-01-01",
      referenceDate: "2025-06-01",
      contractualNoticeDays: 14,
    });
    // 10 years = 10 weeks = 70 days; 14 < 70
    expect(result.statutoryNoticeWeeks).toBe(10);
    expect(result.isCompliant).toBe(false);
    expect(result.complianceMessage).toContain("NON-COMPLIANT");
  });

  it("is compliant when contractual exactly equals statutory", () => {
    const result = calculateStatutoryNoticePeriod({
      hireDate: "2023-01-01",
      referenceDate: "2025-01-15",
      contractualNoticeDays: 14,
    });
    // 2 years = 2 weeks = 14 days; 14 >= 14
    expect(result.statutoryNoticeWeeks).toBe(2);
    expect(result.isCompliant).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Input handling
  // -----------------------------------------------------------------------

  it("accepts Date objects as well as strings", () => {
    const result = calculateStatutoryNoticePeriod({
      hireDate: new Date("2020-01-01"),
      referenceDate: new Date("2025-06-01"),
    });
    expect(result.statutoryNoticeWeeks).toBe(5);
  });

  it("defaults referenceDate to today when not provided", () => {
    const hireDate = new Date();
    hireDate.setFullYear(hireDate.getFullYear() - 3);
    const result = calculateStatutoryNoticePeriod({
      hireDate,
    });
    expect(result.statutoryNoticeWeeks).toBe(3);
  });
});
