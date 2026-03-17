/**
 * Global Mobility Module - TypeBox Schemas
 *
 * Defines validation schemas for international assignment tracking API endpoints.
 * Tables: international_assignments
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
  t.Literal("completed"),
  t.Literal("cancelled"),
]);
export type AssignmentStatus = Static<typeof AssignmentStatusSchema>;

export const VisaStatusSchema = t.Union([
  t.Literal("not_required"),
  t.Literal("pending"),
  t.Literal("approved"),
  t.Literal("denied"),
  t.Literal("expired"),
]);
export type VisaStatus = Static<typeof VisaStatusSchema>;

/** ISO 3166-1 alpha-2 country code */
export const CountryCodeSchema = t.String({
  minLength: 2,
  maxLength: 2,
  pattern: "^[A-Z]{2}$",
});

// =============================================================================
// International Assignment Schemas
// =============================================================================

export const CreateAssignmentSchema = t.Object({
  employee_id: UuidSchema,
  assignment_type: AssignmentTypeSchema,
  home_country: CountryCodeSchema,
  host_country: CountryCodeSchema,
  start_date: DateSchema,
  end_date: t.Optional(DateSchema),
  tax_equalisation: t.Optional(t.Boolean()),
  housing_allowance: t.Optional(t.Number({ minimum: 0 })),
  relocation_package: t.Optional(t.Record(t.String(), t.Unknown())),
  visa_status: t.Optional(VisaStatusSchema),
  notes: t.Optional(t.String({ maxLength: 10000 })),
});
export type CreateAssignment = Static<typeof CreateAssignmentSchema>;

export const UpdateAssignmentSchema = t.Partial(
  t.Object({
    assignment_type: AssignmentTypeSchema,
    home_country: CountryCodeSchema,
    host_country: CountryCodeSchema,
    start_date: DateSchema,
    end_date: t.Union([DateSchema, t.Null()]),
    tax_equalisation: t.Boolean(),
    housing_allowance: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    relocation_package: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
    visa_status: VisaStatusSchema,
    notes: t.Union([t.String({ maxLength: 10000 }), t.Null()]),
  })
);
export type UpdateAssignment = Static<typeof UpdateAssignmentSchema>;

export const AssignmentStatusTransitionSchema = t.Object({
  status: AssignmentStatusSchema,
});
export type AssignmentStatusTransition = Static<typeof AssignmentStatusTransitionSchema>;

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
  visa_status: VisaStatusSchema,
  status: AssignmentStatusSchema,
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});
export type AssignmentResponse = Static<typeof AssignmentResponseSchema>;

export const AssignmentFiltersSchema = t.Object({
  status: t.Optional(AssignmentStatusSchema),
  assignment_type: t.Optional(AssignmentTypeSchema),
  employee_id: t.Optional(UuidSchema),
  home_country: t.Optional(CountryCodeSchema),
  host_country: t.Optional(CountryCodeSchema),
  visa_status: t.Optional(VisaStatusSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});
export type AssignmentFilters = Static<typeof AssignmentFiltersSchema>;

export const ExpiringAssignmentsQuerySchema = t.Object({
  days: t.Optional(t.Number({ minimum: 1, maximum: 365, default: 30 })),
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type ExpiringAssignmentsQuery = Static<typeof ExpiringAssignmentsQuerySchema>;

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
