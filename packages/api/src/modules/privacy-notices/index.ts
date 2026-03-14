/**
 * Privacy Notices Module
 *
 * Provides the complete API layer for UK GDPR privacy notice management including:
 * - Privacy Notice versions (create, list, get, update)
 * - Employee acknowledgements (acknowledge, track outstanding)
 * - Compliance summary (per-notice and overall acknowledgement rates)
 *
 * Usage:
 * ```typescript
 * import { privacyNoticeRoutes } from './modules/privacy-notices';
 *
 * const app = new Elysia()
 *   .use(privacyNoticeRoutes);
 * ```
 */

// Export routes
export { privacyNoticeRoutes, type PrivacyNoticeRoutes } from "./routes";

// Export service
export { PrivacyNoticeService } from "./service";
export type { ServiceResult, PaginatedServiceResult, TenantContext as ServiceTenantContext } from "../../types/service-result";

// Export repository
export {
  PrivacyNoticeRepository,
  type TenantContext,
  type PaginatedResult,
  type PrivacyNoticeRow,
  type AcknowledgementRow,
  type OutstandingRow,
  type NoticeComplianceRow,
} from "./repository";

// Export schemas
export {
  // Common
  UuidSchema,
  PaginationQuerySchema,
  // Notice
  CreatePrivacyNoticeSchema,
  UpdatePrivacyNoticeSchema,
  PrivacyNoticeResponseSchema,
  PrivacyNoticeFiltersSchema,
  // Acknowledgement
  AcknowledgePrivacyNoticeSchema,
  AcknowledgementResponseSchema,
  // Outstanding
  OutstandingAcknowledgementSchema,
  // Compliance
  ComplianceSummaryResponseSchema,
  // Params
  IdParamsSchema,
  // Headers
  OptionalIdempotencyHeaderSchema,
  // Types
  type PaginationQuery,
  type CreatePrivacyNotice,
  type UpdatePrivacyNotice,
  type PrivacyNoticeResponse,
  type PrivacyNoticeFilters,
  type AcknowledgePrivacyNotice,
  type AcknowledgementResponse,
  type OutstandingAcknowledgement,
  type ComplianceSummaryResponse,
  type IdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
