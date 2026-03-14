/**
 * Agency Management Module - TypeBox Schemas
 *
 * Defines validation schemas for recruitment agency management API endpoints.
 * Tables: recruitment_agencies, agency_placements
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

export const AgencyFeeTypeSchema = t.Union([
  t.Literal("percentage"),
  t.Literal("fixed"),
]);
export type AgencyFeeType = Static<typeof AgencyFeeTypeSchema>;

export const AgencyStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("inactive"),
  t.Literal("blacklisted"),
]);
export type AgencyStatus = Static<typeof AgencyStatusSchema>;

// =============================================================================
// Agency Schemas
// =============================================================================

export const CreateAgencySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  contact_name: t.Optional(t.String({ maxLength: 255 })),
  email: t.Optional(t.String({ maxLength: 255, format: "email" })),
  phone: t.Optional(t.String({ maxLength: 50 })),
  website: t.Optional(t.String({ maxLength: 500 })),
  terms_agreed: t.Optional(t.Boolean()),
  fee_type: t.Optional(AgencyFeeTypeSchema),
  fee_amount: t.Optional(t.Number({ minimum: 0 })),
  preferred: t.Optional(t.Boolean()),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});
export type CreateAgency = Static<typeof CreateAgencySchema>;

export const UpdateAgencySchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    contact_name: t.Union([t.String({ maxLength: 255 }), t.Null()]),
    email: t.Union([t.String({ maxLength: 255, format: "email" }), t.Null()]),
    phone: t.Union([t.String({ maxLength: 50 }), t.Null()]),
    website: t.Union([t.String({ maxLength: 500 }), t.Null()]),
    terms_agreed: t.Boolean(),
    fee_type: t.Union([AgencyFeeTypeSchema, t.Null()]),
    fee_amount: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    preferred: t.Boolean(),
    status: AgencyStatusSchema,
    notes: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
  })
);
export type UpdateAgency = Static<typeof UpdateAgencySchema>;

export const AgencyResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  contact_name: t.Union([t.String(), t.Null()]),
  email: t.Union([t.String(), t.Null()]),
  phone: t.Union([t.String(), t.Null()]),
  website: t.Union([t.String(), t.Null()]),
  terms_agreed: t.Boolean(),
  fee_type: t.Union([AgencyFeeTypeSchema, t.Null()]),
  fee_amount: t.Union([t.Number(), t.Null()]),
  preferred: t.Boolean(),
  status: AgencyStatusSchema,
  notes: t.Union([t.String(), t.Null()]),
  placements_count: t.Optional(t.Number()),
  created_at: t.String(),
  updated_at: t.String(),
});
export type AgencyResponse = Static<typeof AgencyResponseSchema>;

export const AgencyFiltersSchema = t.Object({
  status: t.Optional(AgencyStatusSchema),
  preferred: t.Optional(t.Boolean()),
  search: t.Optional(t.String({ minLength: 1 })),
});
export type AgencyFilters = Static<typeof AgencyFiltersSchema>;

// =============================================================================
// Placement Schemas
// =============================================================================

export const CreatePlacementSchema = t.Object({
  agency_id: UuidSchema,
  candidate_id: t.Optional(UuidSchema),
  requisition_id: t.Optional(UuidSchema),
  fee_agreed: t.Optional(t.Number({ minimum: 0 })),
  fee_paid: t.Optional(t.Boolean()),
  placement_date: t.Optional(DateSchema),
  guarantee_end_date: t.Optional(DateSchema),
});
export type CreatePlacement = Static<typeof CreatePlacementSchema>;

export const UpdatePlacementSchema = t.Partial(
  t.Object({
    fee_agreed: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    fee_paid: t.Boolean(),
    placement_date: t.Union([DateSchema, t.Null()]),
    guarantee_end_date: t.Union([DateSchema, t.Null()]),
  })
);
export type UpdatePlacement = Static<typeof UpdatePlacementSchema>;

export const PlacementResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  agency_id: UuidSchema,
  agency_name: t.Optional(t.String()),
  candidate_id: t.Union([UuidSchema, t.Null()]),
  requisition_id: t.Union([UuidSchema, t.Null()]),
  fee_agreed: t.Union([t.Number(), t.Null()]),
  fee_paid: t.Boolean(),
  placement_date: t.Union([t.String(), t.Null()]),
  guarantee_end_date: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});
export type PlacementResponse = Static<typeof PlacementResponseSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

export const PlacementParamsSchema = t.Object({
  id: UuidSchema,
  placementId: UuidSchema,
});
export type PlacementParams = Static<typeof PlacementParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});
export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
