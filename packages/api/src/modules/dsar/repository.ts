/**
 * DSAR Module - Repository Layer
 *
 * Provides data access methods for DSAR (Data Subject Access Request) entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  DsarRequestFilters,
  PaginationQuery,
  DsarRequestStatus,
  DsarDataItemStatus,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

/**
 * Database row types
 */
export interface DsarRequestRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  requestedByUserId: string;
  requestType: string;
  status: string;
  receivedDate: Date;
  deadlineDate: Date;
  extendedDeadlineDate: Date | null;
  extensionReason: string | null;
  completedDate: Date | null;
  responseFormat: string;
  identityVerified: boolean;
  identityVerifiedDate: Date | null;
  identityVerifiedBy: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DsarDataItemRow extends Row {
  id: string;
  tenantId: string;
  dsarRequestId: string;
  moduleName: string;
  dataCategory: string;
  status: string;
  recordCount: number;
  dataExport: unknown | null;
  redactionNotes: string | null;
  gatheredBy: string | null;
  gatheredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DsarAuditLogRow extends Row {
  id: string;
  tenantId: string;
  dsarRequestId: string;
  action: string;
  performedBy: string;
  details: Record<string, unknown> | null;
  createdAt: Date;
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
// DSAR Repository
// =============================================================================

export class DSARRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // DSAR Request Methods
  // ===========================================================================

  /**
   * Find DSAR requests with filters and pagination
   */
  async findRequests(
    context: TenantContext,
    filters: DsarRequestFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<DsarRequestRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = Number(limit) + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<DsarRequestRow[]>`
        SELECT
          id, tenant_id, employee_id, requested_by_user_id,
          request_type, status,
          received_date, deadline_date, extended_deadline_date, extension_reason,
          completed_date, response_format,
          identity_verified, identity_verified_date, identity_verified_by,
          rejection_reason, notes, created_at, updated_at
        FROM app.dsar_requests
        WHERE 1=1
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.employee_id ? tx`AND employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.request_type ? tx`AND request_type = ${filters.request_type}` : tx``}
          ${String(filters.overdue) === "true"
            ? tx`AND status NOT IN ('completed', 'rejected')
                 AND COALESCE(extended_deadline_date, deadline_date) < CURRENT_DATE`
            : tx``}
          ${filters.search
            ? tx`AND (notes ILIKE ${"%" + filters.search + "%"} OR id::text ILIKE ${"%" + filters.search + "%"})`
            : tx``}
          ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
        ORDER BY received_date DESC, id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > Number(limit);
    const items = hasMore ? result.slice(0, Number(limit)) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find DSAR request by ID
   */
  async findRequestById(
    context: TenantContext,
    id: string
  ): Promise<DsarRequestRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      return tx<DsarRequestRow[]>`
        SELECT
          id, tenant_id, employee_id, requested_by_user_id,
          request_type, status,
          received_date, deadline_date, extended_deadline_date, extension_reason,
          completed_date, response_format,
          identity_verified, identity_verified_date, identity_verified_by,
          rejection_reason, notes, created_at, updated_at
        FROM app.dsar_requests
        WHERE id = ${id}::uuid
      `;
    });

    return result[0] || null;
  }

  /**
   * Find overdue DSAR requests
   */
  async findOverdueRequests(
    context: TenantContext
  ): Promise<DsarRequestRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<DsarRequestRow[]>`
        SELECT
          id, tenant_id, employee_id, requested_by_user_id,
          request_type, status,
          received_date, deadline_date, extended_deadline_date, extension_reason,
          completed_date, response_format,
          identity_verified, identity_verified_date, identity_verified_by,
          rejection_reason, notes, created_at, updated_at
        FROM app.dsar_requests
        WHERE status NOT IN ('completed', 'rejected')
          AND COALESCE(extended_deadline_date, deadline_date) < CURRENT_DATE
        ORDER BY deadline_date ASC
      `;
    });
  }

  /**
   * Create a DSAR request
   */
  async createRequest(
    tx: TransactionSql,
    context: TenantContext,
    data: {
      employeeId: string;
      requestedByUserId: string;
      requestType: string;
      responseFormat: string;
      receivedDate: string;
      deadlineDate: string;
      notes?: string;
    }
  ): Promise<DsarRequestRow> {
    const rows = await tx<DsarRequestRow[]>`
      INSERT INTO app.dsar_requests (
        id, tenant_id, employee_id, requested_by_user_id,
        request_type, status, received_date, deadline_date,
        response_format, notes, created_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        ${data.employeeId}::uuid,
        ${data.requestedByUserId}::uuid,
        ${data.requestType},
        'received',
        ${data.receivedDate}::date,
        ${data.deadlineDate}::date,
        ${data.responseFormat},
        ${data.notes || null},
        now(),
        now()
      )
      RETURNING
        id, tenant_id, employee_id, requested_by_user_id,
        request_type, status,
        received_date, deadline_date, extended_deadline_date, extension_reason,
        completed_date, response_format,
        identity_verified, identity_verified_date, identity_verified_by,
        rejection_reason, notes, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update DSAR request status
   */
  async updateRequestStatus(
    tx: TransactionSql,
    id: string,
    status: DsarRequestStatus,
    extra: {
      identityVerified?: boolean | null;
      identityVerifiedDate?: string | null;
      identityVerifiedBy?: string | null;
      extendedDeadlineDate?: string | null;
      extensionReason?: string | null;
      completedDate?: string | null;
      rejectionReason?: string | null;
      notes?: string | null;
    } = {}
  ): Promise<DsarRequestRow | null> {
    const identityVerified = extra.identityVerified ?? null;
    const identityVerifiedDate = extra.identityVerifiedDate ?? null;
    const identityVerifiedBy = extra.identityVerifiedBy ?? null;
    const extendedDeadlineDate = extra.extendedDeadlineDate ?? null;
    const extensionReason = extra.extensionReason ?? null;
    const completedDate = extra.completedDate ?? null;
    const rejectionReason = extra.rejectionReason ?? null;
    const notes = extra.notes ?? null;

    const rows = await tx<DsarRequestRow[]>`
      UPDATE app.dsar_requests
      SET
        status = ${status},
        identity_verified = COALESCE(${identityVerified}::boolean, identity_verified),
        identity_verified_date = COALESCE(${identityVerifiedDate}::date, identity_verified_date),
        identity_verified_by = COALESCE(${identityVerifiedBy}::uuid, identity_verified_by),
        extended_deadline_date = COALESCE(${extendedDeadlineDate}::date, extended_deadline_date),
        extension_reason = COALESCE(${extensionReason}::text, extension_reason),
        completed_date = COALESCE(${completedDate}::date, completed_date),
        rejection_reason = COALESCE(${rejectionReason}::text, rejection_reason),
        notes = COALESCE(${notes}::text, notes),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, requested_by_user_id,
        request_type, status,
        received_date, deadline_date, extended_deadline_date, extension_reason,
        completed_date, response_format,
        identity_verified, identity_verified_date, identity_verified_by,
        rejection_reason, notes, created_at, updated_at
    `;

    return rows[0] || null;
  }

  /**
   * Mark identity as verified
   */
  async verifyIdentity(
    tx: TransactionSql,
    id: string,
    verifiedBy: string,
    verifiedDate: string
  ): Promise<DsarRequestRow | null> {
    const rows = await tx<DsarRequestRow[]>`
      UPDATE app.dsar_requests
      SET
        identity_verified = true,
        identity_verified_date = ${verifiedDate}::date,
        identity_verified_by = ${verifiedBy}::uuid,
        status = CASE
          WHEN status = 'received' THEN 'in_progress'::app.dsar_request_status
          ELSE status
        END,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, requested_by_user_id,
        request_type, status,
        received_date, deadline_date, extended_deadline_date, extension_reason,
        completed_date, response_format,
        identity_verified, identity_verified_date, identity_verified_by,
        rejection_reason, notes, created_at, updated_at
    `;

    return rows[0] || null;
  }

  // ===========================================================================
  // DSAR Data Item Methods
  // ===========================================================================

  /**
   * Get data items for a DSAR request
   */
  async findDataItemsByRequestId(
    context: TenantContext,
    dsarRequestId: string
  ): Promise<DsarDataItemRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<DsarDataItemRow[]>`
        SELECT
          id, tenant_id, dsar_request_id, module_name, data_category,
          status, record_count, data_export, redaction_notes,
          gathered_by, gathered_at, created_at, updated_at
        FROM app.dsar_data_items
        WHERE dsar_request_id = ${dsarRequestId}::uuid
        ORDER BY module_name, data_category
      `;
    });
  }

  /**
   * Find a single data item by ID
   */
  async findDataItemById(
    context: TenantContext,
    itemId: string
  ): Promise<DsarDataItemRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      return tx<DsarDataItemRow[]>`
        SELECT
          id, tenant_id, dsar_request_id, module_name, data_category,
          status, record_count, data_export, redaction_notes,
          gathered_by, gathered_at, created_at, updated_at
        FROM app.dsar_data_items
        WHERE id = ${itemId}::uuid
      `;
    });

    return result[0] || null;
  }

  /**
   * Create a data item
   */
  async createDataItem(
    tx: TransactionSql,
    context: TenantContext,
    data: {
      dsarRequestId: string;
      moduleName: string;
      dataCategory: string;
      status?: string;
      recordCount?: number;
      dataExport?: unknown;
      gatheredBy?: string;
      gatheredAt?: string;
    }
  ): Promise<DsarDataItemRow> {
    const rows = await tx<DsarDataItemRow[]>`
      INSERT INTO app.dsar_data_items (
        id, tenant_id, dsar_request_id, module_name, data_category,
        status, record_count, data_export,
        gathered_by, gathered_at,
        created_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        ${data.dsarRequestId}::uuid,
        ${data.moduleName},
        ${data.dataCategory},
        ${data.status || "pending"},
        ${data.recordCount ?? 0},
        ${data.dataExport ? JSON.stringify(data.dataExport) : null}::jsonb,
        ${data.gatheredBy ?? null}::uuid,
        ${data.gatheredAt ? data.gatheredAt : null}::timestamptz,
        now(),
        now()
      )
      RETURNING
        id, tenant_id, dsar_request_id, module_name, data_category,
        status, record_count, data_export, redaction_notes,
        gathered_by, gathered_at, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update a data item status
   */
  async updateDataItem(
    tx: TransactionSql,
    itemId: string,
    data: {
      status: DsarDataItemStatus;
      redactionNotes?: string;
      recordCount?: number;
      dataExport?: unknown;
      gatheredBy?: string;
      gatheredAt?: string;
    }
  ): Promise<DsarDataItemRow | null> {
    const rows = await tx<DsarDataItemRow[]>`
      UPDATE app.dsar_data_items
      SET
        status = ${data.status},
        redaction_notes = COALESCE(${data.redactionNotes ?? null}::text, redaction_notes),
        record_count = COALESCE(${data.recordCount ?? null}::integer, record_count),
        data_export = COALESCE(${data.dataExport ? JSON.stringify(data.dataExport) : null}::jsonb, data_export),
        gathered_by = COALESCE(${data.gatheredBy ?? null}::uuid, gathered_by),
        gathered_at = COALESCE(${data.gatheredAt ?? null}::timestamptz, gathered_at),
        updated_at = now()
      WHERE id = ${itemId}::uuid
      RETURNING
        id, tenant_id, dsar_request_id, module_name, data_category,
        status, record_count, data_export, redaction_notes,
        gathered_by, gathered_at, created_at, updated_at
    `;

    return rows[0] || null;
  }

  // ===========================================================================
  // DSAR Audit Log Methods
  // ===========================================================================

  /**
   * Get audit log entries for a DSAR request
   */
  async findAuditLogByRequestId(
    context: TenantContext,
    dsarRequestId: string
  ): Promise<DsarAuditLogRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<DsarAuditLogRow[]>`
        SELECT
          id, tenant_id, dsar_request_id, action, performed_by,
          details, created_at
        FROM app.dsar_audit_log
        WHERE dsar_request_id = ${dsarRequestId}::uuid
        ORDER BY created_at ASC
      `;
    });
  }

  /**
   * Add an audit log entry (must be called within a transaction)
   */
  async addAuditEntry(
    tx: TransactionSql,
    context: TenantContext,
    data: {
      dsarRequestId: string;
      action: string;
      performedBy: string;
      details?: Record<string, unknown>;
    }
  ): Promise<DsarAuditLogRow> {
    const rows = await tx<DsarAuditLogRow[]>`
      INSERT INTO app.dsar_audit_log (
        id, tenant_id, dsar_request_id, action, performed_by, details, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        ${data.dsarRequestId}::uuid,
        ${data.action},
        ${data.performedBy}::uuid,
        ${data.details ? JSON.stringify(data.details) : null}::jsonb,
        now()
      )
      RETURNING
        id, tenant_id, dsar_request_id, action, performed_by, details, created_at
    `;

    return rows[0]!;
  }

  // ===========================================================================
  // Dashboard / Stats
  // ===========================================================================

  /**
   * Get DSAR dashboard statistics
   */
  async getDashboardStats(
    context: TenantContext
  ): Promise<{
    totalOpen: number;
    totalCompleted: number;
    totalRejected: number;
    totalOverdue: number;
    avgResponseDays: number | null;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const result = await this.db.withTransaction(context, async (tx) => {
      // Aggregate counts
      const [counts] = await tx<Record<string, unknown>[]>`
        SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('completed', 'rejected'))::int AS total_open,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS total_completed,
          COUNT(*) FILTER (WHERE status = 'rejected')::int AS total_rejected,
          COUNT(*) FILTER (
            WHERE status NOT IN ('completed', 'rejected')
              AND COALESCE(extended_deadline_date, deadline_date) < CURRENT_DATE
          )::int AS total_overdue,
          ROUND(AVG(
            CASE WHEN status = 'completed' AND completed_date IS NOT NULL
              THEN (completed_date - received_date)
              ELSE NULL
            END
          ), 1) AS avg_response_days
        FROM app.dsar_requests
      `;

      // By status
      const statusCounts = await tx<{ status: string; count: number }[]>`
        SELECT status, COUNT(*)::int AS count
        FROM app.dsar_requests
        GROUP BY status
      `;

      // By type
      const typeCounts = await tx<{ requestType: string; count: number }[]>`
        SELECT request_type, COUNT(*)::int AS count
        FROM app.dsar_requests
        GROUP BY request_type
      `;

      return { counts, statusCounts, typeCounts };
    });

    const byStatus: Record<string, number> = {};
    for (const row of result.statusCounts) {
      byStatus[row.status] = Number(row.count);
    }

    const byType: Record<string, number> = {};
    for (const row of result.typeCounts) {
      byType[row.requestType] = Number(row.count);
    }

    return {
      totalOpen: Number(result.counts?.totalOpen ?? 0),
      totalCompleted: Number(result.counts?.totalCompleted ?? 0),
      totalRejected: Number(result.counts?.totalRejected ?? 0),
      totalOverdue: Number(result.counts?.totalOverdue ?? 0),
      avgResponseDays: result.counts?.avgResponseDays != null
        ? Number(result.counts.avgResponseDays)
        : null,
      byStatus,
      byType,
    };
  }
}
