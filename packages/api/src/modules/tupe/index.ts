/**
 * TUPE Transfers Module
 *
 * TUPE (Transfer of Undertakings Protection of Employment) transfer management
 * for tracking business transfers under UK employment law.
 *
 * The TUPE Regulations 2006 (as amended 2014) protect employees' terms and
 * conditions when a business or undertaking transfers to a new employer.
 * This module tracks the full lifecycle from planning through consultation
 * to completion, including affected employee identification and consent.
 */

// Export routes
export { tupeRoutes, type TupeRoutes } from "./routes";

// Export service
export { TupeService } from "./service";

// Export repository
export {
  TupeRepository,
  type TenantContext,
  type TupeTransferRow,
  type TupeAffectedEmployeeRow,
  type PaginatedResult,
} from "./repository";

// Export schemas
export {
  // Enums
  TupeTransferStatusSchema,
  TupeConsentStatusSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  // Request
  CreateTupeTransferSchema,
  UpdateTupeTransferSchema,
  AddAffectedEmployeeSchema,
  UpdateConsentSchema,
  // Response
  TupeTransferResponseSchema,
  TupeTransferListResponseSchema,
  TupeAffectedEmployeeResponseSchema,
  TupeAffectedEmployeeListResponseSchema,
  StatusHistoryEntrySchema,
  // Filters
  TupeTransferFiltersSchema,
  // Params
  IdParamsSchema,
  TransferEmployeeParamsSchema,
  // Headers
  OptionalIdempotencyHeaderSchema,
  // Types
  type TupeTransferStatus,
  type TupeConsentStatus,
  type PaginationQuery,
  type CreateTupeTransfer,
  type UpdateTupeTransfer,
  type AddAffectedEmployee,
  type UpdateConsent,
  type TupeTransferResponse,
  type TupeTransferListResponse,
  type TupeAffectedEmployeeResponse,
  type TupeAffectedEmployeeListResponse,
  type TupeTransferFilters,
  type StatusHistoryEntry,
  type IdParams,
  type TransferEmployeeParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
