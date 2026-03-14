/**
 * Right to Work Module
 *
 * Provides the complete API layer for UK Right to Work verification including:
 * - RTW check creation, verification, and failure tracking
 * - Document reference management
 * - Employee RTW status queries
 * - Compliance dashboard statistics
 * - Expiring check alerts and follow-up tracking
 *
 * Usage:
 * ```typescript
 * import { rightToWorkRoutes } from './modules/right-to-work';
 *
 * const app = new Elysia()
 *   .use(rightToWorkRoutes);
 * ```
 */

// Export routes
export { rightToWorkRoutes, type RTWRoutes } from "./routes";

// Export service
export { RTWService } from "./service";

// Export repository
export {
  RTWRepository,
  type RTWCheckRow,
  type RTWCheckListRow,
  type RTWDocumentRow,
  type PaginatedResult,
  type ComplianceStats,
  type TenantContext,
} from "./repository";

// Export schemas
export {
  // Enums
  RTWCheckTypeSchema,
  RTWStatusSchema,
  // Request schemas
  CreateRTWCheckSchema,
  UpdateRTWCheckSchema,
  VerifyCheckSchema,
  FailCheckSchema,
  CreateRTWDocumentSchema,
  // Filter schemas
  RTWCheckFiltersSchema,
  ExpiringChecksQuerySchema,
  // Response schemas
  RTWCheckResponseSchema,
  RTWCheckListItemSchema,
  RTWDocumentResponseSchema,
  EmployeeRTWStatusResponseSchema,
  ComplianceDashboardResponseSchema,
  // Param schemas
  IdParamsSchema,
  EmployeeIdParamsSchema,
  // Types
  type RTWCheckType,
  type RTWStatus,
  type CreateRTWCheck,
  type UpdateRTWCheck,
  type VerifyCheck,
  type FailCheck,
  type CreateRTWDocument,
  type RTWCheckFilters,
  type ExpiringChecksQuery,
  type RTWCheckResponse,
  type RTWCheckListItem,
  type RTWDocumentResponse,
  type EmployeeRTWStatusResponse,
  type ComplianceDashboardResponse,
} from "./schemas";
