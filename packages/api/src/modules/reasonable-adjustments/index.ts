/**
 * Reasonable Adjustments Module
 *
 * Provides the complete API layer for tracking reasonable adjustments
 * under the Equality Act 2010 (ss.20-22).
 *
 * Usage:
 * ```typescript
 * import { reasonableAdjustmentsRoutes } from './modules/reasonable-adjustments';
 *
 * const app = new Elysia()
 *   .use(reasonableAdjustmentsRoutes);
 * ```
 */

// Export routes
export { reasonableAdjustmentsRoutes, type ReasonableAdjustmentsRoutes } from "./routes";

// Export service
export { ReasonableAdjustmentsService } from "./service";
export type { ServiceResult, PaginatedServiceResult, TenantContext as ServiceTenantContext } from "../../types/service-result";

// Export repository
export {
  ReasonableAdjustmentsRepository,
  type TenantContext,
  type PaginatedResult,
  type AdjustmentRow,
} from "./repository";

// Export schemas
export {
  // Enums
  AdjustmentStatusSchema,
  RequestedBySchema,
  AdjustmentCategorySchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  // Request schemas
  CreateAdjustmentSchema,
  AssessAdjustmentSchema,
  DecideAdjustmentSchema,
  ImplementAdjustmentSchema,
  AdjustmentFiltersSchema,
  // Response schemas
  AdjustmentResponseSchema,
  AdjustmentListItemSchema,
  AdjustmentListResponseSchema,
  DueReviewItemSchema,
  // Params
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type AdjustmentStatus,
  type RequestedBy,
  type AdjustmentCategory,
  type PaginationQuery,
  type CreateAdjustment,
  type AssessAdjustment,
  type DecideAdjustment,
  type ImplementAdjustment,
  type AdjustmentFilters,
  type AdjustmentResponse,
  type AdjustmentListItem,
  type AdjustmentListResponse,
  type DueReviewItem,
  type IdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
