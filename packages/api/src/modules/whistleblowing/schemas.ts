/**
 * Whistleblowing Module - TypeBox Schemas
 *
 * Defines validation schemas for all Whistleblowing API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * UK Public Interest Disclosure Act 1998 (PIDA) compliance:
 * - Anonymous and confidential reporting channels
 * - PIDA protection flag for qualifying disclosures
 * - Restricted access to designated officers only
 * - Full audit trail for all case actions
 *
 * State machine: submitted -> under_review -> investigating -> resolved/dismissed -> closed
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const ConfidentialityLevelSchema = t.Union([
  t.Literal("confidential"),
  t.Literal("anonymous"),
]);

export type ConfidentialityLevel = Static<typeof ConfidentialityLevelSchema>;

export const WhistleblowingCategorySchema = t.Union([
  t.Literal("fraud"),
  t.Literal("health_and_safety"),
  t.Literal("environmental"),
  t.Literal("criminal_offence"),
  t.Literal("miscarriage_of_justice"),
  t.Literal("breach_of_legal_obligation"),
  t.Literal("cover_up"),
  t.Literal("other"),
]);

export type WhistleblowingCategory = Static<typeof WhistleblowingCategorySchema>;

export const WhistleblowingStatusSchema = t.Union([
  t.Literal("submitted"),
  t.Literal("under_review"),
  t.Literal("investigating"),
  t.Literal("resolved"),
  t.Literal("dismissed"),
  t.Literal("closed"),
]);

export type WhistleblowingStatus = Static<typeof WhistleblowingStatusSchema>;

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
// Submit Report Schema (POST /reports)
// =============================================================================

export const SubmitReportSchema = t.Object({
  /** Category of the disclosure */
  category: WhistleblowingCategorySchema,
  /** Detailed description of the concern */
  description: t.String({ minLength: 10, maxLength: 50000 }),
  /** Confidentiality level: confidential (identity known to officer) or anonymous */
  confidentiality_level: t.Optional(ConfidentialityLevelSchema),
  /** Whether this is a qualifying disclosure under PIDA 1998 */
  pida_protected: t.Optional(t.Boolean()),
});

export type SubmitReport = Static<typeof SubmitReportSchema>;

// =============================================================================
// Update Case Schema (PATCH /reports/:id)
// =============================================================================

export const UpdateCaseSchema = t.Object({
  /** Transition status */
  status: t.Optional(WhistleblowingStatusSchema),
  /** Assign to a designated officer */
  assigned_to: t.Optional(t.Union([UuidSchema, t.Null()])),
  /** Internal investigation notes (not visible to reporter) */
  investigation_notes: t.Optional(t.String({ maxLength: 50000 })),
  /** Outcome summary */
  outcome: t.Optional(t.String({ maxLength: 10000 })),
  /** Update PIDA protection flag */
  pida_protected: t.Optional(t.Boolean()),
});

export type UpdateCase = Static<typeof UpdateCaseSchema>;

// =============================================================================
// Filter Schema
// =============================================================================

export const WhistleblowingFiltersSchema = t.Object({
  status: t.Optional(WhistleblowingStatusSchema),
  category: t.Optional(WhistleblowingCategorySchema),
  confidentiality_level: t.Optional(ConfidentialityLevelSchema),
  pida_protected: t.Optional(t.Boolean()),
  assigned_to: t.Optional(UuidSchema),
  search: t.Optional(t.String({ minLength: 1 })),
  created_from: t.Optional(t.String({ format: "date" })),
  created_to: t.Optional(t.String({ format: "date" })),
});

export type WhistleblowingFilters = Static<typeof WhistleblowingFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const WhistleblowingCaseResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  reporter_id: t.Union([UuidSchema, t.Null()]),
  category: WhistleblowingCategorySchema,
  description: t.String(),
  confidentiality_level: ConfidentialityLevelSchema,
  pida_protected: t.Boolean(),
  assigned_to: t.Union([UuidSchema, t.Null()]),
  status: WhistleblowingStatusSchema,
  investigation_notes: t.Union([t.String(), t.Null()]),
  outcome: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type WhistleblowingCaseResponse = Static<typeof WhistleblowingCaseResponseSchema>;

export const WhistleblowingCaseListResponseSchema = t.Object({
  items: t.Array(WhistleblowingCaseResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type WhistleblowingCaseListResponse = Static<typeof WhistleblowingCaseListResponseSchema>;

export const WhistleblowingAuditEntryResponseSchema = t.Object({
  id: UuidSchema,
  case_id: UuidSchema,
  action: t.String(),
  action_by: t.Union([UuidSchema, t.Null()]),
  old_values: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
  new_values: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type WhistleblowingAuditEntryResponse = Static<typeof WhistleblowingAuditEntryResponseSchema>;
