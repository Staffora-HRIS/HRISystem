/**
 * Data Import Module - Repository Layer
 *
 * Database operations for import jobs.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  ImportType,
  ImportStatus,
  ImportRowError,
  ListImportJobsQuery,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface ImportJobRow extends Row {
  id: string;
  tenantId: string;
  importType: string;
  fileName: string;
  status: string;
  totalRows: number;
  processedRows: number;
  errorRows: number;
  errors: ImportRowError[];
  validatedData: unknown[] | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class DataImportRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Create Import Job
  // ===========================================================================

  /**
   * Create a new import job record in 'pending' status.
   */
  async createJob(
    ctx: TenantContext,
    data: {
      importType: ImportType;
      fileName: string;
      totalRows: number;
    }
  ): Promise<ImportJobRow> {
    const [row] = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<ImportJobRow[]>`
        INSERT INTO import_jobs (
          tenant_id, import_type, file_name, status, total_rows, created_by
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${data.importType},
          ${data.fileName},
          'pending',
          ${data.totalRows},
          ${ctx.userId || null}::uuid
        )
        RETURNING *
      `;
    });
    return row;
  }

  // ===========================================================================
  // Get Import Job
  // ===========================================================================

  /**
   * Retrieve a single import job by ID (RLS-scoped).
   */
  async getJobById(ctx: TenantContext, id: string): Promise<ImportJobRow | null> {
    const rows = await this.db.withTransaction(
      ctx,
      async (tx) => {
        return await tx<ImportJobRow[]>`
          SELECT * FROM import_jobs
          WHERE id = ${id}::uuid
          LIMIT 1
        `;
      },
      { accessMode: "read only" }
    );
    return rows[0] || null;
  }

  // ===========================================================================
  // List Import Jobs (cursor-based pagination)
  // ===========================================================================

  /**
   * List import jobs with optional status/type filters and cursor pagination.
   */
  async listJobs(
    ctx: TenantContext,
    query: ListImportJobsQuery
  ): Promise<PaginatedResult<ImportJobRow>> {
    const limit = query.limit ?? 20;
    const fetchLimit = limit + 1; // Fetch one extra to detect hasMore

    const rows = await this.db.withTransaction(
      ctx,
      async (tx) => {
        // Build conditions array
        const conditions: ReturnType<typeof tx.unsafe>[] = [];

        if (query.status) {
          conditions.push(tx`status = ${query.status}`);
        }
        if (query.import_type) {
          conditions.push(tx`import_type = ${query.import_type}`);
        }
        if (query.cursor) {
          conditions.push(tx`created_at < ${query.cursor}::timestamptz`);
        }

        // Construct WHERE clause
        const where = conditions.length > 0
          ? tx`WHERE ${conditions.reduce((acc, cond, i) => i === 0 ? cond : tx`${acc} AND ${cond}`)}`
          : tx``;

        return await tx<ImportJobRow[]>`
          SELECT id, tenant_id, import_type, file_name, status,
                 total_rows, processed_rows, error_rows,
                 errors, created_by, created_at, updated_at, completed_at
          FROM import_jobs
          ${where}
          ORDER BY created_at DESC
          LIMIT ${fetchLimit}
        `;
      },
      { accessMode: "read only" }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0
      ? (items[items.length - 1].createdAt instanceof Date
        ? items[items.length - 1].createdAt.toISOString()
        : String(items[items.length - 1].createdAt))
      : null;

    return { items, nextCursor, hasMore };
  }

  // ===========================================================================
  // Update Job Status
  // ===========================================================================

  /**
   * Transition a job to a new status. Returns the updated row.
   */
  async updateJobStatus(
    ctx: TenantContext,
    id: string,
    update: {
      status: ImportStatus;
      totalRows?: number;
      processedRows?: number;
      errorRows?: number;
      errors?: ImportRowError[];
      validatedData?: unknown[];
      completedAt?: Date;
    }
  ): Promise<ImportJobRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<ImportJobRow[]>`
        UPDATE import_jobs SET
          status = ${update.status},
          total_rows = COALESCE(${update.totalRows ?? null}::integer, total_rows),
          processed_rows = COALESCE(${update.processedRows ?? null}::integer, processed_rows),
          error_rows = COALESCE(${update.errorRows ?? null}::integer, error_rows),
          errors = COALESCE(${update.errors ? JSON.stringify(update.errors) : null}::jsonb, errors),
          validated_data = COALESCE(${update.validatedData ? JSON.stringify(update.validatedData) : null}::jsonb, validated_data),
          completed_at = COALESCE(${update.completedAt ?? null}::timestamptz, completed_at),
          updated_at = now()
        WHERE id = ${id}::uuid
        RETURNING *
      `;
    });
    return rows[0] || null;
  }

  // ===========================================================================
  // Execute Import (within transaction + outbox)
  // ===========================================================================

  /**
   * Execute the import of validated employee rows within a single transaction.
   * Writes outbox events atomically with the data inserts.
   *
   * This method handles the 'employees' import type. Other import types
   * can be added as separate methods following the same transactional pattern.
   */
  async executeEmployeeImport(
    ctx: TenantContext,
    jobId: string,
    validatedRows: Record<string, string>[]
  ): Promise<{ processedRows: number; errorRows: number; errors: ImportRowError[] }> {
    return this.db.withTransaction(ctx, async (tx) => {
      let processedRows = 0;
      let errorRows = 0;
      const errors: ImportRowError[] = [];

      for (let i = 0; i < validatedRows.length; i++) {
        const row = validatedRows[i];
        try {
          const employeeId = crypto.randomUUID();
          const employeeNumber = row.employee_number || await this.generateEmployeeNumber(tx, ctx);

          // Insert employee record
          await tx`
            INSERT INTO employees (
              id, tenant_id, employee_number, status, hire_date,
              created_by, updated_by
            ) VALUES (
              ${employeeId}::uuid, ${ctx.tenantId}::uuid, ${employeeNumber},
              'pending', ${row.hire_date}::date,
              ${ctx.userId || null}::uuid, ${ctx.userId || null}::uuid
            )
          `;

          // Insert personal info
          await tx`
            INSERT INTO employee_personal (
              id, tenant_id, employee_id,
              first_name, last_name, middle_name, preferred_name,
              date_of_birth, gender, marital_status, nationality,
              effective_from, created_by
            ) VALUES (
              ${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid, ${employeeId}::uuid,
              ${row.first_name}, ${row.last_name},
              ${row.middle_name || null}, ${row.preferred_name || null},
              ${row.date_of_birth || null}::date,
              ${row.gender || null}, ${row.marital_status || null},
              ${row.nationality || null},
              ${row.hire_date}::date, ${ctx.userId || null}::uuid
            )
          `;

          // Insert contract record
          await tx`
            INSERT INTO employee_contracts (
              id, tenant_id, employee_id,
              contract_type, employment_type, fte,
              working_hours_per_week,
              effective_from, created_by
            ) VALUES (
              ${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid, ${employeeId}::uuid,
              ${row.contract_type || "permanent"}, ${row.employment_type || "full_time"},
              ${row.fte ? Number(row.fte) : 1.0},
              ${row.working_hours_per_week ? Number(row.working_hours_per_week) : null},
              ${row.hire_date}::date, ${ctx.userId || null}::uuid
            )
          `;

          // Insert position assignment
          await tx`
            INSERT INTO position_assignments (
              id, tenant_id, employee_id, position_id, org_unit_id,
              is_primary, effective_from, created_by
            ) VALUES (
              ${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid, ${employeeId}::uuid,
              ${row.position_id}::uuid, ${row.org_unit_id}::uuid,
              true, ${row.hire_date}::date, ${ctx.userId || null}::uuid
            )
          `;

          // Insert compensation if salary provided
          if (row.base_salary) {
            await tx`
              INSERT INTO employee_compensation (
                id, tenant_id, employee_id,
                base_salary, currency, pay_frequency,
                effective_from, created_by
              ) VALUES (
                ${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid, ${employeeId}::uuid,
                ${Number(row.base_salary)}, ${row.currency || "GBP"},
                ${row.pay_frequency || "monthly"},
                ${row.hire_date}::date, ${ctx.userId || null}::uuid
              )
            `;
          }

          // Insert reporting line if manager specified
          if (row.manager_id) {
            await tx`
              INSERT INTO reporting_lines (
                id, tenant_id, employee_id, manager_id,
                relationship_type, is_primary,
                effective_from, created_by
              ) VALUES (
                ${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid, ${employeeId}::uuid,
                ${row.manager_id}::uuid, 'direct', true,
                ${row.hire_date}::date, ${ctx.userId || null}::uuid
              )
            `;
          }

          // Insert status history
          await tx`
            INSERT INTO employee_status_history (
              id, tenant_id, employee_id,
              from_status, to_status, changed_at, changed_by, reason
            ) VALUES (
              ${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid, ${employeeId}::uuid,
              NULL, 'pending', now(), ${ctx.userId || null}::uuid, 'CSV import'
            )
          `;

          // Outbox event (same transaction)
          await tx`
            INSERT INTO domain_outbox (
              id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at
            ) VALUES (
              ${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid,
              'employee', ${employeeId}::uuid, 'hr.employee.created',
              ${JSON.stringify({
                employeeId,
                employeeNumber,
                hireDate: row.hire_date,
                source: "csv_import",
                importJobId: jobId,
                actor: ctx.userId,
              })}::jsonb, now()
            )
          `;

          processedRows++;
        } catch (error: unknown) {
          errorRows++;
          errors.push({
            row: i + 1,
            message: error instanceof Error ? error.message : "Unknown error during import",
          });
        }
      }

      return { processedRows, errorRows, errors };
    });
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Generate the next sequential employee number for the tenant.
   */
  private async generateEmployeeNumber(
    tx: TransactionSql,
    ctx: TenantContext
  ): Promise<string> {
    const [seqRow] = await tx<Array<{ nextNumber: string }>>`
      SELECT LPAD(
        (COALESCE(
          (SELECT MAX(CAST(employee_number AS INTEGER))
           FROM employees
           WHERE tenant_id = ${ctx.tenantId}::uuid
             AND employee_number ~ '^[0-9]+$'
          ), 0
        ) + 1)::text,
        6, '0'
      ) AS next_number
    `;
    return seqRow?.nextNumber || `EMP-${Date.now()}`;
  }
}
