/**
 * Payroll Config Module - Repository Layer
 *
 * Provides data access methods for pay schedules, employee pay assignments,
 * and NI categories. All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreatePaySchedule,
  UpdatePaySchedule,
  CreatePayAssignment,
  CreateNiCategory,
  PaginationQuery,
  PayFrequency,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

/**
 * Paginated result shape
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Database row type for pay schedules
 */
export interface PayScheduleRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  frequency: PayFrequency;
  payDayOfWeek: number | null;
  payDayOfMonth: number | null;
  taxWeekStart: Date | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database row type for employee pay assignments
 */
export interface PayAssignmentRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  payScheduleId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  // Joined fields
  scheduleName?: string;
  scheduleFrequency?: PayFrequency;
}

/**
 * Database row type for NI categories
 */
export interface NiCategoryRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  categoryLetter: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  notes: string | null;
  createdAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class PayrollConfigRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Pay Schedules - Create
  // ===========================================================================

  /**
   * Insert a new pay schedule
   */
  async createPaySchedule(
    ctx: TenantContext,
    data: CreatePaySchedule,
    tx: TransactionSql
  ): Promise<PayScheduleRow> {
    const [row] = await tx`
      INSERT INTO pay_schedules (
        tenant_id,
        name,
        frequency,
        pay_day_of_week,
        pay_day_of_month,
        tax_week_start,
        is_default
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.name},
        ${data.frequency}::app.pay_frequency,
        ${data.pay_day_of_week ?? null},
        ${data.pay_day_of_month ?? null},
        ${data.tax_week_start ?? null}::date,
        ${data.is_default ?? false}
      )
      RETURNING
        id, tenant_id, name, frequency,
        pay_day_of_week, pay_day_of_month,
        tax_week_start, is_default,
        created_at, updated_at
    `;
    return row as unknown as PayScheduleRow;
  }

  // ===========================================================================
  // Pay Schedules - Read
  // ===========================================================================

  /**
   * Find a pay schedule by ID
   */
  async findPayScheduleById(
    ctx: TenantContext,
    id: string
  ): Promise<PayScheduleRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, name, frequency,
          pay_day_of_week, pay_day_of_month,
          tax_week_start, is_default,
          created_at, updated_at
        FROM pay_schedules
        WHERE id = ${id}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as PayScheduleRow;
  }

  /**
   * List all pay schedules for the tenant with cursor-based pagination
   */
  async findAllPaySchedules(
    ctx: TenantContext,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<PayScheduleRow>> {
    const limit = pagination.limit ?? 20;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      if (pagination.cursor) {
        return await tx`
          SELECT
            id, tenant_id, name, frequency,
            pay_day_of_week, pay_day_of_month,
            tax_week_start, is_default,
            created_at, updated_at
          FROM pay_schedules
          WHERE created_at < ${new Date(pagination.cursor)}::timestamptz
          ORDER BY created_at DESC
          LIMIT ${fetchLimit}
        `;
      }

      return await tx`
        SELECT
          id, tenant_id, name, frequency,
          pay_day_of_week, pay_day_of_month,
          tax_week_start, is_default,
          created_at, updated_at
        FROM pay_schedules
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit) as unknown as PayScheduleRow[];
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Check if a pay schedule name already exists for the tenant
   */
  async payScheduleNameExists(
    ctx: TenantContext,
    name: string,
    excludeId?: string
  ): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      if (excludeId) {
        return await tx`
          SELECT 1 FROM pay_schedules
          WHERE name = ${name} AND id != ${excludeId}::uuid
          LIMIT 1
        `;
      }
      return await tx`
        SELECT 1 FROM pay_schedules
        WHERE name = ${name}
        LIMIT 1
      `;
    });
    return rows.length > 0;
  }

  // ===========================================================================
  // Pay Schedules - Update
  // ===========================================================================

  /**
   * Update a pay schedule
   */
  async updatePaySchedule(
    ctx: TenantContext,
    id: string,
    data: UpdatePaySchedule,
    tx: TransactionSql
  ): Promise<PayScheduleRow | null> {
    // Build SET clause dynamically from provided fields
    const sets: string[] = [];
    const setClauses: Array<ReturnType<typeof tx>> = [];

    // We use explicit field-by-field updates within the tagged template
    // to maintain type safety and SQL injection protection
    const [row] = await tx`
      UPDATE pay_schedules
      SET
        name = COALESCE(${data.name ?? null}, name),
        frequency = COALESCE(${data.frequency ?? null}::app.pay_frequency, frequency),
        pay_day_of_week = CASE
          WHEN ${data.pay_day_of_week !== undefined} THEN ${data.pay_day_of_week ?? null}
          ELSE pay_day_of_week
        END,
        pay_day_of_month = CASE
          WHEN ${data.pay_day_of_month !== undefined} THEN ${data.pay_day_of_month ?? null}
          ELSE pay_day_of_month
        END,
        tax_week_start = CASE
          WHEN ${data.tax_week_start !== undefined} THEN ${data.tax_week_start ?? null}::date
          ELSE tax_week_start
        END,
        is_default = COALESCE(${data.is_default ?? null}, is_default),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, name, frequency,
        pay_day_of_week, pay_day_of_month,
        tax_week_start, is_default,
        created_at, updated_at
    `;

    if (!row) return null;
    return row as unknown as PayScheduleRow;
  }

  /**
   * Clear the default flag on all schedules except the given one
   */
  async clearDefaultExcept(
    ctx: TenantContext,
    scheduleId: string,
    tx: TransactionSql
  ): Promise<void> {
    await tx`
      UPDATE pay_schedules
      SET is_default = false, updated_at = now()
      WHERE id != ${scheduleId}::uuid
        AND is_default = true
    `;
  }

  // ===========================================================================
  // Employee Pay Assignments - Create
  // ===========================================================================

  /**
   * Insert a new employee pay assignment
   */
  async createPayAssignment(
    ctx: TenantContext,
    data: CreatePayAssignment,
    tx: TransactionSql
  ): Promise<PayAssignmentRow> {
    const [row] = await tx`
      INSERT INTO employee_pay_assignments (
        tenant_id,
        employee_id,
        pay_schedule_id,
        effective_from,
        effective_to
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.pay_schedule_id}::uuid,
        ${data.effective_from}::date,
        ${data.effective_to ?? null}::date
      )
      RETURNING
        id, tenant_id, employee_id, pay_schedule_id,
        effective_from, effective_to, created_at
    `;
    return row as unknown as PayAssignmentRow;
  }

  // ===========================================================================
  // Employee Pay Assignments - Read
  // ===========================================================================

  /**
   * Find current and historical pay assignments for an employee (with schedule details)
   */
  async findPayAssignmentsByEmployee(
    ctx: TenantContext,
    employeeId: string
  ): Promise<PayAssignmentRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          epa.id,
          epa.tenant_id,
          epa.employee_id,
          epa.pay_schedule_id,
          epa.effective_from,
          epa.effective_to,
          epa.created_at,
          ps.name AS schedule_name,
          ps.frequency AS schedule_frequency
        FROM employee_pay_assignments epa
        JOIN pay_schedules ps ON ps.id = epa.pay_schedule_id
        WHERE epa.employee_id = ${employeeId}::uuid
        ORDER BY epa.effective_from DESC
      `;
    });
    return rows as unknown as PayAssignmentRow[];
  }

  /**
   * Check for overlapping pay assignments for an employee.
   * Returns true if an overlap exists.
   */
  async hasOverlappingPayAssignment(
    ctx: TenantContext,
    employeeId: string,
    effectiveFrom: string,
    effectiveTo: string | null | undefined,
    tx: TransactionSql
  ): Promise<boolean> {
    const rows = await tx`
      SELECT 1 FROM employee_pay_assignments
      WHERE employee_id = ${employeeId}::uuid
        AND daterange(effective_from, effective_to, '[]') &&
            daterange(${effectiveFrom}::date, ${effectiveTo ?? null}::date, '[]')
      LIMIT 1
    `;
    return rows.length > 0;
  }

  // ===========================================================================
  // NI Categories - Create
  // ===========================================================================

  /**
   * Insert a new NI category record
   */
  async createNiCategory(
    ctx: TenantContext,
    data: CreateNiCategory,
    tx: TransactionSql
  ): Promise<NiCategoryRow> {
    const [row] = await tx`
      INSERT INTO ni_categories (
        tenant_id,
        employee_id,
        category_letter,
        effective_from,
        effective_to,
        notes
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.category_letter},
        ${data.effective_from}::date,
        ${data.effective_to ?? null}::date,
        ${data.notes ?? null}
      )
      RETURNING
        id, tenant_id, employee_id, category_letter,
        effective_from, effective_to, notes, created_at
    `;
    return row as unknown as NiCategoryRow;
  }

  // ===========================================================================
  // NI Categories - Read
  // ===========================================================================

  /**
   * Find current and historical NI categories for an employee
   */
  async findNiCategoriesByEmployee(
    ctx: TenantContext,
    employeeId: string
  ): Promise<NiCategoryRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, employee_id, category_letter,
          effective_from, effective_to, notes, created_at
        FROM ni_categories
        WHERE employee_id = ${employeeId}::uuid
        ORDER BY effective_from DESC
      `;
    });
    return rows as unknown as NiCategoryRow[];
  }

  /**
   * Check for overlapping NI category records for an employee.
   * Returns true if an overlap exists.
   */
  async hasOverlappingNiCategory(
    ctx: TenantContext,
    employeeId: string,
    effectiveFrom: string,
    effectiveTo: string | null | undefined,
    tx: TransactionSql
  ): Promise<boolean> {
    const rows = await tx`
      SELECT 1 FROM ni_categories
      WHERE employee_id = ${employeeId}::uuid
        AND daterange(effective_from, effective_to, '[]') &&
            daterange(${effectiveFrom}::date, ${effectiveTo ?? null}::date, '[]')
      LIMIT 1
    `;
    return rows.length > 0;
  }
}
