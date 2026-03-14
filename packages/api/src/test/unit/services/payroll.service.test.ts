/**
 * Payroll Service Unit Tests
 *
 * Tests for UK payroll calculation business logic including:
 * - Monthly income tax (PAYE) calculation with tax codes
 * - Employee NI contributions
 * - Employer NI contributions
 * - Student loan repayments
 * - Payroll run status transitions
 *
 * NOTE: Business logic is extracted inline to avoid bun 1.3.3
 * segfault on Windows when importing modules with native postgres
 * dependencies.
 */

import { describe, it, expect } from "bun:test";

// =============================================================================
// Extracted Business Logic (from modules/payroll/service.ts)
// =============================================================================

/**
 * Calculate monthly income tax based on tax code (simplified PAYE).
 */
function calculateMonthlyIncomeTax(annualSalary: number, taxCode: string | null): number {
  if (!taxCode) return 0;

  const numericMatch = taxCode.match(/^([SK]?)(\d+)/);
  let personalAllowance = 12570;
  if (numericMatch) {
    personalAllowance = parseInt(numericMatch[2], 10) * 10;
  }

  if (taxCode === "BR") return (annualSalary * 0.20) / 12;
  if (taxCode === "D0") return (annualSalary * 0.40) / 12;
  if (taxCode === "D1") return (annualSalary * 0.45) / 12;
  if (taxCode === "NT") return 0;

  const isKCode = taxCode.startsWith("K");
  const taxableIncome = isKCode
    ? annualSalary + personalAllowance
    : Math.max(0, annualSalary - personalAllowance);

  let tax = 0;
  const bands = [
    { limit: 37700, rate: 0.20 },
    { limit: 125140, rate: 0.40 },
    { limit: Infinity, rate: 0.45 },
  ];

  let remaining = taxableIncome;
  for (const band of bands) {
    if (remaining <= 0) break;
    const taxableInBand = Math.min(remaining, band.limit);
    tax += taxableInBand * band.rate;
    remaining -= taxableInBand;
  }

  return Math.round((tax / 12) * 100) / 100;
}

/**
 * Calculate monthly employee NI contributions (simplified).
 */
function calculateMonthlyEmployeeNI(annualSalary: number, _niCategory: string | null): number {
  const monthlySalary = annualSalary / 12;
  const monthlyPrimaryThreshold = 1048;
  const monthlyUpperLimit = 4189;

  if (monthlySalary <= monthlyPrimaryThreshold) return 0;

  let ni = 0;
  const band1 = Math.min(monthlySalary, monthlyUpperLimit) - monthlyPrimaryThreshold;
  ni += Math.max(0, band1) * 0.08;

  if (monthlySalary > monthlyUpperLimit) {
    ni += (monthlySalary - monthlyUpperLimit) * 0.02;
  }

  return Math.round(ni * 100) / 100;
}

/**
 * Calculate monthly employer NI contributions (simplified).
 */
function calculateMonthlyEmployerNI(annualSalary: number): number {
  const monthlySalary = annualSalary / 12;
  const monthlySecondaryThreshold = 758;

  if (monthlySalary <= monthlySecondaryThreshold) return 0;

  const ni = (monthlySalary - monthlySecondaryThreshold) * 0.138;
  return Math.round(ni * 100) / 100;
}

/**
 * Calculate monthly student loan repayment (simplified).
 */
function calculateMonthlyStudentLoan(annualSalary: number, plan: string): number {
  if (plan === "none") return 0;

  const thresholds: Record<string, { threshold: number; rate: number }> = {
    plan1: { threshold: 22015, rate: 0.09 },
    plan2: { threshold: 27295, rate: 0.09 },
    plan4: { threshold: 27660, rate: 0.09 },
    plan5: { threshold: 25000, rate: 0.09 },
    postgrad: { threshold: 21000, rate: 0.06 },
  };

  const config = thresholds[plan];
  if (!config) return 0;

  if (annualSalary <= config.threshold) return 0;

  const repayment = ((annualSalary - config.threshold) * config.rate) / 12;
  return Math.round(repayment * 100) / 100;
}

/** Payroll run status transitions */
const PAYROLL_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["calculating"],
  calculating: ["review", "draft"],
  review: ["approved", "draft"],
  approved: ["submitted", "review"],
  submitted: ["paid"],
  paid: [],
};

function isValidTransition(from: string, to: string): boolean {
  const allowed = PAYROLL_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

// =============================================================================
// Tests
// =============================================================================

describe("PayrollService", () => {
  describe("calculateMonthlyIncomeTax", () => {
    it("returns 0 for null tax code", () => {
      expect(calculateMonthlyIncomeTax(30000, null)).toBe(0);
    });

    it("returns 0 for NT tax code", () => {
      expect(calculateMonthlyIncomeTax(50000, "NT")).toBe(0);
    });

    it("calculates basic rate for BR code", () => {
      const result = calculateMonthlyIncomeTax(30000, "BR");
      expect(result).toBeCloseTo(500, 0); // 30000 * 0.20 / 12 = 500
    });

    it("calculates higher rate for D0 code", () => {
      const result = calculateMonthlyIncomeTax(30000, "D0");
      expect(result).toBeCloseTo(1000, 0); // 30000 * 0.40 / 12 = 1000
    });

    it("calculates additional rate for D1 code", () => {
      const result = calculateMonthlyIncomeTax(30000, "D1");
      expect(result).toBeCloseTo(1125, 0); // 30000 * 0.45 / 12 = 1125
    });

    it("calculates standard tax with 1257L code", () => {
      const result = calculateMonthlyIncomeTax(30000, "1257L");
      // Taxable: 30000 - 12570 = 17430, tax: 17430 * 0.20 = 3486, monthly: 290.50
      expect(result).toBeCloseTo(290.5, 1);
    });

    it("handles salary below personal allowance", () => {
      const result = calculateMonthlyIncomeTax(10000, "1257L");
      expect(result).toBe(0);
    });

    it("calculates higher rate band correctly", () => {
      const result = calculateMonthlyIncomeTax(60000, "1257L");
      // Taxable: 60000 - 12570 = 47430
      // Basic: 37700 * 0.20 = 7540
      // Higher: (47430 - 37700) * 0.40 = 9730 * 0.40 = 3892
      // Total: 11432, monthly: 952.67
      expect(result).toBeCloseTo(952.67, 0);
    });

    it("handles K code (negative personal allowance)", () => {
      const result = calculateMonthlyIncomeTax(30000, "K100");
      // K code: taxable = 30000 + 1000 = 31000
      // 31000 * 0.20 = 6200, monthly: 516.67
      expect(result).toBeCloseTo(516.67, 0);
    });

    it("handles zero salary", () => {
      const result = calculateMonthlyIncomeTax(0, "1257L");
      expect(result).toBe(0);
    });
  });

  describe("calculateMonthlyEmployeeNI", () => {
    it("returns 0 for salary below primary threshold", () => {
      expect(calculateMonthlyEmployeeNI(10000, "A")).toBe(0);
    });

    it("calculates NI for salary in main band", () => {
      const result = calculateMonthlyEmployeeNI(30000, "A");
      // Monthly: 2500, PT: 1048, band1: 2500 - 1048 = 1452
      // NI: 1452 * 0.08 = 116.16
      expect(result).toBeCloseTo(116.16, 0);
    });

    it("calculates NI above upper earnings limit", () => {
      const result = calculateMonthlyEmployeeNI(60000, "A");
      // Monthly: 5000, PT: 1048, UEL: 4189
      // Band1: (4189 - 1048) * 0.08 = 3141 * 0.08 = 251.28
      // Band2: (5000 - 4189) * 0.02 = 811 * 0.02 = 16.22
      // Total: 267.50
      expect(result).toBeCloseTo(267.50, 0);
    });

    it("returns 0 for zero salary", () => {
      expect(calculateMonthlyEmployeeNI(0, "A")).toBe(0);
    });
  });

  describe("calculateMonthlyEmployerNI", () => {
    it("returns 0 for salary below secondary threshold", () => {
      expect(calculateMonthlyEmployerNI(8000)).toBe(0);
    });

    it("calculates employer NI correctly", () => {
      const result = calculateMonthlyEmployerNI(30000);
      // Monthly: 2500, ST: 758
      // (2500 - 758) * 0.138 = 1742 * 0.138 = 240.40
      expect(result).toBeCloseTo(240.40, 0);
    });

    it("returns 0 for zero salary", () => {
      expect(calculateMonthlyEmployerNI(0)).toBe(0);
    });
  });

  describe("calculateMonthlyStudentLoan", () => {
    it("returns 0 for plan 'none'", () => {
      expect(calculateMonthlyStudentLoan(50000, "none")).toBe(0);
    });

    it("returns 0 for unknown plan", () => {
      expect(calculateMonthlyStudentLoan(50000, "unknown")).toBe(0);
    });

    it("returns 0 for salary below plan1 threshold", () => {
      expect(calculateMonthlyStudentLoan(20000, "plan1")).toBe(0);
    });

    it("calculates plan1 repayment correctly", () => {
      const result = calculateMonthlyStudentLoan(30000, "plan1");
      // (30000 - 22015) * 0.09 / 12 = 7985 * 0.09 / 12 = 59.89
      expect(result).toBeCloseTo(59.89, 0);
    });

    it("calculates plan2 repayment correctly", () => {
      const result = calculateMonthlyStudentLoan(35000, "plan2");
      // (35000 - 27295) * 0.09 / 12 = 7705 * 0.09 / 12 = 57.79
      expect(result).toBeCloseTo(57.79, 0);
    });

    it("calculates postgrad loan repayment correctly", () => {
      const result = calculateMonthlyStudentLoan(30000, "postgrad");
      // (30000 - 21000) * 0.06 / 12 = 9000 * 0.06 / 12 = 45.00
      expect(result).toBeCloseTo(45.0, 0);
    });

    it("returns 0 for salary at exact threshold", () => {
      expect(calculateMonthlyStudentLoan(22015, "plan1")).toBe(0);
    });
  });

  describe("Payroll Status Transitions", () => {
    it("allows draft -> calculating", () => {
      expect(isValidTransition("draft", "calculating")).toBe(true);
    });

    it("disallows draft -> approved", () => {
      expect(isValidTransition("draft", "approved")).toBe(false);
    });

    it("allows calculating -> review", () => {
      expect(isValidTransition("calculating", "review")).toBe(true);
    });

    it("allows calculating -> draft (reset)", () => {
      expect(isValidTransition("calculating", "draft")).toBe(true);
    });

    it("allows review -> approved", () => {
      expect(isValidTransition("review", "approved")).toBe(true);
    });

    it("allows approved -> submitted", () => {
      expect(isValidTransition("approved", "submitted")).toBe(true);
    });

    it("allows submitted -> paid", () => {
      expect(isValidTransition("submitted", "paid")).toBe(true);
    });

    it("disallows paid -> any", () => {
      expect(isValidTransition("paid", "draft")).toBe(false);
      expect(isValidTransition("paid", "submitted")).toBe(false);
    });

    it("returns false for unknown status", () => {
      expect(isValidTransition("unknown", "draft")).toBe(false);
    });
  });
});
