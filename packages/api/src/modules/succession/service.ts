/**
 * Succession Planning Module - Service Layer
 *
 * Implements business logic for succession planning operations.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  SuccessionRepository,
  TenantContext,
  SuccessionPlanRow,
  CandidateRow,
} from "./repository";
import type {
  CreateSuccessionPlan,
  UpdateSuccessionPlan,
  CreateCandidate,
  UpdateCandidate,
  PlanFilters,
  SuccessionPlanResponse,
  CandidateResponse,
  SuccessionGapResponse,
  SuccessionPipelineResponse,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedServiceResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

type DomainEventType =
  | "succession.plan.created"
  | "succession.plan.updated"
  | "succession.plan.deleted"
  | "succession.candidate.added"
  | "succession.candidate.updated"
  | "succession.candidate.removed";

// =============================================================================
// Service
// =============================================================================

export class SuccessionService {
  constructor(
    private repository: SuccessionRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateType: string,
    aggregateId: string,
    eventType: DomainEventType,
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
        ${aggregateType},
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Plan Methods
  // ===========================================================================

  async listPlans(
    context: TenantContext,
    filters: PlanFilters = {},
    pagination: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedServiceResult<SuccessionPlanResponse>> {
    const result = await this.repository.findPlans(context, filters, pagination);

    return {
      items: result.items.map(this.mapPlanToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getPlan(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<SuccessionPlanResponse>> {
    const plan = await this.repository.findPlanById(context, id);

    if (!plan) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Succession plan not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapPlanToResponse(plan),
    };
  }

  async createPlan(
    context: TenantContext,
    data: CreateSuccessionPlan
  ): Promise<ServiceResult<SuccessionPlanResponse>> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const plan = await this.repository.createPlan(tx, context, data);

      await this.emitEvent(
        tx,
        context,
        "succession_plan",
        plan.id,
        "succession.plan.created",
        { planId: plan.id, positionId: data.position_id }
      );

      return plan;
    });

    // Fetch full plan with relations
    const fullPlan = await this.repository.findPlanById(context, result.id);

    return {
      success: true,
      data: this.mapPlanToResponse(fullPlan!),
    };
  }

  async updatePlan(
    context: TenantContext,
    id: string,
    data: UpdateSuccessionPlan
  ): Promise<ServiceResult<SuccessionPlanResponse>> {
    const existing = await this.repository.findPlanById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Succession plan not found",
          details: { id },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.updatePlan(tx, context, id, data);

      await this.emitEvent(
        tx,
        context,
        "succession_plan",
        id,
        "succession.plan.updated",
        { changes: data }
      );
    });

    const updated = await this.repository.findPlanById(context, id);

    return {
      success: true,
      data: this.mapPlanToResponse(updated!),
    };
  }

  async deletePlan(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    const existing = await this.repository.findPlanById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Succession plan not found",
          details: { id },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.deletePlan(tx, context, id);

      await this.emitEvent(
        tx,
        context,
        "succession_plan",
        id,
        "succession.plan.deleted",
        { planId: id }
      );
    });

    return { success: true };
  }

  // ===========================================================================
  // Candidate Methods
  // ===========================================================================

  async listCandidates(
    context: TenantContext,
    planId: string
  ): Promise<ServiceResult<CandidateResponse[]>> {
    const plan = await this.repository.findPlanById(context, planId);
    if (!plan) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Succession plan not found",
          details: { planId },
        },
      };
    }

    const candidates = await this.repository.findCandidates(context, planId);

    return {
      success: true,
      data: candidates.map(this.mapCandidateToResponse),
    };
  }

  async getCandidate(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<CandidateResponse>> {
    const candidate = await this.repository.findCandidateById(context, id);

    if (!candidate) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Candidate not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapCandidateToResponse(candidate),
    };
  }

  async addCandidate(
    context: TenantContext,
    data: CreateCandidate
  ): Promise<ServiceResult<CandidateResponse>> {
    const plan = await this.repository.findPlanById(context, data.plan_id);
    if (!plan) {
      return {
        success: false,
        error: {
          code: "PLAN_NOT_FOUND",
          message: "Succession plan not found",
          details: { planId: data.plan_id },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const candidate = await this.repository.createCandidate(tx, context, data);

      await this.emitEvent(
        tx,
        context,
        "succession_candidate",
        candidate.id,
        "succession.candidate.added",
        { planId: data.plan_id, employeeId: data.employee_id }
      );

      return candidate;
    });

    // Fetch full candidate with relations
    const fullCandidate = await this.repository.findCandidateById(context, result.id);

    return {
      success: true,
      data: this.mapCandidateToResponse(fullCandidate!),
    };
  }

  async updateCandidate(
    context: TenantContext,
    id: string,
    data: UpdateCandidate
  ): Promise<ServiceResult<CandidateResponse>> {
    const existing = await this.repository.findCandidateById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Candidate not found",
          details: { id },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.updateCandidate(tx, context, id, data);

      await this.emitEvent(
        tx,
        context,
        "succession_candidate",
        id,
        "succession.candidate.updated",
        { changes: data }
      );
    });

    const updated = await this.repository.findCandidateById(context, id);

    return {
      success: true,
      data: this.mapCandidateToResponse(updated!),
    };
  }

  async removeCandidate(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    const existing = await this.repository.findCandidateById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Candidate not found",
          details: { id },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.deleteCandidate(tx, context, id);

      await this.emitEvent(
        tx,
        context,
        "succession_candidate",
        id,
        "succession.candidate.removed",
        { candidateId: id, planId: existing.planId }
      );
    });

    return { success: true };
  }

  // ===========================================================================
  // Pipeline & Gap Analysis
  // ===========================================================================

  async getPipeline(
    context: TenantContext
  ): Promise<ServiceResult<SuccessionPipelineResponse[]>> {
    const pipeline = await this.repository.getPipeline(context);

    return {
      success: true,
      data: pipeline.map((row) => ({
        position_id: row.position_id,
        position_title: row.position_title,
        org_unit_name: row.org_unit_name,
        is_critical: row.is_critical,
        risk_level: row.risk_level,
        incumbent_name: row.incumbent_name,
        candidate_count: Number(row.candidate_count),
        ready_now_count: Number(row.ready_now_count),
        ready_1_year_count: Number(row.ready_1_year_count),
      })),
    };
  }

  async getGaps(
    context: TenantContext
  ): Promise<ServiceResult<SuccessionGapResponse[]>> {
    const gaps = await this.repository.getGaps(context);

    return {
      success: true,
      data: gaps.map((row) => ({
        position_id: row.position_id,
        position_title: row.position_title,
        org_unit_name: row.org_unit_name,
        risk_level: row.risk_level,
        gap_severity: row.gap_severity,
        candidate_count: 0,
        ready_now_count: 0,
      })),
    };
  }

  // ===========================================================================
  // Mapping Helpers
  // ===========================================================================

  private mapPlanToResponse(row: SuccessionPlanRow): SuccessionPlanResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      position_id: row.positionId,
      position_title: row.positionTitle ?? "",
      org_unit_id: row.orgUnitId ?? undefined,
      org_unit_name: row.orgUnitName ?? undefined,
      incumbent_id: row.incumbentId ?? undefined,
      incumbent_name: row.incumbentName ?? undefined,
      is_critical_role: row.isCriticalRole,
      criticality_reason: row.criticalityReason ?? undefined,
      risk_level: row.riskLevel,
      incumbent_retirement_risk: row.incumbentRetirementRisk,
      incumbent_flight_risk: row.incumbentFlightRisk,
      market_scarcity: row.marketScarcity,
      notes: row.notes ?? undefined,
      candidate_count: row.candidateCount ?? 0,
      ready_now_count: row.readyNowCount ?? 0,
      last_reviewed_at: row.lastReviewedAt?.toISOString() ?? undefined,
      next_review_date: row.nextReviewDate?.toISOString().split("T")[0] ?? undefined,
      is_active: row.isActive,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private mapCandidateToResponse(row: CandidateRow): CandidateResponse {
    return {
      id: row.id,
      plan_id: row.planId,
      employee_id: row.employeeId,
      employee_name: row.employeeName ?? "",
      current_position: row.currentPosition ?? undefined,
      current_department: row.currentDepartment ?? undefined,
      readiness: row.readiness,
      ranking: row.ranking,
      assessment_notes: row.assessmentNotes ?? undefined,
      strengths: row.strengths ?? [],
      development_areas: row.developmentAreas ?? [],
      is_active: row.isActive,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
