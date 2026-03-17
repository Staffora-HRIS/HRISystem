/**
 * Data Archival Module
 *
 * Provides the complete API layer for archiving old completed records
 * (terminated employees >7 years, closed cases >5 years, etc.) and
 * restoring them when needed.
 *
 * Usage:
 * ```typescript
 * import { dataArchivalRoutes } from './modules/data-archival';
 *
 * const app = new Elysia()
 *   .use(dataArchivalRoutes);
 * ```
 */

// Export routes
export { dataArchivalRoutes, type DataArchivalRoutes } from "./routes";

// Export service
export { DataArchivalService } from "./service";

// Export repository
export {
  DataArchivalRepository,
  type ArchivedRecordRow,
  type ArchivalRuleRow,
  type PaginatedResult,
  type CategoryStats,
} from "./repository";

// Export schemas
export {
  // Enums
  ArchivalSourceCategorySchema,
  ArchivalStatusSchema,
  // Common
  UuidSchema,
  IdParamsSchema,
  PaginationQuerySchema,
  OptionalIdempotencyHeaderSchema,
  // Query schemas
  ArchivedRecordsQuerySchema,
  // Request schemas
  ArchiveRecordSchema,
  RestoreRecordSchema,
  RunArchivalSchema,
  // Response schemas
  ArchivedRecordResponseSchema,
  ArchivedRecordListResponseSchema,
  ArchivalRunResultSchema,
  RestoreResultSchema,
  ArchivalDashboardResponseSchema,
  ArchivalRuleResponseSchema,
  ArchivalRuleListResponseSchema,
  SeedDefaultsResponseSchema,
  DeleteSuccessResponseSchema,
  // Types
  type ArchivalSourceCategory,
  type ArchivalStatus,
  type IdParams,
  type PaginationQuery,
  type OptionalIdempotencyHeader,
  type ArchivedRecordsQuery,
  type ArchiveRecordRequest,
  type RestoreRecordRequest,
  type RunArchivalRequest,
  type ArchivedRecordResponse,
  type ArchivedRecordListResponse,
  type ArchivalRunResult,
  type RestoreResult,
  type ArchivalDashboardResponse,
  type ArchivalRuleResponse,
  type ArchivalRuleListResponse,
  type SeedDefaultsResponse,
  type DeleteSuccessResponse,
} from "./schemas";
