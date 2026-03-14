/**
 * Data Erasure Module - Repository Layer
 *
 * Provides data access methods for GDPR Article 17 erasure operations.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  ErasureRequestStatus,
  ErasureItemAction,
  ErasureRequestFilters,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

export interface ErasureRequestRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  requestedByUserId: string;
  status: ErasureRequestStatus;
  receivedDate: Date;
  deadlineDate: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
  completedAt: Date | null;
  rejectionReason: string | null;
  notes: string | null;
  certificateFileKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ErasureItemRow extends Row {
  id: string;
  tenantId: string;
  erasureRequestId: string;
  tableName: string;
  moduleName: string | null;
  recordCount: number;
  actionTaken: ErasureItemAction;
  retentionReason: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ErasureAuditLogRow extends Row {
  id: string;
  tenantId: string;
  erasureRequestId: string;
  action: string;
  performedBy: string;
  details: Record<string, unknown> | null;
  createdAt: Date;
}

export type { TenantContext };

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class DataErasureRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Erasure Requests
  // ===========================================================================

  /**
   * Create a new erasure request
   */
  async createRequest(
    tx: TransactionSql,
    data: {
      id: string;
      tenantId: string;
      employeeId: string;
      requestedByUserId: string;
      receivedDate: string;
      deadlineDate: string;
      notes?: string;
    }
  ): Promise<ErasureRequestRow> {
    const [row] = await tx<ErasureRequestRow[]>`
      INSERT INTO erasure_requests (
        id, tenant_id, employee_id, requested_by_user_id,
        status, received_date, deadline_date, notes
      )
      VALUES (
        ${data.id}::uuid,
        ${data.tenantId}::uuid,
        ${data.employeeId}::uuid,
        ${data.requestedByUserId}::uuid,
        'received',
        ${data.receivedDate}::date,
        ${data.deadlineDate}::date,
        ${data.notes || null}
      )
      RETURNING
        id, tenant_id, employee_id, requested_by_user_id,
        status, received_date, deadline_date,
        approved_by, approved_at, completed_at,
        rejection_reason, notes, certificate_file_key,
        created_at, updated_at
    `;
    return row;
  }

  /**
   * Get an erasure request by ID
   */
  async getRequestById(
    ctx: TenantContext,
    requestId: string
  ): Promise<ErasureRequestRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<ErasureRequestRow[]>`
        SELECT
          id, tenant_id, employee_id, requested_by_user_id,
          status, received_date, deadline_date,
          approved_by, approved_at, completed_at,
          rejection_reason, notes, certificate_file_key,
          created_at, updated_at
        FROM erasure_requests
        WHERE id = ${requestId}::uuid
      `;
    });
    return rows[0] || null;
  }

  /**
   * List erasure requests with filters and cursor-based pagination
   */
  async listRequests(
    ctx: TenantContext,
    filters: ErasureRequestFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<ErasureRequestRow>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor;

    return await this.db.withTransaction(ctx, async (tx) => {
      // Build filter conditions
      const conditions: string[] = [];
      const values: unknown[] = [];

      if (filters.status) {
        conditions.push(`status = $${values.length + 1}`);
        values.push(filters.status);
      }

      if (filters.employee_id) {
        conditions.push(`employee_id = $${values.length + 1}::uuid`);
        values.push(filters.employee_id);
      }

      // We use tagged template queries; build them inline
      let rows: ErasureRequestRow[];

      if (cursor) {
        if (filters.status && filters.employee_id) {
          rows = await tx<ErasureRequestRow[]>`
            SELECT
              id, tenant_id, employee_id, requested_by_user_id,
              status, received_date, deadline_date,
              approved_by, approved_at, completed_at,
              rejection_reason, notes, certificate_file_key,
              created_at, updated_at
            FROM erasure_requests
            WHERE status = ${filters.status}
              AND employee_id = ${filters.employee_id}::uuid
              AND created_at < (SELECT created_at FROM erasure_requests WHERE id = ${cursor}::uuid)
            ORDER BY created_at DESC
            LIMIT ${limit + 1}
          `;
        } else if (filters.status) {
          rows = await tx<ErasureRequestRow[]>`
            SELECT
              id, tenant_id, employee_id, requested_by_user_id,
              status, received_date, deadline_date,
              approved_by, approved_at, completed_at,
              rejection_reason, notes, certificate_file_key,
              created_at, updated_at
            FROM erasure_requests
            WHERE status = ${filters.status}
              AND created_at < (SELECT created_at FROM erasure_requests WHERE id = ${cursor}::uuid)
            ORDER BY created_at DESC
            LIMIT ${limit + 1}
          `;
        } else if (filters.employee_id) {
          rows = await tx<ErasureRequestRow[]>`
            SELECT
              id, tenant_id, employee_id, requested_by_user_id,
              status, received_date, deadline_date,
              approved_by, approved_at, completed_at,
              rejection_reason, notes, certificate_file_key,
              created_at, updated_at
            FROM erasure_requests
            WHERE employee_id = ${filters.employee_id}::uuid
              AND created_at < (SELECT created_at FROM erasure_requests WHERE id = ${cursor}::uuid)
            ORDER BY created_at DESC
            LIMIT ${limit + 1}
          `;
        } else {
          rows = await tx<ErasureRequestRow[]>`
            SELECT
              id, tenant_id, employee_id, requested_by_user_id,
              status, received_date, deadline_date,
              approved_by, approved_at, completed_at,
              rejection_reason, notes, certificate_file_key,
              created_at, updated_at
            FROM erasure_requests
            WHERE created_at < (SELECT created_at FROM erasure_requests WHERE id = ${cursor}::uuid)
            ORDER BY created_at DESC
            LIMIT ${limit + 1}
          `;
        }
      } else {
        if (filters.status && filters.employee_id) {
          rows = await tx<ErasureRequestRow[]>`
            SELECT
              id, tenant_id, employee_id, requested_by_user_id,
              status, received_date, deadline_date,
              approved_by, approved_at, completed_at,
              rejection_reason, notes, certificate_file_key,
              created_at, updated_at
            FROM erasure_requests
            WHERE status = ${filters.status}
              AND employee_id = ${filters.employee_id}::uuid
            ORDER BY created_at DESC
            LIMIT ${limit + 1}
          `;
        } else if (filters.status) {
          rows = await tx<ErasureRequestRow[]>`
            SELECT
              id, tenant_id, employee_id, requested_by_user_id,
              status, received_date, deadline_date,
              approved_by, approved_at, completed_at,
              rejection_reason, notes, certificate_file_key,
              created_at, updated_at
            FROM erasure_requests
            WHERE status = ${filters.status}
            ORDER BY created_at DESC
            LIMIT ${limit + 1}
          `;
        } else if (filters.employee_id) {
          rows = await tx<ErasureRequestRow[]>`
            SELECT
              id, tenant_id, employee_id, requested_by_user_id,
              status, received_date, deadline_date,
              approved_by, approved_at, completed_at,
              rejection_reason, notes, certificate_file_key,
              created_at, updated_at
            FROM erasure_requests
            WHERE employee_id = ${filters.employee_id}::uuid
            ORDER BY created_at DESC
            LIMIT ${limit + 1}
          `;
        } else {
          rows = await tx<ErasureRequestRow[]>`
            SELECT
              id, tenant_id, employee_id, requested_by_user_id,
              status, received_date, deadline_date,
              approved_by, approved_at, completed_at,
              rejection_reason, notes, certificate_file_key,
              created_at, updated_at
            FROM erasure_requests
            ORDER BY created_at DESC
            LIMIT ${limit + 1}
          `;
        }
      }

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Update erasure request status
   */
  async updateRequestStatus(
    tx: TransactionSql,
    requestId: string,
    status: ErasureRequestStatus,
    extra?: {
      approvedBy?: string;
      approvedAt?: Date;
      completedAt?: Date;
      rejectionReason?: string;
      certificateFileKey?: string;
      notes?: string;
    }
  ): Promise<ErasureRequestRow | null> {
    const [row] = await tx<ErasureRequestRow[]>`
      UPDATE erasure_requests SET
        status = ${status},
        approved_by = COALESCE(${extra?.approvedBy || null}::uuid, approved_by),
        approved_at = COALESCE(${extra?.approvedAt || null}::timestamptz, approved_at),
        completed_at = COALESCE(${extra?.completedAt || null}::timestamptz, completed_at),
        rejection_reason = COALESCE(${extra?.rejectionReason || null}, rejection_reason),
        certificate_file_key = COALESCE(${extra?.certificateFileKey || null}, certificate_file_key),
        notes = COALESCE(${extra?.notes || null}, notes)
      WHERE id = ${requestId}::uuid
      RETURNING
        id, tenant_id, employee_id, requested_by_user_id,
        status, received_date, deadline_date,
        approved_by, approved_at, completed_at,
        rejection_reason, notes, certificate_file_key,
        created_at, updated_at
    `;
    return row || null;
  }

  /**
   * Get overdue erasure requests (past deadline, still open)
   */
  async getOverdueRequests(
    ctx: TenantContext
  ): Promise<ErasureRequestRow[]> {
    return await this.db.withTransaction(ctx, async (tx) => {
      return await tx<ErasureRequestRow[]>`
        SELECT
          id, tenant_id, employee_id, requested_by_user_id,
          status, received_date, deadline_date,
          approved_by, approved_at, completed_at,
          rejection_reason, notes, certificate_file_key,
          created_at, updated_at
        FROM erasure_requests
        WHERE status IN ('received', 'reviewing', 'approved', 'in_progress')
          AND deadline_date < CURRENT_DATE
        ORDER BY deadline_date ASC
      `;
    });
  }

  /**
   * Check if an active erasure request already exists for an employee
   */
  async hasActiveRequest(
    tx: TransactionSql,
    employeeId: string
  ): Promise<boolean> {
    const [row] = await tx<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM erasure_requests
      WHERE employee_id = ${employeeId}::uuid
        AND status NOT IN ('completed', 'rejected', 'partially_completed')
    `;
    return (row?.count ?? 0) > 0;
  }

  // ===========================================================================
  // Erasure Items
  // ===========================================================================

  /**
   * Create erasure items (batch insert for all tables to be processed)
   */
  async createItem(
    tx: TransactionSql,
    data: {
      id: string;
      tenantId: string;
      erasureRequestId: string;
      tableName: string;
      moduleName?: string;
      recordCount: number;
      actionTaken: ErasureItemAction;
      retentionReason?: string;
      completedAt?: Date;
    }
  ): Promise<ErasureItemRow> {
    const [row] = await tx<ErasureItemRow[]>`
      INSERT INTO erasure_items (
        id, tenant_id, erasure_request_id,
        table_name, module_name, record_count,
        action_taken, retention_reason, completed_at
      )
      VALUES (
        ${data.id}::uuid,
        ${data.tenantId}::uuid,
        ${data.erasureRequestId}::uuid,
        ${data.tableName},
        ${data.moduleName || null},
        ${data.recordCount},
        ${data.actionTaken},
        ${data.retentionReason || null},
        ${data.completedAt || null}
      )
      RETURNING
        id, tenant_id, erasure_request_id,
        table_name, module_name, record_count,
        action_taken, retention_reason, completed_at,
        created_at, updated_at
    `;
    return row;
  }

  /**
   * Get all erasure items for a request
   */
  async getItemsByRequestId(
    ctx: TenantContext,
    erasureRequestId: string
  ): Promise<ErasureItemRow[]> {
    return await this.db.withTransaction(ctx, async (tx) => {
      return await tx<ErasureItemRow[]>`
        SELECT
          id, tenant_id, erasure_request_id,
          table_name, module_name, record_count,
          action_taken, retention_reason, completed_at,
          created_at, updated_at
        FROM erasure_items
        WHERE erasure_request_id = ${erasureRequestId}::uuid
        ORDER BY table_name ASC
      `;
    });
  }

  // ===========================================================================
  // Erasure Audit Log
  // ===========================================================================

  /**
   * Write an immutable audit log entry
   */
  async writeAuditLog(
    tx: TransactionSql,
    data: {
      id: string;
      tenantId: string;
      erasureRequestId: string;
      action: string;
      performedBy: string;
      details?: Record<string, unknown>;
    }
  ): Promise<ErasureAuditLogRow> {
    const [row] = await tx<ErasureAuditLogRow[]>`
      INSERT INTO erasure_audit_log (
        id, tenant_id, erasure_request_id,
        action, performed_by, details
      )
      VALUES (
        ${data.id}::uuid,
        ${data.tenantId}::uuid,
        ${data.erasureRequestId}::uuid,
        ${data.action},
        ${data.performedBy}::uuid,
        ${data.details ? JSON.stringify(data.details) : null}::jsonb
      )
      RETURNING
        id, tenant_id, erasure_request_id,
        action, performed_by, details,
        created_at
    `;
    return row;
  }

  /**
   * Get audit log entries for a request
   */
  async getAuditLog(
    ctx: TenantContext,
    erasureRequestId: string
  ): Promise<ErasureAuditLogRow[]> {
    return await this.db.withTransaction(ctx, async (tx) => {
      return await tx<ErasureAuditLogRow[]>`
        SELECT
          id, tenant_id, erasure_request_id,
          action, performed_by, details,
          created_at
        FROM erasure_audit_log
        WHERE erasure_request_id = ${erasureRequestId}::uuid
        ORDER BY created_at ASC
      `;
    });
  }

  // ===========================================================================
  // Anonymization Execution
  // ===========================================================================

  /**
   * Execute the anonymization function and return per-table results
   */
  async executeAnonymization(
    tx: TransactionSql,
    tenantId: string,
    employeeId: string
  ): Promise<Record<string, number>> {
    const [row] = await tx<{ anonymizeEmployee: Record<string, number> }[]>`
      SELECT app.anonymize_employee(
        ${tenantId}::uuid,
        ${employeeId}::uuid,
        'ANONYMIZED'
      ) AS anonymize_employee
    `;
    return row?.anonymizeEmployee ?? {};
  }

  // ===========================================================================
  // Retention Conflict Checks
  // ===========================================================================

  /**
   * Check for data retention conflicts that prevent full erasure.
   * Returns records in tables that have statutory retention requirements.
   */
  async getRetentionConflicts(
    ctx: TenantContext,
    employeeId: string
  ): Promise<
    Array<{
      tableName: string;
      moduleName: string;
      recordCount: number;
      reason: string;
    }>
  > {
    return await this.db.withTransaction(ctx, async (tx) => {
      const conflicts: Array<{
        tableName: string;
        moduleName: string;
        recordCount: number;
        reason: string;
      }> = [];

      // Check compensation_history (tax statutory retention — typically 6-7 years UK)
      const [compCount] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM compensation_history
        WHERE employee_id = ${employeeId}::uuid
      `;
      if ((compCount?.count ?? 0) > 0) {
        conflicts.push({
          tableName: "compensation_history",
          moduleName: "hr",
          recordCount: compCount.count,
          reason:
            "Compensation records must be retained for 6 years for tax and payroll statutory obligations (HMRC requirements)",
        });
      }

      // Check leave_requests (may need retention for Working Time Regulations)
      const [leaveCount] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM leave_requests
        WHERE employee_id = ${employeeId}::uuid
      `;
      if ((leaveCount?.count ?? 0) > 0) {
        conflicts.push({
          tableName: "leave_requests",
          moduleName: "absence",
          recordCount: leaveCount.count,
          reason:
            "Leave records may be retained for Working Time Regulations compliance (2-year retention period)",
        });
      }

      // Check employee_status_history (operational/audit — no direct PII)
      const [statusCount] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM employee_status_history
        WHERE employee_id = ${employeeId}::uuid
      `;
      if ((statusCount?.count ?? 0) > 0) {
        conflicts.push({
          tableName: "employee_status_history",
          moduleName: "hr",
          recordCount: statusCount.count,
          reason:
            "Employment status history retained for audit trail (no personal data — contains only status transitions)",
        });
      }

      return conflicts;
    });
  }

  /**
   * Check if employee exists
   */
  async employeeExists(
    ctx: TenantContext,
    employeeId: string
  ): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<{ id: string }[]>`
        SELECT id FROM employees
        WHERE id = ${employeeId}::uuid
      `;
    });
    return rows.length > 0;
  }
}
