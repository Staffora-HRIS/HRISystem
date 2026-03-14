/**
 * Equipment Module
 *
 * Provides the API layer for equipment catalog management,
 * equipment request tracking, and provisioning workflows.
 *
 * Usage:
 * ```typescript
 * import { equipmentRoutes } from './modules/equipment';
 *
 * const app = new Elysia()
 *   .use(equipmentRoutes);
 * ```
 */

// Export routes
export { equipmentRoutes, type EquipmentRoutes } from "./routes";

// Export service
export { EquipmentService } from "./service";

// Export repository
export {
  EquipmentRepository,
  type TenantContext,
  type PaginatedResult,
  type CatalogItemRow,
  type EquipmentRequestRow,
  type EquipmentRequestHistoryRow,
} from "./repository";

// Export schemas
export {
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  EquipmentTypeSchema,
  EquipmentRequestStatusSchema,
  EquipmentPrioritySchema,
  CreateCatalogItemSchema,
  UpdateCatalogItemSchema,
  CatalogItemResponseSchema,
  CatalogFiltersSchema,
  CreateEquipmentRequestSchema,
  EquipmentStatusTransitionSchema,
  EquipmentRequestResponseSchema,
  EquipmentRequestFiltersSchema,
  EquipmentRequestHistorySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type EquipmentType,
  type EquipmentRequestStatus,
  type EquipmentPriority,
  type CreateCatalogItem,
  type UpdateCatalogItem,
  type CatalogItemResponse,
  type CatalogFilters,
  type CreateEquipmentRequest,
  type EquipmentStatusTransition,
  type EquipmentRequestResponse,
  type EquipmentRequestFilters,
  type EquipmentRequestHistory,
  type IdParams,
  type OptionalIdempotencyHeader,
  type PaginationQuery,
} from "./schemas";
