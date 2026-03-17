/**
 * Data Import Module
 *
 * Provides structured CSV data import for bulk data loading.
 * Supports a three-phase workflow: upload, validate, execute.
 *
 * Endpoints:
 * - POST   /api/v1/data-import/upload         - Upload CSV, create import job
 * - POST   /api/v1/data-import/:id/validate   - Validate rows (dry run)
 * - POST   /api/v1/data-import/:id/execute    - Commit validated rows
 * - GET    /api/v1/data-import                - List import jobs
 * - GET    /api/v1/data-import/:id            - Get import job status
 * - GET    /api/v1/data-import/:id/errors     - Get per-row error details
 *
 * Supported import types:
 * - employees, leave, time, departments, positions, compensation,
 *   emergency_contacts, bank_details, training, equipment
 *
 * Usage:
 * ```typescript
 * import { dataImportRoutes } from './modules/data-import';
 *
 * const app = new Elysia()
 *   .use(dataImportRoutes);
 * ```
 */

// Export routes
export { dataImportRoutes, type DataImportRoutes } from "./routes";

// Export service
export { DataImportService } from "./service";

// Export repository
export { DataImportRepository, type TenantContext } from "./repository";

// Export schemas
export {
  // Constants
  MAX_IMPORT_FILE_SIZE,
  MAX_IMPORT_ROWS,
  IMPORT_TYPE_COLUMNS,
  // Enums
  ImportTypeSchema,
  ImportStatusSchema,
  // Request schemas
  UploadImportBodySchema,
  ImportJobIdParamsSchema,
  ListImportJobsQuerySchema,
  ImportErrorsQuerySchema,
  IdempotencyHeaderSchema,
  // Response schemas
  ImportJobResponseSchema,
  ImportJobListResponseSchema,
  ImportErrorsResponseSchema,
  ImportValidationResultSchema,
  ImportExecutionResultSchema,
  ImportRowErrorSchema,
  // Types
  type ImportType,
  type ImportStatus,
  type UploadImportBody,
  type ImportJobIdParams,
  type ListImportJobsQuery,
  type ImportErrorsQuery,
  type IdempotencyHeader,
  type ImportJobResponse,
  type ImportJobListResponse,
  type ImportErrorsResponse,
  type ImportValidationResult,
  type ImportExecutionResult,
  type ImportRowError,
} from "./schemas";
