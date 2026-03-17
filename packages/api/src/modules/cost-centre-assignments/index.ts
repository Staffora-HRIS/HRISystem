/**
 * Cost Centre Assignments Module
 *
 * Provides effective-dated cost centre assignment tracking for
 * employees, departments, and positions with percentage-based allocation.
 *
 * Usage:
 * ```typescript
 * import { costCentreAssignmentRoutes } from './modules/cost-centre-assignments';
 *
 * const app = new Elysia()
 *   .use(costCentreAssignmentRoutes);
 * ```
 */

// Export routes
export { costCentreAssignmentRoutes, type CostCentreAssignmentRoutes } from "./routes";

// Export service
export { CostCentreAssignmentService } from "./service";

// Export repository
export { CostCentreAssignmentRepository } from "./repository";

// Export schemas
export {
  CreateCostCentreAssignmentSchema,
  UpdateCostCentreAssignmentSchema,
  CostCentreAssignmentResponseSchema,
  CostCentreAssignmentFiltersSchema,
  EntityHistoryParamsSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";
