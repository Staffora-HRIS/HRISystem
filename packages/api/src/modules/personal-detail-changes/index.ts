/**
 * Personal Detail Changes Module (TODO-150)
 *
 * Self-service personal detail change requests with approval workflow.
 * Employees submit changes to their personal details via the portal.
 * Non-sensitive fields (phone, mobile, personal_email) are auto-approved.
 * Sensitive fields (name, address, bank details, emergency contacts) require
 * HR/manager approval before being applied.
 *
 * Two route groups:
 * - personalDetailChangePortalRoutes -- Employee self-service at /portal/personal-detail-changes
 * - personalDetailChangeAdminRoutes  -- HR/Manager review at /hr/personal-detail-changes
 *
 * Usage:
 * ```typescript
 * import { personalDetailChangePortalRoutes, personalDetailChangeAdminRoutes } from './modules/personal-detail-changes';
 *
 * const app = new Elysia()
 *   .use(personalDetailChangePortalRoutes)
 *   .use(personalDetailChangeAdminRoutes);
 * ```
 */

// Routes
export {
  personalDetailChangePortalRoutes,
  personalDetailChangeAdminRoutes,
} from "./routes";
export type {
  PersonalDetailChangePortalRoutes,
  PersonalDetailChangeAdminRoutes,
} from "./routes";

// Service
export { PersonalDetailChangeService } from "./service";

// Repository
export {
  PersonalDetailChangeRepository,
  type PersonalDetailChangeRow,
  type TenantContext,
} from "./repository";

// Schemas
export {
  // Constants
  SENSITIVE_FIELDS,
  NON_SENSITIVE_FIELDS,
  ALL_ALLOWED_FIELDS,
  // Enums
  PersonalDetailChangeStatusSchema,
  // Common
  UuidSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  IdempotencyHeaderSchema,
  // Request schemas
  SubmitChangeRequestSchema,
  ReviewChangeRequestSchema,
  // Query schemas
  MyChangeRequestsQuerySchema,
  PendingReviewQuerySchema,
  // Response schemas
  ChangeRequestResponseSchema,
  ChangeRequestListResponseSchema,
  // Types
  type PersonalDetailChangeStatus,
  type SubmitChangeRequest,
  type ReviewChangeRequest,
  type IdParams,
  type ChangeRequestResponse,
  type ChangeRequestListResponse,
} from "./schemas";
