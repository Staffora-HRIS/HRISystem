/**
 * Right to Work Module - Repository Layer
 *
 * Provides data access methods for RTW checks and documents.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  CreateRTWCheck,
  UpdateRTWCheck,
  CreateRTWDocument,
  RTWCheckFilters,
  PaginationQuery,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface RTWCheckRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  checkType: string;
  checkDate: Date;
  checkedByUserId: string;
  status: string;
  documentType: string | null;
  documentReference: string | null;
  documentExpiryDate: Date | null;
  shareCode: string | null;
  followUpDate: Date | null;
  followUpCompleted: boolean;
  rightToWorkConfirmed: boolean;
  restrictionDetails: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RTWCheckListRow extends Row {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  checkType: string;
  checkDate: Date;
  status: string;
  documentType: string | null;
  documentExpiryDate: Date | null;
  followUpDate: Date | null;
  rightToWorkConfirmed: boolean;
}

export interface RTWDocumentRow extends Row {
  id: string;
  tenantId: string;
  rtwCheckId: string;
  documentName: string;
  documentType: string | null;
  fileKey: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  uploadedBy: string | null;
  uploadedAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ComplianceStats {
  totalEmployees: number;
  verifiedCount: number;
  pendingCount: number;
  expiredCount: number;
  failedCount: number;
  followUpRequiredCount: number;
  noCheckCount: number;
  expiringSoonCount: number;
}

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// RTW Repository
// =============================================================================

export class RTWRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // RTW Check Methods
  // ===========================================================================

  /**
   * Create a new RTW check (called within an existing transaction)
   */
  async createCheck(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateRTWCheck,
    followUpDate: Date | null
  ): Promise<RTWCheckRow> {
    const rows = await tx<RTWCheckRow[]>`
      INSERT INTO app.rtw_checks (
        tenant_id, employee_id, check_type, check_date, checked_by_user_id,
        document_type, document_reference, document_expiry_date, share_code,
        follow_up_date, restriction_details, notes
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.check_type}::app.rtw_check_type,
        ${data.check_date}::date,
        ${context.userId || null}::uuid,
        ${data.document_type || null},
        ${data.document_reference || null},
        ${data.document_expiry_date || null}::date,
        ${data.share_code || null},
        ${followUpDate ? followUpDate.toISOString().split("T")[0]! : null}::date,
        ${data.restriction_details || null},
        ${data.notes || null}
      )
      RETURNING
        id, tenant_id, employee_id, check_type, check_date, checked_by_user_id,
        status, document_type, document_reference, document_expiry_date, share_code,
        follow_up_date, follow_up_completed, right_to_work_confirmed,
        restriction_details, notes, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Find RTW check by ID
   */
  async findCheckById(
    context: TenantContext,
    id: string
  ): Promise<RTWCheckRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<RTWCheckRow[]>`
        SELECT
          id, tenant_id, employee_id, check_type, check_date, checked_by_user_id,
          status, document_type, document_reference, document_expiry_date, share_code,
          follow_up_date, follow_up_completed, right_to_work_confirmed,
          restriction_details, notes, created_at, updated_at
        FROM app.rtw_checks
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Find RTW checks by employee ID (most recent first)
   */
  async findChecksByEmployeeId(
    context: TenantContext,
    employeeId: string
  ): Promise<RTWCheckRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<RTWCheckRow[]>`
        SELECT
          id, tenant_id, employee_id, check_type, check_date, checked_by_user_id,
          status, document_type, document_reference, document_expiry_date, share_code,
          follow_up_date, follow_up_completed, right_to_work_confirmed,
          restriction_details, notes, created_at, updated_at
        FROM app.rtw_checks
        WHERE employee_id = ${employeeId}::uuid
        ORDER BY check_date DESC, created_at DESC
      `;
    });
  }

  /**
   * Find RTW checks with filters and cursor-based pagination
   */
  async findChecks(
    context: TenantContext,
    filters: RTWCheckFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<RTWCheckListRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      return tx<RTWCheckListRow[]>`
        SELECT
          rc.id,
          rc.employee_id,
          (
            SELECT CONCAT(ep.first_name, ' ', ep.last_name)
            FROM app.employee_personal ep
            WHERE ep.employee_id = rc.employee_id
              AND ep.effective_to IS NULL
            LIMIT 1
          ) as employee_name,
          e.employee_number,
          rc.check_type,
          rc.check_date,
          rc.status,
          rc.document_type,
          rc.document_expiry_date,
          rc.follow_up_date,
          rc.right_to_work_confirmed
        FROM app.rtw_checks rc
        JOIN app.employees e ON e.id = rc.employee_id
        WHERE 1=1
          ${filters.employee_id ? tx`AND rc.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.status ? tx`AND rc.status = ${filters.status}::app.rtw_status` : tx``}
          ${filters.check_type ? tx`AND rc.check_type = ${filters.check_type}::app.rtw_check_type` : tx``}
          ${filters.expiring_before ? tx`AND rc.document_expiry_date IS NOT NULL AND rc.document_expiry_date <= ${filters.expiring_before}::date` : tx``}
          ${filters.search ? tx`AND (
            rc.document_reference ILIKE ${"%" + filters.search + "%"}
            OR rc.document_type ILIKE ${"%" + filters.search + "%"}
            OR e.employee_number ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
          ${cursor ? tx`AND rc.id < ${cursor}::uuid` : tx``}
        ORDER BY rc.created_at DESC, rc.id DESC
        LIMIT ${fetchLimit}
      `;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Update RTW check fields (called within an existing transaction)
   */
  async updateCheck(
    tx: TransactionSql,
    id: string,
    data: UpdateRTWCheck
  ): Promise<RTWCheckRow | null> {
    const rows = await tx<RTWCheckRow[]>`
      UPDATE app.rtw_checks
      SET
        check_date = COALESCE(${data.check_date || null}::date, check_date),
        document_type = COALESCE(${data.document_type !== undefined ? data.document_type : null}, document_type),
        document_reference = COALESCE(${data.document_reference !== undefined ? data.document_reference : null}, document_reference),
        document_expiry_date = COALESCE(${data.document_expiry_date !== undefined ? data.document_expiry_date : null}::date, document_expiry_date),
        share_code = COALESCE(${data.share_code !== undefined ? data.share_code : null}, share_code),
        follow_up_date = COALESCE(${data.follow_up_date !== undefined ? data.follow_up_date : null}::date, follow_up_date),
        restriction_details = COALESCE(${data.restriction_details !== undefined ? data.restriction_details : null}, restriction_details),
        notes = COALESCE(${data.notes !== undefined ? data.notes : null}, notes),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, check_type, check_date, checked_by_user_id,
        status, document_type, document_reference, document_expiry_date, share_code,
        follow_up_date, follow_up_completed, right_to_work_confirmed,
        restriction_details, notes, created_at, updated_at
    `;

    return rows[0] || null;
  }

  /**
   * Update check status (called within an existing transaction)
   */
  async updateCheckStatus(
    tx: TransactionSql,
    id: string,
    status: string,
    updates: {
      rightToWorkConfirmed?: boolean;
      followUpCompleted?: boolean;
      notes?: string | null;
    } = {}
  ): Promise<RTWCheckRow | null> {
    const rows = await tx<RTWCheckRow[]>`
      UPDATE app.rtw_checks
      SET
        status = ${status}::app.rtw_status,
        right_to_work_confirmed = COALESCE(${updates.rightToWorkConfirmed ?? null}::boolean, right_to_work_confirmed),
        follow_up_completed = COALESCE(${updates.followUpCompleted ?? null}::boolean, follow_up_completed),
        notes = CASE
          WHEN ${updates.notes !== undefined ? updates.notes : null}::text IS NOT NULL
          THEN COALESCE(notes || E'\n', '') || ${updates.notes || ""}
          ELSE notes
        END,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, check_type, check_date, checked_by_user_id,
        status, document_type, document_reference, document_expiry_date, share_code,
        follow_up_date, follow_up_completed, right_to_work_confirmed,
        restriction_details, notes, created_at, updated_at
    `;

    return rows[0] || null;
  }

  /**
   * Find checks expiring within N days (for compliance alerts)
   */
  async findExpiringChecks(
    context: TenantContext,
    daysAhead: number
  ): Promise<RTWCheckListRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<RTWCheckListRow[]>`
        SELECT
          rc.id,
          rc.employee_id,
          (
            SELECT CONCAT(ep.first_name, ' ', ep.last_name)
            FROM app.employee_personal ep
            WHERE ep.employee_id = rc.employee_id
              AND ep.effective_to IS NULL
            LIMIT 1
          ) as employee_name,
          e.employee_number,
          rc.check_type,
          rc.check_date,
          rc.status,
          rc.document_type,
          rc.document_expiry_date,
          rc.follow_up_date,
          rc.right_to_work_confirmed
        FROM app.rtw_checks rc
        JOIN app.employees e ON e.id = rc.employee_id
        WHERE rc.status IN ('verified', 'follow_up_required')
          AND rc.document_expiry_date IS NOT NULL
          AND rc.document_expiry_date <= (CURRENT_DATE + (${daysAhead} || ' days')::interval)
          AND rc.document_expiry_date >= CURRENT_DATE
        ORDER BY rc.document_expiry_date ASC
      `;
    });
  }

  /**
   * Find checks with pending follow-ups
   */
  async findPendingFollowUps(
    context: TenantContext
  ): Promise<RTWCheckListRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<RTWCheckListRow[]>`
        SELECT
          rc.id,
          rc.employee_id,
          (
            SELECT CONCAT(ep.first_name, ' ', ep.last_name)
            FROM app.employee_personal ep
            WHERE ep.employee_id = rc.employee_id
              AND ep.effective_to IS NULL
            LIMIT 1
          ) as employee_name,
          e.employee_number,
          rc.check_type,
          rc.check_date,
          rc.status,
          rc.document_type,
          rc.document_expiry_date,
          rc.follow_up_date,
          rc.right_to_work_confirmed
        FROM app.rtw_checks rc
        JOIN app.employees e ON e.id = rc.employee_id
        WHERE rc.follow_up_completed = false
          AND rc.follow_up_date IS NOT NULL
          AND rc.follow_up_date <= CURRENT_DATE
          AND rc.status IN ('verified', 'follow_up_required')
        ORDER BY rc.follow_up_date ASC
      `;
    });
  }

  /**
   * Get compliance stats for a tenant
   */
  async getComplianceStats(
    context: TenantContext
  ): Promise<ComplianceStats> {
    const [result] = await this.db.withTransaction(context, async (tx) => {
      return tx<Record<string, unknown>[]>`
        WITH latest_checks AS (
          SELECT DISTINCT ON (rc.employee_id)
            rc.employee_id,
            rc.status,
            rc.document_expiry_date
          FROM app.rtw_checks rc
          ORDER BY rc.employee_id, rc.check_date DESC, rc.created_at DESC
        ),
        employee_count AS (
          SELECT COUNT(*)::int as cnt
          FROM app.employees
          WHERE status IN ('active', 'pending', 'on_leave')
        ),
        stats AS (
          SELECT
            COUNT(*) FILTER (WHERE lc.status = 'verified')::int as verified_count,
            COUNT(*) FILTER (WHERE lc.status = 'pending')::int as pending_count,
            COUNT(*) FILTER (WHERE lc.status = 'expired')::int as expired_count,
            COUNT(*) FILTER (WHERE lc.status = 'failed')::int as failed_count,
            COUNT(*) FILTER (WHERE lc.status = 'follow_up_required')::int as follow_up_required_count,
            COUNT(*) FILTER (
              WHERE lc.status = 'verified'
                AND lc.document_expiry_date IS NOT NULL
                AND lc.document_expiry_date <= (CURRENT_DATE + interval '28 days')
                AND lc.document_expiry_date >= CURRENT_DATE
            )::int as expiring_soon_count
          FROM latest_checks lc
        )
        SELECT
          ec.cnt as total_employees,
          COALESCE(s.verified_count, 0) as verified_count,
          COALESCE(s.pending_count, 0) as pending_count,
          COALESCE(s.expired_count, 0) as expired_count,
          COALESCE(s.failed_count, 0) as failed_count,
          COALESCE(s.follow_up_required_count, 0) as follow_up_required_count,
          GREATEST(ec.cnt - (
            SELECT COUNT(DISTINCT employee_id)::int FROM latest_checks
          ), 0) as no_check_count,
          COALESCE(s.expiring_soon_count, 0) as expiring_soon_count
        FROM employee_count ec
        CROSS JOIN stats s
      `;
    });

    return {
      totalEmployees: Number(result?.totalEmployees ?? 0),
      verifiedCount: Number(result?.verifiedCount ?? 0),
      pendingCount: Number(result?.pendingCount ?? 0),
      expiredCount: Number(result?.expiredCount ?? 0),
      failedCount: Number(result?.failedCount ?? 0),
      followUpRequiredCount: Number(result?.followUpRequiredCount ?? 0),
      noCheckCount: Number(result?.noCheckCount ?? 0),
      expiringSoonCount: Number(result?.expiringSoonCount ?? 0),
    };
  }

  // ===========================================================================
  // RTW Document Methods
  // ===========================================================================

  /**
   * Add document reference to a check (called within an existing transaction)
   */
  async addDocument(
    tx: TransactionSql,
    context: TenantContext,
    checkId: string,
    data: CreateRTWDocument
  ): Promise<RTWDocumentRow> {
    const rows = await tx<RTWDocumentRow[]>`
      INSERT INTO app.rtw_documents (
        tenant_id, rtw_check_id, document_name, document_type,
        file_key, file_size_bytes, mime_type, uploaded_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${checkId}::uuid,
        ${data.document_name},
        ${data.document_type || null},
        ${data.file_key || null},
        ${data.file_size_bytes || null},
        ${data.mime_type || null},
        ${context.userId || null}::uuid
      )
      RETURNING
        id, tenant_id, rtw_check_id, document_name, document_type,
        file_key, file_size_bytes, mime_type, uploaded_by, uploaded_at
    `;

    return rows[0]!;
  }

  /**
   * Get documents for a check
   */
  async getDocuments(
    context: TenantContext,
    checkId: string
  ): Promise<RTWDocumentRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<RTWDocumentRow[]>`
        SELECT
          id, tenant_id, rtw_check_id, document_name, document_type,
          file_key, file_size_bytes, mime_type, uploaded_by, uploaded_at
        FROM app.rtw_documents
        WHERE rtw_check_id = ${checkId}::uuid
        ORDER BY uploaded_at DESC
      `;
    });
  }

  /**
   * Delete a document reference (called within an existing transaction)
   */
  async deleteDocument(
    tx: TransactionSql,
    documentId: string
  ): Promise<RTWDocumentRow | null> {
    const rows = await tx<RTWDocumentRow[]>`
      DELETE FROM app.rtw_documents
      WHERE id = ${documentId}::uuid
      RETURNING
        id, tenant_id, rtw_check_id, document_name, document_type,
        file_key, file_size_bytes, mime_type, uploaded_by, uploaded_at
    `;

    return rows[0] || null;
  }

  /**
   * Find document by ID
   */
  async findDocumentById(
    context: TenantContext,
    documentId: string
  ): Promise<RTWDocumentRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      return tx<RTWDocumentRow[]>`
        SELECT
          id, tenant_id, rtw_check_id, document_name, document_type,
          file_key, file_size_bytes, mime_type, uploaded_by, uploaded_at
        FROM app.rtw_documents
        WHERE id = ${documentId}::uuid
      `;
    });

    return result[0] || null;
  }
}
