/**
 * Deductions Module - Repository Layer
 *
 * Data access for deduction types and employee deductions.
 * All methods respect RLS through tenant context.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateDeductionType,
  UpdateDeductionType,
  CreateEmployeeDeduction,
  UpdateEmployeeDeduction,
  DeductionCategory,
  CalculationMethod,
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

export interface DeductionTypeRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  category: DeductionCategory;
  isStatutory: boolean;
  calculationMethod: CalculationMethod;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployeeDeductionRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  deductionTypeId: string;
  amount: number | null;
  percentage: number | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  reference: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  deductionTypeName?: string;
  deductionTypeCode?: string;
  deductionCategory?: string;
}

// =============================================================================
// Repository
// =============================================================================

export class DeductionRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Deduction Types
  // ===========================================================================

  async createDeductionType(
    ctx: TenantContext,
    data: CreateDeductionType,
    tx: TransactionSql
  ): Promise<DeductionTypeRow> {
    const [row] = await tx`
      INSERT INTO deduction_types (
        tenant_id, name, code, category, is_statutory, calculation_method
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.name},
        ${data.code},
        ${data.category}::app.deduction_category,
        ${data.is_statutory ?? false},
        ${data.calculation_method ?? "fixed"}::app.calculation_method
      )
      RETURNING
        id, tenant_id, name, code, category,
        is_statutory, calculation_method,
        created_at, updated_at
    `;
    return row as unknown as DeductionTypeRow;
  }

  async findDeductionTypeById(
    ctx: TenantContext,
    id: string
  ): Promise<DeductionTypeRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, name, code, category,
          is_statutory, calculation_method,
          created_at, updated_at
        FROM deduction_types
        WHERE id = ${id}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as DeductionTypeRow;
  }

  async findAllDeductionTypes(
    ctx: TenantContext,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<DeductionTypeRow>> {
    const limit = pagination.limit ?? 20;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      if (pagination.cursor) {
        return await tx`
          SELECT
            id, tenant_id, name, code, category,
            is_statutory, calculation_method,
            created_at, updated_at
          FROM deduction_types
          WHERE created_at < ${new Date(pagination.cursor)}::timestamptz
          ORDER BY created_at DESC
          LIMIT ${fetchLimit}
        `;
      }

      return await tx`
        SELECT
          id, tenant_id, name, code, category,
          is_statutory, calculation_method,
          created_at, updated_at
        FROM deduction_types
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit) as unknown as DeductionTypeRow[];
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    return { items, nextCursor, hasMore };
  }

  async updateDeductionType(
    ctx: TenantContext,
    id: string,
    data: UpdateDeductionType,
    tx: TransactionSql
  ): Promise<DeductionTypeRow | null> {
    const [row] = await tx`
      UPDATE deduction_types
      SET
        name = COALESCE(${data.name ?? null}, name),
        code = COALESCE(${data.code ?? null}, code),
        category = COALESCE(${data.category ?? null}::app.deduction_category, category),
        is_statutory = COALESCE(${data.is_statutory ?? null}, is_statutory),
        calculation_method = COALESCE(${data.calculation_method ?? null}::app.calculation_method, calculation_method),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, name, code, category,
        is_statutory, calculation_method,
        created_at, updated_at
    `;

    if (!row) return null;
    return row as unknown as DeductionTypeRow;
  }

  async deductionTypeCodeExists(
    ctx: TenantContext,
    code: string,
    excludeId?: string
  ): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      if (excludeId) {
        return await tx`
          SELECT 1 FROM deduction_types
          WHERE code = ${code} AND id != ${excludeId}::uuid
          LIMIT 1
        `;
      }
      return await tx`
        SELECT 1 FROM deduction_types
        WHERE code = ${code}
        LIMIT 1
      `;
    });
    return rows.length > 0;
  }

  // ===========================================================================
  // Employee Deductions
  // ===========================================================================

  async createEmployeeDeduction(
    ctx: TenantContext,
    data: CreateEmployeeDeduction,
    tx: TransactionSql
  ): Promise<EmployeeDeductionRow> {
    const [row] = await tx`
      INSERT INTO employee_deductions (
        tenant_id, employee_id, deduction_type_id,
        amount, percentage,
        effective_from, effective_to, reference
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.deduction_type_id}::uuid,
        ${data.amount ?? null},
        ${data.percentage ?? null},
        ${data.effective_from}::date,
        ${data.effective_to ?? null}::date,
        ${data.reference ?? null}
      )
      RETURNING
        id, tenant_id, employee_id, deduction_type_id,
        amount, percentage,
        effective_from, effective_to, reference,
        created_at, updated_at
    `;
    return row as unknown as EmployeeDeductionRow;
  }

  async findEmployeeDeductionById(
    ctx: TenantContext,
    id: string
  ): Promise<EmployeeDeductionRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          ed.id, ed.tenant_id, ed.employee_id, ed.deduction_type_id,
          ed.amount, ed.percentage,
          ed.effective_from, ed.effective_to, ed.reference,
          ed.created_at, ed.updated_at,
          dt.name AS deduction_type_name,
          dt.code AS deduction_type_code,
          dt.category AS deduction_category
        FROM employee_deductions ed
        JOIN deduction_types dt ON dt.id = ed.deduction_type_id
        WHERE ed.id = ${id}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as EmployeeDeductionRow;
  }

  async findEmployeeDeductionsByEmployee(
    ctx: TenantContext,
    employeeId: string
  ): Promise<EmployeeDeductionRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          ed.id, ed.tenant_id, ed.employee_id, ed.deduction_type_id,
          ed.amount, ed.percentage,
          ed.effective_from, ed.effective_to, ed.reference,
          ed.created_at, ed.updated_at,
          dt.name AS deduction_type_name,
          dt.code AS deduction_type_code,
          dt.category AS deduction_category
        FROM employee_deductions ed
        JOIN deduction_types dt ON dt.id = ed.deduction_type_id
        WHERE ed.employee_id = ${employeeId}::uuid
        ORDER BY ed.effective_from DESC
      `;
    });
    return rows as unknown as EmployeeDeductionRow[];
  }

  async updateEmployeeDeduction(
    ctx: TenantContext,
    id: string,
    data: UpdateEmployeeDeduction,
    tx: TransactionSql
  ): Promise<EmployeeDeductionRow | null> {
    const [row] = await tx`
      UPDATE employee_deductions
      SET
        amount = CASE
          WHEN ${data.amount !== undefined} THEN ${data.amount ?? null}
          ELSE amount
        END,
        percentage = CASE
          WHEN ${data.percentage !== undefined} THEN ${data.percentage ?? null}
          ELSE percentage
        END,
        effective_from = COALESCE(${data.effective_from ?? null}::date, effective_from),
        effective_to = CASE
          WHEN ${data.effective_to !== undefined} THEN ${data.effective_to ?? null}::date
          ELSE effective_to
        END,
        reference = CASE
          WHEN ${data.reference !== undefined} THEN ${data.reference ?? null}
          ELSE reference
        END,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, deduction_type_id,
        amount, percentage,
        effective_from, effective_to, reference,
        created_at, updated_at
    `;

    if (!row) return null;
    return row as unknown as EmployeeDeductionRow;
  }

  async hasOverlappingDeduction(
    ctx: TenantContext,
    employeeId: string,
    deductionTypeId: string,
    effectiveFrom: string,
    effectiveTo: string | null | undefined,
    tx: TransactionSql,
    excludeId?: string
  ): Promise<boolean> {
    const rows = excludeId
      ? await tx`
          SELECT 1 FROM employee_deductions
          WHERE employee_id = ${employeeId}::uuid
            AND deduction_type_id = ${deductionTypeId}::uuid
            AND id != ${excludeId}::uuid
            AND daterange(effective_from, effective_to, '[]') &&
                daterange(${effectiveFrom}::date, ${effectiveTo ?? null}::date, '[]')
          LIMIT 1
        `
      : await tx`
          SELECT 1 FROM employee_deductions
          WHERE employee_id = ${employeeId}::uuid
            AND deduction_type_id = ${deductionTypeId}::uuid
            AND daterange(effective_from, effective_to, '[]') &&
                daterange(${effectiveFrom}::date, ${effectiveTo ?? null}::date, '[]')
          LIMIT 1
        `;
    return rows.length > 0;
  }
}
