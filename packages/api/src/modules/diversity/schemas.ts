/**
 * Diversity Monitoring Module - TypeBox Schemas
 *
 * Defines validation schemas for all Diversity Monitoring API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * All diversity fields are voluntary (Equality Act 2010).
 * consent_given must be true before any data is stored.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Disability status enum (Equality Act 2010 categories)
 */
export const DisabilityStatusSchema = t.Union([
  t.Literal("prefer_not_to_say"),
  t.Literal("no"),
  t.Literal("yes_limited_a_lot"),
  t.Literal("yes_limited_a_little"),
]);

export type DisabilityStatus = Static<typeof DisabilityStatusSchema>;

/**
 * Sexual orientation enum
 */
export const SexualOrientationSchema = t.Union([
  t.Literal("prefer_not_to_say"),
  t.Literal("heterosexual"),
  t.Literal("gay_or_lesbian"),
  t.Literal("bisexual"),
  t.Literal("other"),
]);

export type SexualOrientation = Static<typeof SexualOrientationSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Diversity Data Schemas
// =============================================================================

/**
 * Schema for submitting/updating diversity data.
 * All diversity fields are optional. consent_given is required
 * and must be true for data to be stored.
 */
export const UpsertDiversityDataSchema = t.Object({
  ethnicity: t.Optional(t.String({ maxLength: 100 })),
  ethnicity_other: t.Optional(t.String({ maxLength: 100 })),
  disability_status: t.Optional(DisabilityStatusSchema),
  disability_details: t.Optional(t.String({ maxLength: 2000 })),
  religion_belief: t.Optional(t.String({ maxLength: 100 })),
  religion_other: t.Optional(t.String({ maxLength: 100 })),
  sexual_orientation: t.Optional(SexualOrientationSchema),
  sexual_orientation_other: t.Optional(t.String({ maxLength: 100 })),
  consent_given: t.Boolean(),
});

export type UpsertDiversityData = Static<typeof UpsertDiversityDataSchema>;

/**
 * Response schema for diversity data
 */
export const DiversityDataResponseSchema = t.Object({
  id: UuidSchema,
  employeeId: UuidSchema,
  ethnicity: t.Union([t.String(), t.Null()]),
  ethnicityOther: t.Union([t.String(), t.Null()]),
  disabilityStatus: t.Union([t.String(), t.Null()]),
  disabilityDetails: t.Union([t.String(), t.Null()]),
  religionBelief: t.Union([t.String(), t.Null()]),
  religionOther: t.Union([t.String(), t.Null()]),
  sexualOrientation: t.Union([t.String(), t.Null()]),
  sexualOrientationOther: t.Union([t.String(), t.Null()]),
  consentGiven: t.Boolean(),
  consentDate: t.Union([t.String(), t.Null()]),
  dataCollectedAt: t.Union([t.String(), t.Null()]),
  updatedAt: t.Union([t.String(), t.Null()]),
});

export type DiversityDataResponse = Static<typeof DiversityDataResponseSchema>;

// =============================================================================
// Aggregate Stats Schemas
// =============================================================================

/**
 * A single category count in aggregate reporting
 */
export const CategoryCountSchema = t.Object({
  value: t.Union([t.String(), t.Null()]),
  count: t.Number(),
});

export type CategoryCount = Static<typeof CategoryCountSchema>;

/**
 * Response schema for aggregate diversity statistics.
 * Returns counts only -- never individual identification data.
 */
export const AggregateStatsResponseSchema = t.Object({
  totalResponses: t.Number(),
  ethnicity: t.Array(CategoryCountSchema),
  disabilityStatus: t.Array(CategoryCountSchema),
  religionBelief: t.Array(CategoryCountSchema),
  sexualOrientation: t.Array(CategoryCountSchema),
});

export type AggregateStatsResponse = Static<typeof AggregateStatsResponseSchema>;

/**
 * Response schema for completion rate
 */
export const CompletionRateResponseSchema = t.Object({
  totalEmployees: t.Number(),
  totalSubmissions: t.Number(),
  completionRate: t.Number(),
});

export type CompletionRateResponse = Static<typeof CompletionRateResponseSchema>;
