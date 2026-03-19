/**
 * Data Archival Module
 *
 * Provides the complete API layer for archiving old completed records
 * (terminated employees >7 years, closed cases >5 years, etc.) and
 * restoring them when needed.
 *
 * TODO-225 enhancements:
 *   - archive_policies: configurable policies with archive_after_days and status_filter
 *   - archive_log: immutable log of every archival run execution
 *   - archive schema: parallel tables that mirror app schema structure
 *   - Policy-based archival run and restore endpoints
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
  type ArchivePolicyRow,
  type ArchiveLogRow,
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
  ArchiveLogQuerySchema,
  // Request schemas
  ArchiveRecordSchema,
  RestoreRecordSchema,
  RunArchivalSchema,
  CreateArchivePolicySchema,
  UpdateArchivePolicySchema,
  RunPolicyArchivalSchema,
  RestoreFromArchiveSchema,
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
  ArchivePolicyResponseSchema,
  ArchivePolicyListResponseSchema,
  ArchiveLogEntryResponseSchema,
  ArchiveLogListResponseSchema,
  PolicyArchivalRunResultSchema,
  PolicyRestoreResultSchema,
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
  type CreateArchivePolicy,
  type UpdateArchivePolicy,
  type ArchivePolicyResponse,
  type ArchivePolicyListResponse,
  type ArchiveLogEntryResponse,
  type ArchiveLogListResponse,
  type ArchiveLogQuery,
  type RunPolicyArchivalRequest,
  type PolicyArchivalRunResult,
  type RestoreFromArchiveRequest,
  type PolicyRestoreResult,
} from "./schemas";
