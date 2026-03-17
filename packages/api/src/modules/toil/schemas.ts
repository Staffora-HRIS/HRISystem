/**
 * TOIL (Time Off In Lieu) Module Schemas
 *
 * TypeBox validation schemas for TOIL balance and transaction endpoints.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Shared primitives
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });
export const DateSchema = t.String({ format: "date" });

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});
export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.String({ minLength: 1 }),
});
export type IdempotencyHeader = Static<typeof IdempotencyHeaderSchema>;

// =============================================================================
// Enums
// =============================================================================

export const ToilTransactionTypeSchema = t.Union([
  t.Literal("accrual"),
  t.Literal("usage"),
]);
export type ToilTransactionType = Static<typeof ToilTransactionTypeSchema>;

// =============================================================================
// TOIL Balance Schemas
// =============================================================================

export const CreateToilBalanceSchema = t.Object({
  employeeId: UuidSchema,
  periodStart: DateSchema,
  periodEnd: DateSchema,
  expiryDays: t.Optional(t.Number({ minimum: 1, maximum: 365, default: 90 })),
});
export type CreateToilBalance = Static<typeof CreateToilBalanceSchema>;

export const ToilBalanceResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  employeeId: UuidSchema,
  accruedHours: t.Number(),
  usedHours: t.Number(),
  balanceHours: t.Number(),
  periodStart: t.String(),
  periodEnd: t.String(),
  expiryDays: t.Number(),
  createdAt: t.String(),
  updatedAt: t.String(),
});
export type ToilBalanceResponse = Static<typeof ToilBalanceResponseSchema>;

export const ToilBalanceQuerySchema = t.Object({
  employeeId: t.Optional(UuidSchema),
  activeOnly: t.Optional(t.String({ pattern: "^(true|false)$" })),
  ...PaginationQuerySchema.properties,
});
export type ToilBalanceQuery = Static<typeof ToilBalanceQuerySchema>;

// =============================================================================
// TOIL Accrual Schemas (manager accrues TOIL for overtime worked)
// =============================================================================

export const CreateToilAccrualSchema = t.Object({
  employeeId: UuidSchema,
  balanceId: UuidSchema,
  hours: t.Number({ minimum: 0.25, maximum: 24 }),
  reason: t.String({ minLength: 1, maxLength: 1000 }),
  date: DateSchema,
});
export type CreateToilAccrual = Static<typeof CreateToilAccrualSchema>;

// =============================================================================
// TOIL Usage Schemas (employee requests to use TOIL)
// =============================================================================

export const CreateToilUsageSchema = t.Object({
  employeeId: UuidSchema,
  balanceId: UuidSchema,
  hours: t.Number({ minimum: 0.25, maximum: 24 }),
  reason: t.Optional(t.String({ maxLength: 1000 })),
  date: DateSchema,
});
export type CreateToilUsage = Static<typeof CreateToilUsageSchema>;

// =============================================================================
// TOIL Transaction Response
// =============================================================================

export const ToilTransactionResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  employeeId: UuidSchema,
  balanceId: UuidSchema,
  type: ToilTransactionTypeSchema,
  hours: t.Number(),
  reason: t.Nullable(t.String()),
  authorizedBy: t.Nullable(UuidSchema),
  date: t.String(),
  expiresAt: t.Nullable(t.String()),
  createdAt: t.String(),
});
export type ToilTransactionResponse = Static<typeof ToilTransactionResponseSchema>;

export const ToilTransactionQuerySchema = t.Object({
  employeeId: t.Optional(UuidSchema),
  balanceId: t.Optional(UuidSchema),
  type: t.Optional(ToilTransactionTypeSchema),
  from: t.Optional(DateSchema),
  to: t.Optional(DateSchema),
  ...PaginationQuerySchema.properties,
});
export type ToilTransactionQuery = Static<typeof ToilTransactionQuerySchema>;
