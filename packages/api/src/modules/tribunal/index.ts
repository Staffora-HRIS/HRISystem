/**
 * Tribunal Module
 *
 * Employment Tribunal Preparation tracking for UK employment law compliance.
 * Supports case management with status workflow (preparation -> submitted ->
 * hearing -> decided), document bundle management, and representative tracking.
 */

// Export routes
export { tribunalRoutes, type TribunalRoutes } from "./routes";

// Export service
export { TribunalService } from "./service";

// Export repository
export {
  TribunalRepository,
  type TenantContext,
  type TribunalCaseRow,
  type PaginatedResult,
} from "./repository";

// Export schemas
export {
  // Enums
  TribunalCaseStatusSchema,
  TribunalClaimTypeSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  // Document
  TribunalDocumentSchema,
  // Request
  CreateTribunalCaseSchema,
  UpdateTribunalCaseSchema,
  AddTribunalDocumentSchema,
  UpdateTribunalDocumentSchema,
  // Response
  TribunalCaseResponseSchema,
  TribunalCaseListResponseSchema,
  // Filters
  TribunalCaseFiltersSchema,
  // Params
  IdParamsSchema,
  DocumentIdParamsSchema,
  // Headers
  OptionalIdempotencyHeaderSchema,
  // Types
  type TribunalCaseStatus,
  type TribunalClaimType,
  type PaginationQuery,
  type TribunalDocument,
  type CreateTribunalCase,
  type UpdateTribunalCase,
  type AddTribunalDocument,
  type UpdateTribunalDocument,
  type TribunalCaseResponse,
  type TribunalCaseListResponse,
  type TribunalCaseFilters,
  type IdParams,
  type DocumentIdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
