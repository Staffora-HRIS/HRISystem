/**
 * Headcount Planning Module - Repository Layer
 *
 * Database operations for headcount plans and plan items.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreatePlan,
  UpdatePlan,
  CreatePlanItem,
  UpdatePlanItem,
  PlanFilters,
  PaginationQuery,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface HeadcountPlanRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  financialYear: string;
  status: string;
  createdBy: string | null;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Aggregated fields (optional)
  totalCurrent?: number;
  totalPlanned?: number;
  totalVariance?: number;
  itemsCount?: number;
}

export interface HeadcountPlanItemRow extends Row {
  id: string;
  tenantId: string;
  planId: string;
  orgUnitId: string;
  orgUnitName?: string;
  positionId: string | null;
  positionTitle?: string | null;
  jobId: string | null;
  currentHeadcount: number;
  plannedHeadcount: number;
  variance: number;
  justification: string | null;
  priority: string;
  status: string;
  targetFillDate: Date | null;
  createdAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class HeadcountPlanningRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Plan Operations
  // ===========================================================================

  async listPlans(
    ctx: TenantContext,
    filters: PlanFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<HeadcountPlanRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<HeadcountPlanRow[]>`
        SELECT
          hp.id, hp.tenant_id, hp.name, hp.financial_year,
          hp.status, hp.created_by, hp.approved_by,
          hp.created_at, hp.updated_at,
          COALESCE(SUM(hpi.current_headcount), 0)::int AS total_current,
          COALESCE(SUM(hpi.planned_headcount), 0)::int AS total_planned,
          COALESCE(SUM(hpi.variance), 0)::int AS total_variance,
          COUNT(hpi.id)::int AS items_count
        FROM headcount_plans hp
        LEFT JOIN headcount_plan_items hpi ON hpi.plan_id = hp.id AND hpi.tenant_id = hp.tenant_id
        WHERE 1=1
          ${filters.status ? tx`AND hp.status = ${filters.status}::app.headcount_plan_status` : tx``}
          ${filters.financial_year ? tx`AND hp.financial_year = ${filters.financial_year}` : tx``}
          ${filters.search ? tx`AND hp.name ILIKE ${"%" + filters.search + "%"}` : tx``}
          ${pagination.cursor ? tx`AND hp.id > ${pagination.cursor}::uuid` : tx``}
        GROUP BY hp.id
        ORDER BY hp.created_at DESC, hp.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0 ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  async getPlanById(
    ctx: TenantContext,
    id: string
  ): Promise<HeadcountPlanRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<HeadcountPlanRow[]>`
        SELECT
          hp.id, hp.tenant_id, hp.name, hp.financial_year,
          hp.status, hp.created_by, hp.approved_by,
          hp.created_at, hp.updated_at,
          COALESCE(SUM(hpi.current_headcount), 0)::int AS total_current,
          COALESCE(SUM(hpi.planned_headcount), 0)::int AS total_planned,
          COALESCE(SUM(hpi.variance), 0)::int AS total_variance,
          COUNT(hpi.id)::int AS items_count
        FROM headcount_plans hp
        LEFT JOIN headcount_plan_items hpi ON hpi.plan_id = hp.id AND hpi.tenant_id = hp.tenant_id
        WHERE hp.id = ${id}::uuid
        GROUP BY hp.id
      `;
    });
    return rows[0] ?? null;
  }

  async createPlan(
    ctx: TenantContext,
    data: CreatePlan,
    tx: TransactionSql
  ): Promise<HeadcountPlanRow> {
    const [row] = await tx<HeadcountPlanRow[]>`
      INSERT INTO headcount_plans (
        tenant_id, name, financial_year, created_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.name},
        ${data.financial_year},
        ${ctx.userId ?? null}
      )
      RETURNING
        id, tenant_id, name, financial_year,
        status, created_by, approved_by,
        created_at, updated_at
    `;
    return row;
  }

  async updatePlan(
    id: string,
    data: UpdatePlan,
    tx: TransactionSql
  ): Promise<HeadcountPlanRow | null> {
    const [row] = await tx<HeadcountPlanRow[]>`
      UPDATE headcount_plans
      SET
        name = COALESCE(${data.name ?? null}, name),
        financial_year = COALESCE(${data.financial_year ?? null}, financial_year),
        status = COALESCE(${data.status ? data.status + '' : null}::app.headcount_plan_status, status)
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, name, financial_year,
        status, created_by, approved_by,
        created_at, updated_at
    `;
    return row ?? null;
  }

  async approvePlan(
    id: string,
    approvedBy: string | undefined,
    tx: TransactionSql
  ): Promise<HeadcountPlanRow | null> {
    const [row] = await tx<HeadcountPlanRow[]>`
      UPDATE headcount_plans
      SET
        status = 'approved'::app.headcount_plan_status,
        approved_by = ${approvedBy ?? null}
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, name, financial_year,
        status, created_by, approved_by,
        created_at, updated_at
    `;
    return row ?? null;
  }

  async deletePlan(
    id: string,
    tx: TransactionSql
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM headcount_plans WHERE id = ${id}::uuid
    `;
    return result.count > 0;
  }

  async getPlanByIdTx(
    id: string,
    tx: TransactionSql
  ): Promise<HeadcountPlanRow | null> {
    const rows = await tx<HeadcountPlanRow[]>`
      SELECT
        id, tenant_id, name, financial_year,
        status, created_by, approved_by,
        created_at, updated_at
      FROM headcount_plans
      WHERE id = ${id}::uuid
    `;
    return rows[0] ?? null;
  }

  // ===========================================================================
  // Plan Item Operations
  // ===========================================================================

  async listPlanItems(
    ctx: TenantContext,
    planId: string,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<HeadcountPlanItemRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<HeadcountPlanItemRow[]>`
        SELECT
          hpi.id, hpi.tenant_id, hpi.plan_id, hpi.org_unit_id,
          hpi.position_id, hpi.job_id,
          hpi.current_headcount, hpi.planned_headcount, hpi.variance,
          hpi.justification, hpi.priority, hpi.status,
          hpi.target_fill_date, hpi.created_at,
          ou.name AS org_unit_name,
          p.title AS position_title
        FROM headcount_plan_items hpi
        JOIN org_units ou ON ou.id = hpi.org_unit_id AND ou.tenant_id = hpi.tenant_id
        LEFT JOIN positions p ON p.id = hpi.position_id AND p.tenant_id = hpi.tenant_id
        WHERE hpi.plan_id = ${planId}::uuid
          ${pagination.cursor ? tx`AND hpi.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY hpi.created_at DESC, hpi.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0 ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  async createPlanItem(
    ctx: TenantContext,
    planId: string,
    data: CreatePlanItem,
    tx: TransactionSql
  ): Promise<HeadcountPlanItemRow> {
    const [row] = await tx<HeadcountPlanItemRow[]>`
      INSERT INTO headcount_plan_items (
        tenant_id, plan_id, org_unit_id, position_id, job_id,
        current_headcount, planned_headcount,
        justification, priority, status, target_fill_date
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${planId}::uuid,
        ${data.org_unit_id}::uuid,
        ${data.position_id ?? null},
        ${data.job_id ?? null},
        ${data.current_headcount},
        ${data.planned_headcount},
        ${data.justification ?? null},
        ${data.priority ?? "medium"}::app.headcount_item_priority,
        ${data.status ?? "open"}::app.headcount_item_status,
        ${data.target_fill_date ?? null}
      )
      RETURNING
        id, tenant_id, plan_id, org_unit_id,
        position_id, job_id,
        current_headcount, planned_headcount, variance,
        justification, priority, status,
        target_fill_date, created_at
    `;
    return row;
  }

  async updatePlanItem(
    itemId: string,
    data: UpdatePlanItem,
    tx: TransactionSql
  ): Promise<HeadcountPlanItemRow | null> {
    const [row] = await tx<HeadcountPlanItemRow[]>`
      UPDATE headcount_plan_items
      SET
        current_headcount = COALESCE(${data.current_headcount ?? null}, current_headcount),
        planned_headcount = COALESCE(${data.planned_headcount ?? null}, planned_headcount),
        justification = CASE
          WHEN ${data.justification !== undefined} THEN ${data.justification ?? null}
          ELSE justification
        END,
        priority = COALESCE(${data.priority ? data.priority + '' : null}::app.headcount_item_priority, priority),
        status = COALESCE(${data.status ? data.status + '' : null}::app.headcount_item_status, status),
        target_fill_date = CASE
          WHEN ${data.target_fill_date !== undefined} THEN ${data.target_fill_date ?? null}::date
          ELSE target_fill_date
        END
      WHERE id = ${itemId}::uuid
      RETURNING
        id, tenant_id, plan_id, org_unit_id,
        position_id, job_id,
        current_headcount, planned_headcount, variance,
        justification, priority, status,
        target_fill_date, created_at
    `;
    return row ?? null;
  }

  async deletePlanItem(
    itemId: string,
    tx: TransactionSql
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM headcount_plan_items WHERE id = ${itemId}::uuid
    `;
    return result.count > 0;
  }
}
