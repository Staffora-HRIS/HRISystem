/**
 * Payroll Integration Module
 *
 * Provides the complete API layer for payroll processing:
 * - Payroll Runs (create, calculate, approve, export)
 * - Payroll Lines (per-employee pay breakdown)
 * - Employee Tax Details (effective-dated HMRC tax code & NI storage)
 * - Payslip Data (individual employee payslip retrieval)
 * - Export (CSV/JSON for external payroll provider integration)
 * - Payroll Period Locks (lock/unlock periods to control data modifications)
 * - Journal Entries (double-entry accounting integration from payroll runs)
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
export { SubmissionService } from "./submission.service";

// Export repository
export {
  PayrollRepository,
  type TenantContext,
  type PaginatedResult,
  type PayrollRunRow,
  type PayrollLineRow,
  type TaxDetailsRow,
  type ActiveEmployeeRow,
  type PeriodLockRow,
  type JournalEntryRow,
  type PayAssignmentRow,
  type PayScheduleRow,
} from "./repository";
export {
  SubmissionRepository,
  type SubmissionRow,
  type SubmissionItemRow,
} from "./submission.repository";

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
  // Period Locks
  LockPayrollPeriodSchema,
  UnlockPayrollPeriodSchema,
  PeriodLockStatusQuerySchema,
  PeriodLockResponseSchema,
  // Journal Entries
  JournalEntryResponseSchema,
  GenerateJournalEntriesSchema,
  JournalEntriesQuerySchema,
  JournalEntriesListResponseSchema,
  // Pay Schedule Assignments (TODO-124)
  CreatePayScheduleAssignmentSchema,
  UpdatePayScheduleAssignmentSchema,
  PayScheduleAssignmentResponseSchema,
  PayScheduleAssignmentFiltersSchema,
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
  type LockPayrollPeriod,
  type UnlockPayrollPeriod,
  type PeriodLockStatusQuery,
  type PeriodLockResponse,
  type JournalEntryResponse,
  type GenerateJournalEntries,
  type JournalEntriesQuery,
  type CreatePayScheduleAssignment,
  type UpdatePayScheduleAssignment,
  type PayScheduleAssignmentResponse,
  type PayScheduleAssignmentFilters,
  // PAYE/RTI Submission (TODO-064)
  PayrollSubmissionTypeSchema,
  PayrollSubmissionStatusSchema,
  SUBMISSION_STATUS_TRANSITIONS,
  CreateFpsSubmissionSchema,
  CreateEpsSubmissionSchema,
  SubmissionListQuerySchema,
  SubmissionItemResponseSchema,
  SubmissionResponseSchema,
  SubmissionDetailResponseSchema,
  SubmissionValidationResponseSchema,
  type PayrollSubmissionType,
  type PayrollSubmissionStatus,
  type CreateFpsSubmission,
  type CreateEpsSubmission,
  type SubmissionListQuery,
  type SubmissionItemResponse,
  type SubmissionResponse,
  type SubmissionDetailResponse,
  type SubmissionValidationResponse,
} from "./schemas";

// Submission routes (TODO-064)
export { submissionRoutes, type SubmissionRoutes } from "./submission.routes";

// Salary Sacrifice (TODO-232)
export { SalarySacrificeService } from "./salary-sacrifice.service";
export { SalarySacrificeRepository, type SalarySacrificeRow } from "./salary-sacrifice.repository";
export { salarySacrificeRoutes, type SalarySacrificeRoutes } from "./salary-sacrifice.routes";
export {
  // Schemas
  CreateSalarySacrificeSchema,
  UpdateSalarySacrificeSchema,
  SalarySacrificeResponseSchema,
  SalarySacrificeImpactSchema,
  SalarySacrificeFiltersSchema,
  SacrificeTypeSchema,
  SacrificeFrequencySchema,
  SacrificeStatusSchema,
  // Types
  type CreateSalarySacrifice,
  type UpdateSalarySacrifice,
  type SalarySacrificeResponse,
  type SalarySacrificeImpact,
  type SalarySacrificeFilters,
  type SacrificeType,
  type SacrificeFrequency,
  type SacrificeStatus,
} from "./salary-sacrifice.schemas";
