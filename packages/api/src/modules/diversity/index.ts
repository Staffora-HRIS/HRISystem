/**
 * Diversity Monitoring Module
 *
 * Provides voluntary diversity data collection and aggregate reporting
 * in compliance with the Equality Act 2010 (UK).
 *
 * Features:
 * - Employee self-service: submit, update, and withdraw diversity data
 * - Admin aggregate reporting: counts per category (never individual data)
 * - Completion rate tracking
 * - Explicit consent enforcement before data collection
 *
 * Usage:
 * ```typescript
 * import { diversityRoutes } from './modules/diversity';
 *
 * const app = new Elysia()
 *   .use(diversityRoutes);
 * ```
 */

// Export routes
export { diversityRoutes, type DiversityRoutes } from "./routes";

// Export service
export { DiversityService } from "./service";
export type { ServiceResult, TenantContext as ServiceTenantContext } from "../../types/service-result";

// Export repository
export {
  DiversityRepository,
  type TenantContext,
  type DiversityDataRow,
  type CategoryCount,
  type AggregateStats,
  type CompletionRate,
} from "./repository";

// Export schemas
export {
  // Enums
  DisabilityStatusSchema,
  SexualOrientationSchema,
  // Data schemas
  UpsertDiversityDataSchema,
  DiversityDataResponseSchema,
  // Aggregate schemas
  CategoryCountSchema,
  AggregateStatsResponseSchema,
  CompletionRateResponseSchema,
  // Common
  UuidSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type DisabilityStatus,
  type SexualOrientation,
  type UpsertDiversityData,
  type DiversityDataResponse,
  type CategoryCount as CategoryCountType,
  type AggregateStatsResponse,
  type CompletionRateResponse,
  type IdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
