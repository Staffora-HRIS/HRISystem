/**
 * Probation Module
 *
 * Provides the complete API layer for probation review management and reminder tracking.
 *
 * Usage:
 * ```typescript
 * import { probationRoutes } from './modules/probation';
 *
 * const app = new Elysia()
 *   .use(probationRoutes);
 * ```
 */

// Export routes
export { probationRoutes, type ProbationRoutes } from "./routes";

// Export service
export { ProbationService } from "./service";

// Export repository
export { ProbationRepository } from "./repository";

// Export schemas
export {
  ProbationReviewResponseSchema,
  ProbationReviewDetailResponseSchema,
  ProbationReminderResponseSchema,
  ProbationFiltersSchema,
  CreateProbationReviewSchema,
  ExtendProbationSchema,
  CompleteProbationSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";
