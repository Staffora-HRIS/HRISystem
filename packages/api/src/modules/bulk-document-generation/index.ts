/**
 * Bulk Document Generation Module
 *
 * Provides the complete API layer for bulk document generation:
 * - POST /documents/bulk-generate      Queue bulk PDF generation
 * - GET  /documents/bulk-generate/:batchId  Check batch progress
 *
 * Usage:
 * ```typescript
 * import { bulkDocumentGenerationRoutes } from './modules/bulk-document-generation';
 *
 * const app = new Elysia()
 *   .use(bulkDocumentGenerationRoutes);
 * ```
 */

// Export routes
export {
  bulkDocumentGenerationRoutes,
  type BulkDocumentGenerationRoutes,
} from "./routes";

// Export service
export { BulkDocumentGenerationService } from "./service";

// Export repository
export {
  BulkDocumentGenerationRepository,
  type TenantContext,
  type BatchRow,
  type BatchItemRow,
} from "./repository";

// Export schemas
export {
  MAX_BULK_GENERATE_SIZE,
  UuidSchema,
  BatchStatusSchema,
  BatchItemStatusSchema,
  BulkGenerateRequestSchema,
  BatchIdParamsSchema,
  BatchItemResponseSchema,
  BatchResponseSchema,
  BatchStatusResponseSchema,
  BulkGenerateResponseSchema,
  OptionalIdempotencyHeaderSchema,
  type BatchStatus,
  type BatchItemStatus,
  type BulkGenerateRequest,
  type BatchIdParams,
  type BatchItemResponse,
  type BatchResponse,
  type BatchStatusResponse,
  type BulkGenerateResponse,
  type OptionalIdempotencyHeader,
} from "./schemas";
