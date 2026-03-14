/**
 * Payslips Module - Repository Layer
 *
 * Data access for payslip templates and payslips.
 * All methods respect RLS through tenant context.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreatePayslipTemplate,
  UpdatePayslipTemplate,
  CreatePayslip,
  PayslipStatus,
  PayslipFilters,
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

export interface PayslipTemplateRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  layoutConfig: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayslipRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  payPeriodId: string | null;
  grossPay: number;
  netPay: number;
  taxDeducted: number;
  niEmployee: number;
  niEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
  otherDeductions: unknown[];
  otherAdditions: unknown[];
  paymentDate: Date;
  status: PayslipStatus;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class PayslipRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Payslip Templates
  // ===========================================================================

  async createTemplate(
    ctx: TenantContext,
    data: CreatePayslipTemplate,
    tx: TransactionSql
  ): Promise<PayslipTemplateRow> {
    const [row] = await tx`
      INSERT INTO payslip_templates (
        tenant_id, name, layout_config
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.name},
        ${JSON.stringify(data.layout_config ?? {})}::jsonb
      )
      RETURNING
        id, tenant_id, name, layout_config,
        created_at, updated_at
    `;
    return row as unknown as PayslipTemplateRow;
  }

  async findTemplateById(
    ctx: TenantContext,
    id: string
  ): Promise<PayslipTemplateRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT id, tenant_id, name, layout_config, created_at, updated_at
        FROM payslip_templates
        WHERE id = ${id}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as PayslipTemplateRow;
  }

  async findAllTemplates(
    ctx: TenantContext,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<PayslipTemplateRow>> {
    const limit = pagination.limit ?? 20;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      if (pagination.cursor) {
        return await tx`
          SELECT id, tenant_id, name, layout_config, created_at, updated_at
          FROM payslip_templates
          WHERE created_at < ${new Date(pagination.cursor)}::timestamptz
          ORDER BY created_at DESC
          LIMIT ${fetchLimit}
        `;
      }

      return await tx`
        SELECT id, tenant_id, name, layout_config, created_at, updated_at
        FROM payslip_templates
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit) as unknown as PayslipTemplateRow[];
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    return { items, nextCursor, hasMore };
  }

  async updateTemplate(
    ctx: TenantContext,
    id: string,
    data: UpdatePayslipTemplate,
    tx: TransactionSql
  ): Promise<PayslipTemplateRow | null> {
    const [row] = await tx`
      UPDATE payslip_templates
      SET
        name = COALESCE(${data.name ?? null}, name),
        layout_config = CASE
          WHEN ${data.layout_config !== undefined} THEN ${JSON.stringify(data.layout_config ?? {})}::jsonb
          ELSE layout_config
        END,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, name, layout_config,
        created_at, updated_at
    `;

    if (!row) return null;
    return row as unknown as PayslipTemplateRow;
  }

  async templateNameExists(
    ctx: TenantContext,
    name: string,
    excludeId?: string
  ): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      if (excludeId) {
        return await tx`
          SELECT 1 FROM payslip_templates
          WHERE name = ${name} AND id != ${excludeId}::uuid
          LIMIT 1
        `;
      }
      return await tx`
        SELECT 1 FROM payslip_templates
        WHERE name = ${name}
        LIMIT 1
      `;
    });
    return rows.length > 0;
  }

  // ===========================================================================
  // Payslips
  // ===========================================================================

  async createPayslip(
    ctx: TenantContext,
    data: CreatePayslip,
    tx: TransactionSql
  ): Promise<PayslipRow> {
    const [row] = await tx`
      INSERT INTO payslips (
        tenant_id, employee_id, pay_period_id,
        gross_pay, net_pay, tax_deducted,
        ni_employee, ni_employer,
        pension_employee, pension_employer,
        other_deductions, other_additions,
        payment_date, status
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.pay_period_id ?? null}::uuid,
        ${data.gross_pay},
        ${data.net_pay},
        ${data.tax_deducted},
        ${data.ni_employee},
        ${data.ni_employer},
        ${data.pension_employee ?? 0},
        ${data.pension_employer ?? 0},
        ${JSON.stringify(data.other_deductions ?? [])}::jsonb,
        ${JSON.stringify(data.other_additions ?? [])}::jsonb,
        ${data.payment_date}::date,
        ${data.status ?? "draft"}::app.payslip_status
      )
      RETURNING
        id, tenant_id, employee_id, pay_period_id,
        gross_pay, net_pay, tax_deducted,
        ni_employee, ni_employer,
        pension_employee, pension_employer,
        other_deductions, other_additions,
        payment_date, status,
        created_at, updated_at
    `;
    return row as unknown as PayslipRow;
  }

  async findPayslipById(
    ctx: TenantContext,
    id: string
  ): Promise<PayslipRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, employee_id, pay_period_id,
          gross_pay, net_pay, tax_deducted,
          ni_employee, ni_employer,
          pension_employee, pension_employer,
          other_deductions, other_additions,
          payment_date, status,
          created_at, updated_at
        FROM payslips
        WHERE id = ${id}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as PayslipRow;
  }

  async findPayslipsByEmployee(
    ctx: TenantContext,
    employeeId: string,
    filters: PayslipFilters = {}
  ): Promise<PaginatedResult<PayslipRow>> {
    const limit = filters.limit ?? 20;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, employee_id, pay_period_id,
          gross_pay, net_pay, tax_deducted,
          ni_employee, ni_employer,
          pension_employee, pension_employer,
          other_deductions, other_additions,
          payment_date, status,
          created_at, updated_at
        FROM payslips
        WHERE employee_id = ${employeeId}::uuid
          ${filters.status ? tx`AND status = ${filters.status}::app.payslip_status` : tx``}
          ${filters.payment_date_from ? tx`AND payment_date >= ${filters.payment_date_from}::date` : tx``}
          ${filters.payment_date_to ? tx`AND payment_date <= ${filters.payment_date_to}::date` : tx``}
          ${filters.cursor ? tx`AND created_at < ${new Date(filters.cursor)}::timestamptz` : tx``}
        ORDER BY payment_date DESC, created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit) as unknown as PayslipRow[];
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    return { items, nextCursor, hasMore };
  }

  async updatePayslipStatus(
    ctx: TenantContext,
    id: string,
    status: PayslipStatus,
    tx: TransactionSql
  ): Promise<PayslipRow | null> {
    const [row] = await tx`
      UPDATE payslips
      SET
        status = ${status}::app.payslip_status,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, pay_period_id,
        gross_pay, net_pay, tax_deducted,
        ni_employee, ni_employer,
        pension_employee, pension_employer,
        other_deductions, other_additions,
        payment_date, status,
        created_at, updated_at
    `;

    if (!row) return null;
    return row as unknown as PayslipRow;
  }

  /**
   * Check if a payslip already exists for an employee+pay_period
   */
  async payslipExistsForPeriod(
    ctx: TenantContext,
    employeeId: string,
    payPeriodId: string,
    tx: TransactionSql
  ): Promise<boolean> {
    const rows = await tx`
      SELECT 1 FROM payslips
      WHERE employee_id = ${employeeId}::uuid
        AND pay_period_id = ${payPeriodId}::uuid
      LIMIT 1
    `;
    return rows.length > 0;
  }
}
