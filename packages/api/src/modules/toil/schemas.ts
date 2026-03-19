/**
 * Time Off In Lieu (TOIL) Module - TypeBox Schemas
 *
 * Defines validation schemas for the TOIL management API.
 * TOIL allows employees to accrue time off instead of overtime pay.
 *
 * Transaction types:
 *   accrual    - Hours earned from approved overtime
 *   usage      - Hours taken as time off
 *   expiry     - Hours expired (e.g. end-of-year policy)
 *   adjustment - Manual HR adjustment with mandatory reason
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Enums
// =============================================================================

export const ToilTransactionTypeSchema = t.Union([
  t.Literal("accrual"),
  t.Literal("usage"),
  t.Literal("expiry"),
  t.Literal("adjustment"),
]);

export type ToilTransactionType = Static<typeof ToilTransactionTypeSchema>;

// =============================================================================
// Params
// =============================================================================

export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

// =============================================================================
// Headers
// =============================================================================

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Accrue TOIL hours from approved overtime.
 */
export const AccrueToilSchema = t.Object({
  employeeId: UuidSchema,
  hours: t.Number({ minimum: 0.25, maximum: 999 }),
  referenceId: t.Optional(UuidSchema),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type AccrueToil = Static<typeof AccrueToilSchema>;

/**
 * Use TOIL hours (take time off).
 */
export const UseToilSchema = t.Object({
  employeeId: UuidSchema,
  hours: t.Number({ minimum: 0.25, maximum: 999 }),
  referenceId: t.Optional(UuidSchema),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type UseToil = Static<typeof UseToilSchema>;

/**
 * Manual TOIL adjustment by HR.
 */
export const AdjustToilSchema = t.Object({
  employeeId: UuidSchema,
  hours: t.Number({ minimum: -999, maximum: 999 }),
  notes: t.String({ minLength: 1, maxLength: 2000 }),
});

export type AdjustToil = Static<typeof AdjustToilSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

export const ToilTransactionFiltersSchema = t.Object({
  type: t.Optional(ToilTransactionTypeSchema),
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type ToilTransactionFilters = Static<typeof ToilTransactionFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * TOIL balance response
 */
export const ToilBalanceResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  employeeId: UuidSchema,
  accruedHours: t.Number(),
  usedHours: t.Number(),
  expiredHours: t.Number(),
  balanceHours: t.Number(),
  updatedAt: t.String(),
});

export type ToilBalanceResponse = Static<typeof ToilBalanceResponseSchema>;

/**
 * TOIL transaction response
 */
export const ToilTransactionResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  employeeId: UuidSchema,
  type: ToilTransactionTypeSchema,
  hours: t.Number(),
  referenceId: t.Union([UuidSchema, t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  createdBy: t.Union([UuidSchema, t.Null()]),
  createdAt: t.String(),
});

export type ToilTransactionResponse = Static<typeof ToilTransactionResponseSchema>;
