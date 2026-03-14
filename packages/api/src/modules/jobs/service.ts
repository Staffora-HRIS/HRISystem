/**
 * Jobs Catalog Module - Service Layer
 *
 * Implements business logic for the jobs catalog.
 * Enforces invariants:
 *   - Unique code per tenant
 *   - Status transitions: draft -> active, active -> frozen/archived, frozen -> active/archived
 *   - Salary range validation: min_salary <= max_salary
 * Emits domain events via the outbox pattern.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { JobsRepository, JobRow } from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateJob,
  UpdateJob,
  JobFilters,
  JobStatus,
  PaginationQuery,
  JobResponse,
  JobListItem,
} from "./schemas";

// =============================================================================
// State Machine
// =============================================================================

/**
 * Valid status transitions for jobs.
 *
 *   draft   -> active
 *   active  -> frozen, archived
 *   frozen  -> active, archived
 *   archived -> (terminal)
 */
const VALID_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ["active"],
  active: ["frozen", "archived"],
  frozen: ["active", "archived"],
  archived: [],
};

// =============================================================================
// Domain Event Types
// =============================================================================

type JobDomainEventType =
  | "jobs.job.created"
  | "jobs.job.updated"
  | "jobs.job.archived"
  | "jobs.job.status_changed";

// =============================================================================
// Jobs Service
// =============================================================================

export class JobsService {
  constructor(
    private repository: JobsRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox (same transaction as business write).
   */
  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateType: string,
    aggregateId: string,
    eventType: JobDomainEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        ${aggregateType},
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Mapping
  // ===========================================================================

  /**
   * Map a database row to the API response shape.
   * Converts camelCase row properties to snake_case response keys
   * and coerces numeric/date types.
   */
  private mapJobToResponse(row: JobRow): JobResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      code: row.code,
      title: row.title,
      family: row.family,
      subfamily: row.subfamily,
      job_level: row.jobLevel != null ? Number(row.jobLevel) : null,
      job_grade: row.jobGrade,
      flsa_status: row.flsaStatus,
      eeo_category: row.eeoCategory,
      summary: row.summary,
      essential_functions: row.essentialFunctions,
      qualifications: row.qualifications,
      physical_requirements: row.physicalRequirements,
      working_conditions: row.workingConditions,
      salary_grade_id: row.salaryGradeId,
      min_salary: row.minSalary != null ? Number(row.minSalary) : null,
      max_salary: row.maxSalary != null ? Number(row.maxSalary) : null,
      currency: row.currency,
      status: row.status,
      effective_date:
        row.effectiveDate instanceof Date
          ? row.effectiveDate.toISOString().slice(0, 10)
          : String(row.effectiveDate),
      created_at:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      updated_at:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : String(row.updatedAt),
      created_by: row.createdBy,
      updated_by: row.updatedBy,
    };
  }

  /**
   * Map a list-projection row to the summary shape.
   */
  private mapJobToListItem(row: JobRow): JobListItem {
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      family: row.family,
      subfamily: row.subfamily,
      job_level: row.jobLevel != null ? Number(row.jobLevel) : null,
      job_grade: row.jobGrade,
      status: row.status,
      min_salary: row.minSalary != null ? Number(row.minSalary) : null,
      max_salary: row.maxSalary != null ? Number(row.maxSalary) : null,
      currency: row.currency,
      effective_date:
        row.effectiveDate instanceof Date
          ? row.effectiveDate.toISOString().slice(0, 10)
          : String(row.effectiveDate),
    };
  }

  // ===========================================================================
  // List Jobs
  // ===========================================================================

  /**
   * List jobs with filters and cursor-based pagination.
   */
  async listJobs(
    context: TenantContext,
    filters: JobFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<JobListItem>> {
    const result = await this.repository.findJobs(context, filters, pagination);

    return {
      items: result.items.map((row) => this.mapJobToListItem(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Get by ID
  // ===========================================================================

  /**
   * Get a single job by ID.
   */
  async getJob(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<JobResponse>> {
    const job = await this.repository.findById(context, id);

    if (!job) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Job not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapJobToResponse(job),
    };
  }

  // ===========================================================================
  // Get by Code
  // ===========================================================================

  /**
   * Get a single job by code.
   */
  async getJobByCode(
    context: TenantContext,
    code: string
  ): Promise<ServiceResult<JobResponse>> {
    const job = await this.repository.findByCode(context, code);

    if (!job) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Job not found",
          details: { code },
        },
      };
    }

    return {
      success: true,
      data: this.mapJobToResponse(job),
    };
  }

  // ===========================================================================
  // Create
  // ===========================================================================

  /**
   * Create a new job.
   *
   * Validates:
   * - Code uniqueness within tenant
   * - Salary range (min <= max)
   */
  async createJob(
    context: TenantContext,
    data: CreateJob,
    _idempotencyKey?: string
  ): Promise<ServiceResult<JobResponse>> {
    // 1. Check for duplicate code
    const existing = await this.repository.findByCode(context, data.code);
    if (existing) {
      return {
        success: false,
        error: {
          code: "DUPLICATE_CODE",
          message: "A job with this code already exists",
          details: { code: data.code },
        },
      };
    }

    // 2. Validate salary range
    if (
      data.min_salary != null &&
      data.max_salary != null &&
      data.min_salary > data.max_salary
    ) {
      return {
        success: false,
        error: {
          code: "INVALID_SALARY_RANGE",
          message:
            "Minimum salary must be less than or equal to maximum salary",
          details: { min_salary: data.min_salary, max_salary: data.max_salary },
        },
      };
    }

    // 3. Create within transaction (business write + outbox event)
    const result = await this.db.withTransaction(context, async (tx) => {
      const job = await this.repository.create(
        tx,
        context,
        data,
        context.userId || "system"
      );

      // Emit domain event
      await this.emitEvent(tx, context, "job", job.id, "jobs.job.created", {
        job: this.mapJobToResponse(job),
      });

      return job;
    });

    return {
      success: true,
      data: this.mapJobToResponse(result),
    };
  }

  // ===========================================================================
  // Update
  // ===========================================================================

  /**
   * Update an existing job.
   *
   * Validates:
   * - Job exists
   * - Code uniqueness if code is being changed
   * - Status transition validity
   * - Salary range (min <= max)
   */
  async updateJob(
    context: TenantContext,
    id: string,
    data: UpdateJob,
    _idempotencyKey?: string
  ): Promise<ServiceResult<JobResponse>> {
    // 1. Check job exists
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Job not found",
          details: { id },
        },
      };
    }

    // 2. If code is changing, check uniqueness
    if (data.code && data.code !== existing.code) {
      const codeConflict = await this.repository.findByCode(
        context,
        data.code
      );
      if (codeConflict) {
        return {
          success: false,
          error: {
            code: "DUPLICATE_CODE",
            message: "A job with this code already exists",
            details: { code: data.code },
          },
        };
      }
    }

    // 3. If status is changing, validate transition
    if (data.status && data.status !== existing.status) {
      const allowed = VALID_STATUS_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(data.status)) {
        return {
          success: false,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot transition job from '${existing.status}' to '${data.status}'`,
            details: {
              current_status: existing.status,
              requested_status: data.status,
              allowed_transitions: allowed,
            },
          },
        };
      }
    }

    // 4. Validate salary range
    const effectiveMin =
      data.min_salary !== undefined ? data.min_salary : existing.minSalary != null ? Number(existing.minSalary) : null;
    const effectiveMax =
      data.max_salary !== undefined ? data.max_salary : existing.maxSalary != null ? Number(existing.maxSalary) : null;

    if (
      effectiveMin != null &&
      effectiveMax != null &&
      effectiveMin > effectiveMax
    ) {
      return {
        success: false,
        error: {
          code: "INVALID_SALARY_RANGE",
          message:
            "Minimum salary must be less than or equal to maximum salary",
          details: { min_salary: effectiveMin, max_salary: effectiveMax },
        },
      };
    }

    // 5. Update within transaction
    const isStatusChange = data.status && data.status !== existing.status;

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.update(
        tx,
        context,
        id,
        data,
        context.userId || "system"
      );

      if (!updated) {
        return null;
      }

      // Emit domain event
      const eventType: JobDomainEventType = isStatusChange
        ? "jobs.job.status_changed"
        : "jobs.job.updated";

      await this.emitEvent(tx, context, "job", updated.id, eventType, {
        job: this.mapJobToResponse(updated),
        changes: data,
        previousStatus: isStatusChange ? existing.status : undefined,
      });

      return updated;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Job not found after update",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapJobToResponse(result),
    };
  }

  // ===========================================================================
  // Archive
  // ===========================================================================

  /**
   * Archive a job. Only allowed from 'active' or 'frozen' status.
   */
  async archiveJob(
    context: TenantContext,
    id: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<JobResponse>> {
    // 1. Check job exists
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Job not found",
          details: { id },
        },
      };
    }

    // 2. Validate transition to archived
    const allowed = VALID_STATUS_TRANSITIONS[existing.status] || [];
    if (!allowed.includes("archived")) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot archive job with status '${existing.status}'`,
          details: {
            current_status: existing.status,
            allowed_transitions: allowed,
          },
        },
      };
    }

    // 3. Archive within transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      const archived = await this.repository.archive(
        tx,
        context,
        id,
        context.userId || "system"
      );

      if (!archived) {
        return null;
      }

      // Emit domain event
      await this.emitEvent(
        tx,
        context,
        "job",
        archived.id,
        "jobs.job.archived",
        {
          job: this.mapJobToResponse(archived),
          previousStatus: existing.status,
        }
      );

      return archived;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Job not found after archive",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapJobToResponse(result),
    };
  }
}
