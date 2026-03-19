/**
 * Total Reward Statement Module
 *
 * Generates comprehensive total reward statements for employees
 * that combine salary, bonuses, pension, benefits, and holiday
 * entitlement into a single package view.
 *
 * Provides:
 * - On-demand total reward statement generation
 * - Cached statement retrieval
 * - PDF generation via async pdf-worker
 * - Detailed breakdown by compensation component
 *
 * Usage:
 * ```typescript
 * import { totalRewardRoutes } from './modules/total-reward';
 *
 * const app = new Elysia()
 *   .use(totalRewardRoutes);
 * ```
 */

// Export routes
export { totalRewardRoutes, type TotalRewardRoutes } from "./routes";

// Export service
export { TotalRewardService } from "./service";

// Export repository
export {
  TotalRewardRepository,
  type TenantContext,
  type TotalRewardStatementRow,
  type CompensationData,
  type PayrollSummaryData,
  type BenefitEnrollmentData,
  type PensionEnrolmentData,
  type LeaveEntitlementData,
  type EmployeeBasicData,
} from "./repository";

// Export schemas
export {
  // Enums
  TotalRewardStatementStatusSchema,
  // Common
  UuidSchema,
  DateSchema,
  EmployeeIdParamsSchema,
  StatementIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Query
  TotalRewardQuerySchema,
  StatementListQuerySchema,
  // Response
  BenefitItemSchema,
  BreakdownDetailSchema,
  TotalRewardStatementResponseSchema,
  PdfRequestResponseSchema,
  // Types
  type TotalRewardStatementStatus,
  type EmployeeIdParams,
  type StatementIdParams,
  type OptionalIdempotencyHeader,
  type TotalRewardQuery,
  type StatementListQuery,
  type BenefitItem,
  type BreakdownDetail,
  type TotalRewardStatementResponse,
  type PdfRequestResponse,
} from "./schemas";
