/**
 * Flexible Working Module
 *
 * Provides the complete API layer for Flexible Working Requests under the
 * Employment Relations (Flexible Working) Act 2023:
 * - Day-one right to request flexible working (from April 2024)
 * - 2 requests per 12-month rolling period
 * - 2-month employer response deadline
 * - 8 statutory grounds for refusal
 * - Mandatory consultation before refusal
 * - Appeal process for rejected requests
 * - Immutable audit trail for all transitions
 * - Compliance summary with overdue tracking
 *
 * State machine:
 *   submitted -> under_review -> consultation_scheduled -> consultation_complete
 *     -> approved / rejected -> appeal -> appeal_approved / appeal_rejected
 *   Any non-terminal -> withdrawn
 *
 * Usage:
 * ```typescript
 * import { flexibleWorkingRoutes } from './modules/flexible-working';
 *
 * const app = new Elysia()
 *   .use(flexibleWorkingRoutes);
 * ```
 */

// Export routes
export { flexibleWorkingRoutes, type FlexibleWorkingRoutes } from "./routes";

// Export service
export { FlexibleWorkingService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  FlexibleWorkingRepository,
  type TenantContext,
  type PaginatedResult,
  type FlexibleWorkingRequestRow,
  type ConsultationRow,
  type RequestHistoryRow,
  type OverdueRequestRow,
  type RejectionBreakdownRow,
} from "./repository";

// Export schemas
export {
  // Enums
  FlexibleWorkingStatusSchema,
  RejectionGroundsSchema,
  AppealOutcomeSchema,
  ChangeTypeSchema,
  ConsultationTypeSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Request schemas
  SubmitRequestSchema,
  CreateFlexibleWorkingRequestSchema,
  RecordConsultationSchema,
  ApproveRequestSchema,
  RejectRequestSchema,
  AppealDecisionSchema,
  ResolveAppealSchema,
  RespondToRequestSchema,
  MoveToConsultationSchema,
  WithdrawRequestSchema,
  // Filter schemas
  FlexibleWorkingFiltersSchema,
  // Response schemas
  FlexibleWorkingResponseSchema,
  ConsultationResponseSchema,
  RequestHistoryEntrySchema,
  ComplianceSummarySchema,
  // Types
  type FlexibleWorkingStatus,
  type RejectionGrounds,
  type AppealOutcome,
  type ChangeType,
  type ConsultationType,
  type PaginationQuery,
  type IdParams,
  type OptionalIdempotencyHeader,
  type SubmitRequest,
  type CreateFlexibleWorkingRequest,
  type RecordConsultation,
  type ApproveRequest,
  type RejectRequest,
  type AppealDecision,
  type ResolveAppeal,
  type RespondToRequest,
  type MoveToConsultation,
  type WithdrawRequest,
  type FlexibleWorkingFilters,
  type FlexibleWorkingResponse,
  type ConsultationResponse,
  type RequestHistoryEntry,
  type ComplianceSummary,
} from "./schemas";
