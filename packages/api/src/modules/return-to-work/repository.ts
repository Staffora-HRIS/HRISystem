/**
 * Return to Work Module - Repository Layer
 *
 * Provides data access methods for return-to-work interview records.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * Table: app.return_to_work_interviews
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  CreateInterview,
  UpdateInterview,
  InterviewFilters,
  PaginationQuery,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

/**
 * Database row type for return_to_work_interviews.
 * Column names are auto-converted to camelCase by postgres.js toCamel transform.
 */
export interface InterviewRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  leaveRequestId: string | null;
  absenceStartDate: Date;
  absenceEndDate: Date;
  interviewDate: Date;
  interviewerId: string;
  fitForWork: boolean;
  adjustmentsNeeded: string | null;
  referralToOccupationalHealth: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class ReturnToWorkRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Find interviews with filters and cursor-based pagination.
   * Ordered by interview_date DESC, id for stable cursor ordering.
   */
  async findInterviews(
    context: TenantContext,
    filters: InterviewFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<InterviewRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1; // Fetch one extra to check hasMore

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<InterviewRow[]>`
        SELECT
          id, tenant_id, employee_id, leave_request_id,
          absence_start_date, absence_end_date, interview_date,
          interviewer_id, fit_for_work, adjustments_needed,
          referral_to_occupational_health, notes,
          created_at, updated_at
        FROM app.return_to_work_interviews
        WHERE 1=1
          ${filters.employee_id ? tx`AND employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.interviewer_id ? tx`AND interviewer_id = ${filters.interviewer_id}::uuid` : tx``}
          ${filters.fit_for_work !== undefined ? tx`AND fit_for_work = ${filters.fit_for_work}` : tx``}
          ${filters.referral_to_occupational_health !== undefined ? tx`AND referral_to_occupational_health = ${filters.referral_to_occupational_health}` : tx``}
          ${filters.interview_date_from ? tx`AND interview_date >= ${filters.interview_date_from}::date` : tx``}
          ${filters.interview_date_to ? tx`AND interview_date <= ${filters.interview_date_to}::date` : tx``}
          ${filters.leave_request_id ? tx`AND leave_request_id = ${filters.leave_request_id}::uuid` : tx``}
          ${cursor ? tx`AND id < ${cursor}::uuid` : tx``}
        ORDER BY interview_date DESC, id DESC
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find a single interview by ID
   */
  async findById(
    context: TenantContext,
    id: string
  ): Promise<InterviewRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<InterviewRow[]>`
        SELECT
          id, tenant_id, employee_id, leave_request_id,
          absence_start_date, absence_end_date, interview_date,
          interviewer_id, fit_for_work, adjustments_needed,
          referral_to_occupational_health, notes,
          created_at, updated_at
        FROM app.return_to_work_interviews
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  // ===========================================================================
  // Write Operations (require transaction handle)
  // ===========================================================================

  /**
   * Insert a new interview record
   */
  async create(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateInterview
  ): Promise<InterviewRow> {
    const rows = await tx<InterviewRow[]>`
      INSERT INTO app.return_to_work_interviews (
        tenant_id, employee_id, leave_request_id,
        absence_start_date, absence_end_date, interview_date,
        interviewer_id, fit_for_work, adjustments_needed,
        referral_to_occupational_health, notes
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.leave_request_id ?? null}::uuid,
        ${data.absence_start_date}::date,
        ${data.absence_end_date}::date,
        ${data.interview_date}::date,
        ${data.interviewer_id}::uuid,
        ${data.fit_for_work},
        ${data.adjustments_needed ?? null},
        ${data.referral_to_occupational_health ?? false},
        ${data.notes ?? null}
      )
      RETURNING
        id, tenant_id, employee_id, leave_request_id,
        absence_start_date, absence_end_date, interview_date,
        interviewer_id, fit_for_work, adjustments_needed,
        referral_to_occupational_health, notes,
        created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update an existing interview record
   */
  async update(
    tx: TransactionSql,
    _context: TenantContext,
    id: string,
    data: UpdateInterview
  ): Promise<InterviewRow | null> {
    const rows = await tx<InterviewRow[]>`
      UPDATE app.return_to_work_interviews
      SET
        leave_request_id = COALESCE(${data.leave_request_id}::uuid, leave_request_id),
        absence_start_date = COALESCE(${data.absence_start_date}::date, absence_start_date),
        absence_end_date = COALESCE(${data.absence_end_date}::date, absence_end_date),
        interview_date = COALESCE(${data.interview_date}::date, interview_date),
        interviewer_id = COALESCE(${data.interviewer_id}::uuid, interviewer_id),
        fit_for_work = COALESCE(${data.fit_for_work}, fit_for_work),
        adjustments_needed = COALESCE(${data.adjustments_needed}, adjustments_needed),
        referral_to_occupational_health = COALESCE(${data.referral_to_occupational_health}, referral_to_occupational_health),
        notes = COALESCE(${data.notes}, notes),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, leave_request_id,
        absence_start_date, absence_end_date, interview_date,
        interviewer_id, fit_for_work, adjustments_needed,
        referral_to_occupational_health, notes,
        created_at, updated_at
    `;

    return rows[0] || null;
  }

  /**
   * Complete an interview by updating assessment fields
   */
  async complete(
    tx: TransactionSql,
    _context: TenantContext,
    id: string,
    data: {
      fitForWork: boolean;
      adjustmentsNeeded?: string | null;
      referralToOccupationalHealth?: boolean;
      notes?: string | null;
    }
  ): Promise<InterviewRow | null> {
    const rows = await tx<InterviewRow[]>`
      UPDATE app.return_to_work_interviews
      SET
        fit_for_work = ${data.fitForWork},
        adjustments_needed = ${data.adjustmentsNeeded ?? null},
        referral_to_occupational_health = ${data.referralToOccupationalHealth ?? false},
        notes = ${data.notes ?? null},
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, leave_request_id,
        absence_start_date, absence_end_date, interview_date,
        interviewer_id, fit_for_work, adjustments_needed,
        referral_to_occupational_health, notes,
        created_at, updated_at
    `;

    return rows[0] || null;
  }
}
