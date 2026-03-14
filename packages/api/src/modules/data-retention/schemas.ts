/**
 * Data Retention Module - TypeBox Schemas
 *
 * Defines validation schemas for UK GDPR Article 5(1)(e) storage limitation endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Data categories that can have retention policies
 */
export const RetentionDataCategorySchema = t.Union([
  t.Literal("employee_records"),
  t.Literal("payroll"),
  t.Literal("tax"),
  t.Literal("time_entries"),
  t.Literal("leave_records"),
  t.Literal("performance_reviews"),
  t.Literal("training_records"),
  t.Literal("recruitment"),
  t.Literal("cases"),
  t.Literal("audit_logs"),
  t.Literal("documents"),
  t.Literal("medical"),
]);

export type RetentionDataCategory = Static<typeof RetentionDataCategorySchema>;

/**
 * Legal basis for data retention
 */
export const RetentionLegalBasisSchema = t.Union([
  t.Literal("employment_law"),
  t.Literal("tax_law"),
  t.Literal("pension_law"),
  t.Literal("limitation_act"),
  t.Literal("consent"),
  t.Literal("legitimate_interest"),
]);

export type RetentionLegalBasis = Static<typeof RetentionLegalBasisSchema>;

/**
 * Retention policy status
 */
export const RetentionPolicyStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("inactive"),
]);

export type RetentionPolicyStatus = Static<typeof RetentionPolicyStatusSchema>;

/**
 * Retention review status
 */
export const RetentionReviewStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("in_progress"),
  t.Literal("completed"),
  t.Literal("skipped"),
]);

export type RetentionReviewStatus = Static<typeof RetentionReviewStatusSchema>;

/**
 * Retention exception reason
 */
export const RetentionExceptionReasonSchema = t.Union([
  t.Literal("legal_hold"),
  t.Literal("active_litigation"),
  t.Literal("regulatory_investigation"),
  t.Literal("employee_request"),
]);

export type RetentionExceptionReason = Static<
  typeof RetentionExceptionReasonSchema
>;

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern:
    "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const PolicyIdParamsSchema = t.Object({
  policyId: UuidSchema,
});

export type PolicyIdParams = Static<typeof PolicyIdParamsSchema>;

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(
    t.String({ minLength: 1, maxLength: 100 })
  ),
});

export type OptionalIdempotencyHeader = Static<
  typeof OptionalIdempotencyHeaderSchema
>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create a new retention policy
 */
export const CreateRetentionPolicySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 5000 })),
  data_category: RetentionDataCategorySchema,
  retention_period_months: t.Number({ minimum: 1, maximum: 600 }),
  legal_basis: RetentionLegalBasisSchema,
  auto_purge_enabled: t.Optional(t.Boolean({ default: false })),
  notification_before_purge_days: t.Optional(
    t.Number({ minimum: 0, maximum: 365, default: 30 })
  ),
});

export type CreateRetentionPolicy = Static<
  typeof CreateRetentionPolicySchema
>;

/**
 * Update a retention policy
 */
export const UpdateRetentionPolicySchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 200 }),
    description: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    retention_period_months: t.Number({ minimum: 1, maximum: 600 }),
    legal_basis: RetentionLegalBasisSchema,
    auto_purge_enabled: t.Boolean(),
    notification_before_purge_days: t.Number({
      minimum: 0,
      maximum: 365,
    }),
    status: RetentionPolicyStatusSchema,
  })
);

export type UpdateRetentionPolicy = Static<
  typeof UpdateRetentionPolicySchema
>;

/**
 * Create a retention exception (legal hold)
 */
export const CreateRetentionExceptionSchema = t.Object({
  policy_id: UuidSchema,
  record_type: t.String({ minLength: 1, maxLength: 100 }),
  record_id: UuidSchema,
  reason: RetentionExceptionReasonSchema,
  exception_until: t.Optional(
    t.String({ format: "date-time" })
  ),
});

export type CreateRetentionException = Static<
  typeof CreateRetentionExceptionSchema
>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Retention policy response
 */
export const RetentionPolicyResponseSchema = t.Object({
  id: t.String(),
  tenantId: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  dataCategory: RetentionDataCategorySchema,
  retentionPeriodMonths: t.Number(),
  legalBasis: RetentionLegalBasisSchema,
  autoPurgeEnabled: t.Boolean(),
  notificationBeforePurgeDays: t.Number(),
  status: RetentionPolicyStatusSchema,
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type RetentionPolicyResponse = Static<
  typeof RetentionPolicyResponseSchema
>;

/**
 * Retention policy list response
 */
export const RetentionPolicyListResponseSchema = t.Object({
  items: t.Array(RetentionPolicyResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type RetentionPolicyListResponse = Static<
  typeof RetentionPolicyListResponseSchema
>;

/**
 * Retention review response
 */
export const RetentionReviewResponseSchema = t.Object({
  id: t.String(),
  tenantId: t.String(),
  policyId: t.String(),
  reviewDate: t.String(),
  reviewerId: t.Union([t.String(), t.Null()]),
  recordsReviewed: t.Number(),
  recordsPurged: t.Number(),
  recordsRetainedReason: t.Union([t.String(), t.Null()]),
  status: RetentionReviewStatusSchema,
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type RetentionReviewResponse = Static<
  typeof RetentionReviewResponseSchema
>;

/**
 * Retention review list response
 */
export const RetentionReviewListResponseSchema = t.Object({
  items: t.Array(RetentionReviewResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type RetentionReviewListResponse = Static<
  typeof RetentionReviewListResponseSchema
>;

/**
 * Retention exception response
 */
export const RetentionExceptionResponseSchema = t.Object({
  id: t.String(),
  tenantId: t.String(),
  policyId: t.String(),
  recordType: t.String(),
  recordId: t.String(),
  reason: RetentionExceptionReasonSchema,
  exceptionUntil: t.Union([t.String(), t.Null()]),
  createdBy: t.String(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type RetentionExceptionResponse = Static<
  typeof RetentionExceptionResponseSchema
>;

/**
 * Dashboard response — overview of retention status
 */
export const RetentionDashboardResponseSchema = t.Object({
  totalPolicies: t.Number(),
  activePolicies: t.Number(),
  totalExceptions: t.Number(),
  activeExceptions: t.Number(),
  upcomingReviews: t.Number(),
  lastPurgeDate: t.Union([t.String(), t.Null()]),
  policySummary: t.Array(
    t.Object({
      id: t.String(),
      name: t.String(),
      dataCategory: t.String(),
      retentionPeriodMonths: t.Number(),
      status: t.String(),
      autoPurgeEnabled: t.Boolean(),
      lastReviewDate: t.Union([t.String(), t.Null()]),
      exceptionCount: t.Number(),
    })
  ),
});

export type RetentionDashboardResponse = Static<
  typeof RetentionDashboardResponseSchema
>;

/**
 * Expired records identification response
 */
export const ExpiredRecordsResponseSchema = t.Object({
  policyId: t.String(),
  policyName: t.String(),
  dataCategory: t.String(),
  retentionPeriodMonths: t.Number(),
  expiredRecordCount: t.Number(),
  exceptedRecordCount: t.Number(),
  purgeableCount: t.Number(),
  cutoffDate: t.String(),
});

export type ExpiredRecordsResponse = Static<
  typeof ExpiredRecordsResponseSchema
>;

/**
 * Review execution result response
 */
export const ReviewExecutionResponseSchema = t.Object({
  review: RetentionReviewResponseSchema,
  policyName: t.String(),
  dataCategory: t.String(),
});

export type ReviewExecutionResponse = Static<
  typeof ReviewExecutionResponseSchema
>;

/**
 * Seed defaults result
 */
export const SeedDefaultsResponseSchema = t.Object({
  created: t.Number(),
  skipped: t.Number(),
  policies: t.Array(RetentionPolicyResponseSchema),
});

export type SeedDefaultsResponse = Static<typeof SeedDefaultsResponseSchema>;

/**
 * Delete success response
 */
export const DeleteSuccessResponseSchema = t.Object({
  success: t.Literal(true),
  message: t.String(),
});

export type DeleteSuccessResponse = Static<typeof DeleteSuccessResponseSchema>;
