/**
 * Headcount Planning Module - Service Layer
 *
 * Business logic for headcount plan management.
 * Enforces state machine transitions for plan statuses.
 * Emits domain events via the outbox pattern for all mutations.
 */

import type { DatabaseClient } from "../../plugins/db";
import {
  HeadcountPlanningRepository,
  type HeadcountPlanRow,
  type HeadcountPlanItemRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { emitDomainEvent } from "../../lib/outbox";
import type {
  CreatePlan,
  UpdatePlan,
  CreatePlanItem,
  UpdatePlanItem,
  PlanFilters,
  PlanResponse,
  PlanItemResponse,
  HeadcountPlanStatus,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// State Machine
// =============================================================================

const VALID_TRANSITIONS: Record<HeadcountPlanStatus, HeadcountPlanStatus[]> = {
  draft: ["active", "closed"],
  active: ["approved", "closed"],
  approved: ["closed"],
  closed: [],
};

// =============================================================================
// Mappers
// =============================================================================

function formatDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d);
}

function mapPlanToResponse(row: HeadcountPlanRow): PlanResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    name: row.name,
    financial_year: row.financialYear,
    status: row.status as HeadcountPlanStatus,
    created_by: row.createdBy,
    approved_by: row.approvedBy,
    total_current: row.totalCurrent,
    total_planned: row.totalPlanned,
    total_variance: row.totalVariance,
    items_count: row.itemsCount,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function mapItemToResponse(row: HeadcountPlanItemRow): PlanItemResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    plan_id: row.planId,
    org_unit_id: row.orgUnitId,
    org_unit_name: row.orgUnitName,
    position_id: row.positionId,
    position_title: row.positionTitle,
    job_id: row.jobId,
    current_headcount: row.currentHeadcount,
    planned_headcount: row.plannedHeadcount,
    variance: row.variance,
    justification: row.justification,
    priority: row.priority as PlanItemResponse["priority"],
    status: row.status as PlanItemResponse["status"],
    target_fill_date: formatDate(row.targetFillDate),
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

// =============================================================================
// Service
// =============================================================================

export class HeadcountPlanningService {
  constructor(
    private repository: HeadcountPlanningRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Plan Operations
  // ===========================================================================

  async listPlans(
    ctx: TenantContext,
    filters: PlanFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<PlanResponse>> {
    const result = await this.repository.listPlans(ctx, filters, pagination);
    return {
      items: result.items.map(mapPlanToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getPlan(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<PlanResponse>> {
    const plan = await this.repository.getPlanById(ctx, id);
    if (!plan) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Headcount plan not found",
          details: { id },
        },
      };
    }
    return { success: true, data: mapPlanToResponse(plan) };
  }

  async createPlan(
    ctx: TenantContext,
    data: CreatePlan
  ): Promise<ServiceResult<PlanResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const plan = await this.repository.createPlan(ctx, data, tx);

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "headcount_plan",
        aggregateId: plan.id,
        eventType: "headcount.plan.created",
        payload: { plan: mapPlanToResponse(plan) },
        userId: ctx.userId,
      });

      return { success: true, data: mapPlanToResponse(plan) };
    });
  }

  async updatePlan(
    ctx: TenantContext,
    id: string,
    data: UpdatePlan
  ): Promise<ServiceResult<PlanResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getPlanByIdTx(id, tx);
      if (!existing) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Headcount plan not found",
            details: { id },
          },
        };
      }

      // Validate status transition if status is being changed
      if (data.status && data.status !== existing.status) {
        const currentStatus = existing.status as HeadcountPlanStatus;
        const allowed = VALID_TRANSITIONS[currentStatus] || [];
        if (!allowed.includes(data.status)) {
          return {
            success: false as const,
            error: {
              code: ErrorCodes.STATE_MACHINE_VIOLATION,
              message: `Cannot transition plan from '${currentStatus}' to '${data.status}'`,
              details: { currentStatus, requestedStatus: data.status, allowedTransitions: allowed },
            },
          };
        }
      }

      const updated = await this.repository.updatePlan(id, data, tx);
      if (!updated) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Failed to update headcount plan" },
        };
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "headcount_plan",
        aggregateId: id,
        eventType: "headcount.plan.updated",
        payload: { plan: mapPlanToResponse(updated), changes: data },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapPlanToResponse(updated) };
    });
  }

  async approvePlan(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<PlanResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getPlanByIdTx(id, tx);
      if (!existing) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Headcount plan not found", details: { id } },
        };
      }

      const currentStatus = existing.status as HeadcountPlanStatus;
      if (currentStatus !== "active") {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot approve plan in '${currentStatus}' status. Plan must be 'active' to approve.`,
            details: { currentStatus, requiredStatus: "active" },
          },
        };
      }

      const updated = await this.repository.approvePlan(id, ctx.userId, tx);
      if (!updated) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Failed to approve headcount plan" },
        };
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "headcount_plan",
        aggregateId: id,
        eventType: "headcount.plan.approved",
        payload: { plan: mapPlanToResponse(updated) },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapPlanToResponse(updated) };
    });
  }

  async deletePlan(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getPlanByIdTx(id, tx);
      if (!existing) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Headcount plan not found", details: { id } },
        };
      }

      if (existing.status === "approved") {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: "Cannot delete an approved plan. Close it first.",
            details: { status: existing.status },
          },
        };
      }

      const deleted = await this.repository.deletePlan(id, tx);

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "headcount_plan",
        aggregateId: id,
        eventType: "headcount.plan.deleted",
        payload: { planId: id },
        userId: ctx.userId,
      });

      return { success: true as const, data: { deleted } };
    });
  }

  // ===========================================================================
  // Plan Item Operations
  // ===========================================================================

  async listPlanItems(
    ctx: TenantContext,
    planId: string,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<PlanItemResponse>> {
    const result = await this.repository.listPlanItems(ctx, planId, pagination);
    return {
      items: result.items.map(mapItemToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async createPlanItem(
    ctx: TenantContext,
    planId: string,
    data: CreatePlanItem
  ): Promise<ServiceResult<PlanItemResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      // Verify plan exists and is editable
      const plan = await this.repository.getPlanByIdTx(planId, tx);
      if (!plan) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Headcount plan not found", details: { planId } },
        };
      }

      if (plan.status === "closed" || plan.status === "approved") {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot add items to a plan in '${plan.status}' status`,
            details: { status: plan.status },
          },
        };
      }

      const item = await this.repository.createPlanItem(ctx, planId, data, tx);

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "headcount_plan_item",
        aggregateId: item.id,
        eventType: "headcount.plan_item.created",
        payload: { item: mapItemToResponse(item), planId },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapItemToResponse(item) };
    });
  }

  async updatePlanItem(
    ctx: TenantContext,
    planId: string,
    itemId: string,
    data: UpdatePlanItem
  ): Promise<ServiceResult<PlanItemResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const plan = await this.repository.getPlanByIdTx(planId, tx);
      if (!plan) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Headcount plan not found", details: { planId } },
        };
      }

      if (plan.status === "closed") {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: "Cannot update items in a closed plan",
            details: { status: plan.status },
          },
        };
      }

      const updated = await this.repository.updatePlanItem(itemId, data, tx);
      if (!updated) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Plan item not found", details: { itemId } },
        };
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "headcount_plan_item",
        aggregateId: itemId,
        eventType: "headcount.plan_item.updated",
        payload: { item: mapItemToResponse(updated), planId, changes: data },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapItemToResponse(updated) };
    });
  }

  async deletePlanItem(
    ctx: TenantContext,
    planId: string,
    itemId: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const plan = await this.repository.getPlanByIdTx(planId, tx);
      if (!plan) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Headcount plan not found", details: { planId } },
        };
      }

      if (plan.status === "closed" || plan.status === "approved") {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot delete items from a plan in '${plan.status}' status`,
            details: { status: plan.status },
          },
        };
      }

      const deleted = await this.repository.deletePlanItem(itemId, tx);
      if (!deleted) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Plan item not found", details: { itemId } },
        };
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "headcount_plan_item",
        aggregateId: itemId,
        eventType: "headcount.plan_item.deleted",
        payload: { itemId, planId },
        userId: ctx.userId,
      });

      return { success: true as const, data: { deleted } };
    });
  }
}
