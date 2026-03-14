/**
 * Return to Work Module
 *
 * Provides the complete API layer for return-to-work interview operations.
 * UK absence management best practice: conduct a return-to-work interview
 * after every period of absence.
 *
 * Usage:
 * ```typescript
 * import { returnToWorkRoutes } from './modules/return-to-work';
 *
 * const app = new Elysia()
 *   .use(returnToWorkRoutes);
 * ```
 */

// Export routes
export { returnToWorkRoutes, type ReturnToWorkRoutes } from "./routes";

// Export service
export { ReturnToWorkService } from "./service";

// Export repository
export {
  ReturnToWorkRepository,
  type TenantContext,
  type PaginatedResult,
  type InterviewRow,
} from "./repository";

// Export schemas
export {
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  // Create / Update / Complete
  CreateInterviewSchema,
  UpdateInterviewSchema,
  CompleteInterviewSchema,
  // Response
  InterviewResponseSchema,
  InterviewListResponseSchema,
  // Filters
  InterviewFiltersSchema,
  // Params
  IdParamsSchema,
  // Headers
  OptionalIdempotencyHeaderSchema,
  // Types
  type PaginationQuery,
  type CreateInterview,
  type UpdateInterview,
  type CompleteInterview,
  type InterviewResponse,
  type InterviewListResponse,
  type InterviewFilters,
  type IdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
