/**
 * Secondment Module
 *
 * Provides secondment management (internal and external).
 *
 * Usage:
 * ```typescript
 * import { secondmentRoutes } from './modules/secondments';
 *
 * const app = new Elysia()
 *   .use(secondmentRoutes);
 * ```
 */

// Export routes
export { secondmentRoutes, type SecondmentRoutes } from "./routes";

// Export service
export { SecondmentService } from "./service";

// Export repository
export { SecondmentRepository } from "./repository";

// Export schemas
export {
  CreateSecondmentSchema,
  UpdateSecondmentSchema,
  SecondmentStatusTransitionSchema,
  SecondmentResponseSchema,
  SecondmentFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";
