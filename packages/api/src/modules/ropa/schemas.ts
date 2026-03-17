/**
 * ROPA Module - TypeBox Schemas
 *
 * Defines validation schemas for Records of Processing Activities (ROPA) endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * UK GDPR Article 30 requires controllers to maintain a written record of
 * processing activities under their responsibility. This module captures
 * all mandatory Article 30(1) fields.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Lawful basis for data processing (GDPR Article 6)
 */
export const LawfulBasisSchema = t.Union([
  t.Literal("consent"),
  t.Literal("contract"),
  t.Literal("legal_obligation"),
  t.Literal("vital_interests"),
  t.Literal("public_task"),
  t.Literal("legitimate_interests"),
]);

export type LawfulBasis = Static<typeof LawfulBasisSchema>;

/**
 * Processing activity status
 */
export const ProcessingActivityStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("active"),
  t.Literal("under_review"),
  t.Literal("archived"),
]);

export type ProcessingActivityStatus = Static<typeof ProcessingActivityStatusSchema>;

// =============================================================================
// Common Schemas
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

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

// =============================================================================
// International Transfer Item Schema
// =============================================================================

export const InternationalTransferSchema = t.Object({
  country: t.String({ minLength: 1, maxLength: 100 }),
  safeguard: t.Optional(t.String({ maxLength: 500 })),
  notes: t.Optional(t.String({ maxLength: 1000 })),
});

export type InternationalTransfer = Static<typeof InternationalTransferSchema>;

// =============================================================================
// Create Processing Activity Schema (POST)
// =============================================================================

export const CreateProcessingActivitySchema = t.Object({
  /** Name/title of the processing activity */
  name: t.String({ minLength: 1, maxLength: 500 }),
  /** Detailed description */
  description: t.Optional(t.String({ maxLength: 10000 })),
  /** Purpose(s) of the processing (Article 30(1)(b)) */
  purpose: t.String({ minLength: 1, maxLength: 5000 }),
  /** Lawful basis under GDPR Article 6 */
  lawful_basis: LawfulBasisSchema,
  /** Additional detail on the lawful basis (e.g., which legitimate interest) */
  lawful_basis_detail: t.Optional(t.String({ maxLength: 2000 })),
  /** Categories of data subjects */
  data_subjects: t.Array(t.String({ minLength: 1, maxLength: 200 }), {
    minItems: 1,
    description: "Categories of data subjects (e.g., employees, job applicants)",
  }),
  /** Categories of personal data processed */
  data_categories: t.Array(t.String({ minLength: 1, maxLength: 200 }), {
    minItems: 1,
    description: "Categories of personal data (e.g., name, email, salary, health data)",
  }),
  /** Categories of recipients */
  recipients: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 200 }))),
  /** International transfers with safeguards */
  international_transfers: t.Optional(t.Array(InternationalTransferSchema)),
  /** Envisaged time limits for erasure (Article 30(1)(f)) */
  retention_period: t.Optional(t.String({ maxLength: 500 })),
  /** General description of security measures (Article 30(1)(g)) */
  security_measures: t.Optional(t.String({ maxLength: 5000 })),
  /** Whether a DPIA is required (Article 35) */
  dpia_required: t.Optional(t.Boolean()),
  /** Reference to a DPIA record */
  dpia_id: t.Optional(UuidSchema),
  /** Name of the data controller (Article 30(1)(a)) */
  controller_name: t.Optional(t.String({ maxLength: 500 })),
  /** Contact details of the data controller */
  controller_contact: t.Optional(t.String({ maxLength: 500 })),
  /** Contact details of the Data Protection Officer */
  dpo_contact: t.Optional(t.String({ maxLength: 500 })),
});

export type CreateProcessingActivity = Static<typeof CreateProcessingActivitySchema>;

// =============================================================================
// Update Processing Activity Schema (PATCH)
// =============================================================================

export const UpdateProcessingActivitySchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 500 }),
    description: t.Union([t.String({ maxLength: 10000 }), t.Null()]),
    purpose: t.String({ minLength: 1, maxLength: 5000 }),
    lawful_basis: LawfulBasisSchema,
    lawful_basis_detail: t.Union([t.String({ maxLength: 2000 }), t.Null()]),
    data_subjects: t.Array(t.String({ minLength: 1, maxLength: 200 }), { minItems: 1 }),
    data_categories: t.Array(t.String({ minLength: 1, maxLength: 200 }), { minItems: 1 }),
    recipients: t.Union([t.Array(t.String({ minLength: 1, maxLength: 200 })), t.Null()]),
    international_transfers: t.Union([t.Array(InternationalTransferSchema), t.Null()]),
    retention_period: t.Union([t.String({ maxLength: 500 }), t.Null()]),
    security_measures: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    dpia_required: t.Boolean(),
    dpia_id: t.Union([UuidSchema, t.Null()]),
    controller_name: t.Union([t.String({ maxLength: 500 }), t.Null()]),
    controller_contact: t.Union([t.String({ maxLength: 500 }), t.Null()]),
    dpo_contact: t.Union([t.String({ maxLength: 500 }), t.Null()]),
    status: ProcessingActivityStatusSchema,
  })
);

export type UpdateProcessingActivity = Static<typeof UpdateProcessingActivitySchema>;

// =============================================================================
// Filters Schema
// =============================================================================

export const ProcessingActivityFiltersSchema = t.Object({
  status: t.Optional(ProcessingActivityStatusSchema),
  lawful_basis: t.Optional(LawfulBasisSchema),
  dpia_required: t.Optional(t.Boolean()),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type ProcessingActivityFilters = Static<typeof ProcessingActivityFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const ProcessingActivityResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  purpose: t.String(),
  lawful_basis: LawfulBasisSchema,
  lawful_basis_detail: t.Union([t.String(), t.Null()]),
  data_subjects: t.Array(t.String()),
  data_categories: t.Array(t.String()),
  recipients: t.Array(t.String()),
  international_transfers: t.Array(InternationalTransferSchema),
  retention_period: t.Union([t.String(), t.Null()]),
  security_measures: t.Union([t.String(), t.Null()]),
  dpia_required: t.Boolean(),
  dpia_id: t.Union([UuidSchema, t.Null()]),
  controller_name: t.Union([t.String(), t.Null()]),
  controller_contact: t.Union([t.String(), t.Null()]),
  dpo_contact: t.Union([t.String(), t.Null()]),
  status: ProcessingActivityStatusSchema,
  last_reviewed_at: t.Union([t.String(), t.Null()]),
  last_reviewed_by: t.Union([UuidSchema, t.Null()]),
  created_by: t.Union([UuidSchema, t.Null()]),
  updated_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type ProcessingActivityResponse = Static<typeof ProcessingActivityResponseSchema>;

export const ProcessingActivityListResponseSchema = t.Object({
  items: t.Array(ProcessingActivityResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type ProcessingActivityListResponse = Static<typeof ProcessingActivityListResponseSchema>;

// =============================================================================
// Export Response Schema (Article 30 Report)
// =============================================================================

export const RopaExportResponseSchema = t.Object({
  /** ISO 8601 timestamp of when this export was generated */
  generated_at: t.String(),
  /** Organisation (controller) name */
  controller_name: t.Union([t.String(), t.Null()]),
  /** DPO contact */
  dpo_contact: t.Union([t.String(), t.Null()]),
  /** Total number of processing activities */
  total_activities: t.Number(),
  /** All active processing activities */
  activities: t.Array(ProcessingActivityResponseSchema),
  /** Summary statistics */
  summary: t.Object({
    by_lawful_basis: t.Record(t.String(), t.Number()),
    by_status: t.Record(t.String(), t.Number()),
    requiring_dpia: t.Number(),
    with_international_transfers: t.Number(),
  }),
});

export type RopaExportResponse = Static<typeof RopaExportResponseSchema>;

// =============================================================================
// Seed / Pre-populate Schema
// =============================================================================

export const SeedProcessingActivitiesResponseSchema = t.Object({
  created: t.Number(),
  activities: t.Array(t.Object({
    id: UuidSchema,
    name: t.String(),
  })),
});

export type SeedProcessingActivitiesResponse = Static<typeof SeedProcessingActivitiesResponseSchema>;
