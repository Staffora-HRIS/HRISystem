/**
 * Payroll Period Lock Schemas (TODO-234)
 *
 * Defines TypeBox validation schemas for payroll period locking,
 * unlocking, finalization, and guard middleware.
 *
 * Separated from the main schemas.ts for clean imports.
 */

import { t, type Static } from "elysia";

const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

const DateSchema = t.String({
  format: "date",
  pattern: "^\d{4}-\d{2}-\d{2}$",
});

// =============================================================================
// Period Lock Status Enum
// =============================================================================

/**
 * Period lock status enum.
 * Lifecycle: open -> locked -> finalized
 * - open: Period is open for modifications
 * - locked: Period is locked; can be unlocked with reason (audit trail)
 * - finalized: Period is permanently finalized; cannot be unlocked
 */
export const PeriodLockStatusEnumSchema = t.Union([
  t.Literal("open"),
  t.Literal("locked"),
  t.Literal("finalized"),
]);

export type PeriodLockStatusEnum = Static<typeof PeriodLockStatusEnumSchema>;

/**
 * Valid period lock status transitions
 */
export const PERIOD_LOCK_STATUS_TRANSITIONS: Record<
  PeriodLockStatusEnum,
  PeriodLockStatusEnum[]
> = {
  open: ["locked"],
  locked: ["open", "finalized"],
  finalized: [],
};

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Lock a payroll period request body
 */
export const LockPayrollPeriodSchema = t.Object({
  pay_schedule_id: t.Optional(
    t.Union([UuidSchema, t.Null()], {
      description:
        "Pay schedule to lock. NULL means lock applies to all schedules for the tenant.",
    })
  ),
  period_start: DateSchema,
  period_end: DateSchema,
});

export type LockPayrollPeriod = Static<typeof LockPayrollPeriodSchema>;

/**
 * Unlock a payroll period request body (reason is mandatory for audit)
 */
export const UnlockPayrollPeriodSchema = t.Object({
  unlock_reason: t.String({
    minLength: 1,
    maxLength: 2000,
    description: "Mandatory reason for unlocking the payroll period",
  }),
});

export type UnlockPayrollPeriod = Static<typeof UnlockPayrollPeriodSchema>;

/**
 * Finalize a payroll period request body (optional notes)
 */
export const FinalizePayrollPeriodSchema = t.Object({
  notes: t.Optional(
    t.String({
      maxLength: 2000,
      description: "Optional notes for the finalization",
    })
  ),
});

export type FinalizePayrollPeriod = Static<typeof FinalizePayrollPeriodSchema>;

// =============================================================================
// Query / Response Schemas
// =============================================================================

/**
 * Payroll period lock status query parameters
 */
export const PeriodLockStatusQuerySchema = t.Object({
  period_start: t.Optional(DateSchema),
  period_end: t.Optional(DateSchema),
  pay_schedule_id: t.Optional(UuidSchema),
  status: t.Optional(PeriodLockStatusEnumSchema),
  active_only: t.Optional(t.String({ pattern: "^(true|false)$" })),
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PeriodLockStatusQuery = Static<typeof PeriodLockStatusQuerySchema>;

/**
 * Payroll period lock response
 */
export const PeriodLockResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  pay_schedule_id: t.Union([UuidSchema, t.Null()]),
  period_start: t.String(),
  period_end: t.String(),
  status: PeriodLockStatusEnumSchema,
  locked_at: t.String(),
  locked_by: UuidSchema,
  unlock_reason: t.Union([t.String(), t.Null()]),
  unlocked_at: t.Union([t.String(), t.Null()]),
  unlocked_by: t.Union([UuidSchema, t.Null()]),
  finalized_at: t.Union([t.String(), t.Null()]),
  finalized_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  is_locked: t.Boolean(),
  is_finalized: t.Boolean(),
});

export type PeriodLockResponse = Static<typeof PeriodLockResponseSchema>;

/**
 * Payroll period lock check request -- used by the guard middleware
 * to determine whether a date falls within a locked or finalized period.
 */
export const PeriodLockCheckSchema = t.Object({
  date: DateSchema,
  pay_schedule_id: t.Optional(t.Union([UuidSchema, t.Null()])),
});

export type PeriodLockCheck = Static<typeof PeriodLockCheckSchema>;
