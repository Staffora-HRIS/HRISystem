/**
 * Beneficiary Nominations Module - TypeBox Schemas
 *
 * Defines validation schemas for all Beneficiary Nomination API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common
// =============================================================================

/**
 * UUID validation schema
 */
export const UuidSchema = t.String({ format: "uuid" });

/**
 * Pagination query parameters (cursor-based)
 */
export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.String({ pattern: "^[0-9]+$" })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Params
// =============================================================================

/**
 * Generic ID params for single resource routes
 */
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

/**
 * Employee ID params for employee-scoped routes
 */
export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

// =============================================================================
// Headers
// =============================================================================

/**
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Constants
// =============================================================================

/**
 * Allowed benefit types for nominations.
 * Mirrors the benefit_category enum values that support beneficiary designation.
 */
export const BENEFIT_TYPES = [
  "health",
  "dental",
  "vision",
  "life",
  "disability",
  "retirement",
  "hsa",
  "fsa",
  "wellness",
  "commuter",
  "education",
  "childcare",
  "legal",
  "other",
] as const;

export type BenefitType = (typeof BENEFIT_TYPES)[number];

/**
 * Common relationship values for beneficiary designation
 */
export const RELATIONSHIPS = [
  "spouse",
  "child",
  "parent",
  "sibling",
  "domestic_partner",
  "trust",
  "estate",
  "charity",
  "other",
] as const;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create beneficiary nomination request body
 */
export const CreateBeneficiaryNominationSchema = t.Object({
  benefit_type: t.String({ minLength: 1, maxLength: 50 }),
  beneficiary_name: t.String({ minLength: 1, maxLength: 255 }),
  relationship: t.String({ minLength: 1, maxLength: 100 }),
  date_of_birth: t.Optional(t.Union([t.String({ format: "date" }), t.Null()])),
  percentage: t.Number({ minimum: 0.01, maximum: 100 }),
  address: t.Optional(t.Union([t.String(), t.Null()])),
});

export type CreateBeneficiaryNomination = Static<typeof CreateBeneficiaryNominationSchema>;

/**
 * Update beneficiary nomination request body (all fields optional)
 */
export const UpdateBeneficiaryNominationSchema = t.Partial(
  t.Object({
    beneficiary_name: t.String({ minLength: 1, maxLength: 255 }),
    relationship: t.String({ minLength: 1, maxLength: 100 }),
    date_of_birth: t.Union([t.String({ format: "date" }), t.Null()]),
    percentage: t.Number({ minimum: 0.01, maximum: 100 }),
    address: t.Union([t.String(), t.Null()]),
  })
);

export type UpdateBeneficiaryNomination = Static<typeof UpdateBeneficiaryNominationSchema>;

/**
 * Query filter for listing nominations (optional benefit_type filter)
 */
export const NominationFiltersSchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.String({ pattern: "^[0-9]+$" })),
  benefit_type: t.Optional(t.String()),
});

export type NominationFilters = Static<typeof NominationFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Beneficiary nomination response schema
 */
export const BeneficiaryNominationResponseSchema = t.Object({
  id: t.String(),
  employeeId: t.String(),
  benefitType: t.String(),
  beneficiaryName: t.String(),
  relationship: t.String(),
  dateOfBirth: t.Union([t.String(), t.Null()]),
  percentage: t.Number(),
  address: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type BeneficiaryNominationResponse = Static<typeof BeneficiaryNominationResponseSchema>;

/**
 * List response schema with cursor-based pagination
 */
export const BeneficiaryNominationListResponseSchema = t.Object({
  items: t.Array(BeneficiaryNominationResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type BeneficiaryNominationListResponse = Static<typeof BeneficiaryNominationListResponseSchema>;

/**
 * Percentage summary per benefit type
 */
export const PercentageSummarySchema = t.Object({
  benefitType: t.String(),
  totalPercentage: t.Number(),
  isComplete: t.Boolean(),
  nominationCount: t.Number(),
});

export type PercentageSummary = Static<typeof PercentageSummarySchema>;

/**
 * Response for the percentage validation / summary endpoint
 */
export const PercentageSummaryListSchema = t.Object({
  items: t.Array(PercentageSummarySchema),
});

export type PercentageSummaryList = Static<typeof PercentageSummaryListSchema>;
