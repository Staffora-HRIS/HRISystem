/**
 * Warnings Module
 *
 * Employee Disciplinary Warning Management following UK ACAS Code of Practice.
 * Supports verbal, first written, and final written warnings with
 * expiry tracking, appeal handling, and rescission.
 */

// Export routes
export { warningsRoutes, type WarningsRoutes } from "./routes";

// Export service
export { WarningsService } from "./service";

// Export repository
export {
  WarningsRepository,
  type TenantContext,
  type WarningRow,
  type PaginatedResult,
} from "./repository";

// Export schemas
export {
  // Enums
  WarningLevelSchema,
  WarningStatusSchema,
  AppealOutcomeSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  // Request
  IssueWarningSchema,
  AppealWarningSchema,
  ResolveAppealSchema,
  RescindWarningSchema,
  // Response
  WarningResponseSchema,
  WarningListResponseSchema,
  ExpiredWarningsResultSchema,
  // Filters
  WarningFiltersSchema,
  // Params
  IdParamsSchema,
  EmployeeIdParamsSchema,
  // Headers
  OptionalIdempotencyHeaderSchema,
  // Types
  type WarningLevel,
  type WarningStatus,
  type AppealOutcome,
  type PaginationQuery,
  type IssueWarning,
  type AppealWarning,
  type ResolveAppeal,
  type RescindWarning,
  type WarningResponse,
  type WarningListResponse,
  type ExpiredWarningsResult,
  type WarningFilters,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
