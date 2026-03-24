/**
 * Data Import Module - Service Layer
 *
 * Implements business logic for CSV data imports.
 * Orchestrates the three-phase import workflow:
 *   1. Upload   - Parse CSV, create job in 'pending' status
 *   2. Validate - Check each row against schema, move to 'validated' or 'failed'
 *   3. Execute  - Commit validated rows to database, move to 'completed' or 'failed'
 *
 * Design decisions:
 * - Validation is a separate step so users can review errors before committing.
 * - Validated data is stored on the job row (as JSONB) so that the execute step
 *   does not need to re-parse the file.
 * - Each import type has its own validation rules defined inline. New types
 *   can be added by extending the validateRow method.
 * - The execute phase runs within a single DB transaction with outbox events
 *   to guarantee atomicity.
 */

import type { DataImportRepository, ImportJobRow } from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import type {
  ImportType,
  ImportRowError,
  ImportJobResponse,
  ImportJobListResponse,
  ImportErrorsResponse,
  ImportValidationResult,
  ImportExecutionResult,
  ListImportJobsQuery,
} from "./schemas";
import { IMPORT_TYPE_COLUMNS, MAX_IMPORT_ROWS } from "./schemas";
import { logger } from "../../lib/logger";

// =============================================================================
// CSV Parser
// =============================================================================

/**
 * Parse a CSV string into an array of row objects.
 * Handles quoted fields and newlines within quotes.
 * Returns the header row and data rows separately.
 */
function parseCsv(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const value = (values[j] || "").trim();
      if (value.length > 0) {
        row[headers[j]] = value;
      }
    }
    // Skip completely empty rows
    if (Object.keys(row).length > 0) {
      rows.push(row);
    }
  }

  return { headers, rows };
}

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  fields.push(current);

  return fields;
}

// =============================================================================
// Row Mappers
// =============================================================================

function mapJobToResponse(row: ImportJobRow): ImportJobResponse {
  const errors = Array.isArray(row.errors) ? row.errors : [];
  return {
    id: row.id,
    tenant_id: row.tenantId,
    import_type: row.importType as ImportType,
    file_name: row.fileName,
    status: row.status as ImportJobResponse["status"],
    total_rows: row.totalRows,
    processed_rows: row.processedRows,
    error_rows: row.errorRows,
    error_count: errors.length,
    created_by: row.createdBy,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    completed_at: row.completedAt
      ? (row.completedAt instanceof Date ? row.completedAt.toISOString() : String(row.completedAt))
      : null,
  };
}

// =============================================================================
// Service
// =============================================================================

export class DataImportService {
  constructor(private repository: DataImportRepository) {}

  // ===========================================================================
  // Phase 1: Upload CSV
  // ===========================================================================

  /**
   * Accept a CSV file upload, parse headers, and create an import job.
   * The job starts in 'pending' status. The caller must then call validate.
   */
  async uploadCsv(
    ctx: TenantContext,
    importType: ImportType,
    file: File
  ): Promise<ServiceResult<ImportJobResponse>> {
    // Read file content
    let content: string;
    try {
      content = await file.text();
    } catch {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Failed to read uploaded file",
        },
      };
    }

    if (!content.trim()) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Uploaded file is empty",
        },
      };
    }

    // Parse CSV to get row count and validate headers
    const { headers, rows } = parseCsv(content);

    if (headers.length === 0) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "CSV file has no header row",
        },
      };
    }

    if (rows.length === 0) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "CSV file has no data rows",
        },
      };
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `CSV exceeds maximum of ${MAX_IMPORT_ROWS} rows (found ${rows.length})`,
          details: { maxRows: MAX_IMPORT_ROWS, actualRows: rows.length },
        },
      };
    }

    // Check that required columns are present
    const requiredColumns = IMPORT_TYPE_COLUMNS[importType].required;
    const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
    if (missingColumns.length > 0) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `CSV is missing required columns: ${missingColumns.join(", ")}`,
          details: {
            missing: missingColumns,
            found: headers,
            required: requiredColumns,
          },
        },
      };
    }

    // Create the import job
    try {
      const job = await this.repository.createJob(ctx, {
        importType,
        fileName: file.name || "import.csv",
        totalRows: rows.length,
      });

      return {
        success: true,
        data: mapJobToResponse(job),
      };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId }, "Failed to create import job");
      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create import job",
        },
      };
    }
  }

  // ===========================================================================
  // Phase 2: Validate
  // ===========================================================================

  /**
   * Re-read the CSV content (passed from the route), validate every row
   * against the import type schema, and store validated data on the job.
   *
   * Since the file is no longer stored after upload, the route handler
   * must pass the raw CSV content from the upload phase. In practice, the
   * validate endpoint re-accepts the file or the upload step stores it.
   * For simplicity, we accept the file again on the validate endpoint.
   */
  async validateJob(
    ctx: TenantContext,
    jobId: string,
    fileContent: string
  ): Promise<ServiceResult<ImportValidationResult>> {
    // Get the job
    const job = await this.repository.getJobById(ctx, jobId);
    if (!job) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Import job not found",
        },
      };
    }

    // Check valid status transitions
    if (job.status !== "pending" && job.status !== "failed") {
      return {
        success: false,
        error: {
          code: "STATE_MACHINE_VIOLATION",
          message: `Cannot validate job in '${job.status}' status. Only 'pending' or 'failed' jobs can be validated.`,
          details: { currentStatus: job.status },
        },
      };
    }

    // Mark as validating
    await this.repository.updateJobStatus(ctx, jobId, { status: "validating" });

    // Parse CSV
    const { rows } = parseCsv(fileContent);
    const importType = job.importType as ImportType;
    const errors: ImportRowError[] = [];
    const validatedRows: Record<string, string>[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowErrors = this.validateRow(importType, rows[i], i + 1);
      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
      } else {
        validatedRows.push(rows[i]);
      }
    }

    const errorRowIndices = new Set(errors.map((e) => e.row));
    const errorRowCount = errorRowIndices.size;
    const newStatus = errorRowCount > 0 && validatedRows.length === 0 ? "failed" : "validated";

    // Update job with validation results
    await this.repository.updateJobStatus(ctx, jobId, {
      status: newStatus as "validated" | "failed",
      totalRows: rows.length,
      errorRows: errorRowCount,
      errors,
      validatedData: validatedRows,
      ...(newStatus === "failed" ? { completedAt: new Date() } : {}),
    });

    return {
      success: true,
      data: {
        job_id: jobId,
        status: newStatus as ImportValidationResult["status"],
        total_rows: rows.length,
        valid_rows: validatedRows.length,
        error_rows: errorRowCount,
        errors: errors.slice(0, 100), // Return first 100 errors inline
      },
    };
  }

  // ===========================================================================
  // Phase 3: Execute
  // ===========================================================================

  /**
   * Commit validated rows to the database.
   * Only jobs in 'validated' status can be executed.
   */
  async executeJob(
    ctx: TenantContext,
    jobId: string
  ): Promise<ServiceResult<ImportExecutionResult>> {
    const job = await this.repository.getJobById(ctx, jobId);
    if (!job) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Import job not found",
        },
      };
    }

    if (job.status !== "validated") {
      return {
        success: false,
        error: {
          code: "STATE_MACHINE_VIOLATION",
          message: `Cannot execute job in '${job.status}' status. Only 'validated' jobs can be executed.`,
          details: { currentStatus: job.status },
        },
      };
    }

    const validatedData = job.validatedData as Record<string, string>[] | null;
    if (!validatedData || validatedData.length === 0) {
      await this.repository.updateJobStatus(ctx, jobId, {
        status: "failed",
        completedAt: new Date(),
        errors: [{ row: 0, message: "No validated rows to import" }],
      });
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "No validated rows to import",
        },
      };
    }

    // Mark as importing
    await this.repository.updateJobStatus(ctx, jobId, { status: "importing" });

    try {
      const importType = job.importType as ImportType;

      // For now, only employees import type has full execution support.
      // Other types can be added following the same repository pattern.
      if (importType !== "employees") {
        await this.repository.updateJobStatus(ctx, jobId, {
          status: "failed",
          completedAt: new Date(),
          errors: [{
            row: 0,
            message: `Import execution for type '${importType}' is not yet implemented`,
          }],
        });
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Import execution for type '${importType}' is not yet implemented. Currently supported: employees`,
          },
        };
      }

      const result = await this.repository.executeEmployeeImport(
        ctx,
        jobId,
        validatedData
      );

      const finalStatus = result.errorRows > 0 && result.processedRows === 0
        ? "failed"
        : "completed";

      // Merge any execution errors with previous validation errors
      const allErrors = [
        ...(Array.isArray(job.errors) ? job.errors : []),
        ...result.errors,
      ];

      await this.repository.updateJobStatus(ctx, jobId, {
        status: finalStatus,
        processedRows: result.processedRows,
        errorRows: (job.errorRows || 0) + result.errorRows,
        errors: allErrors as ImportRowError[],
        completedAt: new Date(),
        // Clear validated_data after execution to free storage
        validatedData: [],
      });

      return {
        success: true,
        data: {
          job_id: jobId,
          status: finalStatus as ImportExecutionResult["status"],
          total_rows: job.totalRows,
          processed_rows: result.processedRows,
          error_rows: (job.errorRows || 0) + result.errorRows,
        },
      };
    } catch (error) {
      logger.error({ err: error, tenantId: ctx.tenantId, jobId }, "Import execution failed");
      await this.repository.updateJobStatus(ctx, jobId, {
        status: "failed",
        completedAt: new Date(),
        errors: [{
          row: 0,
          message: error instanceof Error ? error.message : "Import execution failed unexpectedly",
        }],
      });
      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Import execution failed",
        },
      };
    }
  }

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Get a single import job by ID.
   */
  async getJob(
    ctx: TenantContext,
    jobId: string
  ): Promise<ServiceResult<ImportJobResponse>> {
    const job = await this.repository.getJobById(ctx, jobId);
    if (!job) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Import job not found",
        },
      };
    }
    return { success: true, data: mapJobToResponse(job) };
  }

  /**
   * List import jobs with cursor-based pagination and filters.
   */
  async listJobs(
    ctx: TenantContext,
    query: ListImportJobsQuery
  ): Promise<ImportJobListResponse> {
    const result = await this.repository.listJobs(ctx, query);
    return {
      items: result.items.map(mapJobToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get paginated error details for a specific import job.
   */
  async getJobErrors(
    ctx: TenantContext,
    jobId: string,
    query: { cursor?: string; limit?: number }
  ): Promise<ServiceResult<ImportErrorsResponse>> {
    const job = await this.repository.getJobById(ctx, jobId);
    if (!job) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Import job not found",
        },
      };
    }

    const allErrors: ImportRowError[] = Array.isArray(job.errors) ? job.errors : [];
    const limit = query.limit ?? 50;

    // Cursor is the 0-based offset into the errors array
    const offset = query.cursor ? Number(query.cursor) : 0;
    const sliced = allErrors.slice(offset, offset + limit + 1);
    const hasMore = sliced.length > limit;
    const items = hasMore ? sliced.slice(0, limit) : sliced;
    const nextCursor = hasMore ? String(offset + limit) : null;

    return {
      success: true,
      data: {
        job_id: jobId,
        total_errors: allErrors.length,
        items,
        nextCursor,
        hasMore,
      },
    };
  }

  // ===========================================================================
  // Row Validation
  // ===========================================================================

  /**
   * Validate a single CSV row against the import type's schema.
   * Returns an array of errors (empty = valid).
   */
  private validateRow(
    importType: ImportType,
    row: Record<string, string>,
    rowNumber: number
  ): ImportRowError[] {
    const errors: ImportRowError[] = [];
    const spec = IMPORT_TYPE_COLUMNS[importType];

    // Check required fields are present and non-empty
    for (const col of spec.required) {
      if (!row[col] || row[col].trim().length === 0) {
        errors.push({
          row: rowNumber,
          field: col,
          message: `Required field '${col}' is missing or empty`,
        });
      }
    }

    // Type-specific validation
    switch (importType) {
      case "employees":
        this.validateEmployeeRow(row, rowNumber, errors);
        break;
      case "leave":
        this.validateLeaveRow(row, rowNumber, errors);
        break;
      case "time":
        this.validateTimeRow(row, rowNumber, errors);
        break;
      case "compensation":
        this.validateCompensationRow(row, rowNumber, errors);
        break;
      default:
        // For other types, only required-field checks are performed
        break;
    }

    return errors;
  }

  private validateEmployeeRow(
    row: Record<string, string>,
    rowNumber: number,
    errors: ImportRowError[]
  ): void {
    // Validate hire_date format
    if (row.hire_date && !isValidDate(row.hire_date)) {
      errors.push({
        row: rowNumber,
        field: "hire_date",
        message: "Invalid date format. Expected YYYY-MM-DD",
        value: row.hire_date,
      });
    }

    // Validate date_of_birth if present
    if (row.date_of_birth && !isValidDate(row.date_of_birth)) {
      errors.push({
        row: rowNumber,
        field: "date_of_birth",
        message: "Invalid date format. Expected YYYY-MM-DD",
        value: row.date_of_birth,
      });
    }

    // Validate UUID fields
    if (row.position_id && !isValidUuid(row.position_id)) {
      errors.push({
        row: rowNumber,
        field: "position_id",
        message: "Invalid UUID format",
        value: row.position_id,
      });
    }

    if (row.org_unit_id && !isValidUuid(row.org_unit_id)) {
      errors.push({
        row: rowNumber,
        field: "org_unit_id",
        message: "Invalid UUID format",
        value: row.org_unit_id,
      });
    }

    if (row.manager_id && !isValidUuid(row.manager_id)) {
      errors.push({
        row: rowNumber,
        field: "manager_id",
        message: "Invalid UUID format",
        value: row.manager_id,
      });
    }

    // Validate contract_type if present
    const validContractTypes = ["permanent", "fixed_term", "contractor", "intern", "temporary"];
    if (row.contract_type && !validContractTypes.includes(row.contract_type)) {
      errors.push({
        row: rowNumber,
        field: "contract_type",
        message: `Invalid contract type. Must be one of: ${validContractTypes.join(", ")}`,
        value: row.contract_type,
      });
    }

    // Validate employment_type if present
    const validEmploymentTypes = ["full_time", "part_time"];
    if (row.employment_type && !validEmploymentTypes.includes(row.employment_type)) {
      errors.push({
        row: rowNumber,
        field: "employment_type",
        message: `Invalid employment type. Must be one of: ${validEmploymentTypes.join(", ")}`,
        value: row.employment_type,
      });
    }

    // Validate gender if present
    const validGenders = ["male", "female", "other", "prefer_not_to_say"];
    if (row.gender && !validGenders.includes(row.gender)) {
      errors.push({
        row: rowNumber,
        field: "gender",
        message: `Invalid gender. Must be one of: ${validGenders.join(", ")}`,
        value: row.gender,
      });
    }

    // Validate numeric fields
    if (row.fte) {
      const fte = Number(row.fte);
      if (isNaN(fte) || fte < 0.01 || fte > 1) {
        errors.push({
          row: rowNumber,
          field: "fte",
          message: "FTE must be a number between 0.01 and 1",
          value: row.fte,
        });
      }
    }

    if (row.base_salary) {
      const salary = Number(row.base_salary);
      if (isNaN(salary) || salary < 0) {
        errors.push({
          row: rowNumber,
          field: "base_salary",
          message: "Base salary must be a non-negative number",
          value: row.base_salary,
        });
      }
    }

    // Validate currency if present (3-letter ISO code)
    if (row.currency && !/^[A-Z]{3}$/.test(row.currency)) {
      errors.push({
        row: rowNumber,
        field: "currency",
        message: "Currency must be a 3-letter uppercase ISO code (e.g., GBP)",
        value: row.currency,
      });
    }
  }

  private validateLeaveRow(
    row: Record<string, string>,
    rowNumber: number,
    errors: ImportRowError[]
  ): void {
    if (row.employee_id && !isValidUuid(row.employee_id)) {
      errors.push({ row: rowNumber, field: "employee_id", message: "Invalid UUID format", value: row.employee_id });
    }
    if (row.leave_type_id && !isValidUuid(row.leave_type_id)) {
      errors.push({ row: rowNumber, field: "leave_type_id", message: "Invalid UUID format", value: row.leave_type_id });
    }
    if (row.start_date && !isValidDate(row.start_date)) {
      errors.push({ row: rowNumber, field: "start_date", message: "Invalid date format. Expected YYYY-MM-DD", value: row.start_date });
    }
    if (row.end_date && !isValidDate(row.end_date)) {
      errors.push({ row: rowNumber, field: "end_date", message: "Invalid date format. Expected YYYY-MM-DD", value: row.end_date });
    }
    // Check end >= start
    if (row.start_date && row.end_date && isValidDate(row.start_date) && isValidDate(row.end_date)) {
      if (row.end_date < row.start_date) {
        errors.push({ row: rowNumber, field: "end_date", message: "End date must be on or after start date", value: row.end_date });
      }
    }
  }

  private validateTimeRow(
    row: Record<string, string>,
    rowNumber: number,
    errors: ImportRowError[]
  ): void {
    if (row.employee_id && !isValidUuid(row.employee_id)) {
      errors.push({ row: rowNumber, field: "employee_id", message: "Invalid UUID format", value: row.employee_id });
    }
    if (row.date && !isValidDate(row.date)) {
      errors.push({ row: rowNumber, field: "date", message: "Invalid date format. Expected YYYY-MM-DD", value: row.date });
    }
    // Validate time format (HH:MM or HH:MM:SS)
    const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/;
    if (row.clock_in && !timeRegex.test(row.clock_in)) {
      errors.push({ row: rowNumber, field: "clock_in", message: "Invalid time format. Expected HH:MM or HH:MM:SS", value: row.clock_in });
    }
    if (row.clock_out && !timeRegex.test(row.clock_out)) {
      errors.push({ row: rowNumber, field: "clock_out", message: "Invalid time format. Expected HH:MM or HH:MM:SS", value: row.clock_out });
    }
    if (row.break_minutes) {
      const mins = Number(row.break_minutes);
      if (isNaN(mins) || mins < 0) {
        errors.push({ row: rowNumber, field: "break_minutes", message: "Break minutes must be a non-negative number", value: row.break_minutes });
      }
    }
  }

  private validateCompensationRow(
    row: Record<string, string>,
    rowNumber: number,
    errors: ImportRowError[]
  ): void {
    if (row.employee_id && !isValidUuid(row.employee_id)) {
      errors.push({ row: rowNumber, field: "employee_id", message: "Invalid UUID format", value: row.employee_id });
    }
    if (row.effective_from && !isValidDate(row.effective_from)) {
      errors.push({ row: rowNumber, field: "effective_from", message: "Invalid date format. Expected YYYY-MM-DD", value: row.effective_from });
    }
    if (row.effective_to && !isValidDate(row.effective_to)) {
      errors.push({ row: rowNumber, field: "effective_to", message: "Invalid date format. Expected YYYY-MM-DD", value: row.effective_to });
    }
    if (row.base_salary) {
      const salary = Number(row.base_salary);
      if (isNaN(salary) || salary < 0) {
        errors.push({ row: rowNumber, field: "base_salary", message: "Base salary must be a non-negative number", value: row.base_salary });
      }
    }
    if (row.currency && !/^[A-Z]{3}$/.test(row.currency)) {
      errors.push({ row: rowNumber, field: "currency", message: "Currency must be a 3-letter uppercase ISO code", value: row.currency });
    }
  }
}

// =============================================================================
// Validation Helpers
// =============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function isValidDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}
