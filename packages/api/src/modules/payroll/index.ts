/**
 * Payroll Integration Module
 *
 * Provides the complete API layer for payroll processing:
 * - Payroll Runs (create, calculate, approve, export)
 * - Payroll Lines (per-employee pay breakdown)
 * - Employee Tax Details (effective-dated HMRC tax code & NI storage)
 * - Payslip Data (individual employee payslip retrieval)
 * - Export (CSV/JSON for external payroll provider integration)
 *
 * Usage:
 * ```typescript
 * import { payrollRoutes } from './modules/payroll';
 *
 * const app = new Elysia()
 *   .use(payrollRoutes);
 * ```
 */

// Export routes
export { payrollRoutes, type PayrollRoutes } from "./routes";

// Export service
export { PayrollService } from "./service";

// Export repository
export {
  PayrollRepository,
  type TenantContext,
  type PaginatedResult,
  type PayrollRunRow,
  type PayrollLineRow,
  type TaxDetailsRow,
  type ActiveEmployeeRow,
} from "./repository";

// Export schemas
export {
  // Enums
  PayrollRunStatusSchema,
  PayrollRunTypeSchema,
  StudentLoanPlanSchema,
  PaymentMethodSchema,
  NiCategorySchema,
  ExportFormatSchema,
  PAYROLL_STATUS_TRANSITIONS,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  PayslipParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Payroll Run
  CreatePayrollRunSchema,
  PayrollRunResponseSchema,
  PayrollRunDetailResponseSchema,
  PayrollRunFiltersSchema,
  // Payroll Lines
  PayrollLineResponseSchema,
  // Tax Details
  UpsertTaxDetailsSchema,
  TaxDetailsResponseSchema,
  // Export
  ExportPayrollSchema,
  // Types
  type PayrollRunStatus,
  type PayrollRunType,
  type StudentLoanPlan,
  type PaymentMethod,
  type ExportFormat,
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type PayslipParams,
  type OptionalIdempotencyHeader,
  type CreatePayrollRun,
  type PayrollRunResponse,
  type PayrollRunDetailResponse,
  type PayrollRunFilters,
  type PayrollLineResponse,
  type UpsertTaxDetails,
  type TaxDetailsResponse,
  type ExportPayroll,
} from "./schemas";
