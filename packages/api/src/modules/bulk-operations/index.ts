/**
 * Bulk Operations Module
 *
 * Provides batch API endpoints for bulk create/update operations across
 * Core HR and Absence Management modules.
 *
 * Endpoints:
 * - POST   /api/v1/bulk/employees       - Bulk create employees
 * - PATCH  /api/v1/bulk/employees       - Bulk update employee fields
 * - POST   /api/v1/bulk/leave-requests  - Bulk approve/reject leave requests
 *
 * Usage:
 * ```typescript
 * import { bulkOperationsRoutes } from './modules/bulk-operations';
 *
 * const app = new Elysia()
 *   .use(bulkOperationsRoutes);
 * ```
 */

// Export routes
export { bulkOperationsRoutes, type BulkOperationsRoutes } from "./routes";

// Export service
export { BulkOperationsService } from "./service";

// Export repository
export { BulkOperationsRepository, type TenantContext } from "./repository";

// Export schemas
export {
  // Constants
  MAX_BULK_BATCH_SIZE,
  // Request schemas
  BulkCreateEmployeesRequestSchema,
  BulkUpdateEmployeesRequestSchema,
  BulkLeaveRequestActionsRequestSchema,
  BulkCreateEmployeeItemSchema,
  BulkUpdateEmployeeItemSchema,
  BulkLeaveRequestActionItemSchema,
  // Response schemas
  BulkResponseSchema,
  BulkItemResultSchema,
  // Header schemas
  IdempotencyHeaderSchema,
  // Types
  type BulkCreateEmployeesRequest,
  type BulkUpdateEmployeesRequest,
  type BulkLeaveRequestActionsRequest,
  type BulkCreateEmployeeItem,
  type BulkUpdateEmployeeItem,
  type BulkLeaveRequestActionItem,
  type BulkResponse,
  type BulkItemResult,
  type IdempotencyHeader,
} from "./schemas";
