/**
 * Assessments Service
 *
 * Business logic for assessment templates and candidate assessments.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { emitDomainEvent } from "../../lib/outbox";
import {
  withServiceErrorHandling,
  notFound,
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "../../lib/service-errors";
import {
  AssessmentRepository,
  type TenantContext,
  type AssessmentTemplate,
  type CandidateAssessment,
} from "./repository";

// =============================================================================
// Valid candidate assessment status transitions
// =============================================================================

const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
};

// =============================================================================
// Service
// =============================================================================

export class AssessmentService {
  private repository: AssessmentRepository;

  constructor(private db: DatabaseClient) {
    this.repository = new AssessmentRepository(db);
  }

  // ===========================================================================
  // Template Methods
  // ===========================================================================

  async listTemplates(
    ctx: TenantContext,
    options: {
      cursor?: string;
      limit?: number;
      type?: string;
      active?: string;
      search?: string;
    } = {}
  ) {
    return this.repository.listTemplates(ctx, options);
  }

  async getTemplate(ctx: TenantContext, id: string): Promise<ServiceResult<AssessmentTemplate>> {
    return withServiceErrorHandling("fetching assessment template", async () => {
      const template = await this.repository.getTemplateById(ctx, id);
      if (!template) return notFound("Assessment template");
      return serviceSuccess(template);
    });
  }

  async createTemplate(
    ctx: TenantContext,
    data: {
      name: string;
      type: string;
      description?: string;
      questions?: Record<string, unknown>[];
      scoringCriteria?: Record<string, unknown>;
      timeLimitMinutes?: number;
      passMark?: number;
    }
  ): Promise<ServiceResult<AssessmentTemplate>> {
    return withServiceErrorHandling("creating assessment template", async () => {
      const template = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
        const result = await this.repository.createTemplate(ctx, data);

        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "assessment_template",
          aggregateId: result.id,
          eventType: "recruitment.assessment_template.created",
          payload: { template: result },
          userId: ctx.userId,
        });

        return result;
      });

      return serviceSuccess(template);
    });
  }

  async updateTemplate(
    ctx: TenantContext,
    id: string,
    data: Partial<{
      name: string;
      type: string;
      description: string | null;
      questions: Record<string, unknown>[];
      scoringCriteria: Record<string, unknown> | null;
      timeLimitMinutes: number | null;
      passMark: number | null;
      active: boolean;
    }>
  ): Promise<ServiceResult<AssessmentTemplate>> {
    return withServiceErrorHandling("updating assessment template", async () => {
      const existing = await this.repository.getTemplateById(ctx, id);
      if (!existing) return notFound("Assessment template");

      const updated = await this.repository.updateTemplate(ctx, id, data);
      if (!updated) {
        return serviceFailure("UPDATE_FAILED", "Failed to update assessment template");
      }

      await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "assessment_template",
          aggregateId: updated.id,
          eventType: "recruitment.assessment_template.updated",
          payload: { oldTemplate: existing, template: updated, changes: data },
          userId: ctx.userId,
        });
      });

      return serviceSuccess(updated);
    });
  }

  // ===========================================================================
  // Candidate Assessment Methods
  // ===========================================================================

  async listCandidateAssessments(
    ctx: TenantContext,
    options: {
      cursor?: string;
      limit?: number;
      candidateId?: string;
      templateId?: string;
      status?: string;
      search?: string;
    } = {}
  ) {
    return this.repository.listCandidateAssessments(ctx, options);
  }

  async getCandidateAssessment(ctx: TenantContext, id: string): Promise<ServiceResult<CandidateAssessment>> {
    return withServiceErrorHandling("fetching candidate assessment", async () => {
      const assessment = await this.repository.getCandidateAssessmentById(ctx, id);
      if (!assessment) return notFound("Candidate assessment");
      return serviceSuccess(assessment);
    });
  }

  async scheduleCandidateAssessment(
    ctx: TenantContext,
    data: {
      candidateId: string;
      templateId: string;
      scheduledAt?: string;
    }
  ): Promise<ServiceResult<CandidateAssessment>> {
    // Verify template exists and is active
    const template = await this.repository.getTemplateById(ctx, data.templateId);
    if (!template) {
      return serviceFailure("TEMPLATE_NOT_FOUND", "Assessment template not found");
    }
    if (!template.active) {
      return serviceFailure("TEMPLATE_INACTIVE", "Assessment template is not active");
    }

    return withServiceErrorHandling("scheduling candidate assessment", async () => {
      const assessment = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
        const result = await this.repository.createCandidateAssessment(ctx, data);

        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "candidate_assessment",
          aggregateId: result.id,
          eventType: "recruitment.candidate_assessment.scheduled",
          payload: { assessment: result, templateName: template.name },
          userId: ctx.userId,
        });

        return result;
      });

      return serviceSuccess(assessment);
    }, {
      "23505": { code: "ALREADY_SCHEDULED", message: "This candidate already has a non-cancelled assessment with this template" },
    });
  }

  async recordAssessmentResult(
    ctx: TenantContext,
    id: string,
    data: {
      score: number;
      passed: boolean;
      feedback?: string;
      answers?: Record<string, unknown>;
    }
  ): Promise<ServiceResult<CandidateAssessment>> {
    return withServiceErrorHandling("recording assessment result", async () => {
      const existing = await this.repository.getCandidateAssessmentById(ctx, id);
      if (!existing) return notFound("Candidate assessment");

      if (existing.status !== "scheduled" && existing.status !== "in_progress") {
        return serviceFailure(
          "INVALID_TRANSITION",
          `Cannot record result for assessment in '${existing.status}' status`
        );
      }

      const updated = await this.repository.updateCandidateAssessmentStatus(ctx, id, "completed", {
        completedAt: new Date().toISOString(),
        score: data.score,
        passed: data.passed,
        answers: data.answers,
        assessorId: ctx.userId,
        feedback: data.feedback,
      });
      if (!updated) return notFound("Candidate assessment");

      await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "candidate_assessment",
          aggregateId: updated.id,
          eventType: "recruitment.candidate_assessment.completed",
          payload: {
            assessment: updated,
            score: data.score,
            passed: data.passed,
          },
          userId: ctx.userId,
        });
      });

      return serviceSuccess(updated);
    });
  }

  async cancelCandidateAssessment(ctx: TenantContext, id: string): Promise<ServiceResult<CandidateAssessment>> {
    return withServiceErrorHandling("cancelling candidate assessment", async () => {
      const existing = await this.repository.getCandidateAssessmentById(ctx, id);
      if (!existing) return notFound("Candidate assessment");

      const allowed = VALID_TRANSITIONS[existing.status];
      if (!allowed || !allowed.includes("cancelled")) {
        return serviceFailure(
          "INVALID_TRANSITION",
          `Cannot cancel assessment in '${existing.status}' status`
        );
      }

      const updated = await this.repository.updateCandidateAssessmentStatus(ctx, id, "cancelled");
      if (!updated) return notFound("Candidate assessment");

      await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "candidate_assessment",
          aggregateId: updated.id,
          eventType: "recruitment.candidate_assessment.cancelled",
          payload: { assessment: updated, fromStatus: existing.status },
          userId: ctx.userId,
        });
      });

      return serviceSuccess(updated);
    });
  }
}
