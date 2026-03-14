/**
 * Data Erasure Module (GDPR Article 17 - Right to Erasure)
 *
 * Provides the complete API layer for managing GDPR erasure requests,
 * executing employee data anonymization, and generating erasure certificates.
 *
 * Usage:
 * ```typescript
 * import { dataErasureRoutes } from './modules/data-erasure';
 *
 * const app = new Elysia()
 *   .use(dataErasureRoutes);
 * ```
 */

// Export routes
export { dataErasureRoutes, type DataErasureRoutes } from "./routes";

// Export service
export { DataErasureService } from "./service";

// Export repository
export {
  DataErasureRepository,
  type TenantContext,
  type PaginatedResult,
  type ErasureRequestRow,
  type ErasureItemRow,
  type ErasureAuditLogRow,
} from "./repository";

// Export schemas
export {
  // Enums
  ErasureRequestStatusSchema,
  ErasureItemActionSchema,
  // Common
  UuidSchema,
  DateSchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  PaginationQuerySchema,
  OptionalIdempotencyHeaderSchema,
  // Request schemas
  CreateErasureRequestSchema,
  ApproveErasureRequestSchema,
  RejectErasureRequestSchema,
  // Filter schemas
  ErasureRequestFiltersSchema,
  // Response schemas
  ErasureAuditLogEntrySchema,
  ErasureItemResponseSchema,
  ErasureRequestResponseSchema,
  ErasureRequestDetailResponseSchema,
  ErasureRequestListResponseSchema,
  RetentionConflictSchema,
  RetentionConflictsResponseSchema,
  OverdueRequestsResponseSchema,
  // Types
  type ErasureRequestStatus,
  type ErasureItemAction,
  type IdParams,
  type EmployeeIdParams,
  type PaginationQuery,
  type OptionalIdempotencyHeader,
  type CreateErasureRequest,
  type ApproveErasureRequest,
  type RejectErasureRequest,
  type ErasureRequestFilters,
  type ErasureAuditLogEntry,
  type ErasureItemResponse,
  type ErasureRequestResponse,
  type ErasureRequestDetailResponse,
  type ErasureRequestListResponse,
  type RetentionConflict,
  type RetentionConflictsResponse,
  type OverdueRequestsResponse,
} from "./schemas";
