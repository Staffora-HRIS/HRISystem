/**
 * Flexible Benefits Fund - Service Layer
 *
 * Implements business logic for flex benefit fund allocation.
 * Enforces credit balance constraints, validates enrollment windows,
 * prevents duplicate allocations, and emits domain events via the outbox pattern.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  FlexFundRepository,
  FlexFundRow,
  FlexAllocationRow,
  FlexBenefitOptionRow,
} from "./flex-fund.repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  FlexFundResponse,
  FlexAllocationResponse,
  FlexBenefitOption,
} from "./flex-fund.schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type FlexFundEventType =
  | "benefits.flex_fund.created"
  | "benefits.flex_fund.allocation.created"
  | "benefits.flex_fund.allocation.confirmed"
  | "benefits.flex_fund.allocation.cancelled";

// =============================================================================
// Flex Fund Service
// =============================================================================

export class FlexFundService {
  constructor(
    private repository: FlexFundRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateId: string,
    eventType: FlexFundEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        'flex_benefit_fund',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Fund Operations
  // ===========================================================================

  async getEmployeeFund(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<FlexFundResponse>> {
    const fund = await this.repository.findCurrentFund(context, employeeId);

    if (!fund) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "No active flex benefit fund found for this employee",
          details: { employeeId },
        },
      };
    }

    const allocations = await this.repository.findAllocationsByFund(context, fund.id);

    return {
      success: true,
      data: this.mapFundToResponse(fund, allocations),
    };
  }

  async createFund(
    context: TenantContext,
    data: {
      employeeId: string;
      annualCredits: number;
      periodStart: string;
      periodEnd: string;
    }
  ): Promise<ServiceResult<FlexFundResponse>> {
    if (data.periodEnd <= data.periodStart) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Period end must be after period start",
          details: { periodStart: data.periodStart, periodEnd: data.periodEnd },
        },
      };
    }

    const hasOverlap = await this.repository.hasOverlappingFund(
      context,
      data.employeeId,
      data.periodStart,
      data.periodEnd
    );

    if (hasOverlap) {
      return {
        success: false,
        error: {
          code: "EFFECTIVE_DATE_OVERLAP",
          message: "An existing flex benefit fund overlaps with this period",
          details: {
            employeeId: data.employeeId,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
          },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const fund = await this.repository.createFund(tx, context, data);

      await this.emitEvent(
        tx,
        context,
        fund.id,
        "benefits.flex_fund.created",
        {
          fundId: fund.id,
          employeeId: data.employeeId,
          annualCredits: data.annualCredits,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
        }
      );

      return fund;
    });

    return {
      success: true,
      data: this.mapFundToResponse(result, []),
    };
  }

  // ===========================================================================
  // Allocation Operations
  // ===========================================================================

  async allocateCredits(
    context: TenantContext,
    employeeId: string,
    data: {
      benefitPlanId: string;
      creditsAllocated: number;
    }
  ): Promise<ServiceResult<FlexAllocationResponse>> {
    const fund = await this.repository.findCurrentFund(context, employeeId);
    if (!fund) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "No active flex benefit fund found for this employee",
          details: { employeeId },
        },
      };
    }

    const options = await this.repository.findFlexEligiblePlans(context);
    const targetPlan = options.find((o) => o.planId === data.benefitPlanId);
    if (!targetPlan) {
      return {
        success: false,
        error: {
          code: "PLAN_NOT_ELIGIBLE",
          message: "This benefit plan is not eligible for flex-fund allocation (no credit cost set or inactive)",
          details: { benefitPlanId: data.benefitPlanId },
        },
      };
    }

    const planCreditCost = parseFloat(targetPlan.creditCost);
    if (data.creditsAllocated < planCreditCost) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Allocation must be at least the plan credit cost of ${planCreditCost}`,
          details: {
            benefitPlanId: data.benefitPlanId,
            planCreditCost,
            requestedCredits: data.creditsAllocated,
          },
        },
      };
    }

    const remaining = parseFloat(fund.remainingCredits);
    if (data.creditsAllocated > remaining) {
      return {
        success: false,
        error: {
          code: "INSUFFICIENT_LEAVE_BALANCE",
          message: "Insufficient flex credits to make this allocation",
          details: {
            requested: data.creditsAllocated,
            remaining,
            fundId: fund.id,
          },
        },
      };
    }

    const hasDuplicate = await this.repository.hasActiveAllocationForPlan(
      context,
      fund.id,
      data.benefitPlanId
    );
    if (hasDuplicate) {
      return {
        success: false,
        error: {
          code: "CONFLICT",
          message: "An active allocation already exists for this benefit plan in the current fund period",
          details: {
            fundId: fund.id,
            benefitPlanId: data.benefitPlanId,
          },
        },
      };
    }

    const today = new Date().toISOString().split("T")[0]!;
    const periodStart = fund.periodStart instanceof Date
      ? fund.periodStart.toISOString().split("T")[0]!
      : String(fund.periodStart);
    const periodEnd = fund.periodEnd instanceof Date
      ? fund.periodEnd.toISOString().split("T")[0]!
      : String(fund.periodEnd);

    if (today < periodStart || today > periodEnd) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Allocation is not permitted outside the fund period window",
          details: { today, periodStart, periodEnd },
        },
      };
    }

    try {
      const result = await this.db.withTransaction(context, async (tx) => {
        const allocation = await this.repository.createAllocation(tx, context, {
          fundId: fund.id,
          benefitPlanId: data.benefitPlanId,
          creditsAllocated: data.creditsAllocated,
        });

        await this.emitEvent(
          tx,
          context,
          fund.id,
          "benefits.flex_fund.allocation.created",
          {
            allocationId: allocation.id,
            fundId: fund.id,
            employeeId,
            benefitPlanId: data.benefitPlanId,
            creditsAllocated: data.creditsAllocated,
          }
        );

        return allocation;
      });

      return {
        success: true,
        data: this.mapAllocationToResponse(result),
      };
    } catch (err: any) {
      if (err.message === "INSUFFICIENT_CREDITS") {
        return {
          success: false,
          error: {
            code: "INSUFFICIENT_LEAVE_BALANCE",
            message: "Insufficient flex credits to make this allocation (race condition resolved)",
            details: {
              requested: data.creditsAllocated,
              fundId: fund.id,
            },
          },
        };
      }
      throw err;
    }
  }

  async cancelAllocation(
    context: TenantContext,
    allocationId: string,
    reason?: string
  ): Promise<ServiceResult<FlexAllocationResponse>> {
    const existing = await this.repository.findAllocationById(context, allocationId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Allocation not found",
          details: { allocationId },
        },
      };
    }

    if (existing.status === "cancelled") {
      return {
        success: false,
        error: {
          code: "STATE_MACHINE_VIOLATION",
          message: "Allocation is already cancelled",
          details: { allocationId, currentStatus: existing.status },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const allocation = await this.repository.cancelAllocation(
        tx,
        context,
        allocationId,
        reason
      );

      if (allocation) {
        await this.emitEvent(
          tx,
          context,
          existing.fundId,
          "benefits.flex_fund.allocation.cancelled",
          {
            allocationId,
            fundId: existing.fundId,
            creditsReleased: parseFloat(existing.creditsAllocated),
            reason,
          }
        );
      }

      return allocation;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Allocation not found during cancellation",
          details: { allocationId },
        },
      };
    }

    return {
      success: true,
      data: this.mapAllocationToResponse(result),
    };
  }

  // ===========================================================================
  // Flex Options
  // ===========================================================================

  async listFlexOptions(
    context: TenantContext
  ): Promise<ServiceResult<FlexBenefitOption[]>> {
    const options = await this.repository.findFlexEligiblePlans(context);

    return {
      success: true,
      data: options.map(this.mapOptionToResponse),
    };
  }

  // ===========================================================================
  // Mapping Helpers
  // ===========================================================================

  private mapFundToResponse(
    row: FlexFundRow,
    allocations: FlexAllocationRow[]
  ): FlexFundResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      annual_credits: parseFloat(row.annualCredits),
      used_credits: parseFloat(row.usedCredits),
      remaining_credits: parseFloat(row.remainingCredits),
      period_start: row.periodStart instanceof Date
        ? row.periodStart.toISOString().split("T")[0]!
        : String(row.periodStart),
      period_end: row.periodEnd instanceof Date
        ? row.periodEnd.toISOString().split("T")[0]!
        : String(row.periodEnd),
      allocations: allocations.map((a) => ({
        id: a.id,
        benefit_plan_id: a.benefitPlanId,
        benefit_plan_name: a.benefitPlanName || null,
        credits_allocated: parseFloat(a.creditsAllocated),
        status: a.status,
        created_at: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
        confirmed_at: a.confirmedAt instanceof Date ? a.confirmedAt.toISOString() : null,
      })),
      created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }

  private mapAllocationToResponse(row: FlexAllocationRow): FlexAllocationResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      fund_id: row.fundId,
      benefit_plan_id: row.benefitPlanId,
      benefit_plan_name: row.benefitPlanName || null,
      credits_allocated: parseFloat(row.creditsAllocated),
      status: row.status,
      created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
      confirmed_at: row.confirmedAt instanceof Date ? row.confirmedAt.toISOString() : null,
      cancelled_at: row.cancelledAt instanceof Date ? row.cancelledAt.toISOString() : null,
      cancelled_reason: row.cancelledReason || null,
    };
  }

  private mapOptionToResponse(row: FlexBenefitOptionRow): FlexBenefitOption {
    return {
      plan_id: row.planId,
      plan_name: row.planName,
      category: row.category,
      description: row.description,
      credit_cost: parseFloat(row.creditCost),
      is_active: row.isActive,
    };
  }
}
