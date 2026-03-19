/**
 * DPIA Module - TypeBox Schemas
 *
 * Defines validation schemas for all DPIA (Data Protection Impact Assessment)
 * API endpoints. Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * UK GDPR Article 35 requires DPIAs for high-risk data processing:
 * - Systematic description of processing operations and purposes
 * - Assessment of necessity and proportionality
 * - Assessment of risks to rights and freedoms of data subjects
 * - Measures to address those risks
 *
 * State machine: draft -> in_review -> approved / rejected
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const DpiaStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("in_review"),
  t.Literal("approved"),
  t.Literal("rejected"),
]);

export type DpiaStatus = Static<typeof DpiaStatusSchema>;

export const RiskLevelSchema = t.Union([
  t.Literal("low"),
  t.Literal("medium"),
  t.Literal("high"),
]);

export type RiskLevel = Static<typeof RiskLevelSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern:
    "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
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
// Create DPIA Schema (POST /dpia)
// =============================================================================

export const CreateDpiaSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 10000 })),
  processing_activity_id: t.Optional(UuidSchema),
  necessity_assessment: t.Optional(t.String({ maxLength: 20000 })),
  risk_assessment: t.Optional(t.Record(t.String(), t.Unknown())),
  mitigation_measures: t.Optional(t.Array(t.Record(t.String(), t.Unknown()))),
  dpo_opinion: t.Optional(t.String({ maxLength: 10000 })),
  review_date: t.Optional(t.String({ format: "date" })),
});

export type CreateDpia = Static<typeof CreateDpiaSchema>;

// =============================================================================
// Update DPIA Schema (PATCH /dpia/:id)
// =============================================================================

export const UpdateDpiaSchema = t.Object({
  title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  description: t.Optional(t.String({ maxLength: 10000 })),
  processing_activity_id: t.Optional(t.Union([UuidSchema, t.Null()])),
  necessity_assessment: t.Optional(t.String({ maxLength: 20000 })),
  risk_assessment: t.Optional(t.Record(t.String(), t.Unknown())),
  mitigation_measures: t.Optional(t.Array(t.Record(t.String(), t.Unknown()))),
  dpo_opinion: t.Optional(t.String({ maxLength: 10000 })),
  review_date: t.Optional(t.Union([t.String({ format: "date" }), t.Null()])),
});

export type UpdateDpia = Static<typeof UpdateDpiaSchema>;

// =============================================================================
// Add Risk Schema (POST /dpia/:id/risks)
// =============================================================================

export const AddRiskSchema = t.Object({
  risk_description: t.String({ minLength: 1, maxLength: 10000 }),
  likelihood: RiskLevelSchema,
  impact: RiskLevelSchema,
  risk_score: t.Number({ minimum: 0, maximum: 9 }),
  mitigation: t.Optional(t.String({ maxLength: 10000 })),
  residual_risk: RiskLevelSchema,
});

export type AddRisk = Static<typeof AddRiskSchema>;

// =============================================================================
// Submit for Review Schema (POST /dpia/:id/submit)
// =============================================================================

export const SubmitDpiaSchema = t.Object({
  notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type SubmitDpia = Static<typeof SubmitDpiaSchema>;

// =============================================================================
// Approve / Reject DPIA Schema (POST /dpia/:id/approve)
// =============================================================================

export const ApproveDpiaSchema = t.Object({
  decision: t.Union([t.Literal("approved"), t.Literal("rejected")]),
  dpo_opinion: t.Optional(t.String({ maxLength: 10000 })),
});

export type ApproveDpia = Static<typeof ApproveDpiaSchema>;

// =============================================================================
// Filters Schema
// =============================================================================

export const DpiaFiltersSchema = t.Object({
  status: t.Optional(DpiaStatusSchema),
  search: t.Optional(t.String({ minLength: 1 })),
  review_due_before: t.Optional(t.String({ format: "date" })),
});

export type DpiaFilters = Static<typeof DpiaFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const DpiaRiskResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  dpia_id: UuidSchema,
  risk_description: t.String(),
  likelihood: RiskLevelSchema,
  impact: RiskLevelSchema,
  risk_score: t.Number(),
  mitigation: t.Union([t.String(), t.Null()]),
  residual_risk: RiskLevelSchema,
  created_at: t.String(),
});

export type DpiaRiskResponse = Static<typeof DpiaRiskResponseSchema>;

export const DpiaResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  processing_activity_id: t.Union([UuidSchema, t.Null()]),
  title: t.String(),
  description: t.Union([t.String(), t.Null()]),
  necessity_assessment: t.Union([t.String(), t.Null()]),
  risk_assessment: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
  mitigation_measures: t.Union([
    t.Array(t.Record(t.String(), t.Unknown())),
    t.Null(),
  ]),
  dpo_opinion: t.Union([t.String(), t.Null()]),
  status: DpiaStatusSchema,
  approved_by: t.Union([UuidSchema, t.Null()]),
  approved_at: t.Union([t.String(), t.Null()]),
  review_date: t.Union([t.String(), t.Null()]),
  created_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
  risks: t.Optional(t.Array(DpiaRiskResponseSchema)),
});

export type DpiaResponse = Static<typeof DpiaResponseSchema>;

export const DpiaListResponseSchema = t.Object({
  items: t.Array(DpiaResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type DpiaListResponse = Static<typeof DpiaListResponseSchema>;
