/**
 * Jobs Catalog Module
 *
 * Provides the complete API layer for the Jobs Catalog, including:
 * - Job listing with filters and cursor-based pagination
 * - Job CRUD operations
 * - Status transitions (draft -> active -> frozen/archived)
 * - Salary range validation
 *
 * Usage:
 * ```typescript
 * import { jobsRoutes } from './modules/jobs';
 *
 * const app = new Elysia()
 *   .use(jobsRoutes);
 * ```
 */

// Export routes
export { jobsRoutes, type JobsRoutes } from "./routes";

// Export service
export { JobsService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  JobsRepository,
  type TenantContext,
  type PaginatedResult,
  type JobRow,
} from "./repository";

// Export schemas
export {
  // Enums
  JobStatusSchema,
  WtrStatusSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  // Job schemas
  CreateJobSchema,
  UpdateJobSchema,
  JobResponseSchema,
  JobListItemSchema,
  JobFiltersSchema,
  // Params
  IdParamsSchema,
  CodeParamsSchema,
  // Headers
  OptionalIdempotencyHeaderSchema,
  // Types
  type JobStatus,
  type WtrStatus,
  type PaginationQuery,
  type CreateJob,
  type UpdateJob,
  type JobResponse,
  type JobListItem,
  type JobFilters,
  type IdParams,
  type CodeParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
