/**
 * UK Leave Carryover Rules (EU/Additional Statutory Split)
 *
 * Implements the carryover rules under the Working Time Regulations 1998
 * as interpreted by UK case law post-Brexit. UK statutory holiday entitlement
 * has two distinct components:
 *
 * 1. EU-derived leave (Regulation 13): 4 weeks (20 days for full-time).
 *    - Normally cannot be carried over to the next leave year.
 *    - MUST be carried over when the employee was unable to take the leave
 *      due to sickness, maternity, paternity, adoption, shared parental
 *      leave, or other family-related leave.
 *    - Per NHS Leeds v Larner [2012] and Plumb v Duncan Print Group [2015],
 *      this carry over is allowed for up to 18 months after the end of the
 *      leave year in which it was accrued (though this implementation uses
 *      the leave year immediately following).
 *
 * 2. Additional statutory leave (Regulation 13A): 1.6 weeks (8 days for
 *    full-time). Added by the Working Time (Amendment) Regulations 2007.
 *    - Strict use-it-or-lose-it by default.
 *    - CAN be carried over by contractual agreement between employer
 *      and employee (often found in employment contracts or workplace
 *      agreements/handbooks).
 *
 * References:
 * - Working Time Regulations 1998, regs 13, 13A, 15A
 * - Working Time (Coronavirus) (Amendment) Regulations 2020 (SI 2020/365)
 * - NHS Leeds v Larner [2012] ICR 1389
 * - Plumb v Duncan Print Group [2015] IRLR 711
 * - Sood Enterprises v Healy [2013] IRLR 865
 */

import type { DatabaseClient } from "../plugins/db";
import type { TenantContext } from "../types/service-result";

// =============================================================================
// Constants
// =============================================================================

/** EU Working Time Directive minimum: 4 weeks */
export const EU_MINIMUM_WEEKS = 4;

/** Additional UK statutory leave: 1.6 weeks (regs 13A) */
export const ADDITIONAL_STATUTORY_WEEKS = 1.6;

/** Total UK statutory: 5.6 weeks */
export const TOTAL_STATUTORY_WEEKS = EU_MINIMUM_WEEKS + ADDITIONAL_STATUTORY_WEEKS;

/** Standard full-time working days per week */
export const STANDARD_DAYS_PER_WEEK = 5;

// =============================================================================
// Types
// =============================================================================

/**
 * Reasons that allow protected carryover of the EU-derived 4-week leave
 * entitlement.
 */
export const PROTECTED_CARRYOVER_REASONS = [
  "sickness",
  "maternity",
  "paternity",
  "adoption",
  "shared_parental",
  "family_related",
] as const;

export type ProtectedCarryoverReason = (typeof PROTECTED_CARRYOVER_REASONS)[number];

/**
 * Input parameters for calculating carryover.
 */
export interface CarryoverInput {
  /** Total unused leave days at the end of the leave year */
  unusedDays: number;
  /** Employee's contracted working days per week */
  contractedDaysPerWeek: number;
  /** The leave year that is ending (e.g. 2025 for the year ending 31 Mar 2026) */
  leaveYear: number;
  /**
   * If the employee was prevented from taking leave for a protected reason,
   * specify it here to enable EU portion carryover.
   */
  protectedReason?: ProtectedCarryoverReason | null;
  /**
   * Number of days the employee was unable to take due to the protected
   * reason (e.g. sick days overlapping with planned annual leave). If not
   * specified, assumes all unused EU days are eligible for protected carryover.
   */
  protectedDaysUntaken?: number;
  /**
   * Maximum contractual carryover days allowed by the employer's policy.
   * This allows the additional 1.6 weeks to be carried over by agreement.
   * Set to 0 to enforce strict use-it-or-lose-it on the additional portion.
   */
  maxContractualCarryover: number;
  /**
   * Any additional (above-statutory) contractual leave days the employee
   * has. These are subject only to the contractual carryover limit.
   */
  contractualLeaveDays?: number;
  /**
   * The employee's total annual entitlement (statutory + contractual).
   * Used to split unused days into EU, additional, and contractual portions.
   */
  totalAnnualEntitlement: number;
}

/**
 * Detailed breakdown of carryover calculation.
 */
export interface CarryoverResult {
  /** Days carried over from the EU 4-week portion (Reg 13) */
  euCarryover: number;
  /** Days carried over from the additional 1.6-week portion (Reg 13A) */
  additionalStatutoryCarryover: number;
  /** Days carried over from contractual (above-statutory) leave */
  contractualCarryover: number;
  /** Total days that can be carried over */
  totalCarryover: number;
  /** Days forfeited (use-it-or-lose-it) */
  forfeitedDays: number;
  /** The EU minimum entitlement in days for this employee */
  euEntitlementDays: number;
  /** The additional statutory entitlement in days */
  additionalEntitlementDays: number;
  /** The contractual (above-statutory) entitlement in days */
  contractualEntitlementDays: number;
  /** Whether a protected reason was applied */
  protectedReasonApplied: boolean;
  /** Human-readable explanation of the carryover decision */
  explanation: string;
}

// =============================================================================
// Core Calculation
// =============================================================================

/**
 * Calculate how many leave days can be carried over to the next leave year.
 *
 * This function splits the employee's total unused leave into three buckets:
 *
 * 1. **EU portion** (first 4 weeks / 20 days for FT): No carryover unless
 *    a protected reason applies (sickness, maternity, etc.), in which case
 *    up to the full EU entitlement can be carried over.
 *
 * 2. **Additional statutory** (next 1.6 weeks / 8 days for FT): No carryover
 *    unless the employer policy allows it (maxContractualCarryover > 0).
 *
 * 3. **Contractual** (any days above 28 for FT): Subject to whatever
 *    contractual carryover limit the employer sets.
 *
 * Leave is consumed in reverse order: contractual first, then additional
 * statutory, then EU-derived. This means unused days are attributed to the
 * EU portion last, which is favourable to employees (the EU portion has
 * stronger carryover protections).
 *
 * @param input Carryover calculation parameters
 * @returns Detailed carryover breakdown
 */
export function calculateLeaveCarryover(input: CarryoverInput): CarryoverResult {
  const {
    unusedDays,
    contractedDaysPerWeek,
    protectedReason,
    protectedDaysUntaken,
    maxContractualCarryover,
    totalAnnualEntitlement,
  } = input;

  // Calculate entitlement portions for this employee's working pattern
  const effectiveDays = contractedDaysPerWeek > 0
    ? contractedDaysPerWeek
    : STANDARD_DAYS_PER_WEEK;

  const euEntitlementDays = Math.ceil(EU_MINIMUM_WEEKS * effectiveDays);
  const additionalEntitlementDays = Math.ceil(
    ADDITIONAL_STATUTORY_WEEKS * effectiveDays
  );
  const totalStatutoryDays = euEntitlementDays + additionalEntitlementDays;

  // Cap at 28 days (the statutory maximum)
  const cappedStatutoryDays = Math.min(totalStatutoryDays, 28);
  // Re-derive EU and additional within the cap
  const cappedEuDays = Math.min(euEntitlementDays, cappedStatutoryDays);
  const cappedAdditionalDays = cappedStatutoryDays - cappedEuDays;

  // Contractual days above statutory
  const contractualEntitlementDays = Math.max(
    0,
    totalAnnualEntitlement - cappedStatutoryDays
  );

  // If no unused days, nothing to carry over
  if (unusedDays <= 0) {
    return {
      euCarryover: 0,
      additionalStatutoryCarryover: 0,
      contractualCarryover: 0,
      totalCarryover: 0,
      forfeitedDays: 0,
      euEntitlementDays: cappedEuDays,
      additionalEntitlementDays: cappedAdditionalDays,
      contractualEntitlementDays,
      protectedReasonApplied: false,
      explanation: "No unused leave days to carry over.",
    };
  }

  // Attribute unused days to each bucket. Leave is consumed in order:
  // contractual -> additional statutory -> EU. So unused days are attributed
  // in reverse: EU first, then additional, then contractual.
  const unusedEu = Math.min(unusedDays, cappedEuDays);
  const unusedAdditional = Math.min(
    Math.max(0, unusedDays - cappedEuDays),
    cappedAdditionalDays
  );
  const unusedContractual = Math.max(
    0,
    unusedDays - cappedEuDays - cappedAdditionalDays
  );

  // --- EU portion carryover ---
  let euCarryover = 0;
  let protectedReasonApplied = false;

  if (
    protectedReason &&
    PROTECTED_CARRYOVER_REASONS.includes(protectedReason)
  ) {
    protectedReasonApplied = true;
    // The employee can carry over up to their unused EU entitlement,
    // limited by how many days they were prevented from taking.
    const eligibleProtectedDays =
      protectedDaysUntaken !== undefined && protectedDaysUntaken >= 0
        ? Math.min(protectedDaysUntaken, unusedEu)
        : unusedEu;
    euCarryover = eligibleProtectedDays;
  }
  // Without a protected reason, EU leave is use-it-or-lose-it.

  // --- Additional statutory portion carryover ---
  // Only carried over if the employer's policy allows it
  // (through the contractual carryover mechanism).
  let additionalStatutoryCarryover = 0;
  let remainingContractualAllowance = maxContractualCarryover;

  if (remainingContractualAllowance > 0 && unusedAdditional > 0) {
    additionalStatutoryCarryover = Math.min(
      unusedAdditional,
      remainingContractualAllowance
    );
    remainingContractualAllowance -= additionalStatutoryCarryover;
  }

  // --- Contractual (above-statutory) carryover ---
  let contractualCarryover = 0;
  if (remainingContractualAllowance > 0 && unusedContractual > 0) {
    contractualCarryover = Math.min(
      unusedContractual,
      remainingContractualAllowance
    );
  }

  const totalCarryover =
    euCarryover + additionalStatutoryCarryover + contractualCarryover;
  const forfeitedDays = Math.max(0, unusedDays - totalCarryover);

  // Build explanation
  const explanationParts: string[] = [];

  if (euCarryover > 0) {
    explanationParts.push(
      `${euCarryover} day(s) carried over from EU-derived leave (Reg 13) due to ${protectedReason}.`
    );
  } else if (unusedEu > 0 && !protectedReasonApplied) {
    explanationParts.push(
      `${unusedEu} day(s) of EU-derived leave (Reg 13) forfeited (no protected reason for carryover).`
    );
  }

  if (additionalStatutoryCarryover > 0) {
    explanationParts.push(
      `${additionalStatutoryCarryover} day(s) of additional statutory leave (Reg 13A) carried over by employer agreement.`
    );
  } else if (unusedAdditional > 0 && additionalStatutoryCarryover === 0) {
    explanationParts.push(
      `${unusedAdditional} day(s) of additional statutory leave (Reg 13A) forfeited (use-it-or-lose-it).`
    );
  }

  if (contractualCarryover > 0) {
    explanationParts.push(
      `${contractualCarryover} day(s) of contractual leave carried over.`
    );
  } else if (unusedContractual > 0 && contractualCarryover === 0) {
    explanationParts.push(
      `${unusedContractual} day(s) of contractual leave forfeited.`
    );
  }

  if (explanationParts.length === 0) {
    explanationParts.push("No unused leave to carry over.");
  }

  return {
    euCarryover,
    additionalStatutoryCarryover,
    contractualCarryover,
    totalCarryover,
    forfeitedDays,
    euEntitlementDays: cappedEuDays,
    additionalEntitlementDays: cappedAdditionalDays,
    contractualEntitlementDays,
    protectedReasonApplied,
    explanation: explanationParts.join(" "),
  };
}

// =============================================================================
// Database-Backed Calculation
// =============================================================================

/**
 * Calculate leave carryover for a specific employee, reading their balance
 * data and contract details from the database.
 *
 * @param db Database client
 * @param ctx Tenant context
 * @param employeeId Employee UUID
 * @param leaveYear The leave year ending (e.g. 2025)
 * @param leaveTypeId UUID of the annual leave type
 * @param protectedReason Optional protected reason for EU carryover
 * @param protectedDaysUntaken Optional number of days the employee was prevented from taking
 * @returns Carryover calculation result
 */
export async function calculateEmployeeCarryover(
  db: DatabaseClient,
  ctx: TenantContext,
  employeeId: string,
  leaveYear: number,
  leaveTypeId: string,
  protectedReason?: ProtectedCarryoverReason | null,
  protectedDaysUntaken?: number
): Promise<CarryoverResult> {
  // Get the employee's leave balance for the year
  const balanceRows = await db.withTransaction(ctx, async (tx) => {
    return tx`
      SELECT
        lb.opening_balance + lb.accrued + lb.carryover + lb.adjustments AS entitled,
        lb.used,
        lb.pending
      FROM leave_balances lb
      WHERE lb.employee_id = ${employeeId}::uuid
        AND lb.leave_type_id = ${leaveTypeId}::uuid
        AND lb.year = ${leaveYear}
      LIMIT 1
    `;
  });

  // Get contracted days and leave policy details
  const contractRows = await db.withTransaction(ctx, async (tx) => {
    return tx`
      SELECT
        COALESCE(ec.working_hours_per_week / 8.0, ec.fte * 5, 5) AS days_per_week,
        COALESCE(lp.max_carryover, 0) AS max_contractual_carryover
      FROM employment_contracts ec
      LEFT JOIN leave_balances lb
        ON lb.employee_id = ec.employee_id
        AND lb.leave_type_id = ${leaveTypeId}::uuid
        AND lb.year = ${leaveYear}
      LEFT JOIN leave_policies lp
        ON lp.id = lb.policy_id
      WHERE ec.employee_id = ${employeeId}::uuid
        AND ec.effective_to IS NULL
      ORDER BY ec.effective_from DESC
      LIMIT 1
    `;
  });

  const balance = (balanceRows as any[])[0];
  const contract = (contractRows as any[])[0];

  const entitled = balance ? Number(balance.entitled) || 0 : 0;
  const used = balance ? Number(balance.used) || 0 : 0;
  const unusedDays = Math.max(0, entitled - used);
  const contractedDaysPerWeek = contract
    ? Math.round((Number(contract.daysPerWeek) || STANDARD_DAYS_PER_WEEK) * 2) / 2
    : STANDARD_DAYS_PER_WEEK;
  const maxContractualCarryover = contract
    ? Number(contract.maxContractualCarryover) || 0
    : 0;

  return calculateLeaveCarryover({
    unusedDays,
    contractedDaysPerWeek,
    leaveYear,
    protectedReason: protectedReason ?? null,
    protectedDaysUntaken,
    maxContractualCarryover,
    totalAnnualEntitlement: entitled,
  });
}
