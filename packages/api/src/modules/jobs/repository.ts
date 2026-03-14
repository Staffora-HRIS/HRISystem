/**
 * Jobs Catalog Module - Repository Layer
 *
 * Provides data access methods for the jobs catalog.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 * Explicit column SELECTs matching migration 0106_jobs.sql.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  CreateJob,
  UpdateJob,
  JobFilters,
  PaginationQuery,
} from "./schemas";
import type { JobStatus } from "./schemas";

// =============================================================================
// Types
// =============================================================================

/**
 * Database row type for jobs table (camelCase from postgres.js column transform)
 */
export interface JobRow extends Row {
  id: string;
  tenantId: string;
  code: string;
  title: string;
  family: string | null;
  subfamily: string | null;
  jobLevel: number | null;
  jobGrade: string | null;
  flsaStatus: string | null;
  eeoCategory: string | null;
  summary: string | null;
  essentialFunctions: string | null;
  qualifications: string | null;
  physicalRequirements: string | null;
  workingConditions: string | null;
  salaryGradeId: string | null;
  minSalary: string | null;
  maxSalary: string | null;
  currency: string | null;
  status: JobStatus;
  effectiveDate: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Jobs Repository
// =============================================================================

export class JobsRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // List Jobs
  // ===========================================================================

  /**
   * Find jobs with filters and cursor-based pagination.
   * Returns a lightweight projection for list views.
   */
  async findJobs(
    context: TenantContext,
    filters: JobFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<JobRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1; // Fetch one extra to check hasMore

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<JobRow[]>`
        SELECT
          id, code, title, family, subfamily,
          job_level, job_grade, status,
          min_salary, max_salary, currency,
          effective_date
        FROM jobs
        WHERE 1=1
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.family ? tx`AND family = ${filters.family}` : tx``}
          ${filters.job_grade ? tx`AND job_grade = ${filters.job_grade}` : tx``}
          ${filters.search ? tx`AND (title ILIKE ${"%" + filters.search + "%"} OR code ILIKE ${"%" + filters.search + "%"} OR family ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
        ORDER BY code, id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  // ===========================================================================
  // Get by ID
  // ===========================================================================

  /**
   * Find job by ID. Returns full row or null.
   */
  async findById(
    context: TenantContext,
    id: string
  ): Promise<JobRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<JobRow[]>`
        SELECT
          id, tenant_id, code, title, family, subfamily,
          job_level, job_grade, flsa_status, eeo_category,
          summary, essential_functions, qualifications,
          physical_requirements, working_conditions,
          salary_grade_id, min_salary, max_salary, currency,
          status, effective_date,
          created_at, updated_at, created_by, updated_by
        FROM jobs
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  // ===========================================================================
  // Get by Code
  // ===========================================================================

  /**
   * Find job by code (unique per tenant via constraint + RLS).
   */
  async findByCode(
    context: TenantContext,
    code: string
  ): Promise<JobRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<JobRow[]>`
        SELECT
          id, tenant_id, code, title, family, subfamily,
          job_level, job_grade, flsa_status, eeo_category,
          summary, essential_functions, qualifications,
          physical_requirements, working_conditions,
          salary_grade_id, min_salary, max_salary, currency,
          status, effective_date,
          created_at, updated_at, created_by, updated_by
        FROM jobs
        WHERE code = ${code}
      `;
      return rows;
    });

    return result[0] || null;
  }

  // ===========================================================================
  // Create
  // ===========================================================================

  /**
   * Create a new job within a transaction.
   */
  async create(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateJob,
    createdBy: string
  ): Promise<JobRow> {
    const rows = await tx<JobRow[]>`
      INSERT INTO jobs (
        tenant_id, code, title, family, subfamily,
        job_level, job_grade, flsa_status, eeo_category,
        summary, essential_functions, qualifications,
        physical_requirements, working_conditions,
        salary_grade_id, min_salary, max_salary, currency,
        status, effective_date,
        created_by, updated_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.code},
        ${data.title},
        ${data.family || null},
        ${data.subfamily || null},
        ${data.job_level ?? null},
        ${data.job_grade || null},
        ${data.flsa_status || "exempt"},
        ${data.eeo_category || null},
        ${data.summary || null},
        ${data.essential_functions || null},
        ${data.qualifications || null},
        ${data.physical_requirements || null},
        ${data.working_conditions || null},
        ${data.salary_grade_id || null}::uuid,
        ${data.min_salary ?? null},
        ${data.max_salary ?? null},
        ${data.currency || "USD"},
        ${data.status || "draft"},
        ${data.effective_date || new Date().toISOString().slice(0, 10)}::date,
        ${createdBy}::uuid,
        ${createdBy}::uuid
      )
      RETURNING
        id, tenant_id, code, title, family, subfamily,
        job_level, job_grade, flsa_status, eeo_category,
        summary, essential_functions, qualifications,
        physical_requirements, working_conditions,
        salary_grade_id, min_salary, max_salary, currency,
        status, effective_date,
        created_at, updated_at, created_by, updated_by
    `;

    return rows[0]!;
  }

  // ===========================================================================
  // Update
  // ===========================================================================

  /**
   * Update an existing job within a transaction.
   *
   * Uses COALESCE for non-nullable fields (code, title, status, effective_date)
   * so that omitted fields keep their current value. Nullable fields use
   * COALESCE as well; to explicitly clear a nullable field set it to null
   * using the dedicated schema (UpdateJobSchema allows t.Null()).
   *
   * Note: COALESCE(null, column) returns column, so passing null for a
   * nullable field is a no-op. To truly clear a field, callers must use a
   * sentinel or a dedicated "clear" action. This matches the HR module pattern.
   */
  async update(
    tx: TransactionSql,
    _context: TenantContext,
    id: string,
    data: UpdateJob,
    updatedBy: string
  ): Promise<JobRow | null> {
    const rows = await tx<JobRow[]>`
      UPDATE jobs
      SET
        code = COALESCE(${data.code ?? null}, code),
        title = COALESCE(${data.title ?? null}, title),
        family = COALESCE(${data.family ?? null}, family),
        subfamily = COALESCE(${data.subfamily ?? null}, subfamily),
        job_level = COALESCE(${data.job_level ?? null}, job_level),
        job_grade = COALESCE(${data.job_grade ?? null}, job_grade),
        flsa_status = COALESCE(${data.flsa_status ?? null}, flsa_status),
        eeo_category = COALESCE(${data.eeo_category ?? null}, eeo_category),
        summary = COALESCE(${data.summary ?? null}, summary),
        essential_functions = COALESCE(${data.essential_functions ?? null}, essential_functions),
        qualifications = COALESCE(${data.qualifications ?? null}, qualifications),
        physical_requirements = COALESCE(${data.physical_requirements ?? null}, physical_requirements),
        working_conditions = COALESCE(${data.working_conditions ?? null}, working_conditions),
        salary_grade_id = COALESCE(${data.salary_grade_id ?? null}::uuid, salary_grade_id),
        min_salary = COALESCE(${data.min_salary ?? null}, min_salary),
        max_salary = COALESCE(${data.max_salary ?? null}, max_salary),
        currency = COALESCE(${data.currency ?? null}, currency),
        status = COALESCE(${data.status ?? null}, status),
        effective_date = COALESCE(${data.effective_date ?? null}::date, effective_date),
        updated_by = ${updatedBy}::uuid
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, code, title, family, subfamily,
        job_level, job_grade, flsa_status, eeo_category,
        summary, essential_functions, qualifications,
        physical_requirements, working_conditions,
        salary_grade_id, min_salary, max_salary, currency,
        status, effective_date,
        created_at, updated_at, created_by, updated_by
    `;

    return rows[0] || null;
  }

  // ===========================================================================
  // Archive
  // ===========================================================================

  /**
   * Archive a job (set status to 'archived').
   */
  async archive(
    tx: TransactionSql,
    _context: TenantContext,
    id: string,
    updatedBy: string
  ): Promise<JobRow | null> {
    const rows = await tx<JobRow[]>`
      UPDATE jobs
      SET status = 'archived', updated_by = ${updatedBy}::uuid
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, code, title, family, subfamily,
        job_level, job_grade, flsa_status, eeo_category,
        summary, essential_functions, qualifications,
        physical_requirements, working_conditions,
        salary_grade_id, min_salary, max_salary, currency,
        status, effective_date,
        created_at, updated_at, created_by, updated_by
    `;

    return rows[0] || null;
  }
}
