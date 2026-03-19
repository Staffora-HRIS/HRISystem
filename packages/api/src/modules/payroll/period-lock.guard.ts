/**
 * Payroll Period Lock Guard (TODO-234)
 *
 * Middleware/utility that checks whether a payroll-affecting mutation
 * falls within a locked or finalized period. Used by routes in other
 * modules (time entries, absence, compensation) to enforce period locks.
 *
 * Usage in a route handler:
 * ```typescript
 * import { PayrollRepository } from "../payroll/repository";
 * import { checkPayrollPeriodLock } from "../payroll/period-lock.guard";
 *
 * // In route handler:
 * const repository = new PayrollRepository(db);
 * const lockViolation = await checkPayrollPeriodLock(
 *   repository,
 *   tenantContext,
 *   { date: "2026-03-15", payScheduleId: "..." }
 * );
 * if (lockViolation) {
 *   return mapServiceError(lockViolation, set, requestId);
 * }
 * // proceed with mutation...
 * ```
 */

import type { PayrollRepository } from "./repository";
import type { TenantContext } from "../../types/service-result";
import {
  isDateWithinLockedPeriod,
  findActiveLocksForRange,
  mapPeriodLockToEnhancedResponse,
} from "./period-lock.service";

export interface PeriodLockViolation {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Check if a date falls within a locked or finalized payroll period.
 *
 * Returns a PeriodLockViolation if the date is locked, or null if the
 * date is open for modifications.
 *
 * @param repository - PayrollRepository instance
 * @param ctx - Tenant context with tenantId
 * @param options.date - The date to check (YYYY-MM-DD)
 * @param options.payScheduleId - Optional pay schedule ID to scope the check
 */
export async function checkPayrollPeriodLock(
  repository: PayrollRepository,
  ctx: TenantContext,
  options: {
    date: string;
    payScheduleId?: string | null;
  }
): Promise<PeriodLockViolation | null> {
  const result = await isDateWithinLockedPeriod(
    repository,
    ctx,
    options.date,
    options.payScheduleId
  );

  if (!result.success || !result.data) {
    return null;
  }

  const lock = result.data;
  const isFinalized = lock.is_finalized;

  return {
    code: isFinalized ? "PAYROLL_PERIOD_FINALIZED" : "PAYROLL_PERIOD_LOCKED",
    message: isFinalized
      ? `Cannot modify data within finalized payroll period ${lock.period_start} to ${lock.period_end}`
      : `Cannot modify data within locked payroll period ${lock.period_start} to ${lock.period_end}. Contact payroll to unlock if changes are needed.`,
    details: {
      lock_id: lock.id,
      period_start: lock.period_start,
      period_end: lock.period_end,
      status: lock.status,
      locked_at: lock.locked_at,
      locked_by: lock.locked_by,
      pay_schedule_id: lock.pay_schedule_id,
      is_finalized: isFinalized,
    },
  };
}

/**
 * Check if a date range overlaps with any locked or finalized payroll period.
 *
 * Useful for validating that a new effective-dated record does not overlap
 * with a locked period.
 *
 * @param repository - PayrollRepository instance
 * @param ctx - Tenant context with tenantId
 * @param options.periodStart - Start of the date range (YYYY-MM-DD)
 * @param options.periodEnd - End of the date range (YYYY-MM-DD)
 * @param options.payScheduleId - Optional pay schedule ID to scope the check
 */
export async function checkPayrollPeriodLockRange(
  repository: PayrollRepository,
  ctx: TenantContext,
  options: {
    periodStart: string;
    periodEnd: string;
    payScheduleId?: string | null;
  }
): Promise<PeriodLockViolation | null> {
  const result = await findActiveLocksForRange(
    repository,
    ctx,
    options.periodStart,
    options.periodEnd,
    options.payScheduleId
  );

  if (!result.success || !result.data || result.data.length === 0) {
    return null;
  }

  const lock = result.data[0];
  const isFinalized = lock.is_finalized;

  return {
    code: isFinalized ? "PAYROLL_PERIOD_FINALIZED" : "PAYROLL_PERIOD_LOCKED",
    message: isFinalized
      ? `Date range overlaps with finalized payroll period ${lock.period_start} to ${lock.period_end}`
      : `Date range overlaps with locked payroll period ${lock.period_start} to ${lock.period_end}. Contact payroll to unlock if changes are needed.`,
    details: {
      lock_id: lock.id,
      period_start: lock.period_start,
      period_end: lock.period_end,
      status: lock.status,
      locked_at: lock.locked_at,
      locked_by: lock.locked_by,
      pay_schedule_id: lock.pay_schedule_id,
      is_finalized: isFinalized,
      overlapping_locks_count: result.data.length,
    },
  };
}
