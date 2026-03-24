/**
 * Global Mobility Module - TypeBox Schemas
 *
 * Defines validation schemas for international assignment tracking API endpoints.
 * Tables: international_assignments, assignment_costs
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
  pattern: "^\d{4}-\d{2}-\d{2}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Enums
// =============================================================================

export const AssignmentTypeSchema = t.Union([
  t.Literal("short_term"),
  t.Literal("long_term"),
  t.Literal("permanent_transfer"),
  t.Literal("commuter"),
]);
export type AssignmentType = Static<typeof AssignmentTypeSchema>;

export const AssignmentStatusSchema = t.Union([
  t.Literal("planned"),
  t.Literal("active"),
  t.Literal("extended"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);
export type AssignmentStatus = Static<typeof AssignmentStatusSchema>;

export const VisaStatusSchema = t.Union([
  t.Literal("not_required"),
  t.Literal("pending"),
  t.Literal("approved"),
  t.Literal("expired"),
  t.Literal("denied"),
]);
export type VisaStatus = Static<typeof VisaStatusSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});
export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * POST /global-mobility/assignments - Create an international assignment
 */
export const CreateAssignmentSchema = t.Object({
  employee_id: UuidSchema,
  assignment_type: AssignmentTypeSchema,
  home_country: t.String({ minLength: 2, maxLength: 2, description: "ISO 3166-1 alpha-2 country code" }),
  host_country: t.String({ minLength: 2, maxLength: 2, description: "ISO 3166-1 alpha-2 country code" }),
  start_date: DateSchema,
  end_date: t.Optional(DateSchema),
  tax_equalisation: t.Optional(t.Boolean({ default: false })),
  housing_allowance: t.Optional(t.Number({ minimum: 0 })),
  relocation_package: t.Optional(t.Record(t.String(), t.Unknown())),
  visa_status: t.Optional(VisaStatusSchema),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});
export type CreateAssignment = Static<typeof CreateAssignmentSchema>;

/**
 * PATCH /global-mobility/assignments/:id - Update an international assignment
 */
export const UpdateAssignmentSchema = t.Partial(
  t.Object({
    assignment_type: AssignmentTypeSchema,
    home_country: t.String({ minLength: 2, maxLength: 2, description: "ISO 3166-1 alpha-2 country code" }),
    host_country: t.String({ minLength: 2, maxLength: 2, description: "ISO 3166-1 alpha-2 country code" }),
    start_date: DateSchema,
    end_date: t.Union([DateSchema, t.Null()]),
    tax_equalisation: t.Boolean(),
    housing_allowance: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    relocation_package: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
    visa_status: VisaStatusSchema,
    notes: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
  })
);
export type UpdateAssignment = Static<typeof UpdateAssignmentSchema>;

/**
 * POST /global-mobility/assignments/:id/transition - Transition assignment status
 *
 * Valid transitions:
 *   planned -> active / cancelled
 *   active  -> completed / cancelled
 */
export const AssignmentStatusTransitionSchema = t.Object({
  status: AssignmentStatusSchema,
  reason: t.Optional(t.String({ maxLength: 5000 })),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});
export type AssignmentStatusTransition = Static<typeof AssignmentStatusTransitionSchema>;

/**
 * GET /global-mobility/assignments - Filter parameters
 */
export const AssignmentFiltersSchema = t.Object({
  status: t.Optional(AssignmentStatusSchema),
  employee_id: t.Optional(UuidSchema),
  assignment_type: t.Optional(AssignmentTypeSchema),
  home_country: t.Optional(t.String({ minLength: 2, maxLength: 2 })),
  host_country: t.Optional(t.String({ minLength: 2, maxLength: 2 })),
  visa_status: t.Optional(VisaStatusSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});
export type AssignmentFilters = Static<typeof AssignmentFiltersSchema>;

/**
 * GET /global-mobility/assignments/expiring - Query parameters
 */
export const ExpiringAssignmentsQuerySchema = t.Object({
  days: t.Optional(t.Number({ minimum: 1, maximum: 365, default: 30, description: "Number of days to look ahead for expiring assignments" })),
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type ExpiringAssignmentsQuery = Static<typeof ExpiringAssignmentsQuerySchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const AssignmentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  employee_name: t.Optional(t.String()),
  employee_number: t.Optional(t.String()),
  assignment_type: AssignmentTypeSchema,
  home_country: t.String(),
  host_country: t.String(),
  start_date: t.String(),
  end_date: t.Union([t.String(), t.Null()]),
  tax_equalisation: t.Boolean(),
  housing_allowance: t.Union([t.Number(), t.Null()]),
  relocation_package: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
  visa_status: t.String(),
  status: AssignmentStatusSchema,
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});
export type AssignmentResponse = Static<typeof AssignmentResponseSchema>;
