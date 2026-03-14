/**
 * Assessments Repository
 *
 * Database operations for assessment templates and candidate assessments
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface AssessmentTemplate {
  id: string;
  tenant_id: string;
  name: string;
  type: "skills_test" | "psychometric" | "technical" | "situational" | "presentation";
  description: string | null;
  questions: Record<string, unknown>[];
  scoring_criteria: Record<string, unknown>;
  time_limit_minutes: number | null;
  pass_mark: number | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CandidateAssessment {
  id: string;
  tenant_id: string;
  candidate_id: string;
  template_id: string;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  score: number | null;
  passed: boolean | null;
  answers: Record<string, unknown> | null;
  assessor_id: string | null;
  feedback: string | null;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
  // Joined fields
  template_name?: string;
  template_type?: string;
  candidate_name?: string;
}

// =============================================================================
// Assessments Repository
// =============================================================================

export class AssessmentRepository {
  constructor(private db: DatabaseClient) {}

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
  ): Promise<{ items: AssessmentTemplate[]; nextCursor: string | null; hasMore: boolean }> {
    const { cursor, limit = 20, type, active, search } = options;
    const activeFilter = active === "true" ? true : active === "false" ? false : undefined;

    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<AssessmentTemplate[]>`
          SELECT
            id, tenant_id, name, type, description,
            questions, scoring_criteria,
            time_limit_minutes, pass_mark, active,
            created_by, created_at, updated_at
          FROM app.assessment_templates
          WHERE tenant_id = ${ctx.tenantId}::uuid
          ${type ? tx`AND type = ${type}::app.assessment_type` : tx``}
          ${activeFilter !== undefined ? tx`AND active = ${activeFilter}` : tx``}
          ${search ? tx`AND (name ILIKE ${"%" + search + "%"} OR description ILIKE ${"%" + search + "%"})` : tx``}
          ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
          ORDER BY created_at DESC, id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getTemplateById(ctx: TenantContext, id: string): Promise<AssessmentTemplate | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<AssessmentTemplate[]>`
        SELECT
          id, tenant_id, name, type, description,
          questions, scoring_criteria,
          time_limit_minutes, pass_mark, active,
          created_by, created_at, updated_at
        FROM app.assessment_templates
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
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
  ): Promise<AssessmentTemplate> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<AssessmentTemplate[]>`
        INSERT INTO app.assessment_templates (
          tenant_id, name, type, description,
          questions, scoring_criteria,
          time_limit_minutes, pass_mark, created_by
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${data.name},
          ${data.type}::app.assessment_type,
          ${data.description || null},
          ${JSON.stringify(data.questions || [])}::jsonb,
          ${JSON.stringify(data.scoringCriteria || {})}::jsonb,
          ${data.timeLimitMinutes || null},
          ${data.passMark || null},
          ${ctx.userId || null}::uuid
        )
        RETURNING id, tenant_id, name, type, description,
          questions, scoring_criteria,
          time_limit_minutes, pass_mark, active,
          created_by, created_at, updated_at
      `;
    });
    return rows[0];
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
  ): Promise<AssessmentTemplate | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<AssessmentTemplate[]>`
        UPDATE app.assessment_templates SET
          name = COALESCE(${data.name}, name),
          type = COALESCE(${data.type}::app.assessment_type, type),
          description = COALESCE(${data.description}, description),
          questions = COALESCE(${data.questions ? JSON.stringify(data.questions) : null}::jsonb, questions),
          scoring_criteria = COALESCE(${data.scoringCriteria ? JSON.stringify(data.scoringCriteria) : null}::jsonb, scoring_criteria),
          time_limit_minutes = COALESCE(${data.timeLimitMinutes}, time_limit_minutes),
          pass_mark = COALESCE(${data.passMark}, pass_mark),
          active = COALESCE(${data.active}, active),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING id, tenant_id, name, type, description,
          questions, scoring_criteria,
          time_limit_minutes, pass_mark, active,
          created_by, created_at, updated_at
      `;
    });
    return rows[0] || null;
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
  ): Promise<{ items: CandidateAssessment[]; nextCursor: string | null; hasMore: boolean }> {
    const { cursor, limit = 20, candidateId, templateId, status, search } = options;

    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<CandidateAssessment[]>`
          SELECT
            ca.id, ca.tenant_id, ca.candidate_id, ca.template_id,
            ca.scheduled_at, ca.started_at, ca.completed_at,
            ca.score, ca.passed, ca.answers,
            ca.assessor_id, ca.feedback, ca.status,
            ca.created_at, ca.updated_at,
            at.name as template_name,
            at.type as template_type
          FROM app.candidate_assessments ca
          JOIN app.assessment_templates at ON at.id = ca.template_id
          WHERE ca.tenant_id = ${ctx.tenantId}::uuid
          ${candidateId ? tx`AND ca.candidate_id = ${candidateId}::uuid` : tx``}
          ${templateId ? tx`AND ca.template_id = ${templateId}::uuid` : tx``}
          ${status ? tx`AND ca.status = ${status}::app.candidate_assessment_status` : tx``}
          ${search ? tx`AND (at.name ILIKE ${"%" + search + "%"})` : tx``}
          ${cursor ? tx`AND ca.id > ${cursor}::uuid` : tx``}
          ORDER BY ca.created_at DESC, ca.id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getCandidateAssessmentById(ctx: TenantContext, id: string): Promise<CandidateAssessment | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<CandidateAssessment[]>`
        SELECT
          ca.id, ca.tenant_id, ca.candidate_id, ca.template_id,
          ca.scheduled_at, ca.started_at, ca.completed_at,
          ca.score, ca.passed, ca.answers,
          ca.assessor_id, ca.feedback, ca.status,
          ca.created_at, ca.updated_at,
          at.name as template_name,
          at.type as template_type
        FROM app.candidate_assessments ca
        JOIN app.assessment_templates at ON at.id = ca.template_id
        WHERE ca.id = ${id}::uuid AND ca.tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
  }

  async createCandidateAssessment(
    ctx: TenantContext,
    data: {
      candidateId: string;
      templateId: string;
      scheduledAt?: string;
    }
  ): Promise<CandidateAssessment> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<CandidateAssessment[]>`
        INSERT INTO app.candidate_assessments (
          tenant_id, candidate_id, template_id, scheduled_at
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${data.candidateId}::uuid,
          ${data.templateId}::uuid,
          ${data.scheduledAt || null}::timestamptz
        )
        RETURNING id, tenant_id, candidate_id, template_id,
          scheduled_at, started_at, completed_at,
          score, passed, answers,
          assessor_id, feedback, status,
          created_at, updated_at
      `;
    });
    return rows[0];
  }

  async updateCandidateAssessmentStatus(
    ctx: TenantContext,
    id: string,
    status: string,
    extraFields?: Partial<{
      startedAt: string;
      completedAt: string;
      score: number;
      passed: boolean;
      answers: Record<string, unknown>;
      assessorId: string;
      feedback: string;
    }>
  ): Promise<CandidateAssessment | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<CandidateAssessment[]>`
        UPDATE app.candidate_assessments SET
          status = ${status}::app.candidate_assessment_status,
          started_at = COALESCE(${extraFields?.startedAt || null}::timestamptz, started_at),
          completed_at = COALESCE(${extraFields?.completedAt || null}::timestamptz, completed_at),
          score = COALESCE(${extraFields?.score ?? null}, score),
          passed = COALESCE(${extraFields?.passed ?? null}, passed),
          answers = COALESCE(${extraFields?.answers ? JSON.stringify(extraFields.answers) : null}::jsonb, answers),
          assessor_id = COALESCE(${extraFields?.assessorId || null}::uuid, assessor_id),
          feedback = COALESCE(${extraFields?.feedback || null}, feedback),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING id, tenant_id, candidate_id, template_id,
          scheduled_at, started_at, completed_at,
          score, passed, answers,
          assessor_id, feedback, status,
          created_at, updated_at
      `;
    });
    return rows[0] || null;
  }
}
