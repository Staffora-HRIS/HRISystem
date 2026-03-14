/**
 * Parental Bereavement Leave Module
 *
 * Provides the complete API layer for Parental Bereavement Leave (Jack's Law)
 * under the Parental Bereavement (Leave and Pay) Act 2018.
 *
 * Usage:
 * ```typescript
 * import { bereavementRoutes } from './modules/bereavement';
 *
 * const app = new Elysia()
 *   .use(bereavementRoutes);
 * ```
 */

// Export routes
export { bereavementRoutes, type BereavementRoutes } from "./routes";

// Export service
export { BereavementService } from "./service";

// Export repository
export {
  BereavementRepository,
  type TenantContext,
  type PaginatedResult,
  type BereavementLeaveRow,
} from "./repository";

// Export schemas
export {
  // Enums
  BereavementStatusSchema,
  // Request schemas
  CreateBereavementLeaveSchema,
  UpdateBereavementLeaveSchema,
  BereavementStatusTransitionSchema,
  // Response schemas
  BereavementLeaveResponseSchema,
  BereavementLeaveListResponseSchema,
  // Filter schemas
  BereavementLeaveFiltersSchema,
  // Common schemas
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  // Param schemas
  IdParamsSchema,
  // Header schemas
  OptionalIdempotencyHeaderSchema,
  // Types
  type BereavementStatus,
  type CreateBereavementLeave,
  type UpdateBereavementLeave,
  type BereavementStatusTransition,
  type BereavementLeaveResponse,
  type BereavementLeaveListResponse,
  type BereavementLeaveFilters,
  type PaginationQuery,
  type IdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
