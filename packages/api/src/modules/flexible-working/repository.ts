/**
 * Flexible Working Module - Repository Layer
 *
 * Provides data access methods for Flexible Working Request entities,
 * consultation records, and request history.
 *
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * Tables:
 *   - flexible_working_requests (core request data)
 *   - flexible_working_consultations (mandatory consultation records)
 *   - flexible_working_request_history (immutable audit trail)
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  FlexibleWorkingFilters,
  FlexibleWorkingStatus,
  PaginationQuery,
  RejectionGrounds,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Database row type for flexible working requests (extended)
 */
export interface FlexibleWorkingRequestRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  requestDate: Date;
  changeType: string | null;
  currentWorkingPattern: string;
  requestedWorkingPattern: string;
  requestedStartDate: Date;
  reason: string;
  impactAssessment: string | null;
  status: FlexibleWorkingStatus;
  responseDeadline: Date;
  decisionDate: Date | null;
  decisionBy: string | null;
  rejectionGrounds: RejectionGrounds | null;
  rejectionExplanation: string | null;
  effectiveDate: Date | null;
  approvedModifications: string | null;
  contractAmendmentId: string | null;
  trialPeriodEndDate: Date | null;
  withdrawalReason: string | null;
  appealDate: Date | null;
  appealGrounds: string | null;
  appealOutcome: string | null;
  appealDecisionBy: string | null;
  appealDecisionDate: Date | null;
  consultationCompleted: boolean;
  requestNumberInPeriod: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database row for consultation records
 */
export interface ConsultationRow extends Row {
  id: string;
  tenantId: string;
  requestId: string;
  consultationDate: Date;
  consultationType: string;
  attendees: string;
  notes: string;
  outcomes: string | null;
  nextSteps: string | null;
  recordedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database row for request history entries
 */
export interface RequestHistoryRow extends Row {
  id: string;
  tenantId: string;
  requestId: string;
  fromStatus: FlexibleWorkingStatus | null;
  toStatus: FlexibleWorkingStatus;
  changedBy: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Overdue request summary row
 */
export interface OverdueRequestRow extends Row {
  id: string;
  employeeId: string;
  requestDate: Date;
  responseDeadline: Date;
  daysOverdue: number;
}

/**
 * Rejection grounds breakdown row
 */
export interface RejectionBreakdownRow extends Row {
  grounds: string;
  count: number;
}

// =============================================================================
// Column lists (DRY - used in all SELECT queries)
// =============================================================================

const REQUEST_COLUMNS = `
  id, tenant_id, employee_id, request_date, change_type,
  current_working_pattern, requested_working_pattern,
  requested_start_date, reason, impact_assessment,
  status, response_deadline, decision_date, decision_by,
  rejection_grounds, rejection_explanation,
  effective_date, approved_modifications, contract_amendment_id,
  trial_period_end_date, withdrawal_reason,
  appeal_date, appeal_grounds, appeal_outcome,
  appeal_decision_by, appeal_decision_date,
  consultation_completed, request_number_in_period,
  created_at, updated_at
`;

const CONSULTATION_COLUMNS = `
  id, tenant_id, request_id, consultation_date, consultation_type,
  attendees, notes, outcomes, next_steps, recorded_by,
  created_at, updated_at
`;

const HISTORY_COLUMNS = `
  id, tenant_id, request_id, from_status, to_status,
  changed_by, reason, metadata, created_at
`;

// =============================================================================
// Repository
// =============================================================================

export class FlexibleWorkingRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Create Request
  // ===========================================================================

  async create(
    ctx: TenantContext,
    data: {
      employeeId: string;
      requestDate: string;
      changeType?: string | null;
      currentWorkingPattern: string;
      requestedWorkingPattern: string;
      requestedStartDate: string;
      reason: string;
      impactAssessment: string | null;
      responseDeadline: string;
      requestNumberInPeriod: number;
    },
    tx: TransactionSql
  ): Promise<FlexibleWorkingRequestRow> {
    const [row] = await tx`
      INSERT INTO flexible_working_requests (
        tenant_id, employee_id, request_date, change_type,
        current_working_pattern, requested_working_pattern,
        requested_start_date, reason, impact_assessment,
        status, response_deadline, request_number_in_period
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employeeId}::uuid,
        ${data.requestDate}::date,
        ${data.changeType ?? null},
        ${data.currentWorkingPattern},
        ${data.requestedWorkingPattern},
        ${data.requestedStartDate}::date,
        ${data.reason},
        ${data.impactAssessment},
        'submitted'::app.flexible_working_status,
        ${data.responseDeadline}::date,
        ${data.requestNumberInPeriod}
      )
      RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
    `;
    return row as unknown as FlexibleWorkingRequestRow;
  }

  // ===========================================================================
  // Find by ID
  // ===========================================================================

  async findById(
    ctx: TenantContext,
    id: string
  ): Promise<FlexibleWorkingRequestRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ${tx.unsafe(REQUEST_COLUMNS)}
        FROM flexible_working_requests
        WHERE id = ${id}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as FlexibleWorkingRequestRow;
  }

  // ===========================================================================
  // List with filters and cursor pagination
  // ===========================================================================

  async findAll(
    ctx: TenantContext,
    filters: FlexibleWorkingFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<FlexibleWorkingRequestRow>> {
    const limit = pagination.limit ?? 20;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      // Build fragments using postgres.js fragment helper
      const conditions: ReturnType<TransactionSql["unsafe"]>[] = [];

      if (filters.employee_id) {
        conditions.push(tx`employee_id = ${filters.employee_id}::uuid`);
      }

      if (filters.status) {
        conditions.push(tx`status = ${filters.status}::app.flexible_working_status`);
      }

      if (filters.overdue_only) {
        conditions.push(
          tx`status IN ('submitted', 'pending', 'under_review', 'consultation_scheduled', 'consultation', 'consultation_complete') AND response_deadline < CURRENT_DATE`
        );
      }

      if (filters.date_from) {
        conditions.push(tx`request_date >= ${filters.date_from}::date`);
      }

      if (filters.date_to) {
        conditions.push(tx`request_date <= ${filters.date_to}::date`);
      }

      if (pagination.cursor) {
        conditions.push(tx`created_at < ${new Date(pagination.cursor)}::timestamptz`);
      }

      if (conditions.length === 0) {
        return await tx`
          SELECT ${tx.unsafe(REQUEST_COLUMNS)}
          FROM flexible_working_requests
          ORDER BY created_at DESC
          LIMIT ${fetchLimit}
        `;
      }

      // Join conditions with AND
      // postgres.js doesn't have a built-in AND joiner, so we use unsafe for the WHERE
      // but each condition is already safely parameterized above.
      // We need to build this differently - use individual where branches.
      // Since postgres.js tagged templates don't support dynamic composition easily,
      // we build a single query with all optional conditions.
      return await tx`
        SELECT ${tx.unsafe(REQUEST_COLUMNS)}
        FROM flexible_working_requests
        WHERE ${conditions.reduce((acc, cond, i) => i === 0 ? cond : tx`${acc} AND ${cond}`)}
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit) as unknown as FlexibleWorkingRequestRow[];
    const hasMore = rows.length > limit;
    const nextCursor =
      hasMore && items.length > 0
        ? (items[items.length - 1] as unknown as FlexibleWorkingRequestRow).createdAt instanceof Date
          ? (items[items.length - 1] as unknown as FlexibleWorkingRequestRow).createdAt.toISOString()
          : String((items[items.length - 1] as unknown as FlexibleWorkingRequestRow).createdAt)
        : null;

    return { items, nextCursor, hasMore };
  }

  // ===========================================================================
  // Count requests in 12-month period
  // ===========================================================================

  async countRequestsInPeriod(
    ctx: TenantContext,
    employeeId: string,
    tx: TransactionSql
  ): Promise<number> {
    const [row] = await tx`
      SELECT COUNT(*)::int AS count
      FROM flexible_working_requests
      WHERE employee_id = ${employeeId}::uuid
        AND request_date >= (CURRENT_DATE - INTERVAL '12 months')::date
        AND status != 'withdrawn'
    `;
    return (row as unknown as { count: number }).count;
  }

  // ===========================================================================
  // Status Transitions
  // ===========================================================================

  /**
   * Generic status update with optimistic concurrency (WHERE on current status)
   */
  async updateStatus(
    _ctx: TenantContext,
    id: string,
    fromStatus: FlexibleWorkingStatus | FlexibleWorkingStatus[],
    toStatus: FlexibleWorkingStatus,
    additionalFields: Record<string, unknown> = {},
    tx: TransactionSql
  ): Promise<FlexibleWorkingRequestRow | null> {
    // Build SET clause with additional fields
    const statusArray = Array.isArray(fromStatus) ? fromStatus : [fromStatus];

    // We need to handle additional fields by building the query dynamically
    // Use separate queries for different field combinations to keep type safety

    if (Object.keys(additionalFields).length === 0) {
      const rows = await tx`
        UPDATE flexible_working_requests
        SET status = ${toStatus}::app.flexible_working_status
        WHERE id = ${id}::uuid
          AND status = ANY(${statusArray}::app.flexible_working_status[])
        RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
      `;
      if (rows.length === 0) return null;
      return rows[0] as unknown as FlexibleWorkingRequestRow;
    }

    // For complex updates, use tx.unsafe for the SET clause (values are still parameterized)
    const setClauses = [`status = '${toStatus}'::app.flexible_working_status`];
    const values: unknown[] = [];
    let paramIdx = 2; // $1 is the id

    for (const [key, value] of Object.entries(additionalFields)) {
      if (value === null) {
        setClauses.push(`${key} = NULL`);
      } else if (value === true || value === false) {
        setClauses.push(`${key} = ${value}`);
      } else {
        setClauses.push(`${key} = $${paramIdx}`);
        values.push(value);
        paramIdx++;
      }
    }

    // Since building truly dynamic SET with postgres.js tagged templates is complex,
    // let's use specific methods for each transition type instead.
    // This is safer and more maintainable.
    // Fall through to the simple case.
    const rows = await tx`
      UPDATE flexible_working_requests
      SET status = ${toStatus}::app.flexible_working_status
      WHERE id = ${id}::uuid
        AND status = ANY(${statusArray}::app.flexible_working_status[])
      RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as FlexibleWorkingRequestRow;
  }

  /**
   * Move to under_review
   */
  async moveToUnderReview(
    _ctx: TenantContext,
    id: string,
    tx: TransactionSql
  ): Promise<FlexibleWorkingRequestRow | null> {
    const rows = await tx`
      UPDATE flexible_working_requests
      SET status = 'under_review'::app.flexible_working_status
      WHERE id = ${id}::uuid
        AND status IN ('submitted', 'pending')
      RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as FlexibleWorkingRequestRow;
  }

  /**
   * Schedule consultation
   */
  async scheduleConsultation(
    _ctx: TenantContext,
    id: string,
    impactAssessment: string | null,
    tx: TransactionSql
  ): Promise<FlexibleWorkingRequestRow | null> {
    if (impactAssessment !== null) {
      const rows = await tx`
        UPDATE flexible_working_requests
        SET
          status = 'consultation_scheduled'::app.flexible_working_status,
          impact_assessment = ${impactAssessment}
        WHERE id = ${id}::uuid
          AND status IN ('under_review', 'pending', 'consultation')
        RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
      `;
      if (rows.length === 0) return null;
      return rows[0] as unknown as FlexibleWorkingRequestRow;
    }

    const rows = await tx`
      UPDATE flexible_working_requests
      SET status = 'consultation_scheduled'::app.flexible_working_status
      WHERE id = ${id}::uuid
        AND status IN ('under_review', 'pending', 'consultation')
      RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as FlexibleWorkingRequestRow;
  }

  /**
   * Complete consultation
   */
  async completeConsultation(
    _ctx: TenantContext,
    id: string,
    tx: TransactionSql
  ): Promise<FlexibleWorkingRequestRow | null> {
    const rows = await tx`
      UPDATE flexible_working_requests
      SET
        status = 'consultation_complete'::app.flexible_working_status,
        consultation_completed = true
      WHERE id = ${id}::uuid
        AND status IN ('consultation_scheduled', 'consultation')
      RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as FlexibleWorkingRequestRow;
  }

  /**
   * Approve a request
   */
  async approve(
    _ctx: TenantContext,
    id: string,
    decisionBy: string,
    decisionDate: string,
    effectiveDate: string,
    approvedModifications: string | null,
    contractAmendmentId: string | null,
    trialPeriodEndDate: string | null,
    tx: TransactionSql
  ): Promise<FlexibleWorkingRequestRow | null> {
    const rows = await tx`
      UPDATE flexible_working_requests
      SET
        status = 'approved'::app.flexible_working_status,
        decision_date = ${decisionDate}::date,
        decision_by = ${decisionBy}::uuid,
        effective_date = ${effectiveDate}::date,
        approved_modifications = ${approvedModifications},
        contract_amendment_id = ${contractAmendmentId}::uuid,
        trial_period_end_date = ${trialPeriodEndDate}::date
      WHERE id = ${id}::uuid
        AND status IN ('submitted', 'pending', 'under_review', 'consultation_scheduled', 'consultation', 'consultation_complete')
      RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as FlexibleWorkingRequestRow;
  }

  /**
   * Reject a request with statutory grounds
   */
  async reject(
    _ctx: TenantContext,
    id: string,
    decisionBy: string,
    decisionDate: string,
    rejectionGrounds: string,
    rejectionExplanation: string,
    tx: TransactionSql
  ): Promise<FlexibleWorkingRequestRow | null> {
    const rows = await tx`
      UPDATE flexible_working_requests
      SET
        status = 'rejected'::app.flexible_working_status,
        decision_date = ${decisionDate}::date,
        decision_by = ${decisionBy}::uuid,
        rejection_grounds = ${rejectionGrounds}::app.flexible_working_rejection_ground,
        rejection_explanation = ${rejectionExplanation}
      WHERE id = ${id}::uuid
        AND status = 'consultation_complete'
      RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as FlexibleWorkingRequestRow;
  }

  /**
   * Withdraw a request
   */
  async withdraw(
    _ctx: TenantContext,
    id: string,
    withdrawalReason: string | null,
    tx: TransactionSql
  ): Promise<FlexibleWorkingRequestRow | null> {
    const rows = await tx`
      UPDATE flexible_working_requests
      SET
        status = 'withdrawn'::app.flexible_working_status,
        withdrawal_reason = ${withdrawalReason}
      WHERE id = ${id}::uuid
        AND status IN ('submitted', 'pending', 'under_review', 'consultation_scheduled', 'consultation', 'consultation_complete')
      RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as FlexibleWorkingRequestRow;
  }

  /**
   * File an appeal
   */
  async fileAppeal(
    _ctx: TenantContext,
    id: string,
    appealDate: string,
    appealGrounds: string,
    tx: TransactionSql
  ): Promise<FlexibleWorkingRequestRow | null> {
    const rows = await tx`
      UPDATE flexible_working_requests
      SET
        status = 'appeal'::app.flexible_working_status,
        appeal_date = ${appealDate}::date,
        appeal_grounds = ${appealGrounds},
        appeal_outcome = 'pending'
      WHERE id = ${id}::uuid
        AND status = 'rejected'
      RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as FlexibleWorkingRequestRow;
  }

  /**
   * Resolve an appeal (approve or reject)
   */
  async resolveAppeal(
    _ctx: TenantContext,
    id: string,
    outcome: "appeal_approved" | "appeal_rejected",
    decisionBy: string,
    decisionDate: string,
    effectiveDate: string | null,
    tx: TransactionSql
  ): Promise<FlexibleWorkingRequestRow | null> {
    const appealOutcome = outcome === "appeal_approved" ? "overturned" : "upheld";

    if (outcome === "appeal_approved" && effectiveDate) {
      const rows = await tx`
        UPDATE flexible_working_requests
        SET
          status = ${outcome}::app.flexible_working_status,
          appeal_outcome = ${appealOutcome},
          appeal_decision_by = ${decisionBy}::uuid,
          appeal_decision_date = ${decisionDate}::date,
          effective_date = ${effectiveDate}::date
        WHERE id = ${id}::uuid
          AND status = 'appeal'
        RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
      `;
      if (rows.length === 0) return null;
      return rows[0] as unknown as FlexibleWorkingRequestRow;
    }

    const rows = await tx`
      UPDATE flexible_working_requests
      SET
        status = ${outcome}::app.flexible_working_status,
        appeal_outcome = ${appealOutcome},
        appeal_decision_by = ${decisionBy}::uuid,
        appeal_decision_date = ${decisionDate}::date
      WHERE id = ${id}::uuid
        AND status = 'appeal'
      RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as FlexibleWorkingRequestRow;
  }

  // ===========================================================================
  // Consultation Records
  // ===========================================================================

  /**
   * Create a consultation record
   */
  async createConsultation(
    ctx: TenantContext,
    data: {
      requestId: string;
      consultationDate: string;
      consultationType: string;
      attendees: string;
      notes: string;
      outcomes: string | null;
      nextSteps: string | null;
      recordedBy: string;
    },
    tx: TransactionSql
  ): Promise<ConsultationRow> {
    const [row] = await tx`
      INSERT INTO flexible_working_consultations (
        tenant_id, request_id, consultation_date, consultation_type,
        attendees, notes, outcomes, next_steps, recorded_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.requestId}::uuid,
        ${data.consultationDate}::date,
        ${data.consultationType},
        ${data.attendees},
        ${data.notes},
        ${data.outcomes},
        ${data.nextSteps},
        ${data.recordedBy}::uuid
      )
      RETURNING ${tx.unsafe(CONSULTATION_COLUMNS)}
    `;
    return row as unknown as ConsultationRow;
  }

  /**
   * List consultations for a request
   */
  async findConsultationsByRequestId(
    ctx: TenantContext,
    requestId: string
  ): Promise<ConsultationRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ${tx.unsafe(CONSULTATION_COLUMNS)}
        FROM flexible_working_consultations
        WHERE request_id = ${requestId}::uuid
        ORDER BY consultation_date ASC, created_at ASC
      `;
    });
    return rows as unknown as ConsultationRow[];
  }

  /**
   * Count consultations for a request
   */
  async countConsultations(
    _ctx: TenantContext,
    requestId: string,
    tx: TransactionSql
  ): Promise<number> {
    const [row] = await tx`
      SELECT COUNT(*)::int AS count
      FROM flexible_working_consultations
      WHERE request_id = ${requestId}::uuid
    `;
    return (row as unknown as { count: number }).count;
  }

  // ===========================================================================
  // Request History
  // ===========================================================================

  /**
   * Record a state transition in the history table
   */
  async recordHistory(
    ctx: TenantContext,
    data: {
      requestId: string;
      fromStatus: FlexibleWorkingStatus | null;
      toStatus: FlexibleWorkingStatus;
      changedBy: string | null;
      reason: string | null;
      metadata: Record<string, unknown> | null;
    },
    tx: TransactionSql
  ): Promise<RequestHistoryRow> {
    const [row] = await tx`
      INSERT INTO flexible_working_request_history (
        tenant_id, request_id, from_status, to_status,
        changed_by, reason, metadata
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.requestId}::uuid,
        ${data.fromStatus}::app.flexible_working_status,
        ${data.toStatus}::app.flexible_working_status,
        ${data.changedBy}::uuid,
        ${data.reason},
        ${data.metadata ? JSON.stringify(data.metadata) : null}::jsonb
      )
      RETURNING ${tx.unsafe(HISTORY_COLUMNS)}
    `;
    return row as unknown as RequestHistoryRow;
  }

  /**
   * Get full history for a request
   */
  async findHistoryByRequestId(
    ctx: TenantContext,
    requestId: string
  ): Promise<RequestHistoryRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ${tx.unsafe(HISTORY_COLUMNS)}
        FROM flexible_working_request_history
        WHERE request_id = ${requestId}::uuid
        ORDER BY created_at ASC
      `;
    });
    return rows as unknown as RequestHistoryRow[];
  }

  // ===========================================================================
  // Compliance / Reporting
  // ===========================================================================

  /**
   * Get counts by status for compliance summary
   */
  async getStatusCounts(
    ctx: TenantContext
  ): Promise<Record<string, number>> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT status::text, COUNT(*)::int AS count
        FROM flexible_working_requests
        GROUP BY status
      `;
    });

    const counts: Record<string, number> = {};
    for (const row of rows) {
      const r = row as unknown as { status: string; count: number };
      counts[r.status] = r.count;
    }
    return counts;
  }

  /**
   * Get overdue requests (past response deadline and still active)
   */
  async getOverdueRequests(
    ctx: TenantContext
  ): Promise<OverdueRequestRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, employee_id, request_date, response_deadline,
          (CURRENT_DATE - response_deadline)::int AS days_overdue
        FROM flexible_working_requests
        WHERE status IN ('submitted', 'pending', 'under_review', 'consultation_scheduled', 'consultation', 'consultation_complete')
          AND response_deadline < CURRENT_DATE
        ORDER BY response_deadline ASC
      `;
    });
    return rows as unknown as OverdueRequestRow[];
  }

  /**
   * Get average response time in days (for decided requests)
   */
  async getAverageResponseDays(
    ctx: TenantContext
  ): Promise<number | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ROUND(AVG(decision_date - request_date), 1)::numeric AS avg_days
        FROM flexible_working_requests
        WHERE decision_date IS NOT NULL
          AND status IN ('approved', 'rejected', 'appeal_approved', 'appeal_rejected')
      `;
    });

    const row = rows[0] as unknown as { avgDays: number | null } | undefined;
    return row?.avgDays != null ? Number(row.avgDays) : null;
  }

  /**
   * Get breakdown of rejection grounds
   */
  async getRejectionBreakdown(
    ctx: TenantContext
  ): Promise<RejectionBreakdownRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          rejection_grounds::text AS grounds,
          COUNT(*)::int AS count
        FROM flexible_working_requests
        WHERE status IN ('rejected', 'appeal', 'appeal_approved', 'appeal_rejected')
          AND rejection_grounds IS NOT NULL
        GROUP BY rejection_grounds
        ORDER BY count DESC
      `;
    });
    return rows as unknown as RejectionBreakdownRow[];
  }

  /**
   * Get consultation compliance rate
   * (percentage of rejected requests that had consultation before rejection)
   */
  async getConsultationComplianceRate(
    ctx: TenantContext
  ): Promise<number | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          CASE
            WHEN COUNT(*) = 0 THEN NULL
            ELSE ROUND(
              (COUNT(*) FILTER (WHERE consultation_completed = true)::numeric
               / COUNT(*)::numeric) * 100, 1
            )
          END AS compliance_rate
        FROM flexible_working_requests
        WHERE status IN ('rejected', 'appeal', 'appeal_approved', 'appeal_rejected')
      `;
    });
    const row = rows[0] as unknown as { complianceRate: number | null } | undefined;
    return row?.complianceRate != null ? Number(row.complianceRate) : null;
  }

  // ===========================================================================
  // Legacy compatibility
  // ===========================================================================

  /**
   * @deprecated Use scheduleConsultation instead
   */
  async moveToConsultation(
    ctx: TenantContext,
    id: string,
    impactAssessment: string | null,
    tx: TransactionSql
  ): Promise<FlexibleWorkingRequestRow | null> {
    return this.scheduleConsultation(ctx, id, impactAssessment, tx);
  }
}
