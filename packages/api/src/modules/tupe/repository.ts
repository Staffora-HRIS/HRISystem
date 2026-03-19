/**
 * TUPE Transfers Module - Repository Layer
 *
 * Provides data access methods for TUPE transfer and affected employee entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateTupeTransfer,
  UpdateTupeTransfer,
  TupeTransferFilters,
  AddAffectedEmployee,
  PaginationQuery,
  StatusHistoryEntry,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

/**
 * Database row type for TUPE transfers
 */
export interface TupeTransferRow extends Row {
  id: string;
  tenantId: string;
  transferName: string;
  transferorOrg: string;
  transfereeOrg: string;
  transferDate: Date | string;
  status: string;
  employeeCount: number;
  notes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database row type for TUPE affected employees
 */
export interface TupeAffectedEmployeeRow extends Row {
  id: string;
  tenantId: string;
  transferId: string;
  employeeId: string;
  employeeName?: string;
  consentStatus: string;
  newTermsAccepted: boolean;
  transferCompleted: boolean;
  notes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
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

export class TupeRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Transfer Find Operations
  // ===========================================================================

  /**
   * Find TUPE transfer by ID
   */
  async findTransferById(
    context: TenantContext,
    id: string
  ): Promise<TupeTransferRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<TupeTransferRow[]>`
        SELECT
          id,
          tenant_id,
          transfer_name,
          transferor_org,
          transferee_org,
          transfer_date,
          status,
          employee_count,
          notes,
          created_by,
          updated_by,
          created_at,
          updated_at
        FROM tupe_transfers
        WHERE id = ${id}
      `;
    });
    return rows[0] || null;
  }

  /**
   * Find TUPE transfers with filters and cursor-based pagination
   */
  async findAllTransfers(
    context: TenantContext,
    filters: TupeTransferFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<TupeTransferRow>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor;

    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<TupeTransferRow[]>`
        SELECT
          id,
          tenant_id,
          transfer_name,
          transferor_org,
          transferee_org,
          transfer_date,
          status,
          employee_count,
          notes,
          created_by,
          updated_by,
          created_at,
          updated_at
        FROM tupe_transfers
        WHERE 1=1
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.search ? tx`AND (
            transfer_name ILIKE ${"%" + filters.search + "%"}
            OR transferor_org ILIKE ${"%" + filters.search + "%"}
            OR transferee_org ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
          ${cursor ? tx`AND id < ${cursor}` : tx``}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  // ===========================================================================
  // Transfer Write Operations
  // ===========================================================================

  /**
   * Create a new TUPE transfer
   */
  async createTransfer(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateTupeTransfer
  ): Promise<TupeTransferRow> {
    const rows = await tx<TupeTransferRow[]>`
      INSERT INTO tupe_transfers (
        tenant_id,
        transfer_name,
        transferor_org,
        transferee_org,
        transfer_date,
        status,
        employee_count,
        notes,
        created_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.transferName},
        ${data.transferorOrg},
        ${data.transfereeOrg},
        ${data.transferDate}::date,
        'planning',
        0,
        ${data.notes || null},
        ${context.userId || null}
      )
      RETURNING *
    `;
    return rows[0]!;
  }

  /**
   * Update a TUPE transfer
   */
  async updateTransfer(
    tx: TransactionSql,
    id: string,
    data: UpdateTupeTransfer,
    userId?: string
  ): Promise<TupeTransferRow | null> {
    const rows = await tx<TupeTransferRow[]>`
      UPDATE tupe_transfers
      SET
        transfer_name = COALESCE(${data.transferName || null}, transfer_name),
        transferor_org = COALESCE(${data.transferorOrg || null}, transferor_org),
        transferee_org = COALESCE(${data.transfereeOrg || null}, transferee_org),
        transfer_date = COALESCE(${data.transferDate || null}::date, transfer_date),
        status = COALESCE(${data.status || null}, status),
        notes = CASE
          WHEN ${data.notes !== undefined} THEN ${data.notes ?? null}
          ELSE notes
        END,
        updated_by = ${userId || null},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] || null;
  }

  /**
   * Delete a TUPE transfer (only allowed in planning status)
   */
  async deleteTransfer(
    tx: TransactionSql,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM tupe_transfers
      WHERE id = ${id}
        AND status = 'planning'
    `;
    return result.count > 0;
  }

  /**
   * Update the employee_count on a transfer based on actual count
   */
  async refreshEmployeeCount(
    tx: TransactionSql,
    transferId: string
  ): Promise<void> {
    await tx`
      UPDATE tupe_transfers
      SET employee_count = (
        SELECT COUNT(*)::int FROM tupe_affected_employees
        WHERE transfer_id = ${transferId}
      )
      WHERE id = ${transferId}
    `;
  }

  // ===========================================================================
  // Affected Employee Find Operations
  // ===========================================================================

  /**
   * Find affected employee by transfer_id and employee_id
   */
  async findAffectedEmployee(
    context: TenantContext,
    transferId: string,
    employeeId: string
  ): Promise<TupeAffectedEmployeeRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<TupeAffectedEmployeeRow[]>`
        SELECT
          tae.id,
          tae.tenant_id,
          tae.transfer_id,
          tae.employee_id,
          tae.consent_status,
          tae.new_terms_accepted,
          tae.transfer_completed,
          tae.notes,
          tae.created_by,
          tae.updated_by,
          tae.created_at,
          tae.updated_at,
          COALESCE(
            (SELECT ep.first_name || ' ' || ep.last_name
             FROM employee_personal ep
             WHERE ep.employee_id = tae.employee_id
               AND ep.effective_to IS NULL
             LIMIT 1),
            'Unknown'
          ) AS employee_name
        FROM tupe_affected_employees tae
        WHERE tae.transfer_id = ${transferId}
          AND tae.employee_id = ${employeeId}
      `;
    });
    return rows[0] || null;
  }

  /**
   * Find affected employee by record ID
   */
  async findAffectedEmployeeById(
    context: TenantContext,
    id: string
  ): Promise<TupeAffectedEmployeeRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<TupeAffectedEmployeeRow[]>`
        SELECT
          tae.id,
          tae.tenant_id,
          tae.transfer_id,
          tae.employee_id,
          tae.consent_status,
          tae.new_terms_accepted,
          tae.transfer_completed,
          tae.notes,
          tae.created_by,
          tae.updated_by,
          tae.created_at,
          tae.updated_at,
          COALESCE(
            (SELECT ep.first_name || ' ' || ep.last_name
             FROM employee_personal ep
             WHERE ep.employee_id = tae.employee_id
               AND ep.effective_to IS NULL
             LIMIT 1),
            'Unknown'
          ) AS employee_name
        FROM tupe_affected_employees tae
        WHERE tae.id = ${id}
      `;
    });
    return rows[0] || null;
  }

  /**
   * List affected employees for a transfer with cursor-based pagination
   */
  async findAffectedEmployees(
    context: TenantContext,
    transferId: string,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<TupeAffectedEmployeeRow>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor;

    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<TupeAffectedEmployeeRow[]>`
        SELECT
          tae.id,
          tae.tenant_id,
          tae.transfer_id,
          tae.employee_id,
          tae.consent_status,
          tae.new_terms_accepted,
          tae.transfer_completed,
          tae.notes,
          tae.created_by,
          tae.updated_by,
          tae.created_at,
          tae.updated_at,
          COALESCE(
            (SELECT ep.first_name || ' ' || ep.last_name
             FROM employee_personal ep
             WHERE ep.employee_id = tae.employee_id
               AND ep.effective_to IS NULL
             LIMIT 1),
            'Unknown'
          ) AS employee_name
        FROM tupe_affected_employees tae
        WHERE tae.transfer_id = ${transferId}
          ${cursor ? tx`AND tae.id < ${cursor}` : tx``}
        ORDER BY tae.created_at DESC, tae.id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  // ===========================================================================
  // Affected Employee Write Operations
  // ===========================================================================

  /**
   * Add an affected employee to a transfer
   */
  async addAffectedEmployee(
    tx: TransactionSql,
    context: TenantContext,
    transferId: string,
    data: AddAffectedEmployee
  ): Promise<TupeAffectedEmployeeRow> {
    const rows = await tx<TupeAffectedEmployeeRow[]>`
      INSERT INTO tupe_affected_employees (
        tenant_id,
        transfer_id,
        employee_id,
        consent_status,
        new_terms_accepted,
        transfer_completed,
        notes,
        created_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${transferId}::uuid,
        ${data.employeeId}::uuid,
        'pending',
        false,
        false,
        ${data.notes || null},
        ${context.userId || null}
      )
      RETURNING *
    `;
    return rows[0]!;
  }

  /**
   * Update consent status for an affected employee
   */
  async updateConsent(
    tx: TransactionSql,
    transferId: string,
    employeeId: string,
    consentStatus: string,
    newTermsAccepted: boolean | undefined,
    notes: string | null | undefined,
    userId?: string
  ): Promise<TupeAffectedEmployeeRow | null> {
    const rows = await tx<TupeAffectedEmployeeRow[]>`
      UPDATE tupe_affected_employees
      SET
        consent_status = ${consentStatus},
        new_terms_accepted = COALESCE(${newTermsAccepted ?? null}::boolean, new_terms_accepted),
        notes = CASE
          WHEN ${notes !== undefined} THEN ${notes ?? null}
          ELSE notes
        END,
        updated_by = ${userId || null},
        updated_at = now()
      WHERE transfer_id = ${transferId}
        AND employee_id = ${employeeId}
      RETURNING *
    `;
    return rows[0] || null;
  }

  /**
   * Remove an affected employee from a transfer
   */
  async removeAffectedEmployee(
    tx: TransactionSql,
    transferId: string,
    employeeId: string
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM tupe_affected_employees
      WHERE transfer_id = ${transferId}
        AND employee_id = ${employeeId}
    `;
    return result.count > 0;
  }

  /**
   * Mark an affected employee's transfer as completed
   */
  async markTransferCompleted(
    tx: TransactionSql,
    transferId: string,
    employeeId: string,
    userId?: string
  ): Promise<TupeAffectedEmployeeRow | null> {
    const rows = await tx<TupeAffectedEmployeeRow[]>`
      UPDATE tupe_affected_employees
      SET
        transfer_completed = true,
        updated_by = ${userId || null},
        updated_at = now()
      WHERE transfer_id = ${transferId}
        AND employee_id = ${employeeId}
      RETURNING *
    `;
    return rows[0] || null;
  }

  // ===========================================================================
  // Status History
  // ===========================================================================

  /**
   * Record a status transition in the history table
   */
  async recordStatusChange(
    tx: TransactionSql,
    context: TenantContext,
    transferId: string,
    fromStatus: string | null,
    toStatus: string,
    notes?: string
  ): Promise<void> {
    await tx`
      INSERT INTO tupe_transfer_status_history (
        tenant_id,
        transfer_id,
        from_status,
        to_status,
        changed_by,
        notes
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${transferId}::uuid,
        ${fromStatus},
        ${toStatus},
        ${context.userId || null},
        ${notes || null}
      )
    `;
  }

  /**
   * Get the status change history for a transfer
   */
  async getStatusHistory(
    context: TenantContext,
    transferId: string
  ): Promise<StatusHistoryEntry[]> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx`
        SELECT
          id,
          from_status,
          to_status,
          changed_by,
          notes,
          created_at
        FROM tupe_transfer_status_history
        WHERE transfer_id = ${transferId}::uuid
        ORDER BY created_at ASC
      `;
    });

    return rows.map((row: any) => ({
      id: row.id,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      changedBy: row.changedBy,
      notes: row.notes,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }));
  }

  // ===========================================================================
  // Validation Helpers
  // ===========================================================================

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

  /**
   * Check if employee is already assigned to a transfer
   */
  async employeeAlreadyAssigned(
    context: TenantContext,
    transferId: string,
    employeeId: string
  ): Promise<boolean> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx`
        SELECT 1 FROM tupe_affected_employees
        WHERE transfer_id = ${transferId}
          AND employee_id = ${employeeId}
        LIMIT 1
      `;
    });
    return rows.length > 0;
  }
}
