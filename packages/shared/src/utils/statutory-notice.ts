/**
 * Statutory Notice Period Calculator
 *
 * UK Employment Rights Act 1996, Section 86 — Minimum notice periods.
 *
 * Employer-to-employee statutory minimum notice:
 *   - Less than 1 month continuous service: no entitlement
 *   - 1 month to < 2 years: 1 week
 *   - 2+ complete years: 1 week per year, up to a maximum of 12 weeks
 *
 * Employee-to-employer statutory minimum notice:
 *   - 1 week (once 1 month service is reached), regardless of length of service
 *
 * Contractual notice periods may exceed the statutory minimum but must not
 * fall below it. If a contract specifies a shorter period, the statutory
 * minimum applies automatically.
 */

// =============================================================================
// Types
// =============================================================================

export interface StatutoryNoticeInput {
  /** Employee's start / hire date */
  hireDate: Date | string;
  /** Reference date for calculation (defaults to today). Use termination date if known. */
  referenceDate?: Date | string;
  /** Contractual notice period in days, if set on the employment contract */
  contractualNoticeDays?: number | null;
}

export interface StatutoryNoticeResult {
  /** Complete years of continuous service */
  yearsOfService: number;
  /** Complete months of continuous service */
  monthsOfService: number;
  /** Statutory minimum notice in weeks (employer to employee) */
  statutoryNoticeWeeks: number;
  /** Statutory minimum notice in calendar days (weeks * 7) */
  statutoryNoticeDays: number;
  /** Contractual notice in days, or null if not set */
  contractualNoticeDays: number | null;
  /** Whether the contractual notice meets or exceeds the statutory minimum */
  isCompliant: boolean;
  /** Human-readable compliance explanation */
  complianceMessage: string;
}

// =============================================================================
// Calculation
// =============================================================================

/**
 * Calculate the statutory minimum notice period under UK Employment Rights
 * Act 1996, s.86.
 *
 * @param input - Hire date, optional reference date, and optional contractual notice
 * @returns Statutory notice result with compliance status
 *
 * @example
 * ```ts
 * const result = calculateStatutoryNoticePeriod({
 *   hireDate: '2020-01-15',
 *   contractualNoticeDays: 30,
 * });
 * // result.statutoryNoticeWeeks === 6  (if ~6 years service)
 * // result.isCompliant === false       (30 < 42)
 * ```
 */
export function calculateStatutoryNoticePeriod(
  input: StatutoryNoticeInput
): StatutoryNoticeResult {
  const hireDate =
    typeof input.hireDate === "string"
      ? new Date(input.hireDate)
      : input.hireDate;

  const referenceDate = input.referenceDate
    ? typeof input.referenceDate === "string"
      ? new Date(input.referenceDate)
      : input.referenceDate
    : new Date();

  // -------------------------------------------------------------------------
  // Service length
  // -------------------------------------------------------------------------
  const diffMs = referenceDate.getTime() - hireDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const monthsOfService = Math.floor(diffDays / 30.44); // average days per month
  const yearsOfService = Math.floor(diffDays / 365.25);

  // -------------------------------------------------------------------------
  // Statutory notice (employer → employee)
  // -------------------------------------------------------------------------
  let statutoryNoticeWeeks: number;

  if (monthsOfService < 1) {
    // Less than 1 month: no statutory entitlement
    statutoryNoticeWeeks = 0;
  } else if (yearsOfService < 2) {
    // 1 month to under 2 years: 1 week
    statutoryNoticeWeeks = 1;
  } else {
    // 2+ years: 1 week per year, capped at 12
    statutoryNoticeWeeks = Math.min(yearsOfService, 12);
  }

  const statutoryNoticeDays = statutoryNoticeWeeks * 7;

  // -------------------------------------------------------------------------
  // Contractual compliance
  // -------------------------------------------------------------------------
  const contractualNoticeDays = input.contractualNoticeDays ?? null;

  const isCompliant =
    contractualNoticeDays === null
      ? statutoryNoticeWeeks === 0 // acceptable only if no statutory entitlement
      : contractualNoticeDays >= statutoryNoticeDays;

  let complianceMessage: string;

  if (monthsOfService < 1) {
    complianceMessage =
      "Employee has less than 1 month service — no statutory notice entitlement yet.";
  } else if (contractualNoticeDays === null) {
    complianceMessage = `No contractual notice period set. Statutory minimum is ${statutoryNoticeWeeks} week(s).`;
  } else if (isCompliant) {
    complianceMessage = `Contractual notice (${contractualNoticeDays} days) meets or exceeds statutory minimum (${statutoryNoticeDays} days / ${statutoryNoticeWeeks} weeks).`;
  } else {
    complianceMessage = `NON-COMPLIANT: Contractual notice (${contractualNoticeDays} days) is below statutory minimum (${statutoryNoticeDays} days / ${statutoryNoticeWeeks} weeks). Update the employment contract.`;
  }

  return {
    yearsOfService,
    monthsOfService,
    statutoryNoticeWeeks,
    statutoryNoticeDays,
    contractualNoticeDays,
    isCompliant,
    complianceMessage,
  };
}
