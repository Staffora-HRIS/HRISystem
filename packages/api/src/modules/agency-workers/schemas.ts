/**
 * Agency Workers Regulations (AWR) Module - TypeBox Schemas
 *
 * Validation schemas for agency worker assignment tracking and AWR 2010
 * 12-week qualifying period compliance.
 *
 * Tables: agency_worker_assignments
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const DateSchema = t.String({
  format: "date",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

// =============================================================================
// Enums
// =============================================================================

export const AwrBreakReasonSchema = t.Union([
  t.Literal("end_of_assignment"),
  t.Literal("sickness"),
  t.Literal("jury_service"),
  t.Literal("annual_leave"),
  t.Literal("shutdown"),
  t.Literal("strike_lockout"),
  t.Literal("maternity"),
  t.Literal("other"),
]);
export type AwrBreakReason = Static<typeof AwrBreakReasonSchema>;

export const AwrAssignmentStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("on_break"),
  t.Literal("qualified"),
  t.Literal("ended"),
]);
export type AwrAssignmentStatus = Static<typeof AwrAssignmentStatusSchema>;

/**
 * The effect a break has on the 12-week qualifying clock.
 * - "continues": weeks during break still count (annual leave, short gap <= 6 weeks)
 * - "pauses": clock stops but does not reset (sickness, jury service, maternity, strike)
 * - "resets": clock resets to zero (gap > 6 weeks for end_of_assignment/other)
 */
export const ClockEffectSchema = t.Union([
  t.Literal("continues"),
  t.Literal("pauses"),
  t.Literal("resets"),
]);
export type ClockEffect = Static<typeof ClockEffectSchema>;

// =============================================================================
// Break Schema (stored in JSONB)
// =============================================================================

export const BreakRecordSchema = t.Object({
  reason: AwrBreakReasonSchema,
  start_date: DateSchema,
  end_date: t.Union([DateSchema, t.Null()]),
  clock_effect: ClockEffectSchema,
});
export type BreakRecord = Static<typeof BreakRecordSchema>;

// =============================================================================
// Assignment Schemas
// =============================================================================

export const CreateAssignmentSchema = t.Object({
  worker_id: UuidSchema,
  agency_id: UuidSchema,
  role: t.String({ minLength: 1, maxLength: 500 }),
  department: t.Optional(t.String({ maxLength: 255 })),
  start_date: DateSchema,
  end_date: t.Optional(DateSchema),
  hourly_rate: t.Number({ minimum: 0, exclusiveMinimum: 0 }),
  comparable_rate: t.Optional(t.Number({ minimum: 0 })),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});
export type CreateAssignment = Static<typeof CreateAssignmentSchema>;

export const UpdateAssignmentSchema = t.Partial(
  t.Object({
    role: t.String({ minLength: 1, maxLength: 500 }),
    department: t.Union([t.String({ maxLength: 255 }), t.Null()]),
    end_date: t.Union([DateSchema, t.Null()]),
    hourly_rate: t.Number({ minimum: 0, exclusiveMinimum: 0 }),
    comparable_rate: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    status: AwrAssignmentStatusSchema,
    notes: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
  })
);
export type UpdateAssignment = Static<typeof UpdateAssignmentSchema>;

// =============================================================================
// Break Management Schemas
// =============================================================================

export const AddBreakSchema = t.Object({
  reason: AwrBreakReasonSchema,
  start_date: DateSchema,
  end_date: t.Optional(DateSchema),
});
export type AddBreak = Static<typeof AddBreakSchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

export const AssignmentFiltersSchema = t.Object({
  status: t.Optional(AwrAssignmentStatusSchema),
  worker_id: t.Optional(UuidSchema),
  agency_id: t.Optional(UuidSchema),
  qualified: t.Optional(t.Boolean()),
  search: t.Optional(t.String({ minLength: 1 })),
});
export type AssignmentFilters = Static<typeof AssignmentFiltersSchema>;

export const QualifyingSoonQuerySchema = t.Object({
  days: t.Optional(t.Number({ minimum: 1, maximum: 90, default: 14 })),
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type QualifyingSoonQuery = Static<typeof QualifyingSoonQuerySchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const AssignmentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  worker_id: UuidSchema,
  agency_id: UuidSchema,
  status: AwrAssignmentStatusSchema,
  role: t.String(),
  department: t.Union([t.String(), t.Null()]),
  start_date: t.String(),
  end_date: t.Union([t.String(), t.Null()]),
  qualifying_date: t.String(),
  qualified: t.Boolean(),
  hourly_rate: t.Number(),
  comparable_rate: t.Union([t.Number(), t.Null()]),
  breaks: t.Array(BreakRecordSchema),
  notes: t.Union([t.String(), t.Null()]),
  days_until_qualifying: t.Optional(t.Number()),
  weeks_completed: t.Optional(t.Number()),
  worker_name: t.Optional(t.String()),
  agency_name: t.Optional(t.String()),
  created_at: t.String(),
  updated_at: t.String(),
});
export type AssignmentResponse = Static<typeof AssignmentResponseSchema>;
