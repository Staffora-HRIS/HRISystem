/**
 * Gender Pay Gap Module
 *
 * Provides the complete API layer for UK Gender Pay Gap reporting:
 * - Calculate all 6 required GPG metrics from employee compensation/bonus data
 * - Generate reports with automatic snapshot date based on sector
 * - List and retrieve reports with trend analysis
 * - Publish finalised reports
 * - Dashboard with year-over-year trends and threshold check
 *
 * Usage:
 * ```typescript
 * import { genderPayGapRoutes } from './modules/gender-pay-gap';
 *
 * const app = new Elysia()
 *   .use(genderPayGapRoutes);
 * ```
 */

// Export routes
export { genderPayGapRoutes, type GenderPayGapRoutes } from "./routes";

// Export service
export { GenderPayGapService } from "./service";

// Export repository
export {
  GenderPayGapRepository,
  type TenantContext,
  type PaginatedResult,
  type GpgReportRow,
  type EmployeePayDataRow,
  type EmployeeBonusDataRow,
  type TrendRow,
  type DashboardCountsRow,
} from "./repository";

// Export schemas
export {
  // Enums
  GpgReportStatusSchema,
  SectorTypeSchema,
  // Request
  CalculateGpgSchema,
  GenerateReportSchema,
  UpdateGpgNotesSchema,
  PublishGpgSchema,
  // Filters
  GpgReportFiltersSchema,
  // Response
  GpgReportResponseSchema,
  GpgReportListItemSchema,
  GpgReportListResponseSchema,
  GpgDashboardResponseSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  // Params
  IdParamsSchema,
  // Headers
  OptionalIdempotencyHeaderSchema,
  // Types
  type GpgReportStatus,
  type SectorType,
  type CalculateGpg,
  type GenerateReport,
  type UpdateGpgNotes,
  type PublishGpg,
  type GpgReportFilters,
  type GpgReportResponse,
  type GpgReportListItem,
  type GpgReportListResponse,
  type GpgDashboardResponse,
  type PaginationQuery,
  type IdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
