/**
 * Warnings Module - Repository Layer
 *
 * Provides data access methods for employee warning entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  IssueWarning,
  WarningFilters,
  PaginationQuery,
  WarningLevel,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

/**
 * Database row type for employee warnings
 */
export interface WarningRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  caseId: string | null;
  warningLevel: WarningLevel;
  status: string;
  issuedDate: Date;
  expiryDate: Date;
  issuedBy: string;
  reason: string;
  details: string | null;
  hearingDate: Date | null;
  companionPresent: boolean;
  companionName: string | null;
  appealDeadline: Date | null;
  appealed: boolean;
  appealDate: Date | null;
  appealOutcome: string | null;
  appealNotes: string | null;
  rescindedDate: Date | null;
  rescindedBy: string | null;
  rescindedReason: string | null;
  employeeName?: string;
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

export class WarningsRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Find Operations
  // ===========================================================================

  /**
   * Find warning by ID
   */
  async findById(
    context: TenantContext,
    id: string
  ): Promise<WarningRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<WarningRow[]>`
        SELECT
          ew.id,
          ew.tenant_id,
          ew.employee_id,
          ew.case_id,
          ew.warning_level,
          ew.status,
          ew.issued_date,
          ew.expiry_date,
          ew.issued_by,
          ew.reason,
          ew.details,
          ew.hearing_date,
          ew.companion_present,
          ew.companion_name,
          ew.appeal_deadline,
          ew.appealed,
          ew.appeal_date,
          ew.appeal_outcome,
          ew.appeal_notes,
          ew.rescinded_date,
          ew.rescinded_by,
          ew.rescinded_reason,
          ew.created_at,
          ew.updated_at,
          COALESCE(
            (SELECT ep.first_name || ' ' || ep.last_name
             FROM employee_personal ep
             WHERE ep.employee_id = ew.employee_id
               AND ep.effective_to IS NULL
             LIMIT 1),
            'Unknown'
          ) AS employee_name
        FROM employee_warnings ew
        WHERE ew.id = ${id}
      `;
    });
    return rows[0] || null;
  }

  /**
   * Find warnings by employee ID with filters and pagination
   */
  async findByEmployeeId(
    context: TenantContext,
    employeeId: string,
    filters: WarningFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<WarningRow>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor;

    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<WarningRow[]>`
        SELECT
          ew.id,
          ew.tenant_id,
          ew.employee_id,
          ew.case_id,
          ew.warning_level,
          ew.status,
          ew.issued_date,
          ew.expiry_date,
          ew.issued_by,
          ew.reason,
          ew.details,
          ew.hearing_date,
          ew.companion_present,
          ew.companion_name,
          ew.appeal_deadline,
          ew.appealed,
          ew.appeal_date,
          ew.appeal_outcome,
          ew.appeal_notes,
          ew.rescinded_date,
          ew.rescinded_by,
          ew.rescinded_reason,
          ew.created_at,
          ew.updated_at
        FROM employee_warnings ew
        WHERE ew.employee_id = ${employeeId}
          ${filters.status ? tx`AND ew.status = ${filters.status}` : tx``}
          ${filters.warning_level ? tx`AND ew.warning_level = ${filters.warning_level}` : tx``}
          ${filters.search ? tx`AND (ew.reason ILIKE ${"%" + filters.search + "%"} OR ew.details ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${cursor ? tx`AND ew.id < ${cursor}` : tx``}
        ORDER BY ew.issued_date DESC, ew.id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find all active warnings for an employee
   */
  async findActiveByEmployeeId(
    context: TenantContext,
    employeeId: string
  ): Promise<WarningRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return await tx<WarningRow[]>`
        SELECT
          ew.id,
          ew.tenant_id,
          ew.employee_id,
          ew.case_id,
          ew.warning_level,
          ew.status,
          ew.issued_date,
          ew.expiry_date,
          ew.issued_by,
          ew.reason,
          ew.details,
          ew.hearing_date,
          ew.companion_present,
          ew.companion_name,
          ew.appeal_deadline,
          ew.appealed,
          ew.appeal_date,
          ew.appeal_outcome,
          ew.appeal_notes,
          ew.rescinded_date,
          ew.rescinded_by,
          ew.rescinded_reason,
          ew.created_at,
          ew.updated_at
        FROM employee_warnings ew
        WHERE ew.employee_id = ${employeeId}
          AND ew.status = 'active'
        ORDER BY ew.issued_date DESC
      `;
    });
  }

  /**
   * Find expired warnings that are still marked as active
   */
  async findExpiredActiveWarnings(
    context: TenantContext
  ): Promise<WarningRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return await tx<WarningRow[]>`
        SELECT
          ew.id,
          ew.tenant_id,
          ew.employee_id,
          ew.case_id,
          ew.warning_level,
          ew.status,
          ew.issued_date,
          ew.expiry_date,
          ew.issued_by,
          ew.reason,
          ew.details,
          ew.hearing_date,
          ew.companion_present,
          ew.companion_name,
          ew.appeal_deadline,
          ew.appealed,
          ew.appeal_date,
          ew.appeal_outcome,
          ew.appeal_notes,
          ew.rescinded_date,
          ew.rescinded_by,
          ew.rescinded_reason,
          ew.created_at,
          ew.updated_at,
          COALESCE(
            (SELECT ep.first_name || ' ' || ep.last_name
             FROM employee_personal ep
             WHERE ep.employee_id = ew.employee_id
               AND ep.effective_to IS NULL
             LIMIT 1),
            'Unknown'
          ) AS employee_name
        FROM employee_warnings ew
        WHERE ew.status = 'active'
          AND ew.expiry_date <= CURRENT_DATE
        ORDER BY ew.expiry_date ASC
      `;
    });
  }

  // ===========================================================================
  // Write Operations
  // ===========================================================================

  /**
   * Create a new warning
   */
  async create(
    tx: TransactionSql,
    context: TenantContext,
    data: IssueWarning & { expiry_date: string },
    issuedBy: string
  ): Promise<WarningRow> {
    const rows = await tx<WarningRow[]>`
      INSERT INTO employee_warnings (
        tenant_id,
        employee_id,
        case_id,
        warning_level,
        status,
        issued_date,
        expiry_date,
        issued_by,
        reason,
        details,
        hearing_date,
        companion_present,
        companion_name,
        appeal_deadline
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.case_id || null},
        ${data.warning_level},
        'active',
        ${data.issued_date}::date,
        ${data.expiry_date}::date,
        ${issuedBy}::uuid,
        ${data.reason},
        ${data.details || null},
        ${data.hearing_date || null},
        ${data.companion_present || false},
        ${data.companion_name || null},
        ${data.appeal_deadline || null}
      )
      RETURNING *
    `;
    return rows[0]!;
  }

  /**
   * Update warning for appeal submission
   */
  async submitAppeal(
    tx: TransactionSql,
    id: string,
    appealDate: string,
    appealNotes: string | null
  ): Promise<WarningRow | null> {
    const rows = await tx<WarningRow[]>`
      UPDATE employee_warnings
      SET
        appealed = true,
        appeal_date = ${appealDate}::date,
        appeal_notes = ${appealNotes},
        status = 'appealed'
      WHERE id = ${id}
        AND status = 'active'
      RETURNING *
    `;
    return rows[0] || null;
  }

  /**
   * Resolve an appeal
   */
  async resolveAppeal(
    tx: TransactionSql,
    id: string,
    outcome: string,
    notes: string | null
  ): Promise<WarningRow | null> {
    // If overturned, mark as rescinded; if upheld/modified, reactivate
    const newStatus = outcome === "overturned" ? "rescinded" : "active";

    const rows = await tx<WarningRow[]>`
      UPDATE employee_warnings
      SET
        appeal_outcome = ${outcome},
        appeal_notes = COALESCE(${notes}, appeal_notes),
        status = ${newStatus},
        rescinded_date = CASE WHEN ${outcome} = 'overturned' THEN CURRENT_DATE ELSE rescinded_date END,
        rescinded_reason = CASE WHEN ${outcome} = 'overturned' THEN 'Appeal overturned' ELSE rescinded_reason END
      WHERE id = ${id}
        AND status = 'appealed'
      RETURNING *
    `;
    return rows[0] || null;
  }

  /**
   * Rescind a warning
   */
  async rescind(
    tx: TransactionSql,
    id: string,
    rescindedBy: string,
    reason: string
  ): Promise<WarningRow | null> {
    const rows = await tx<WarningRow[]>`
      UPDATE employee_warnings
      SET
        status = 'rescinded',
        rescinded_date = CURRENT_DATE,
        rescinded_by = ${rescindedBy}::uuid,
        rescinded_reason = ${reason}
      WHERE id = ${id}
        AND status = 'active'
      RETURNING *
    `;
    return rows[0] || null;
  }

  /**
   * Batch expire warnings that have passed their expiry date
   */
  async batchExpire(
    tx: TransactionSql,
    context: TenantContext
  ): Promise<WarningRow[]> {
    return await tx<WarningRow[]>`
      UPDATE employee_warnings
      SET status = 'expired'
      WHERE status = 'active'
        AND expiry_date <= CURRENT_DATE
        AND tenant_id = ${context.tenantId}::uuid
      RETURNING *
    `;
  }

  /**
   * Check if employee exists
   */
  async employeeExists(
    context: TenantContext,
    employeeId: string
  ): Promise<boolean> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx`
        SELECT 1 FROM employees WHERE id = ${employeeId} LIMIT 1
      `;
    });
    return rows.length > 0;
  }
}
