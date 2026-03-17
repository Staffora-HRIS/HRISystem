/**
 * Suspensions Module - TypeBox Schemas
 *
 * Validation schemas for employee suspension management.
 * UK best practice: suspensions should normally be on full pay
 * pending investigation, and should be reviewed regularly.
 */

import { t } from "elysia";

// =============================================================================
// Shared Enums
// =============================================================================

export const SuspensionTypeSchema = t.Union([
  t.Literal("with_pay"),
  t.Literal("without_pay"),
]);

export const SuspensionStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("lifted"),
  t.Literal("expired"),
]);

const UuidSchema = t.String({ format: "uuid" });

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create a new suspension linked to a disciplinary case.
 * suspension_type defaults to with_pay per UK best practice.
 */
export const CreateSuspensionSchema = t.Object({
  employeeId: UuidSchema,
  caseId: t.Optional(UuidSchema),
  suspensionType: t.Optional(SuspensionTypeSchema),
  startDate: t.String({ format: "date" }),
  endDate: t.Optional(t.String({ format: "date" })),
  reason: t.String({ minLength: 1, maxLength: 5000 }),
  authorizedBy: UuidSchema,
  reviewDate: t.Optional(t.String({ format: "date" })),
});

/**
 * Lift (end early) an active suspension.
 */
export const LiftSuspensionSchema = t.Object({
  reason: t.String({ minLength: 1, maxLength: 5000 }),
});

/**
 * Extend an active suspension (update end_date and optionally review_date).
 */
export const ExtendSuspensionSchema = t.Object({
  endDate: t.String({ format: "date" }),
  reviewDate: t.Optional(t.String({ format: "date" })),
  reason: t.Optional(t.String({ minLength: 1, maxLength: 5000 })),
});

/**
 * Record a review of an active suspension.
 */
export const ReviewSuspensionSchema = t.Object({
  reviewNotes: t.String({ minLength: 1, maxLength: 5000 }),
  nextReviewDate: t.Optional(t.String({ format: "date" })),
});

/**
 * Query parameters for listing suspensions.
 */
export const ListSuspensionsQuerySchema = t.Object({
  employeeId: t.Optional(UuidSchema),
  caseId: t.Optional(UuidSchema),
  status: t.Optional(SuspensionStatusSchema),
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});

// =============================================================================
// Response Schemas
// =============================================================================

export const SuspensionResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  employeeId: UuidSchema,
  caseId: t.Union([UuidSchema, t.Null()]),

  suspensionType: SuspensionTypeSchema,
  startDate: t.String(),
  endDate: t.Union([t.String(), t.Null()]),
  reason: t.String(),

  authorizedBy: UuidSchema,

  reviewDate: t.Union([t.String(), t.Null()]),
  lastReviewedAt: t.Union([t.String(), t.Null()]),
  reviewNotes: t.Union([t.String(), t.Null()]),

  status: SuspensionStatusSchema,
  liftedAt: t.Union([t.String(), t.Null()]),
  liftedBy: t.Union([UuidSchema, t.Null()]),
  liftedReason: t.Union([t.String(), t.Null()]),

  createdAt: t.String(),
  updatedAt: t.String(),
});

export const SuspensionListResponseSchema = t.Object({
  suspensions: t.Array(SuspensionResponseSchema),
  count: t.Number(),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type SuspensionType = typeof SuspensionTypeSchema.static;
export type SuspensionStatus = typeof SuspensionStatusSchema.static;
export type CreateSuspension = typeof CreateSuspensionSchema.static;
export type LiftSuspension = typeof LiftSuspensionSchema.static;
export type ExtendSuspension = typeof ExtendSuspensionSchema.static;
export type ReviewSuspension = typeof ReviewSuspensionSchema.static;
export type ListSuspensionsQuery = typeof ListSuspensionsQuerySchema.static;
export type SuspensionResponse = typeof SuspensionResponseSchema.static;
