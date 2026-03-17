/**
 * Policy Distribution Module
 *
 * Provides the complete API layer for policy document distribution with read receipts:
 * - Distribute policy documents to departments or all employees
 * - Track distribution status and acknowledgement rates
 * - Record employee acknowledgements (read receipts) with IP address
 *
 * Usage:
 * ```typescript
 * import { policyDistributionRoutes } from './modules/policy-distribution';
 *
 * const app = new Elysia()
 *   .use(policyDistributionRoutes);
 * ```
 */

// Export routes
export {
  policyDistributionRoutes,
  type PolicyDistributionRoutes,
} from "./routes";

// Export service
export { PolicyDistributionService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  PolicyDistributionRepository,
  type TenantContext,
  type PaginatedResult,
  type DistributionRow,
  type AcknowledgementRow,
} from "./repository";

// Export schemas
export {
  // Common
  UuidSchema,
  PaginationQuerySchema,
  // Distribution
  CreateDistributionSchema,
  DistributionResponseSchema,
  DistributionStatusResponseSchema,
  // Acknowledgement
  AcknowledgeDistributionSchema,
  AcknowledgementResponseSchema,
  AcknowledgementRecordSchema,
  // Params
  IdParamsSchema,
  // Headers
  IdempotencyHeaderSchema,
  // Types
  type PaginationQuery,
  type CreateDistribution,
  type DistributionResponse,
  type DistributionStatusResponse,
  type AcknowledgeDistribution,
  type AcknowledgementResponse,
  type AcknowledgementRecord,
  type IdParams,
  type IdempotencyHeader,
} from "./schemas";
