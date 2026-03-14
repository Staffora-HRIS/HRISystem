/**
 * NMW (National Minimum Wage) Module
 *
 * Provides the complete API layer for UK NMW/NLW compliance checking including:
 * - NMW/NLW rate configuration (system-wide and tenant-specific)
 * - Individual employee compliance checks
 * - Bulk compliance checking for all active employees
 * - Compliance reporting with filters and pagination
 *
 * UK National Minimum Wage Act 1998 requires employers to pay at least
 * the statutory minimum hourly rate based on employee age.
 *
 * Current rates (April 2025):
 * - NLW 21+:   £12.21/hour
 * - 18-20:     £10.00/hour
 * - 16-17:     £7.55/hour
 * - Apprentice: £7.55/hour
 *
 * Usage:
 * ```typescript
 * import { nmwRoutes } from './modules/nmw';
 *
 * const app = new Elysia()
 *   .use(nmwRoutes);
 * ```
 */

// Export routes
export { nmwRoutes, type NMWRoutes } from "./routes";

// Export service
export { NMWService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  NMWRepository,
  type TenantContext,
  type PaginatedResult,
  type NMWRateRow,
  type ComplianceCheckRow,
  type ComplianceCheckWithEmployeeRow,
  type EmployeeComplianceData,
} from "./repository";

// Export schemas
export {
  // Enums
  NMWRateTypeSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Request schemas
  CreateNMWRateSchema,
  NMWRateFiltersSchema,
  ComplianceReportFiltersSchema,
  // Response schemas
  NMWRateResponseSchema,
  ComplianceCheckResponseSchema,
  BulkComplianceResponseSchema,
  ComplianceReportResponseSchema,
  // Types
  type NMWRateType,
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
  type CreateNMWRate,
  type NMWRateFilters,
  type NMWRateResponse,
  type ComplianceCheckResponse,
  type BulkComplianceResponse,
  type ComplianceReportFilters,
  type ComplianceReportResponse,
} from "./schemas";
