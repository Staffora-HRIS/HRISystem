/**
 * Tribunal Module - TypeBox Schemas
 *
 * Defines validation schemas for all Employment Tribunal Preparation API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Tribunal case status enum matching database type
 */
export const TribunalCaseStatusSchema = t.Union([
  t.Literal("preparation"),
  t.Literal("submitted"),
  t.Literal("hearing"),
  t.Literal("decided"),
]);

export type TribunalCaseStatus = Static<typeof TribunalCaseStatusSchema>;

/**
 * Tribunal claim type enum matching database type
 */
export const TribunalClaimTypeSchema = t.Union([
  t.Literal("unfair_dismissal"),
  t.Literal("constructive_dismissal"),
  t.Literal("wrongful_dismissal"),
  t.Literal("discrimination"),
  t.Literal("harassment"),
  t.Literal("victimisation"),
  t.Literal("equal_pay"),
  t.Literal("redundancy_payment"),
  t.Literal("breach_of_contract"),
  t.Literal("whistleblowing_detriment"),
  t.Literal("working_time"),
  t.Literal("unlawful_deduction_wages"),
  t.Literal("tupe"),
  t.Literal("trade_union"),
  t.Literal("other"),
]);

export type TribunalClaimType = Static<typeof TribunalClaimTypeSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * UUID schema
 */
export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

/**
 * Date string schema (YYYY-MM-DD)
 */
export const DateSchema = t.String({
  format: "date",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});

/**
 * Cursor pagination schema
 */
export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Document Schema (for JSONB documents array)
// =============================================================================

/**
 * A single document reference in the tribunal bundle
 */
export const TribunalDocumentSchema = t.Object({
  id: t.String({ minLength: 1 }),
  name: t.String({ minLength: 1, maxLength: 500 }),
  type: t.String({ minLength: 1, maxLength: 100 }),
  url: t.Optional(t.String({ maxLength: 2000 })),
  added_at: t.String(),
  added_by: t.Optional(t.String()),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type TribunalDocument = Static<typeof TribunalDocumentSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create tribunal case request
 */
export const CreateTribunalCaseSchema = t.Object({
  case_id: t.Optional(UuidSchema),
  employee_id: UuidSchema,
  tribunal_reference: t.Optional(t.String({ maxLength: 100 })),
  hearing_date: t.Optional(DateSchema),
  claim_type: TribunalClaimTypeSchema,
  respondent_representative: t.Optional(t.String({ maxLength: 500 })),
  claimant_representative: t.Optional(t.String({ maxLength: 500 })),
  notes: t.Optional(t.String({ maxLength: 10000 })),
});

export type CreateTribunalCase = Static<typeof CreateTribunalCaseSchema>;

/**
 * Update tribunal case request
 */
export const UpdateTribunalCaseSchema = t.Object({
  tribunal_reference: t.Optional(t.String({ maxLength: 100 })),
  hearing_date: t.Optional(t.Union([DateSchema, t.Null()])),
  claim_type: t.Optional(TribunalClaimTypeSchema),
  respondent_representative: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
  claimant_representative: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
  status: t.Optional(TribunalCaseStatusSchema),
  outcome: t.Optional(t.Union([t.String({ maxLength: 5000 }), t.Null()])),
  notes: t.Optional(t.Union([t.String({ maxLength: 10000 }), t.Null()])),
});

export type UpdateTribunalCase = Static<typeof UpdateTribunalCaseSchema>;

/**
 * Add document to tribunal case request
 */
export const AddTribunalDocumentSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 500 }),
  type: t.String({ minLength: 1, maxLength: 100 }),
  url: t.Optional(t.String({ maxLength: 2000 })),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type AddTribunalDocument = Static<typeof AddTribunalDocumentSchema>;

/**
 * Update document in tribunal case request
 */
export const UpdateTribunalDocumentSchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
  type: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  url: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
  notes: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
});

export type UpdateTribunalDocument = Static<typeof UpdateTribunalDocumentSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Tribunal case response
 */
export const TribunalCaseResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  case_id: t.Union([UuidSchema, t.Null()]),
  employee_id: UuidSchema,
  tribunal_reference: t.Union([t.String(), t.Null()]),
  hearing_date: t.Union([t.String(), t.Null()]),
  claim_type: t.String(),
  respondent_representative: t.Union([t.String(), t.Null()]),
  claimant_representative: t.Union([t.String(), t.Null()]),
  documents: t.Array(TribunalDocumentSchema),
  status: t.String(),
  outcome: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  employee_name: t.Optional(t.String()),
  created_at: t.String(),
  updated_at: t.String(),
});

export type TribunalCaseResponse = Static<typeof TribunalCaseResponseSchema>;

/**
 * Tribunal case list response
 */
export const TribunalCaseListResponseSchema = t.Object({
  items: t.Array(TribunalCaseResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type TribunalCaseListResponse = Static<typeof TribunalCaseListResponseSchema>;

/**
 * Tribunal case filters for list endpoint
 */
export const TribunalCaseFiltersSchema = t.Object({
  status: t.Optional(TribunalCaseStatusSchema),
  claim_type: t.Optional(TribunalClaimTypeSchema),
  employee_id: t.Optional(UuidSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type TribunalCaseFilters = Static<typeof TribunalCaseFiltersSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

/**
 * ID parameter
 */
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

/**
 * Document ID parameter (nested under tribunal case)
 */
export const DocumentIdParamsSchema = t.Object({
  id: UuidSchema,
  documentId: t.String({ minLength: 1 }),
});

export type DocumentIdParams = Static<typeof DocumentIdParamsSchema>;

// =============================================================================
// Idempotency Header Schema
// =============================================================================

/**
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
