/**
 * DSAR Module (Data Subject Access Request)
 *
 * Provides the complete API layer for UK GDPR DSAR operations including:
 * - DSAR request lifecycle management
 * - Identity verification
 * - Module-by-module data gathering
 * - Data item redaction and exclusion
 * - Deadline extension (up to 60 additional days)
 * - Full audit trail for accountability
 * - Dashboard statistics
 *
 * Usage:
 * ```typescript
 * import { dsarRoutes } from './modules/dsar';
 *
 * const app = new Elysia()
 *   .use(dsarRoutes);
 * ```
 */

// Export routes
export { dsarRoutes, type DSARRoutes } from "./routes";

// Export service
export { DSARService } from "./service";

// Export repository
export {
  DSARRepository,
  type TenantContext,
  type PaginatedResult,
  type DsarRequestRow,
  type DsarDataItemRow,
  type DsarAuditLogRow,
} from "./repository";

// Export schemas
export {
  // Enums
  DsarRequestTypeSchema,
  DsarRequestStatusSchema,
  DsarResponseFormatSchema,
  DsarDataItemStatusSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  // Request schemas
  CreateDsarRequestSchema,
  VerifyIdentitySchema,
  ExtendDeadlineSchema,
  RejectDsarRequestSchema,
  CompleteDsarRequestSchema,
  UpdateDataItemSchema,
  // Params
  IdParamsSchema,
  GatherModuleParamsSchema,
  DataItemParamsSchema,
  // Filters
  DsarRequestFiltersSchema,
  // Response schemas
  DsarRequestResponseSchema,
  DsarRequestDetailResponseSchema,
  DsarRequestListResponseSchema,
  DsarDataItemResponseSchema,
  DsarAuditLogEntrySchema,
  DsarDashboardSchema,
  // Headers
  IdempotencyHeaderSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type DsarRequestType,
  type DsarRequestStatus,
  type DsarResponseFormat,
  type DsarDataItemStatus,
  type PaginationQuery,
  type CreateDsarRequest,
  type VerifyIdentity,
  type ExtendDeadline,
  type RejectDsarRequest,
  type CompleteDsarRequest,
  type UpdateDataItem,
  type IdParams,
  type GatherModuleParams,
  type DataItemParams,
  type DsarRequestFilters,
  type DsarRequestResponse,
  type DsarRequestDetailResponse,
  type DsarRequestListResponse,
  type DsarDataItemResponse,
  type DsarAuditLogEntry,
  type DsarDashboard,
  type IdempotencyHeader,
  type OptionalIdempotencyHeader,
} from "./schemas";
