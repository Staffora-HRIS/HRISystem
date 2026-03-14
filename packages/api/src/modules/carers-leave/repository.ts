/**
 * Carer's Leave Module - Repository Layer
 *
 * Data access methods for carer's leave entitlements.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * Table: app.carers_leave_entitlements
 *   - id uuid PK
 *   - tenant_id uuid NOT NULL
 *   - employee_id uuid NOT NULL
 *   - leave_year_start date NOT NULL
 *   - leave_year_end date NOT NULL
 *   - total_days_available numeric(4,1) DEFAULT 5
 *   - days_used numeric(4,1) DEFAULT 0
 *   - created_at timestamptz
 *   - updated_at timestamptz
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  CreateEntitlement,
  UpdateEntitlement,
  EntitlementFilters,
  PaginationQuery,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

/**
 * Database row type for carers_leave_entitlements.
 * Column names are camelCased by the postgres.js column transform.
 */
export interface EntitlementRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  leaveYearStart: Date;
  leaveYearEnd: Date;
  totalDaysAvailable: string; // numeric comes back as string
  daysUsed: string; // numeric comes back as string
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

export class CarersLeaveRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Find Methods
  // ===========================================================================

  /**
   * List entitlements with filters and cursor-based pagination.
   */
  async findEntitlements(
    context: TenantContext,
    filters: EntitlementFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<EntitlementRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1; // Fetch one extra to check hasMore

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<EntitlementRow[]>`
        SELECT
          cle.id,
          cle.tenant_id,
          cle.employee_id,
          cle.leave_year_start,
          cle.leave_year_end,
          cle.total_days_available,
          cle.days_used,
          cle.created_at,
          cle.updated_at
        FROM app.carers_leave_entitlements cle
        WHERE 1=1
          ${filters.employee_id ? tx`AND cle.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.leave_year_start ? tx`AND cle.leave_year_start = ${filters.leave_year_start}::date` : tx``}
          ${filters.has_remaining === true ? tx`AND cle.days_used < cle.total_days_available` : tx``}
          ${filters.has_remaining === false ? tx`AND cle.days_used >= cle.total_days_available` : tx``}
          ${cursor ? tx`AND cle.id > ${cursor}::uuid` : tx``}
        ORDER BY cle.leave_year_start DESC, cle.created_at DESC, cle.id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find entitlement by ID.
   */
  async findById(
    context: TenantContext,
    id: string
  ): Promise<EntitlementRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<EntitlementRow[]>`
        SELECT
          id, tenant_id, employee_id,
          leave_year_start, leave_year_end,
          total_days_available, days_used,
          created_at, updated_at
        FROM app.carers_leave_entitlements
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Find entitlement by employee and leave year start.
   * Used to check for duplicates (unique constraint: tenant_id, employee_id, leave_year_start).
   */
  async findByEmployeeAndYear(
    context: TenantContext,
    employeeId: string,
    leaveYearStart: string
  ): Promise<EntitlementRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<EntitlementRow[]>`
        SELECT
          id, tenant_id, employee_id,
          leave_year_start, leave_year_end,
          total_days_available, days_used,
          created_at, updated_at
        FROM app.carers_leave_entitlements
        WHERE employee_id = ${employeeId}::uuid
          AND leave_year_start = ${leaveYearStart}::date
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Find the current (active) entitlement for an employee.
   * Matches the entitlement where today falls within the leave year range.
   */
  async findCurrentEntitlement(
    context: TenantContext,
    employeeId: string
  ): Promise<EntitlementRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<EntitlementRow[]>`
        SELECT
          id, tenant_id, employee_id,
          leave_year_start, leave_year_end,
          total_days_available, days_used,
          created_at, updated_at
        FROM app.carers_leave_entitlements
        WHERE employee_id = ${employeeId}::uuid
          AND leave_year_start <= CURRENT_DATE
          AND leave_year_end >= CURRENT_DATE
        ORDER BY leave_year_start DESC
        LIMIT 1
      `;
      return rows;
    });

    return result[0] || null;
  }

  // ===========================================================================
  // Write Methods
  // ===========================================================================

  /**
   * Create a new entitlement record.
   * Called within a transaction managed by the service layer.
   */
  async create(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateEntitlement
  ): Promise<EntitlementRow> {
    const rows = await tx<EntitlementRow[]>`
      INSERT INTO app.carers_leave_entitlements (
        tenant_id, employee_id,
        leave_year_start, leave_year_end,
        total_days_available
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.leave_year_start}::date,
        ${data.leave_year_end}::date,
        ${data.total_days_available ?? 5}
      )
      RETURNING
        id, tenant_id, employee_id,
        leave_year_start, leave_year_end,
        total_days_available, days_used,
        created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update an existing entitlement.
   * Called within a transaction managed by the service layer.
   */
  async update(
    tx: TransactionSql,
    _context: TenantContext,
    id: string,
    data: UpdateEntitlement
  ): Promise<EntitlementRow | null> {
    const rows = await tx<EntitlementRow[]>`
      UPDATE app.carers_leave_entitlements
      SET
        total_days_available = COALESCE(${data.total_days_available ?? null}, total_days_available),
        days_used = COALESCE(${data.days_used ?? null}, days_used),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id,
        leave_year_start, leave_year_end,
        total_days_available, days_used,
        created_at, updated_at
    `;

    return rows[0] || null;
  }

  /**
   * Deduct days from an entitlement (approve leave usage).
   * Called within a transaction managed by the service layer.
   * The DB constraint carers_leave_used_within_limit will reject
   * deductions that exceed the entitlement.
   */
  async deductDays(
    tx: TransactionSql,
    _context: TenantContext,
    id: string,
    days: number
  ): Promise<EntitlementRow | null> {
    const rows = await tx<EntitlementRow[]>`
      UPDATE app.carers_leave_entitlements
      SET
        days_used = days_used + ${days},
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id,
        leave_year_start, leave_year_end,
        total_days_available, days_used,
        created_at, updated_at
    `;

    return rows[0] || null;
  }

  /**
   * Delete an entitlement (hard delete).
   * Called within a transaction managed by the service layer.
   */
  async delete(
    tx: TransactionSql,
    _context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM app.carers_leave_entitlements
      WHERE id = ${id}::uuid
    `;

    return result.count > 0;
  }
}
