/**
 * Data Retention Module (UK GDPR Article 5(1)(e) - Storage Limitation)
 *
 * Provides the complete API layer for managing data retention policies,
 * identifying expired records, executing retention reviews/purges,
 * and managing legal hold exceptions.
 *
 * Usage:
 * ```typescript
 * import { dataRetentionRoutes } from './modules/data-retention';
 *
 * const app = new Elysia()
 *   .use(dataRetentionRoutes);
 * ```
 */

// Export routes
export { dataRetentionRoutes, type DataRetentionRoutes } from "./routes";

// Export service
export { DataRetentionService } from "./service";

// Export repository
export {
  DataRetentionRepository,
  type RetentionPolicyRow,
  type RetentionReviewRow,
  type RetentionExceptionRow,
  type PaginatedResult,
  type PolicyDashboardRow,
} from "./repository";

// Export schemas
export {
  // Enums
  RetentionDataCategorySchema,
  RetentionLegalBasisSchema,
  RetentionPolicyStatusSchema,
  RetentionReviewStatusSchema,
  RetentionExceptionReasonSchema,
  // Common
  UuidSchema,
  IdParamsSchema,
  PolicyIdParamsSchema,
  PaginationQuerySchema,
  OptionalIdempotencyHeaderSchema,
  // Request schemas
  CreateRetentionPolicySchema,
  UpdateRetentionPolicySchema,
  CreateRetentionExceptionSchema,
  // Response schemas
  RetentionPolicyResponseSchema,
  RetentionPolicyListResponseSchema,
  RetentionReviewResponseSchema,
  RetentionReviewListResponseSchema,
  RetentionExceptionResponseSchema,
  RetentionDashboardResponseSchema,
  ExpiredRecordsResponseSchema,
  ReviewExecutionResponseSchema,
  SeedDefaultsResponseSchema,
  DeleteSuccessResponseSchema,
  // Types
  type RetentionDataCategory,
  type RetentionLegalBasis,
  type RetentionPolicyStatus,
  type RetentionReviewStatus,
  type RetentionExceptionReason,
  type IdParams,
  type PolicyIdParams,
  type PaginationQuery,
  type OptionalIdempotencyHeader,
  type CreateRetentionPolicy,
  type UpdateRetentionPolicy,
  type CreateRetentionException,
  type RetentionPolicyResponse,
  type RetentionPolicyListResponse,
  type RetentionReviewResponse,
  type RetentionReviewListResponse,
  type RetentionExceptionResponse,
  type RetentionDashboardResponse,
  type ExpiredRecordsResponse,
  type ReviewExecutionResponse,
  type SeedDefaultsResponse,
  type DeleteSuccessResponse,
} from "./schemas";
