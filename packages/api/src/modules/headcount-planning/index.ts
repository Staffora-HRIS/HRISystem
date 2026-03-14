/**
 * Headcount Planning Module
 *
 * Provides workforce headcount planning with plan and item management.
 *
 * Usage:
 * ```typescript
 * import { headcountPlanningRoutes } from './modules/headcount-planning';
 *
 * const app = new Elysia()
 *   .use(headcountPlanningRoutes);
 * ```
 */

// Export routes
export { headcountPlanningRoutes, type HeadcountPlanningRoutes } from "./routes";

// Export service
export { HeadcountPlanningService } from "./service";

// Export repository
export { HeadcountPlanningRepository } from "./repository";

// Export schemas
export {
  CreatePlanSchema,
  UpdatePlanSchema,
  CreatePlanItemSchema,
  UpdatePlanItemSchema,
  PlanResponseSchema,
  PlanItemResponseSchema,
  PlanFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  PlanItemParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";
