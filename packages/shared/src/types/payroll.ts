/**
 * Payroll Types
 *
 * Type definitions for payroll processing, tax codes, NI categories,
 * and related UK payroll data structures.
 */

import type {
  UUID,
  DateString,
  TimestampString,
  TenantScopedEntity,
  EffectiveDated,
} from "./common";

// =============================================================================
// Tax Code Types
// =============================================================================

/**
 * Source of the tax code assignment.
 * - hmrc: Direct notification from HMRC (P6/P9)
 * - manual: Manually entered by payroll administrator
 * - p45: From a P45 provided by previous employer
 * - p46: Legacy new-starter declaration (pre-2013)
 * - starter_declaration: HMRC Starter Checklist (replaced P46)
 */
export type TaxCodeSource =
  | "hmrc"
  | "manual"
  | "p45"
  | "p46"
  | "starter_declaration";

/**
 * Tax basis for PAYE calculation.
 * - cumulative: Standard cumulative basis (tax calculated based on year-to-date earnings)
 * - week1_month1: Non-cumulative basis (each pay period treated independently)
 */
export type TaxBasis = "cumulative" | "week1_month1";

/**
 * Employee tax code record with effective dating.
 * Represents a UK HMRC tax code assignment for an employee.
 */
export interface EmployeeTaxCode extends TenantScopedEntity, EffectiveDated {
  /** The employee this tax code is assigned to */
  employeeId: UUID;
  /** HMRC tax code (e.g. 1257L, BR, D0, K100, S1257L, C1257L) */
  taxCode: string;
  /** Whether tax is calculated on a cumulative basis */
  isCumulative: boolean;
  /** Whether tax is calculated on week 1/month 1 (non-cumulative) basis */
  week1Month1: boolean;
  /** Source of the tax code assignment */
  source: TaxCodeSource;
  /** Optional notes for audit context */
  notes?: string | null;
}

// =============================================================================
// Tax Code Validation
// =============================================================================

/**
 * UK HMRC tax code format patterns.
 * Tax codes follow specific formats depending on the tax regime:
 *
 * England/Wales/NI:
 *   - Numeric + suffix letter: 1257L, 500T, 100P
 *   - K codes (underpayments): K100, K500
 *   - Fixed rate codes: BR, D0, D1, NT, 0T
 *
 * Scotland (S prefix):
 *   - S1257L, SBR, SD0, SD1, SD2, S0T, SK100
 *
 * Wales (C prefix):
 *   - C1257L, CBR, CD0, CD1, C0T, CK100
 *
 * Emergency/week1-month1 suffixes: W1, M1, X (not stored in code, stored as flag)
 */
export const UK_TAX_CODE_PATTERN =
  /^(S|C)?(([0-9]{1,4}[LMNPTKY])|([0-9]{1,4})|K[0-9]{1,4}|BR|D[0-2]|NT|0T|SD[0-2]|SBR|S0T|CBR|CD[0-1]|C0T)$/;

/**
 * Valid suffix letters for standard UK tax codes.
 */
export const TAX_CODE_SUFFIX_LETTERS = [
  "L", // Standard personal allowance
  "M", // Marriage Allowance recipient (received 10% of partner's allowance)
  "N", // Marriage Allowance transferor (transferred 10% to partner)
  "T", // HMRC needs to review items (no automatic adjustments)
  "P", // Aged 65-74 (legacy, pre-2013)
  "K", // Additions to income exceed allowances
  "Y", // Aged 75+ (legacy, pre-2013)
] as const;

/**
 * Fixed-rate tax codes that have no numeric component.
 */
export const FIXED_RATE_TAX_CODES = [
  "BR",  // Basic rate (20%)
  "D0",  // Higher rate (40%)
  "D1",  // Additional rate (45%)
  "D2",  // Scottish top rate (only with S prefix)
  "NT",  // No tax deducted
  "0T",  // No personal allowance
] as const;

/**
 * Country/region prefixes for UK tax codes.
 */
export const TAX_CODE_PREFIXES = {
  /** No prefix: England, Wales (pre-devolution), or Northern Ireland */
  ENGLAND_NI: "",
  /** S prefix: Scottish Income Tax */
  SCOTLAND: "S",
  /** C prefix: Welsh Rate of Income Tax */
  WALES: "C",
} as const;

// =============================================================================
// Payroll Run Types
// =============================================================================

/** Payroll run status lifecycle */
export type PayrollRunStatus =
  | "draft"
  | "calculating"
  | "review"
  | "approved"
  | "submitted"
  | "paid";

/** Type of payroll run */
export type PayrollRunType = "monthly" | "weekly" | "supplemental";

/** UK student loan repayment plan types */
export type StudentLoanPlan =
  | "none"
  | "plan1"
  | "plan2"
  | "plan4"
  | "plan5"
  | "postgrad";

/** Employee payment method */
export type PaymentMethod = "bacs" | "faster_payments" | "cheque" | "cash";

// =============================================================================
// NI Category Types
// =============================================================================

/**
 * HMRC National Insurance category letters.
 * Each letter determines the NI contribution rates for both employee and employer.
 */
export const NI_CATEGORIES = [
  "A", // Standard employee (most common)
  "B", // Married women reduced rate (legacy)
  "C", // Over state pension age
  "F", // Freeport employee
  "H", // Apprentice under 25
  "I", // Married women reduced rate in freeport
  "J", // Deferred NI (multiple jobs)
  "L", // Deferred freeport
  "M", // Under 21
  "S", // Over state pension age in freeport
  "V", // Veterans (first 12 months of civilian employment)
  "Z", // Under 21, deferred NI
] as const;

export type NICategory = (typeof NI_CATEGORIES)[number];
