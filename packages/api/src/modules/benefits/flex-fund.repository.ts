/**
 * Flexible Benefits Fund - Repository Layer
 *
 * Provides data access methods for flex benefit funds and allocations.
 * All methods respect RLS through tenant context.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type { FlexAllocationStatus } from "./flex-fund.schemas";

// =============================================================================
// Row Types
// =============================================================================

export interface FlexFundRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  annualCredits: string;
  usedCredits: string;
  remainingCredits: string;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface FlexAllocationRow extends Row {
  id: string;
  tenantId: string;
  fundId: string;
  benefitPlanId: string;
  benefitPlanName?: string | null;
  creditsAllocated: string;
  status: FlexAllocationStatus;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancelledReason: string | null;
  createdBy: string | null;
}

export interface FlexBenefitOptionRow extends Row {
  planId: string;
  planName: string;
  category: string;
  description: string | null;
  creditCost: string;
  isActive: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Flex Fund Repository
// =============================================================================

export class FlexFundRepository {
  constructor(private db: DatabaseClient) {}

  async findCurrentFund(
    context: TenantContext,
    employeeId: string,
    asOfDate: string = new Date().toISOString().split("T")[0]!
  ): Promise<FlexFundRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<FlexFundRow[]>`
        SELECT id, tenant_id, employee_id,
               annual_credits::text, used_credits::text, remaining_credits::text,
               period_start, period_end,
               created_at, updated_at, created_by, updated_by
        FROM app.flex_benefit_funds
        WHERE employee_id = ${employeeId}::uuid
          AND period_start <= ${asOfDate}::date
          AND period_end >= ${asOfDate}::date
        ORDER BY period_start DESC
        LIMIT 1
      `;
      return rows;
    });

    return result[0] || null;
  }

  async findFundById(
    context: TenantContext,
    id: string
  ): Promise<FlexFundRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<FlexFundRow[]>`
        SELECT id, tenant_id, employee_id,
               annual_credits::text, used_credits::text, remaining_credits::text,
               period_start, period_end,
               created_at, updated_at, created_by, updated_by
        FROM app.flex_benefit_funds
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  async createFund(
    tx: TransactionSql,
    context: TenantContext,
    data: {
      employeeId: string;
      annualCredits: number;
      periodStart: string;
      periodEnd: string;
    }
  ): Promise<FlexFundRow> {
    const rows = await tx<FlexFundRow[]>`
      INSERT INTO app.flex_benefit_funds (
        tenant_id, employee_id, annual_credits,
        period_start, period_end, created_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.employeeId}::uuid,
        ${data.annualCredits}::decimal,
        ${data.periodStart}::date,
        ${data.periodEnd}::date,
        ${context.userId || null}::uuid
      )
      RETURNING id, tenant_id, employee_id,
                annual_credits::text, used_credits::text, remaining_credits::text,
                period_start, period_end,
                created_at, updated_at, created_by, updated_by
    `;

    return rows[0]!;
  }

  async hasOverlappingFund(
    context: TenantContext,
    employeeId: string,
    periodStart: string,
    periodEnd: string,
    excludeId?: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int as count
        FROM app.flex_benefit_funds
        WHERE employee_id = ${employeeId}::uuid
          AND period_start < ${periodEnd}::date
          AND period_end > ${periodStart}::date
          ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
      `;
      return rows;
    });

    return (result[0]?.count ?? 0) > 0;
  }

  async findAllocationsByFund(
    context: TenantContext,
    fundId: string
  ): Promise<FlexAllocationRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<FlexAllocationRow[]>`
        SELECT
          fa.id, fa.tenant_id, fa.fund_id, fa.benefit_plan_id,
          bp.name as benefit_plan_name,
          fa.credits_allocated::text, fa.status,
          fa.created_at, fa.updated_at,
          fa.confirmed_at, fa.cancelled_at, fa.cancelled_reason,
          fa.created_by
        FROM app.flex_benefit_allocations fa
        INNER JOIN app.benefit_plans bp ON fa.benefit_plan_id = bp.id
        WHERE fa.fund_id = ${fundId}::uuid
        ORDER BY fa.created_at DESC
      `;
      return rows;
    });

    return result;
  }

  async findAllocationById(
    context: TenantContext,
    id: string
  ): Promise<FlexAllocationRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<FlexAllocationRow[]>`
        SELECT
          fa.id, fa.tenant_id, fa.fund_id, fa.benefit_plan_id,
          bp.name as benefit_plan_name,
          fa.credits_allocated::text, fa.status,
          fa.created_at, fa.updated_at,
          fa.confirmed_at, fa.cancelled_at, fa.cancelled_reason,
          fa.created_by
        FROM app.flex_benefit_allocations fa
        INNER JOIN app.benefit_plans bp ON fa.benefit_plan_id = bp.id
        WHERE fa.id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  async hasActiveAllocationForPlan(
    context: TenantContext,
    fundId: string,
    benefitPlanId: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int as count
        FROM app.flex_benefit_allocations
        WHERE fund_id = ${fundId}::uuid
          AND benefit_plan_id = ${benefitPlanId}::uuid
          AND status != 'cancelled'
      `;
      return rows;
    });

    return (result[0]?.count ?? 0) > 0;
  }

  async createAllocation(
    tx: TransactionSql,
    context: TenantContext,
    data: {
      fundId: string;
      benefitPlanId: string;
      creditsAllocated: number;
    }
  ): Promise<FlexAllocationRow> {
    const [fund] = await tx<FlexFundRow[]>`
      SELECT id, annual_credits::text, used_credits::text, remaining_credits::text
      FROM app.flex_benefit_funds
      WHERE id = ${data.fundId}::uuid
      FOR UPDATE
    `;

    if (!fund) {
      throw new Error("Fund not found during allocation");
    }

    const remaining = parseFloat(fund.remainingCredits);
    if (data.creditsAllocated > remaining) {
      throw new Error("INSUFFICIENT_CREDITS");
    }

    await tx`
      UPDATE app.flex_benefit_funds
      SET used_credits = used_credits + ${data.creditsAllocated}::decimal,
          updated_at = now(),
          updated_by = ${context.userId || null}::uuid
      WHERE id = ${data.fundId}::uuid
    `;

    const rows = await tx<FlexAllocationRow[]>`
      INSERT INTO app.flex_benefit_allocations (
        tenant_id, fund_id, benefit_plan_id,
        credits_allocated, status, created_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.fundId}::uuid,
        ${data.benefitPlanId}::uuid,
        ${data.creditsAllocated}::decimal,
        'pending'::app.flex_allocation_status,
        ${context.userId || null}::uuid
      )
      RETURNING id, tenant_id, fund_id, benefit_plan_id,
                credits_allocated::text, status,
                created_at, updated_at,
                confirmed_at, cancelled_at, cancelled_reason, created_by
    `;

    const [planRow] = await tx<{ name: string }[]>`
      SELECT name FROM app.benefit_plans WHERE id = ${data.benefitPlanId}::uuid
    `;

    const alloc = rows[0]!;
    (alloc as any).benefitPlanName = planRow?.name || null;

    return alloc;
  }

  async cancelAllocation(
    tx: TransactionSql,
    context: TenantContext,
    allocationId: string,
    reason?: string
  ): Promise<FlexAllocationRow | null> {
    const [existing] = await tx<FlexAllocationRow[]>`
      SELECT id, fund_id, credits_allocated::text, status
      FROM app.flex_benefit_allocations
      WHERE id = ${allocationId}::uuid
      FOR UPDATE
    `;

    if (!existing) {
      return null;
    }

    const creditsToRelease = parseFloat(existing.creditsAllocated);
    await tx`
      UPDATE app.flex_benefit_funds
      SET used_credits = GREATEST(0, used_credits - ${creditsToRelease}::decimal),
          updated_at = now(),
          updated_by = ${context.userId || null}::uuid
      WHERE id = ${existing.fundId}::uuid
    `;

    const rows = await tx<FlexAllocationRow[]>`
      UPDATE app.flex_benefit_allocations
      SET status = 'cancelled'::app.flex_allocation_status,
          cancelled_at = now(),
          cancelled_reason = ${reason || null},
          updated_at = now()
      WHERE id = ${allocationId}::uuid
      RETURNING id, tenant_id, fund_id, benefit_plan_id,
                credits_allocated::text, status,
                created_at, updated_at,
                confirmed_at, cancelled_at, cancelled_reason, created_by
    `;

    if (!rows[0]) return null;

    const [planRow] = await tx<{ name: string }[]>`
      SELECT name FROM app.benefit_plans WHERE id = ${rows[0].benefitPlanId}::uuid
    `;

    const alloc = rows[0];
    (alloc as any).benefitPlanName = planRow?.name || null;

    return alloc;
  }

  async confirmAllocation(
    tx: TransactionSql,
    _context: TenantContext,
    allocationId: string
  ): Promise<FlexAllocationRow | null> {
    const rows = await tx<FlexAllocationRow[]>`
      UPDATE app.flex_benefit_allocations
      SET status = 'confirmed'::app.flex_allocation_status,
          confirmed_at = now(),
          updated_at = now()
      WHERE id = ${allocationId}::uuid
        AND status = 'pending'
      RETURNING id, tenant_id, fund_id, benefit_plan_id,
                credits_allocated::text, status,
                created_at, updated_at,
                confirmed_at, cancelled_at, cancelled_reason, created_by
    `;

    if (!rows[0]) return null;

    const [planRow] = await tx<{ name: string }[]>`
      SELECT name FROM app.benefit_plans WHERE id = ${rows[0].benefitPlanId}::uuid
    `;

    const alloc = rows[0];
    (alloc as any).benefitPlanName = planRow?.name || null;

    return alloc;
  }

  async findFlexEligiblePlans(
    context: TenantContext
  ): Promise<FlexBenefitOptionRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<FlexBenefitOptionRow[]>`
        SELECT
          id as plan_id,
          name as plan_name,
          category,
          description,
          credit_cost::text,
          is_active
        FROM app.benefit_plans
        WHERE credit_cost IS NOT NULL
          AND is_active = true
        ORDER BY category, name
      `;
      return rows;
    });

    return result;
  }
}
