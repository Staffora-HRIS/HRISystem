/**
 * Tax Codes Module - Repository Layer
 *
 * Provides data access methods for employee tax codes.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateTaxCode,
  UpdateTaxCode,
  TaxCodeSource,
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

export interface TaxCodeRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  taxCode: string;
  isCumulative: boolean;
  week1Month1: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  source: TaxCodeSource;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Column List (shared across queries to avoid repetition)
// =============================================================================

const COLUMNS = `
  id, tenant_id, employee_id, tax_code,
  is_cumulative, week1_month1,
  effective_from, effective_to,
  source, notes, created_at, updated_at
`;

// =============================================================================
// Repository
// =============================================================================

export class TaxCodeRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Insert a new employee tax code
   */
  async createTaxCode(
    ctx: TenantContext,
    data: CreateTaxCode,
    tx: TransactionSql
  ): Promise<TaxCodeRow> {
    const [row] = await tx`
      INSERT INTO employee_tax_codes (
        tenant_id,
        employee_id,
        tax_code,
        is_cumulative,
        week1_month1,
        effective_from,
        effective_to,
        source,
        notes
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.tax_code},
        ${data.is_cumulative ?? true},
        ${data.week1_month1 ?? false},
        ${data.effective_from}::date,
        ${data.effective_to ?? null}::date,
        ${data.source ?? "manual"}::app.tax_code_source,
        ${data.notes ?? null}
      )
      RETURNING ${tx.unsafe(COLUMNS)}
    `;
    return row as unknown as TaxCodeRow;
  }

  /**
   * Find a tax code by ID
   */
  async findById(
    ctx: TenantContext,
    id: string
  ): Promise<TaxCodeRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ${tx.unsafe(COLUMNS)}
        FROM employee_tax_codes
        WHERE id = ${id}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as TaxCodeRow;
  }

  /**
   * Find all tax codes for an employee, ordered by effective_from DESC
   */
  async findByEmployee(
    ctx: TenantContext,
    employeeId: string
  ): Promise<TaxCodeRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ${tx.unsafe(COLUMNS)}
        FROM employee_tax_codes
        WHERE employee_id = ${employeeId}::uuid
        ORDER BY effective_from DESC
      `;
    });
    return rows as unknown as TaxCodeRow[];
  }

  /**
   * Find the current (effective today) tax code for an employee.
   * Returns null if no tax code is effective for the current date.
   */
  async findCurrentByEmployee(
    ctx: TenantContext,
    employeeId: string,
    asOfDate?: string
  ): Promise<TaxCodeRow | null> {
    const refDate = asOfDate ?? new Date().toISOString().split("T")[0];
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ${tx.unsafe(COLUMNS)}
        FROM employee_tax_codes
        WHERE employee_id = ${employeeId}::uuid
          AND effective_from <= ${refDate}::date
          AND (effective_to IS NULL OR effective_to >= ${refDate}::date)
        ORDER BY effective_from DESC
        LIMIT 1
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as TaxCodeRow;
  }

  /**
   * Update a tax code record
   */
  async updateTaxCode(
    ctx: TenantContext,
    id: string,
    data: UpdateTaxCode,
    tx: TransactionSql
  ): Promise<TaxCodeRow | null> {
    const [row] = await tx`
      UPDATE employee_tax_codes
      SET
        tax_code = COALESCE(${data.tax_code ?? null}, tax_code),
        is_cumulative = CASE
          WHEN ${data.is_cumulative !== undefined} THEN ${data.is_cumulative ?? null}
          ELSE is_cumulative
        END,
        week1_month1 = CASE
          WHEN ${data.week1_month1 !== undefined} THEN ${data.week1_month1 ?? null}
          ELSE week1_month1
        END,
        effective_from = COALESCE(${data.effective_from ?? null}::date, effective_from),
        effective_to = CASE
          WHEN ${data.effective_to !== undefined} THEN ${data.effective_to ?? null}::date
          ELSE effective_to
        END,
        source = COALESCE(${data.source ?? null}::app.tax_code_source, source),
        notes = CASE
          WHEN ${data.notes !== undefined} THEN ${data.notes ?? null}
          ELSE notes
        END,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING ${tx.unsafe(COLUMNS)}
    `;

    if (!row) return null;
    return row as unknown as TaxCodeRow;
  }

  /**
   * Check for overlapping tax code records for an employee.
   * Optionally excludes a record by ID (used during updates).
   */
  async hasOverlappingTaxCode(
    ctx: TenantContext,
    employeeId: string,
    effectiveFrom: string,
    effectiveTo: string | null | undefined,
    tx: TransactionSql,
    excludeId?: string
  ): Promise<boolean> {
    const rows = excludeId
      ? await tx`
          SELECT 1 FROM employee_tax_codes
          WHERE employee_id = ${employeeId}::uuid
            AND id != ${excludeId}::uuid
            AND daterange(effective_from, effective_to, '[]') &&
                daterange(${effectiveFrom}::date, ${effectiveTo ?? null}::date, '[]')
          LIMIT 1
        `
      : await tx`
          SELECT 1 FROM employee_tax_codes
          WHERE employee_id = ${employeeId}::uuid
            AND daterange(effective_from, effective_to, '[]') &&
                daterange(${effectiveFrom}::date, ${effectiveTo ?? null}::date, '[]')
          LIMIT 1
        `;
    return rows.length > 0;
  }
}
