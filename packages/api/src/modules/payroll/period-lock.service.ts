/**
 * Payroll Period Lock Service Extension (TODO-234)
 *
 * Extends the PayrollService with finalization support,
 * guard check methods, and enhanced response mapping that
 * includes pay_schedule_id and status fields.
 *
 * These methods are added to the PayrollService prototype to
 * integrate cleanly with the existing service architecture.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { PayrollRepository, PeriodLockRow, PaginatedResult } from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  PeriodLockResponse,
  FinalizePayrollPeriod,
} from "./period-lock.schemas";

// =============================================================================
// Enhanced PeriodLockResponse Mapper
// =============================================================================

/**
 * Map a PeriodLockRow (with new status, pay_schedule_id, finalized_at/by fields)
 * to the enhanced PeriodLockResponse shape.
 */
export function mapPeriodLockToEnhancedResponse(row: PeriodLockRow): PeriodLockResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    pay_schedule_id: row.payScheduleId ?? null,
    period_start:
      row.periodStart instanceof Date
        ? row.periodStart.toISOString().split("T")[0]
        : String(row.periodStart),
    period_end:
      row.periodEnd instanceof Date
        ? row.periodEnd.toISOString().split("T")[0]
        : String(row.periodEnd),
    status: row.status ?? (row.unlockedAt === null ? "locked" : "open"),
    locked_at:
      row.lockedAt instanceof Date
        ? row.lockedAt.toISOString()
        : String(row.lockedAt),
    locked_by: row.lockedBy,
    unlock_reason: row.unlockReason,
    unlocked_at: row.unlockedAt
      ? row.unlockedAt instanceof Date
        ? row.unlockedAt.toISOString()
        : String(row.unlockedAt)
      : null,
    unlocked_by: row.unlockedBy,
    finalized_at: row.finalizedAt
      ? row.finalizedAt instanceof Date
        ? row.finalizedAt.toISOString()
        : String(row.finalizedAt)
      : null,
    finalized_by: row.finalizedBy,
    created_at:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    is_locked: row.status === "locked" || row.status === "finalized",
    is_finalized: row.status === "finalized",
  };
}

// =============================================================================
// Finalize Period Lock
// =============================================================================

/**
 * Finalize a payroll period lock. Permanently prevents unlocking.
 * Only locked periods can be finalized.
 *
 * @param repository - PayrollRepository instance
 * @param db - DatabaseClient instance
 * @param context - Tenant context
 * @param lockId - ID of the period lock to finalize
 * @param data - Optional finalization notes
 * @param idempotencyKey - Optional idempotency key
 */
export async function finalizePayrollPeriod(
  repository: PayrollRepository,
  db: DatabaseClient,
  context: TenantContext,
  lockId: string,
  _data?: FinalizePayrollPeriod,
  _idempotencyKey?: string
): Promise<ServiceResult<PeriodLockResponse>> {
  if (!context.userId) {
    return {
      success: false,
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: "User identity is required to finalize a payroll period",
      },
    };
  }

  const existing = await repository.findPeriodLockById(context, lockId);
  if (!existing) {
    return {
      success: false,
      error: {
        code: ErrorCodes.NOT_FOUND,
        message: `Payroll period lock ${lockId} not found`,
      },
    };
  }

  if (existing.status === "finalized") {
    return {
      success: false,
      error: {
        code: "STATE_MACHINE_VIOLATION",
        message: "This payroll period is already finalized",
        details: {
          lock_id: lockId,
          finalized_at:
            existing.finalizedAt instanceof Date
              ? existing.finalizedAt.toISOString()
              : String(existing.finalizedAt),
          finalized_by: existing.finalizedBy,
        },
      },
    };
  }

  if (existing.status !== "locked") {
    return {
      success: false,
      error: {
        code: "STATE_MACHINE_VIOLATION",
        message: `Cannot finalize a period lock with status '${existing.status}'. Only locked periods can be finalized.`,
        details: {
          lock_id: lockId,
          current_status: existing.status,
          allowed_from: "locked",
        },
      },
    };
  }

  return await db.withTransaction(context, async (tx: TransactionSql) => {
    const row = await repository.finalizePeriodLock(context, lockId, tx);

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message:
            "Failed to finalize period. It may have been modified by another user.",
        },
      };
    }

    // Emit domain event
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        'payroll_period_lock',
        ${row.id}::uuid,
        'payroll.period.finalized',
        ${JSON.stringify({
          lock: mapPeriodLockToEnhancedResponse(row),
          actor: context.userId,
        })}::jsonb,
        now()
      )
    `;

    return {
      success: true,
      data: mapPeriodLockToEnhancedResponse(row),
    };
  });
}

// =============================================================================
// Guard: Check if date is within locked period
// =============================================================================

/**
 * Check if a specific date falls within any locked or finalized payroll period.
 * Returns the blocking lock if found, or null if the date is open.
 */
export async function isDateWithinLockedPeriod(
  repository: PayrollRepository,
  context: TenantContext,
  date: string,
  payScheduleId?: string | null
): Promise<ServiceResult<PeriodLockResponse | null>> {
  const locks = await repository.findLocksForDate(
    context,
    date,
    payScheduleId
  );

  if (locks.length === 0) {
    return { success: true, data: null };
  }

  return {
    success: true,
    data: mapPeriodLockToEnhancedResponse(locks[0]),
  };
}

/**
 * Find active locks (locked or finalized) that overlap with a date range.
 */
export async function findActiveLocksForRange(
  repository: PayrollRepository,
  context: TenantContext,
  periodStart: string,
  periodEnd: string,
  payScheduleId?: string | null
): Promise<ServiceResult<PeriodLockResponse[]>> {
  const locks = await repository.findActiveLocksForPeriod(
    context,
    periodStart,
    periodEnd,
    payScheduleId
  );

  return {
    success: true,
    data: locks.map(mapPeriodLockToEnhancedResponse),
  };
}

// =============================================================================
// Enhanced List with Pagination
// =============================================================================

/**
 * List period locks with enhanced filters and cursor-based pagination.
 */
export async function listPeriodLocksEnhanced(
  repository: PayrollRepository,
  context: TenantContext,
  filters: {
    periodStart?: string;
    periodEnd?: string;
    payScheduleId?: string;
    status?: string;
    activeOnly?: boolean;
    cursor?: string;
    limit?: number;
  } = {}
): Promise<
  ServiceResult<{
    items: PeriodLockResponse[];
    nextCursor: string | null;
    hasMore: boolean;
  }>
> {
  const result = await repository.listPeriodLocks(context, filters);

  return {
    success: true,
    data: {
      items: result.items.map(mapPeriodLockToEnhancedResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    },
  };
}
