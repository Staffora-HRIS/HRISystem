/**
 * Overtime Requests Module - Repository Layer
 *
 * Provides data access methods for overtime authorisation requests.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * Tables:
 *   - overtime_requests (authorisation workflow)
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  OvertimeRequestFilters,
  OvertimeRequestStatus,
  OvertimeRequestType,
  OvertimeAuthorisationType,
  PaginationQuery,
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
 * Database row type for overtime requests
 */
export interface OvertimeRequestRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  requestType: OvertimeRequestType;
  authorisationType: OvertimeAuthorisationType;
  date: Date;
  plannedHours: number;
  actualHours: number | null;
  reason: string;
  status: OvertimeRequestStatus;
  approverId: string | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
  managerNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Column lists (DRY - used in all SELECT queries)
// =============================================================================

const REQUEST_COLUMNS = `
  id, tenant_id, employee_id, request_type, authorisation_type, date,
  planned_hours, actual_hours, reason,
  status, approver_id, approved_at, rejection_reason, manager_notes,
  created_at, updated_at
`;

// =============================================================================
// Repository
// =============================================================================

export class OvertimeRequestRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Create Request
  // ===========================================================================

  async create(
    ctx: TenantContext,
    data: {
      employeeId: string;
      requestType: string;
      authorisationType: string;
      date: string;
      plannedHours: number;
      actualHours: number | null;
      reason: string;
    },
    tx: TransactionSql
  ): Promise<OvertimeRequestRow> {
    const [row] = await tx`
      INSERT INTO overtime_requests (
        tenant_id, employee_id, request_type, authorisation_type, date,
        planned_hours, actual_hours, reason, status
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employeeId}::uuid,
        ${data.requestType}::app.overtime_request_type,
        ${data.authorisationType}::app.overtime_authorisation_type,
        ${data.date}::date,
        ${data.plannedHours},
        ${data.actualHours},
        ${data.reason},
        'pending'::app.overtime_request_status
      )
      RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
    `;
    return row as unknown as OvertimeRequestRow;
  }

  // ===========================================================================
  // Find by ID
  // ===========================================================================

  async findById(
    ctx: TenantContext,
    id: string
  ): Promise<OvertimeRequestRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ${tx.unsafe(REQUEST_COLUMNS)}
        FROM overtime_requests
        WHERE id = ${id}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as OvertimeRequestRow;
  }

  // ===========================================================================
  // List with filters and cursor pagination
  // ===========================================================================

  async findAll(
    ctx: TenantContext,
    filters: OvertimeRequestFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<OvertimeRequestRow>> {
    const limit = pagination.limit ?? 20;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      const conditions: ReturnType<TransactionSql["unsafe"]>[] = [];

      if (filters.employee_id) {
        conditions.push(tx`employee_id = ${filters.employee_id}::uuid`);
      }

      if (filters.status) {
        conditions.push(tx`status = ${filters.status}::app.overtime_request_status`);
      }

      if (filters.request_type) {
        conditions.push(tx`request_type = ${filters.request_type}::app.overtime_request_type`);
      }

      if (filters.authorisation_type) {
        conditions.push(tx`authorisation_type = ${filters.authorisation_type}::app.overtime_authorisation_type`);
      }

      if (filters.date_from) {
        conditions.push(tx`date >= ${filters.date_from}::date`);
      }

      if (filters.date_to) {
        conditions.push(tx`date <= ${filters.date_to}::date`);
      }

      if (pagination.cursor) {
        conditions.push(tx`created_at < ${new Date(pagination.cursor)}::timestamptz`);
      }

      if (conditions.length === 0) {
        return await tx`
          SELECT ${tx.unsafe(REQUEST_COLUMNS)}
          FROM overtime_requests
          ORDER BY created_at DESC
          LIMIT ${fetchLimit}
        `;
      }

      return await tx`
        SELECT ${tx.unsafe(REQUEST_COLUMNS)}
        FROM overtime_requests
        WHERE ${conditions.reduce((acc, cond, i) => i === 0 ? cond : tx`${acc} AND ${cond}`)}
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit) as unknown as OvertimeRequestRow[];
    const hasMore = rows.length > limit;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt instanceof Date
          ? items[items.length - 1].createdAt.toISOString()
          : String(items[items.length - 1].createdAt)
        : null;

    return { items, nextCursor, hasMore };
  }

  // ===========================================================================
  // List pending requests for a specific approver (manager view)
  // ===========================================================================

  async findPendingForApprover(
    ctx: TenantContext,
    _approverId: string,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<OvertimeRequestRow>> {
    const limit = pagination.limit ?? 20;
    const fetchLimit = limit + 1;

    // In a real implementation, this would filter by the manager's direct
    // reports. For now, it returns all pending requests in the tenant
    // (relying on RBAC at the route level for access control).
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      if (pagination.cursor) {
        return await tx`
          SELECT ${tx.unsafe(REQUEST_COLUMNS)}
          FROM overtime_requests
          WHERE status = 'pending'::app.overtime_request_status
            AND created_at < ${new Date(pagination.cursor)}::timestamptz
          ORDER BY created_at DESC
          LIMIT ${fetchLimit}
        `;
      }

      return await tx`
        SELECT ${tx.unsafe(REQUEST_COLUMNS)}
        FROM overtime_requests
        WHERE status = 'pending'::app.overtime_request_status
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit) as unknown as OvertimeRequestRow[];
    const hasMore = rows.length > limit;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt instanceof Date
          ? items[items.length - 1].createdAt.toISOString()
          : String(items[items.length - 1].createdAt)
        : null;

    return { items, nextCursor, hasMore };
  }

  // ===========================================================================
  // Approve
  // ===========================================================================

  async approve(
    _ctx: TenantContext,
    id: string,
    approverId: string,
    actualHours: number | null,
    managerNotes: string | null,
    tx: TransactionSql
  ): Promise<OvertimeRequestRow | null> {
    if (actualHours !== null) {
      const rows = await tx`
        UPDATE overtime_requests
        SET
          status = 'approved'::app.overtime_request_status,
          approver_id = ${approverId}::uuid,
          approved_at = now(),
          actual_hours = ${actualHours},
          manager_notes = ${managerNotes}
        WHERE id = ${id}::uuid
          AND status = 'pending'::app.overtime_request_status
        RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
      `;
      if (rows.length === 0) return null;
      return rows[0] as unknown as OvertimeRequestRow;
    }

    const rows = await tx`
      UPDATE overtime_requests
      SET
        status = 'approved'::app.overtime_request_status,
        approver_id = ${approverId}::uuid,
        approved_at = now()
      WHERE id = ${id}::uuid
        AND status = 'pending'::app.overtime_request_status
      RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as OvertimeRequestRow;
  }

  // ===========================================================================
  // Reject
  // ===========================================================================

  async reject(
    _ctx: TenantContext,
    id: string,
    approverId: string,
    rejectionReason: string,
    managerNotes: string | null,
    tx: TransactionSql
  ): Promise<OvertimeRequestRow | null> {
    const rows = await tx`
      UPDATE overtime_requests
      SET
        status = 'rejected'::app.overtime_request_status,
        approver_id = ${approverId}::uuid,
        approved_at = now(),
        rejection_reason = ${rejectionReason},
        manager_notes = ${managerNotes}
      WHERE id = ${id}::uuid
        AND status = 'pending'::app.overtime_request_status
      RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as OvertimeRequestRow;
  }

  // ===========================================================================
  // Cancel
  // ===========================================================================

  async cancel(
    _ctx: TenantContext,
    id: string,
    tx: TransactionSql
  ): Promise<OvertimeRequestRow | null> {
    const rows = await tx`
      UPDATE overtime_requests
      SET status = 'cancelled'::app.overtime_request_status
      WHERE id = ${id}::uuid
        AND status = 'pending'::app.overtime_request_status
      RETURNING ${tx.unsafe(REQUEST_COLUMNS)}
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as OvertimeRequestRow;
  }
}
