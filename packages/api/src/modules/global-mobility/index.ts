/**
 * Global Mobility Module
 *
 * Provides international assignment tracking for global mobility management.
 * Supports short-term, long-term, permanent transfer, and commuter assignments
 * with visa tracking, tax equalisation, and relocation package management.
 *
 * Usage:
 * ```typescript
 * import { globalMobilityRoutes } from './modules/global-mobility';
 *
 * const app = new Elysia()
 *   .use(globalMobilityRoutes);
 * ```
 */

// Export routes
export { globalMobilityRoutes, type GlobalMobilityRoutes } from "./routes";

// Export service
export { GlobalMobilityService } from "./service";

// Export repository
export { GlobalMobilityRepository } from "./repository";

// Export schemas
export {
  CreateAssignmentSchema,
  UpdateAssignmentSchema,
  AssignmentStatusTransitionSchema,
  AssignmentResponseSchema,
  AssignmentFiltersSchema,
  ExpiringAssignmentsQuerySchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateAssignment,
  type UpdateAssignment,
  type AssignmentStatusTransition,
  type AssignmentResponse,
  type AssignmentFilters,
  type AssignmentStatus,
  type AssignmentType,
  type VisaStatus,
  type ExpiringAssignmentsQuery,
  type IdParams,
  type OptionalIdempotencyHeader,
  type PaginationQuery,
} from "./schemas";
