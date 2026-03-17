/**
 * Data Import Module - TypeBox Schemas
 *
 * Defines validation schemas for the CSV/Excel data import API endpoints.
 * Supports bulk import of employees, leave, time entries, departments,
 * positions, compensation, emergency contacts, bank details, training,
 * and equipment data.
 *
 * Import workflow:
 * 1. POST /data-import/upload   - Upload CSV, creates job in 'pending' status
 * 2. POST /data-import/:id/validate - Parse and validate rows, moves to 'validated' or 'failed'
 * 3. POST /data-import/:id/execute  - Commit validated rows, moves to 'completed' or 'failed'
 * 4. GET  /data-import            - List import jobs (cursor-based pagination)
 * 5. GET  /data-import/:id        - Get job status and summary
 * 6. GET  /data-import/:id/errors - Get detailed per-row error information
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

// =============================================================================
// Enums
// =============================================================================

export const ImportTypeSchema = t.Union([
  t.Literal("employees"),
  t.Literal("leave"),
  t.Literal("time"),
  t.Literal("departments"),
  t.Literal("positions"),
  t.Literal("compensation"),
  t.Literal("emergency_contacts"),
  t.Literal("bank_details"),
  t.Literal("training"),
  t.Literal("equipment"),
]);
export type ImportType = Static<typeof ImportTypeSchema>;

export const ImportStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("validating"),
  t.Literal("validated"),
  t.Literal("importing"),
  t.Literal("completed"),
  t.Literal("failed"),
]);
export type ImportStatus = Static<typeof ImportStatusSchema>;

/** Maximum CSV file size in bytes (5 MB) */
export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;

/** Maximum number of rows per import */
export const MAX_IMPORT_ROWS = 5000;

// =============================================================================
// Upload Request
// =============================================================================

/**
 * Request body for POST /data-import/upload
 * Accepts a CSV file as multipart form data with an import_type field.
 */
export const UploadImportBodySchema = t.Object({
  import_type: ImportTypeSchema,
  file: t.File({
    maxSize: MAX_IMPORT_FILE_SIZE,
    type: ["text/csv", "application/vnd.ms-excel"],
  }),
});
export type UploadImportBody = Static<typeof UploadImportBodySchema>;

// =============================================================================
// Validate and Execute (path params)
// =============================================================================

export const ImportJobIdParamsSchema = t.Object({
  id: UuidSchema,
});
export type ImportJobIdParams = Static<typeof ImportJobIdParamsSchema>;

// =============================================================================
// List Import Jobs Query
// =============================================================================

export const ListImportJobsQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: t.Optional(ImportStatusSchema),
  import_type: t.Optional(ImportTypeSchema),
});
export type ListImportJobsQuery = Static<typeof ListImportJobsQuerySchema>;

// =============================================================================
// Error Detail Query (for paginated error rows)
// =============================================================================

export const ImportErrorsQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 50 })),
});
export type ImportErrorsQuery = Static<typeof ImportErrorsQuerySchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const ImportRowErrorSchema = t.Object({
  row: t.Number({ description: "1-based row number in the CSV" }),
  field: t.Optional(t.String({ description: "Column/field name that failed validation" })),
  message: t.String({ description: "Human-readable error description" }),
  value: t.Optional(t.Unknown({ description: "The invalid value that was provided" })),
});
export type ImportRowError = Static<typeof ImportRowErrorSchema>;

export const ImportJobResponseSchema = t.Object({
  id: t.String(),
  tenant_id: t.String(),
  import_type: ImportTypeSchema,
  file_name: t.String(),
  status: ImportStatusSchema,
  total_rows: t.Number(),
  processed_rows: t.Number(),
  error_rows: t.Number(),
  error_count: t.Number({ description: "Total number of validation/import errors" }),
  created_by: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
  completed_at: t.Union([t.String(), t.Null()]),
});
export type ImportJobResponse = Static<typeof ImportJobResponseSchema>;

export const ImportJobListResponseSchema = t.Object({
  items: t.Array(ImportJobResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});
export type ImportJobListResponse = Static<typeof ImportJobListResponseSchema>;

export const ImportErrorsResponseSchema = t.Object({
  job_id: t.String(),
  total_errors: t.Number(),
  items: t.Array(ImportRowErrorSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});
export type ImportErrorsResponse = Static<typeof ImportErrorsResponseSchema>;

export const ImportValidationResultSchema = t.Object({
  job_id: t.String(),
  status: ImportStatusSchema,
  total_rows: t.Number(),
  valid_rows: t.Number(),
  error_rows: t.Number(),
  errors: t.Array(ImportRowErrorSchema),
});
export type ImportValidationResult = Static<typeof ImportValidationResultSchema>;

export const ImportExecutionResultSchema = t.Object({
  job_id: t.String(),
  status: ImportStatusSchema,
  total_rows: t.Number(),
  processed_rows: t.Number(),
  error_rows: t.Number(),
});
export type ImportExecutionResult = Static<typeof ImportExecutionResultSchema>;

// =============================================================================
// Idempotency Header
// =============================================================================

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.String({ minLength: 1, maxLength: 100 }),
});
export type IdempotencyHeader = Static<typeof IdempotencyHeaderSchema>;

// =============================================================================
// Import Type to Required Columns Mapping
// =============================================================================

/**
 * Required CSV columns per import type.
 * Used during validation to ensure the uploaded CSV has the right structure.
 */
export const IMPORT_TYPE_COLUMNS: Record<ImportType, { required: string[]; optional: string[] }> = {
  employees: {
    required: ["first_name", "last_name", "hire_date", "position_id", "org_unit_id"],
    optional: [
      "employee_number", "middle_name", "preferred_name", "date_of_birth",
      "gender", "marital_status", "nationality", "contract_type",
      "employment_type", "fte", "working_hours_per_week", "manager_id",
      "base_salary", "currency", "pay_frequency",
    ],
  },
  leave: {
    required: ["employee_id", "leave_type_id", "start_date", "end_date"],
    optional: ["reason", "half_day_start", "half_day_end"],
  },
  time: {
    required: ["employee_id", "date", "clock_in"],
    optional: ["clock_out", "break_minutes", "notes"],
  },
  departments: {
    required: ["name", "code"],
    optional: ["parent_id", "description", "cost_centre"],
  },
  positions: {
    required: ["title", "org_unit_id"],
    optional: ["code", "headcount", "description", "grade", "min_salary", "max_salary"],
  },
  compensation: {
    required: ["employee_id", "base_salary", "effective_from"],
    optional: ["currency", "pay_frequency", "effective_to"],
  },
  emergency_contacts: {
    required: ["employee_id", "name", "relationship", "phone"],
    optional: ["email", "address", "is_primary"],
  },
  bank_details: {
    required: ["employee_id", "account_name", "sort_code", "account_number"],
    optional: ["bank_name", "is_primary"],
  },
  training: {
    required: ["employee_id", "course_name", "completed_date"],
    optional: ["provider", "certificate_number", "expiry_date", "notes"],
  },
  equipment: {
    required: ["employee_id", "asset_name", "asset_tag"],
    optional: ["serial_number", "assigned_date", "return_date", "notes"],
  },
};
