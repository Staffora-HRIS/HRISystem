/**
 * Recruitment Service
 *
 * Business logic for recruitment operations
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { RecruitmentRepository, type TenantContext, type Requisition, type Candidate } from "./repository";

// =============================================================================
// Service
// =============================================================================

export class RecruitmentService {
  private repository: RecruitmentRepository;

  constructor(private db: DatabaseClient) {
    this.repository = new RecruitmentRepository(db);
  }

  // ===========================================================================
  // Requisition Methods
  // ===========================================================================

  async listRequisitions(
    ctx: TenantContext,
    options: {
      cursor?: string;
      limit?: number;
      status?: string;
      hiringManagerId?: string;
      orgUnitId?: string;
      search?: string;
    } = {}
  ) {
    return this.repository.listRequisitions(ctx, options);
  }

  async getRequisition(ctx: TenantContext, id: string): Promise<Requisition | null> {
    return this.repository.getRequisitionById(ctx, id);
  }

  async createRequisition(
    ctx: TenantContext,
    data: {
      title: string;
      positionId?: string;
      orgUnitId?: string;
      hiringManagerId?: string;
      employmentType?: string;
      openings?: number;
      priority?: number;
      jobDescription?: string;
      requirements?: Record<string, unknown>;
      targetStartDate?: string;
      deadline?: string;
      location?: string;
    }
  ): Promise<Requisition> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const requisition = await this.repository.createRequisition(ctx, data);

      // Emit domain event atomically within the same transaction
      await this.emitDomainEvent(tx, ctx, "recruitment.requisition.created", "requisition", requisition.id, {
        requisition,
      });

      return requisition;
    });
  }

  async updateRequisition(
    ctx: TenantContext,
    id: string,
    data: Partial<{
      title: string;
      positionId: string | null;
      orgUnitId: string | null;
      hiringManagerId: string | null;
      employmentType: string | null;
      openings: number;
      priority: number;
      jobDescription: string | null;
      requirements: Record<string, unknown> | null;
      targetStartDate: string | null;
      deadline: string | null;
      location: string | null;
      status: string;
    }>
  ): Promise<Requisition | null> {
    const oldRequisition = await this.repository.getRequisitionById(ctx, id);
    if (!oldRequisition) return null;

    const requisition = await this.repository.updateRequisition(ctx, id, data);
    if (!requisition) return null;

    // Emit domain events atomically within the same transaction
    await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      await this.emitDomainEvent(tx, ctx, "recruitment.requisition.updated", "requisition", requisition.id, {
        oldRequisition,
        requisition,
        changes: data,
      });

      // Emit status change event if status changed
      if (data.status && oldRequisition.status !== data.status) {
        await this.emitDomainEvent(tx, ctx, "recruitment.requisition.status_changed", "requisition", requisition.id, {
          requisition,
          fromStatus: oldRequisition.status,
          toStatus: data.status,
        });
      }
    });

    return requisition;
  }

  async openRequisition(ctx: TenantContext, id: string): Promise<Requisition | null> {
    return this.updateRequisition(ctx, id, { status: "open" });
  }

  async closeRequisition(ctx: TenantContext, id: string): Promise<Requisition | null> {
    return this.updateRequisition(ctx, id, { status: "filled" });
  }

  async cancelRequisition(ctx: TenantContext, id: string): Promise<Requisition | null> {
    return this.updateRequisition(ctx, id, { status: "cancelled" });
  }

  async getRequisitionStats(ctx: TenantContext) {
    return this.repository.getRequisitionStats(ctx);
  }

  // ===========================================================================
  // Candidate Methods
  // ===========================================================================

  async listCandidates(
    ctx: TenantContext,
    options: {
      cursor?: string;
      limit?: number;
      requisitionId?: string;
      stage?: string;
      source?: string;
      search?: string;
    } = {}
  ) {
    return this.repository.listCandidates(ctx, options);
  }

  async getCandidate(ctx: TenantContext, id: string): Promise<Candidate | null> {
    return this.repository.getCandidateById(ctx, id);
  }

  async createCandidate(
    ctx: TenantContext,
    data: {
      requisitionId: string;
      email: string;
      firstName: string;
      lastName: string;
      phone?: string;
      source?: string;
      resumeUrl?: string;
      linkedinUrl?: string;
      rating?: number;
      notes?: Record<string, unknown>;
    }
  ): Promise<Candidate> {
    // Verify requisition exists and is open
    const requisition = await this.repository.getRequisitionById(ctx, data.requisitionId);
    if (!requisition) {
      throw new Error("Requisition not found");
    }
    if (requisition.status !== "open") {
      throw new Error("Requisition is not open for applications");
    }

    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const candidate = await this.repository.createCandidate(ctx, data);

      // Emit domain event atomically within the same transaction
      await this.emitDomainEvent(tx, ctx, "recruitment.candidate.created", "candidate", candidate.id, {
        candidate,
        requisitionId: data.requisitionId,
      });

      return candidate;
    });
  }

  async updateCandidate(
    ctx: TenantContext,
    id: string,
    data: Partial<{
      email: string;
      firstName: string;
      lastName: string;
      phone: string | null;
      source: string;
      resumeUrl: string | null;
      linkedinUrl: string | null;
      rating: number | null;
      currentStage: string;
      notes: Record<string, unknown> | null;
    }>
  ): Promise<Candidate | null> {
    const oldCandidate = await this.repository.getCandidateById(ctx, id);
    if (!oldCandidate) return null;

    const candidate = await this.repository.updateCandidate(ctx, id, data);
    if (!candidate) return null;

    // Emit domain event atomically within the same transaction
    await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      await this.emitDomainEvent(tx, ctx, "recruitment.candidate.updated", "candidate", candidate.id, {
        oldCandidate,
        candidate,
        changes: data,
      });
    });

    return candidate;
  }

  async advanceCandidateStage(
    ctx: TenantContext,
    candidateId: string,
    newStage: string,
    reason?: string
  ): Promise<Candidate | null> {
    const oldCandidate = await this.repository.getCandidateById(ctx, candidateId);
    if (!oldCandidate) return null;

    await this.repository.advanceCandidateStage(ctx, candidateId, newStage, reason);

    const candidate = await this.repository.getCandidateById(ctx, candidateId);
    if (!candidate) return null;

    // Emit domain events atomically within the same transaction
    await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      await this.emitDomainEvent(tx, ctx, "recruitment.candidate.stage_changed", "candidate", candidate.id, {
        candidate,
        fromStage: oldCandidate.current_stage,
        toStage: newStage,
        reason,
      });

      // Handle special stage transitions
      if (newStage === "hired") {
        await this.emitDomainEvent(tx, ctx, "recruitment.candidate.hired", "candidate", candidate.id, {
          candidate,
        });
      } else if (newStage === "rejected") {
        await this.emitDomainEvent(tx, ctx, "recruitment.candidate.rejected", "candidate", candidate.id, {
          candidate,
          reason,
        });
      }
    });

    return candidate;
  }

  async getRequisitionPipeline(ctx: TenantContext, requisitionId: string) {
    return this.repository.getRequisitionPipeline(ctx, requisitionId);
  }

  async getCandidateStats(ctx: TenantContext) {
    return this.repository.getCandidateStats(ctx);
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private async emitDomainEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at
      ) VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        ${aggregateType},
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: ctx.userId })}::jsonb,
        now()
      )
    `;
  }
}
