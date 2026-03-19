/**
 * DPIA (Data Protection Impact Assessment) Module
 *
 * Provides the complete API layer for UK GDPR Article 35 DPIA management
 * including:
 * - DPIA assessment register with CRUD operations
 * - Risk register per DPIA with scoring (likelihood x impact)
 * - DPO review and approval workflow
 * - Review date scheduling for periodic reassessment
 * - Outbox events for all state transitions
 *
 * State machine: draft -> in_review -> approved / rejected
 *
 * Usage:
 * ```typescript
 * import { dpiaRoutes } from './modules/dpia';
 *
 * const app = new Elysia()
 *   .use(dpiaRoutes);
 * ```
 */

// Export routes
export { dpiaRoutes, type DpiaRoutes } from "./routes";

// Export service
export { DpiaService } from "./service";

// Export repository
export {
  DpiaRepository,
  type TenantContext,
  type PaginatedResult,
  type DpiaRow,
  type DpiaRiskRow,
} from "./repository";

// Export schemas
export {
  // Enums
  DpiaStatusSchema,
  RiskLevelSchema,
  // Action schemas
  CreateDpiaSchema,
  UpdateDpiaSchema,
  AddRiskSchema,
  SubmitDpiaSchema,
  ApproveDpiaSchema,
  // Filters
  DpiaFiltersSchema,
  // Response
  DpiaResponseSchema,
  DpiaRiskResponseSchema,
  DpiaListResponseSchema,
  // Common
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type DpiaStatus,
  type RiskLevel,
  type CreateDpia,
  type UpdateDpia,
  type AddRisk,
  type SubmitDpia,
  type ApproveDpia,
  type DpiaFilters,
  type DpiaResponse,
  type DpiaRiskResponse,
  type DpiaListResponse,
  type PaginationQuery,
  type IdParams,
} from "./schemas";
