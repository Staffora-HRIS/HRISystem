/**
 * Consent Management Module
 *
 * Provides the complete API layer for GDPR consent management including:
 * - Consent Purposes (what data is processed and why)
 * - Consent Records (individual consent decisions)
 * - Consent Audit Log (immutable history of changes)
 * - Dashboard & Stale Consent Detection
 *
 * Usage:
 * ```typescript
 * import { consentRoutes } from './modules/consent';
 *
 * const app = new Elysia()
 *   .use(consentRoutes);
 * ```
 */

// Export routes
export { consentRoutes, type ConsentRoutes } from "./routes";

// Export service
export { ConsentService } from "./service";
export type { ServiceResult, PaginatedServiceResult, TenantContext as ServiceTenantContext } from "../../types/service-result";

// Export repository
export {
  ConsentRepository,
  type TenantContext,
  type PaginatedResult,
  type ConsentPurposeRow,
  type ConsentRecordRow,
  type ConsentAuditLogRow,
  type ConsentDashboardStats,
} from "./repository";

// Export schemas
export {
  // Enums
  LegalBasisSchema,
  ConsentStatusSchema,
  ConsentMethodSchema,
  ConsentAuditActionSchema,
  // Common
  UuidSchema,
  PaginationQuerySchema,
  // Purpose
  CreateConsentPurposeSchema,
  UpdateConsentPurposeSchema,
  ConsentPurposeResponseSchema,
  ConsentPurposeFiltersSchema,
  // Record
  GrantConsentSchema,
  WithdrawConsentSchema,
  ConsentRecordResponseSchema,
  ConsentRecordFiltersSchema,
  // Check
  ConsentCheckResponseSchema,
  ConsentCheckParamsSchema,
  // Dashboard
  ConsentDashboardResponseSchema,
  // Audit
  ConsentAuditLogResponseSchema,
  // Params
  IdParamsSchema,
  EmployeeIdParamsSchema,
  // Headers
  OptionalIdempotencyHeaderSchema,
  // Types
  type LegalBasis,
  type ConsentStatus,
  type ConsentMethod,
  type ConsentAuditAction,
  type PaginationQuery,
  type CreateConsentPurpose,
  type UpdateConsentPurpose,
  type ConsentPurposeResponse,
  type ConsentPurposeFilters,
  type GrantConsent,
  type WithdrawConsent,
  type ConsentRecordResponse,
  type ConsentRecordFilters,
  type ConsentCheckResponse,
  type ConsentDashboardResponse,
  type ConsentAuditLogResponse,
  type IdParams,
  type EmployeeIdParams,
  type ConsentCheckParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
