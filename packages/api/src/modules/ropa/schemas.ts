/**
 * ROPA Module - TypeBox Schemas
 *
 * Defines validation schemas for all Records of Processing Activities (ROPA) API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * UK GDPR compliance: Article 30 (Records of processing activities).
 * The ICO can request this register at any time, so all Article 30(1) fields are captured.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Lawful basis for processing (UK GDPR Article 6(1))
 */
export const LawfulBasisSchema = t.Union([
  t.Literal("consent"),
  t.Literal("contract"),
  t.Literal("legal_obligation"),
  t.Literal("vital_interest"),
  t.Literal("public_task"),
  t.Literal("legitimate_interest"),
]);

export type LawfulBasis = Static<typeof LawfulBasisSchema>;

/**
 * Processing activity status
 */
export const RopaStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("archived"),
]);

export type RopaStatus = Static<typeof RopaStatusSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create a new processing activity
 */
export const CreateProcessingActivitySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 5000 })),
  purpose: t.String({ minLength: 1, maxLength: 2000 }),
  lawful_basis: LawfulBasisSchema,
  data_categories: t.Array(t.String({ minLength: 1, maxLength: 200 }), { minItems: 1 }),
  data_subjects: t.Array(t.String({ minLength: 1, maxLength: 200 }), { minItems: 1 }),
  recipients: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 200 }))),
  retention_period: t.Optional(t.String({ maxLength: 255 })),
  international_transfers: t.Optional(t.Boolean()),
  transfer_safeguards: t.Optional(t.String({ maxLength: 2000 })),
  technical_measures: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 500 }))),
  organisational_measures: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 500 }))),
  dpia_required: t.Optional(t.Boolean()),
  dpia_id: t.Optional(UuidSchema),
  lawful_basis_detail: t.Optional(t.String({ maxLength: 5000 })),
  security_measures: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 500 }))),
  controller_name: t.Optional(t.String({ maxLength: 255 })),
  controller_contact: t.Optional(t.String({ maxLength: 500 })),
  dpo_contact: t.Optional(t.String({ maxLength: 500 })),
});

export type CreateProcessingActivity = Static<typeof CreateProcessingActivitySchema>;

/**
 * Update an existing processing activity (PATCH - all fields optional)
 */
export const UpdateProcessingActivitySchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  description: t.Optional(t.Union([t.String({ maxLength: 5000 }), t.Null()])),
  purpose: t.Optional(t.String({ minLength: 1, maxLength: 2000 })),
  lawful_basis: t.Optional(LawfulBasisSchema),
  data_categories: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 200 }), { minItems: 1 })),
  data_subjects: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 200 }), { minItems: 1 })),
  recipients: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 200 }))),
  retention_period: t.Optional(t.Union([t.String({ maxLength: 255 }), t.Null()])),
  international_transfers: t.Optional(t.Boolean()),
  transfer_safeguards: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
  technical_measures: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 500 }))),
  organisational_measures: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 500 }))),
  dpia_required: t.Optional(t.Boolean()),
  dpia_id: t.Optional(t.Union([UuidSchema, t.Null()])),
  status: t.Optional(RopaStatusSchema),
  lawful_basis_detail: t.Optional(t.Union([t.String({ maxLength: 5000 }), t.Null()])),
  security_measures: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 500 }))),
  controller_name: t.Optional(t.Union([t.String({ maxLength: 255 }), t.Null()])),
  controller_contact: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
  dpo_contact: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
});

export type UpdateProcessingActivity = Static<typeof UpdateProcessingActivitySchema>;

/**
 * Review processing activity (optional notes in body)
 */
export const ReviewProcessingActivitySchema = t.Object({
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type ReviewProcessingActivity = Static<typeof ReviewProcessingActivitySchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

/**
 * Filters for listing processing activities
 */
export const ProcessingActivityFiltersSchema = t.Object({
  status: t.Optional(RopaStatusSchema),
  lawful_basis: t.Optional(LawfulBasisSchema),
  dpia_required: t.Optional(t.BooleanString()),
  international_transfers: t.Optional(t.BooleanString()),
  search: t.Optional(t.String()),
});

export type ProcessingActivityFilters = Static<typeof ProcessingActivityFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Processing activity response (camelCase per postgres.js toCamel transform)
 */
export const ProcessingActivityResponseSchema = t.Object({
  id: t.String(),
  tenantId: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  purpose: t.String(),
  lawfulBasis: LawfulBasisSchema,
  dataCategories: t.Array(t.String()),
  dataSubjects: t.Array(t.String()),
  recipients: t.Array(t.String()),
  retentionPeriod: t.Union([t.String(), t.Null()]),
  internationalTransfers: t.Boolean(),
  transferSafeguards: t.Union([t.String(), t.Null()]),
  technicalMeasures: t.Array(t.String()),
  organisationalMeasures: t.Array(t.String()),
  dpiaRequired: t.Boolean(),
  dpiaId: t.Union([t.String(), t.Null()]),
  status: RopaStatusSchema,
  reviewedAt: t.Union([t.String(), t.Null()]),
  reviewedBy: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type ProcessingActivityResponse = Static<typeof ProcessingActivityResponseSchema>;

/**
 * Processing activity list response
 */
export const ProcessingActivityListResponseSchema = t.Object({
  items: t.Array(ProcessingActivityResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type ProcessingActivityListResponse = Static<typeof ProcessingActivityListResponseSchema>;
