/**
 * Bank Details Module - Repository Layer
 *
 * Provides data access methods for employee bank detail entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * Table: employee_bank_details
 * Columns: id, tenant_id, employee_id, account_name, sort_code,
 *          account_number, bank_name, building_society_reference,
 *          is_primary, effective_from, effective_to, created_at, updated_at
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateBankDetail,
  UpdateBankDetail,
  PaginationQuery,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Database row type for employee bank details
 */
export interface BankDetailRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  accountName: string;
  sortCode: string;
  accountNumber: string;
  bankName: string | null;
  buildingSocietyReference: string | null;
  isPrimary: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class BankDetailRepository {
  constructor(private db: DatabaseClient) {}

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /**
   * List bank details for an employee with cursor-based pagination.
   * Ordered by effective_from DESC (most recent first), then id ASC.
   */
  async listByEmployee(
    context: TenantContext,
    employeeId: string,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<BankDetailRow>> {
    const limit = pagination.limit ? Number(pagination.limit) : 50;
    const fetchLimit = limit + 1; // Fetch one extra to determine hasMore

    const rows = await this.db.withTransaction(context, async (tx) => {
      if (pagination.cursor) {
        return await tx<BankDetailRow[]>`
          SELECT
            id, tenant_id, employee_id, account_name, sort_code,
            account_number, bank_name, building_society_reference,
            is_primary, effective_from, effective_to, created_at, updated_at
          FROM employee_bank_details
          WHERE employee_id = ${employeeId}::uuid
            AND id > ${pagination.cursor}::uuid
          ORDER BY effective_from DESC, id ASC
          LIMIT ${fetchLimit}
        `;
      }

      return await tx<BankDetailRow[]>`
        SELECT
          id, tenant_id, employee_id, account_name, sort_code,
          account_number, bank_name, building_society_reference,
          is_primary, effective_from, effective_to, created_at, updated_at
        FROM employee_bank_details
        WHERE employee_id = ${employeeId}::uuid
        ORDER BY effective_from DESC, id ASC
        LIMIT ${fetchLimit}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find bank detail by ID
   */
  async findById(
    context: TenantContext,
    id: string
  ): Promise<BankDetailRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<BankDetailRow[]>`
        SELECT
          id, tenant_id, employee_id, account_name, sort_code,
          account_number, bank_name, building_society_reference,
          is_primary, effective_from, effective_to, created_at, updated_at
        FROM employee_bank_details
        WHERE id = ${id}::uuid
      `;
    });

    return rows[0] ?? null;
  }

  /**
   * Find bank detail by ID, scoped to a specific employee
   */
  async findByIdAndEmployee(
    context: TenantContext,
    id: string,
    employeeId: string
  ): Promise<BankDetailRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<BankDetailRow[]>`
        SELECT
          id, tenant_id, employee_id, account_name, sort_code,
          account_number, bank_name, building_society_reference,
          is_primary, effective_from, effective_to, created_at, updated_at
        FROM employee_bank_details
        WHERE id = ${id}::uuid
          AND employee_id = ${employeeId}::uuid
      `;
    });

    return rows[0] ?? null;
  }

  /**
   * Check for effective date overlap for the same employee.
   *
   * Two date ranges [A_from, A_to) and [B_from, B_to) overlap when:
   *   A_from < B_to AND B_from < A_to
   * When effective_to is NULL, treat it as infinity (9999-12-31).
   */
  async checkEffectiveDateOverlap(
    context: TenantContext,
    employeeId: string,
    effectiveFrom: string,
    effectiveTo: string | null,
    excludeId?: string
  ): Promise<boolean> {
    return await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM employee_bank_details
          WHERE employee_id = ${employeeId}::uuid
            ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
            AND effective_from < ${effectiveTo || "9999-12-31"}::date
            AND (effective_to IS NULL OR effective_to > ${effectiveFrom}::date)
        ) as exists
      `;
      return rows[0]?.exists === true;
    });
  }

  /**
   * Count bank details for an employee
   */
  async countByEmployee(
    context: TenantContext,
    employeeId: string
  ): Promise<number> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM employee_bank_details
        WHERE employee_id = ${employeeId}::uuid
      `;
    });

    return parseInt(rows[0]?.count ?? "0", 10);
  }

  // ---------------------------------------------------------------------------
  // Write Operations (require transaction handle)
  // ---------------------------------------------------------------------------

  /**
   * Create a bank detail record
   */
  async create(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    data: CreateBankDetail
  ): Promise<BankDetailRow> {
    const rows = await tx<BankDetailRow[]>`
      INSERT INTO employee_bank_details (
        tenant_id, employee_id, account_name, sort_code,
        account_number, bank_name, building_society_reference,
        is_primary, effective_from, effective_to
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${employeeId}::uuid,
        ${data.account_name},
        ${data.sort_code},
        ${data.account_number},
        ${data.bank_name ?? null},
        ${data.building_society_reference ?? null},
        ${data.is_primary ?? true},
        ${data.effective_from ?? new Date().toISOString().split("T")[0]}::date,
        ${data.effective_to ?? null}
      )
      RETURNING
        id, tenant_id, employee_id, account_name, sort_code,
        account_number, bank_name, building_society_reference,
        is_primary, effective_from, effective_to, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update a bank detail record
   */
  async update(
    tx: TransactionSql,
    _context: TenantContext,
    id: string,
    data: UpdateBankDetail
  ): Promise<BankDetailRow | null> {
    const rows = await tx<BankDetailRow[]>`
      UPDATE employee_bank_details
      SET
        account_name              = COALESCE(${data.account_name ?? null}, account_name),
        sort_code                 = COALESCE(${data.sort_code ?? null}, sort_code),
        account_number            = COALESCE(${data.account_number ?? null}, account_number),
        bank_name                 = CASE WHEN ${data.bank_name !== undefined} THEN ${data.bank_name ?? null} ELSE bank_name END,
        building_society_reference = CASE WHEN ${data.building_society_reference !== undefined} THEN ${data.building_society_reference ?? null} ELSE building_society_reference END,
        is_primary                = COALESCE(${data.is_primary ?? null}, is_primary),
        effective_from            = COALESCE(${data.effective_from ?? null}::date, effective_from),
        effective_to              = CASE WHEN ${data.effective_to !== undefined} THEN ${data.effective_to ?? null}::date ELSE effective_to END
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, account_name, sort_code,
        account_number, bank_name, building_society_reference,
        is_primary, effective_from, effective_to, created_at, updated_at
    `;

    return rows[0] ?? null;
  }

  /**
   * Delete a bank detail record
   */
  async delete(
    tx: TransactionSql,
    _context: TenantContext,
    id: string
  ): Promise<boolean> {
    const rows = await tx<{ id: string }[]>`
      DELETE FROM employee_bank_details
      WHERE id = ${id}::uuid
      RETURNING id
    `;

    return rows.length > 0;
  }

  /**
   * Unset primary flag for all bank details of an employee.
   * Called within a transaction before setting a new primary record.
   */
  async unsetPrimaryForEmployee(
    tx: TransactionSql,
    _context: TenantContext,
    employeeId: string,
    excludeId?: string
  ): Promise<void> {
    if (excludeId) {
      await tx`
        UPDATE employee_bank_details
        SET is_primary = false
        WHERE employee_id = ${employeeId}::uuid
          AND is_primary = true
          AND id != ${excludeId}::uuid
      `;
    } else {
      await tx`
        UPDATE employee_bank_details
        SET is_primary = false
        WHERE employee_id = ${employeeId}::uuid
          AND is_primary = true
      `;
    }
  }
}
