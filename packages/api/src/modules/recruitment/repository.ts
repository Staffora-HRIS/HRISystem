/**
 * Recruitment Repository
 *
 * Database operations for requisitions and candidates
 */

import type { DatabaseClient } from "../../plugins/db";

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface Requisition {
  id: string;
  tenant_id: string;
  code: string;
  title: string;
  position_id: string | null;
  org_unit_id: string | null;
  hiring_manager_id: string | null;
  status: "draft" | "open" | "on_hold" | "filled" | "cancelled";
  openings: number;
  filled: number;
  priority: number;
  job_description: string | null;
  requirements: Record<string, unknown> | null;
  target_start_date: string | null;
  deadline: string | null;
  location?: string;
  employment_type?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  hiring_manager_name?: string;
  position_title?: string;
  org_unit_name?: string;
  department?: string;
  candidate_count?: number;
}

export interface Candidate {
  id: string;
  tenant_id: string;
  requisition_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  current_stage: "applied" | "screening" | "interview" | "offer" | "hired" | "rejected" | "withdrawn";
  source: string;
  resume_url: string | null;
  linkedin_url: string | null;
  rating: number | null;
  notes: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  requisition_title?: string;
}

export interface PipelineStage {
  stage: string;
  count: number;
}

interface RequisitionStatsRow {
  total_requisitions: number;
  open_count: number;
  on_hold_count: number;
  filled_count: number;
  total_openings: number;
  total_filled: number;
}

interface CandidateStatsRow {
  total_candidates: number;
  applied_count: number;
  screening_count: number;
  interview_count: number;
  offer_count: number;
  hired_count: number;
  rejected_count: number;
}

// =============================================================================
// Recruitment Repository
// =============================================================================

export class RecruitmentRepository {
  constructor(private db: DatabaseClient) {}

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
  ): Promise<{ items: Requisition[]; nextCursor: string | null; hasMore: boolean }> {
    const { cursor, limit = 20, status, hiringManagerId, orgUnitId, search } = options;

    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx<Requisition[]>`
          SELECT
            r.*,
            e.first_name || ' ' || e.last_name as hiring_manager_name,
            p.title as position_title,
            ou.name as org_unit_name,
            ou.name as department,
            (SELECT COUNT(*)::int FROM app.candidates c WHERE c.requisition_id = r.id) as candidate_count
          FROM app.requisitions r
          LEFT JOIN app.employees e ON e.id = r.hiring_manager_id
          LEFT JOIN app.positions p ON p.id = r.position_id
          LEFT JOIN app.org_units ou ON ou.id = r.org_unit_id
          WHERE r.tenant_id = ${ctx.tenantId}::uuid
          ${status ? tx`AND r.status = ${status}` : tx``}
          ${hiringManagerId ? tx`AND r.hiring_manager_id = ${hiringManagerId}::uuid` : tx``}
          ${orgUnitId ? tx`AND r.org_unit_id = ${orgUnitId}::uuid` : tx``}
          ${search ? tx`AND (r.title ILIKE ${"%" + search + "%"} OR r.code ILIKE ${"%" + search + "%"})` : tx``}
          ${cursor ? tx`AND r.id > ${cursor}::uuid` : tx``}
          ORDER BY r.priority ASC, r.created_at DESC, r.id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getRequisitionById(ctx: TenantContext, id: string): Promise<Requisition | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<Requisition[]>`
        SELECT
          r.*,
          e.first_name || ' ' || e.last_name as hiring_manager_name,
          p.title as position_title,
          ou.name as org_unit_name,
          ou.name as department,
          (SELECT COUNT(*)::int FROM app.candidates c WHERE c.requisition_id = r.id) as candidate_count
        FROM app.requisitions r
        LEFT JOIN app.employees e ON e.id = r.hiring_manager_id
        LEFT JOIN app.positions p ON p.id = r.position_id
        LEFT JOIN app.org_units ou ON ou.id = r.org_unit_id
        WHERE r.id = ${id}::uuid AND r.tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
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
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      // Generate requisition code
      const codeRows = await tx<{ code: string }[]>`
        SELECT app.generate_requisition_code(${ctx.tenantId}::uuid) as code
      `;
      const code = codeRows[0]?.code || `REQ-${Date.now()}`;

      return tx<Requisition[]>`
        INSERT INTO app.requisitions (
          tenant_id, code, title, position_id, org_unit_id, hiring_manager_id,
          openings, priority, job_description, requirements,
          target_start_date, deadline, created_by
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${code},
          ${data.title},
          ${data.positionId || null}::uuid,
          ${data.orgUnitId || null}::uuid,
          ${data.hiringManagerId || null}::uuid,
          ${data.openings || 1},
          ${data.priority || 3},
          ${data.jobDescription || null},
          ${data.requirements ? JSON.stringify(data.requirements) : "{}"}::jsonb,
          ${data.targetStartDate || null}::date,
          ${data.deadline || null}::date,
          ${ctx.userId || null}::uuid
        )
        RETURNING *
      `;
    });
    return rows[0];
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
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<Requisition[]>`
        UPDATE app.requisitions SET
          title = COALESCE(${data.title}, title),
          position_id = COALESCE(${data.positionId}::uuid, position_id),
          org_unit_id = COALESCE(${data.orgUnitId}::uuid, org_unit_id),
          hiring_manager_id = COALESCE(${data.hiringManagerId}::uuid, hiring_manager_id),
          openings = COALESCE(${data.openings}, openings),
          priority = COALESCE(${data.priority}, priority),
          job_description = COALESCE(${data.jobDescription}, job_description),
          requirements = COALESCE(${data.requirements ? JSON.stringify(data.requirements) : null}::jsonb, requirements),
          target_start_date = COALESCE(${data.targetStartDate}::date, target_start_date),
          deadline = COALESCE(${data.deadline}::date, deadline),
          status = COALESCE(${data.status}::app.requisition_status, status),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
    });
    return rows[0] || null;
  }

  async getRequisitionStats(ctx: TenantContext): Promise<{
    totalRequisitions: number;
    openCount: number;
    onHoldCount: number;
    filledCount: number;
    totalOpenings: number;
    totalFilled: number;
  }> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<RequisitionStatsRow[]>`
        SELECT
          COUNT(*)::int AS total_requisitions,
          COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
          COUNT(*) FILTER (WHERE status = 'on_hold')::int AS on_hold_count,
          COUNT(*) FILTER (WHERE status = 'filled')::int AS filled_count,
          COALESCE(SUM(openings), 0)::int AS total_openings,
          COALESCE(SUM(filled), 0)::int AS total_filled
        FROM app.requisitions
        WHERE tenant_id = ${ctx.tenantId}::uuid
      `;
    });

    const stats = rows[0];
    return {
      totalRequisitions: stats?.total_requisitions || 0,
      openCount: stats?.open_count || 0,
      onHoldCount: stats?.on_hold_count || 0,
      filledCount: stats?.filled_count || 0,
      totalOpenings: stats?.total_openings || 0,
      totalFilled: stats?.total_filled || 0,
    };
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
  ): Promise<{ items: Candidate[]; nextCursor: string | null; hasMore: boolean }> {
    const { cursor, limit = 20, requisitionId, stage, source, search } = options;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<Candidate[]>`
        SELECT
          c.*,
          r.title as requisition_title
        FROM app.candidates c
        JOIN app.requisitions r ON r.id = c.requisition_id
        WHERE c.tenant_id = ${ctx.tenantId}::uuid
        ${requisitionId ? tx`AND c.requisition_id = ${requisitionId}::uuid` : tx``}
        ${stage ? tx`AND c.current_stage = ${stage}::app.candidate_stage` : tx``}
        ${source ? tx`AND c.source = ${source}` : tx``}
        ${search ? tx`AND (c.first_name ILIKE ${"%" + search + "%"} OR c.last_name ILIKE ${"%" + search + "%"} OR c.email ILIKE ${"%" + search + "%"})` : tx``}
        ${cursor ? tx`AND c.id > ${cursor}::uuid` : tx``}
        ORDER BY c.created_at DESC, c.id ASC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getCandidateById(ctx: TenantContext, id: string): Promise<Candidate | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<Candidate[]>`
        SELECT
          c.*,
          r.title as requisition_title
        FROM app.candidates c
        JOIN app.requisitions r ON r.id = c.requisition_id
        WHERE c.id = ${id}::uuid AND c.tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
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
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<Candidate[]>`
        INSERT INTO app.candidates (
          tenant_id, requisition_id, email, first_name, last_name,
          phone, source, resume_url, linkedin_url, rating, notes
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${data.requisitionId}::uuid,
          ${data.email},
          ${data.firstName},
          ${data.lastName},
          ${data.phone || null},
          ${data.source || "direct"},
          ${data.resumeUrl || null},
          ${data.linkedinUrl || null},
          ${data.rating || null},
          ${data.notes ? JSON.stringify(data.notes) : "{}"}::jsonb
        )
        RETURNING *
      `;
    });
    return rows[0];
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
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<Candidate[]>`
        UPDATE app.candidates SET
          email = COALESCE(${data.email}, email),
          first_name = COALESCE(${data.firstName}, first_name),
          last_name = COALESCE(${data.lastName}, last_name),
          phone = COALESCE(${data.phone}, phone),
          source = COALESCE(${data.source}, source),
          resume_url = COALESCE(${data.resumeUrl}, resume_url),
          linkedin_url = COALESCE(${data.linkedinUrl}, linkedin_url),
          rating = COALESCE(${data.rating}, rating),
          current_stage = COALESCE(${data.currentStage}::app.candidate_stage, current_stage),
          notes = COALESCE(${data.notes ? JSON.stringify(data.notes) : null}::jsonb, notes),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
    });
    return rows[0] || null;
  }

  async advanceCandidateStage(
    ctx: TenantContext,
    candidateId: string,
    newStage: string,
    reason?: string
  ): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ result: boolean }[]>`
        SELECT app.advance_candidate_stage(
          ${candidateId}::uuid,
          ${newStage}::app.candidate_stage,
          ${ctx.userId || null}::uuid,
          ${reason || null}
        ) as result
      `;
    });
    return rows[0]?.result || false;
  }

  async getRequisitionPipeline(ctx: TenantContext, requisitionId: string): Promise<PipelineStage[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ stage: string; count: number }[]>`
        SELECT current_stage as stage, COUNT(*)::int as count
        FROM app.candidates
        WHERE requisition_id = ${requisitionId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        GROUP BY current_stage
        ORDER BY
          CASE current_stage
            WHEN 'applied' THEN 1
            WHEN 'screening' THEN 2
            WHEN 'interview' THEN 3
            WHEN 'offer' THEN 4
            WHEN 'hired' THEN 5
            WHEN 'rejected' THEN 6
            WHEN 'withdrawn' THEN 7
          END
      `;
    });
    return rows;
  }

  async getCandidateStats(ctx: TenantContext): Promise<{
    totalCandidates: number;
    appliedCount: number;
    screeningCount: number;
    interviewCount: number;
    offerCount: number;
    hiredCount: number;
    rejectedCount: number;
  }> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<CandidateStatsRow[]>`
        SELECT
          COUNT(*)::int AS total_candidates,
          COUNT(*) FILTER (WHERE current_stage = 'applied')::int AS applied_count,
          COUNT(*) FILTER (WHERE current_stage = 'screening')::int AS screening_count,
          COUNT(*) FILTER (WHERE current_stage = 'interview')::int AS interview_count,
          COUNT(*) FILTER (WHERE current_stage = 'offer')::int AS offer_count,
          COUNT(*) FILTER (WHERE current_stage = 'hired')::int AS hired_count,
          COUNT(*) FILTER (WHERE current_stage = 'rejected')::int AS rejected_count
        FROM app.candidates
        WHERE tenant_id = ${ctx.tenantId}::uuid
      `;
    });

    const stats = rows[0];
    return {
      totalCandidates: stats?.total_candidates || 0,
      appliedCount: stats?.applied_count || 0,
      screeningCount: stats?.screening_count || 0,
      interviewCount: stats?.interview_count || 0,
      offerCount: stats?.offer_count || 0,
      hiredCount: stats?.hired_count || 0,
      rejectedCount: stats?.rejected_count || 0,
    };
  }

  // ===========================================================================
  // Recruitment Cost Methods
  // ===========================================================================

  async createRecruitmentCost(
    ctx: TenantContext,
    data: {
      requisitionId: string;
      category: string;
      description?: string;
      amount: number;
      currency?: string;
      incurredDate?: string;
      externalReference?: string;
    }
  ): Promise<RecruitmentCost> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<RecruitmentCost[]>`
        INSERT INTO app.recruitment_costs (
          tenant_id, requisition_id, category, description,
          amount, currency, incurred_date, external_reference, created_by
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${data.requisitionId}::uuid,
          ${data.category},
          ${data.description || null},
          ${data.amount},
          ${data.currency || "GBP"},
          ${data.incurredDate || null}::date,
          ${data.externalReference || null},
          ${ctx.userId || null}::uuid
        )
        RETURNING *
      `;
    });
    return rows[0];
  }

  async listRecruitmentCosts(
    ctx: TenantContext,
    options: {
      requisitionId?: string;
      category?: string;
      cursor?: string;
      limit?: number;
    } = {}
  ): Promise<{ items: RecruitmentCost[]; nextCursor: string | null; hasMore: boolean }> {
    const { requisitionId, category, cursor, limit = 20 } = options;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<RecruitmentCost[]>`
        SELECT rc.*, r.title as requisition_title
        FROM app.recruitment_costs rc
        JOIN app.requisitions r ON r.id = rc.requisition_id
        WHERE rc.tenant_id = ${ctx.tenantId}::uuid
        ${requisitionId ? tx`AND rc.requisition_id = ${requisitionId}::uuid` : tx``}
        ${category ? tx`AND rc.category = ${category}` : tx``}
        ${cursor ? tx`AND rc.id > ${cursor}::uuid` : tx``}
        ORDER BY rc.incurred_date DESC, rc.created_at DESC, rc.id ASC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async updateRecruitmentCost(
    ctx: TenantContext,
    id: string,
    data: Partial<{
      category: string;
      description: string | null;
      amount: number;
      currency: string;
      incurredDate: string;
      externalReference: string | null;
    }>
  ): Promise<RecruitmentCost | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<RecruitmentCost[]>`
        UPDATE app.recruitment_costs SET
          category = COALESCE(${data.category}, category),
          description = COALESCE(${data.description}, description),
          amount = COALESCE(${data.amount}, amount),
          currency = COALESCE(${data.currency}, currency),
          incurred_date = COALESCE(${data.incurredDate}::date, incurred_date),
          external_reference = COALESCE(${data.externalReference}, external_reference),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
    });
    return rows[0] || null;
  }

  async deleteRecruitmentCost(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ id: string }[]>`
        DELETE FROM app.recruitment_costs
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING id
      `;
    });
    return rows.length > 0;
  }

  // ===========================================================================
  // Recruitment Analytics Methods
  // ===========================================================================

  /**
   * Time-to-fill: For each filled requisition, calculate days from when it was
   * opened (first candidate_stage_event with to_stage='applied' or requisition
   * status became 'open') to when a candidate reached 'hired' stage.
   *
   * We use the requisition created_at as the opening date and the earliest
   * candidate_stage_event with to_stage='hired' as the fill date, because
   * this gives the most accurate measure of the full recruitment cycle.
   */
  async getTimeToFill(
    ctx: TenantContext,
    options: {
      startDate: string;
      endDate: string;
      orgUnitId?: string;
      requisitionId?: string;
    }
  ): Promise<{
    items: Array<{
      requisition_id: string;
      requisition_code: string;
      requisition_title: string;
      status: string;
      opened_at: string | null;
      filled_at: string | null;
      days_to_fill: number | null;
    }>;
    average_days_to_fill: number;
    median_days_to_fill: number;
    min_days_to_fill: number | null;
    max_days_to_fill: number | null;
    total_filled: number;
  }> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<any[]>`
        WITH filled_reqs AS (
          SELECT
            r.id AS requisition_id,
            r.code AS requisition_code,
            r.title AS requisition_title,
            r.status,
            r.created_at AS opened_at,
            (
              SELECT MIN(cse.created_at)
              FROM app.candidate_stage_events cse
              JOIN app.candidates c ON c.id = cse.candidate_id
              WHERE c.requisition_id = r.id
                AND cse.to_stage = 'hired'
            ) AS filled_at
          FROM app.requisitions r
          WHERE r.tenant_id = ${ctx.tenantId}::uuid
            AND r.status = 'filled'
            AND r.created_at >= ${options.startDate}::date
            AND r.created_at <= (${options.endDate}::date + interval '1 day')
            ${options.orgUnitId ? tx`AND r.org_unit_id = ${options.orgUnitId}::uuid` : tx``}
            ${options.requisitionId ? tx`AND r.id = ${options.requisitionId}::uuid` : tx``}
        )
        SELECT
          requisition_id,
          requisition_code,
          requisition_title,
          status,
          opened_at::text,
          filled_at::text,
          CASE
            WHEN filled_at IS NOT NULL AND opened_at IS NOT NULL
            THEN EXTRACT(DAY FROM filled_at - opened_at)::int
            ELSE NULL
          END AS days_to_fill
        FROM filled_reqs
        ORDER BY days_to_fill ASC NULLS LAST
      `;
    });

    const daysValues = rows
      .map((r) => r.days_to_fill ?? r.daysToFill)
      .filter((d: number | null): d is number => d !== null && d !== undefined);

    const sorted = [...daysValues].sort((a, b) => a - b);
    const total = sorted.length;
    const avg = total > 0 ? Math.round((sorted.reduce((s, v) => s + v, 0) / total) * 10) / 10 : 0;
    const median = total > 0
      ? total % 2 === 0
        ? Math.round(((sorted[total / 2 - 1] + sorted[total / 2]) / 2) * 10) / 10
        : sorted[Math.floor(total / 2)]
      : 0;

    return {
      items: rows.map((r) => ({
        requisition_id: r.requisition_id ?? r.requisitionId,
        requisition_code: r.requisition_code ?? r.requisitionCode,
        requisition_title: r.requisition_title ?? r.requisitionTitle,
        status: r.status,
        opened_at: r.opened_at ?? r.openedAt ?? null,
        filled_at: r.filled_at ?? r.filledAt ?? null,
        days_to_fill: r.days_to_fill ?? r.daysToFill ?? null,
      })),
      average_days_to_fill: avg,
      median_days_to_fill: median,
      min_days_to_fill: sorted.length > 0 ? sorted[0] : null,
      max_days_to_fill: sorted.length > 0 ? sorted[sorted.length - 1] : null,
      total_filled: total,
    };
  }

  /**
   * Cost-per-hire: Total recruitment costs divided by hires in period.
   * Also breaks down costs by category.
   */
  async getCostPerHire(
    ctx: TenantContext,
    options: {
      startDate: string;
      endDate: string;
      orgUnitId?: string;
      currency?: string;
    }
  ): Promise<{
    total_costs: number;
    total_hires: number;
    cost_per_hire: number;
    currency: string;
    costs_by_category: Array<{
      category: string;
      total_amount: number;
      percentage: number;
    }>;
  }> {
    const currency = options.currency || "GBP";

    const [costRows, hireRows, categoryRows] = await Promise.all([
      this.db.withTransaction(ctx, async (tx) => {
        return tx<any[]>`
          SELECT COALESCE(SUM(rc.amount), 0)::numeric AS total_costs
          FROM app.recruitment_costs rc
          JOIN app.requisitions r ON r.id = rc.requisition_id
          WHERE rc.tenant_id = ${ctx.tenantId}::uuid
            AND rc.currency = ${currency}
            AND rc.incurred_date >= ${options.startDate}::date
            AND rc.incurred_date <= ${options.endDate}::date
            ${options.orgUnitId ? tx`AND r.org_unit_id = ${options.orgUnitId}::uuid` : tx``}
        `;
      }),
      this.db.withTransaction(ctx, async (tx) => {
        return tx<any[]>`
          SELECT COUNT(DISTINCT c.id)::int AS total_hires
          FROM app.candidates c
          JOIN app.requisitions r ON r.id = c.requisition_id
          WHERE c.tenant_id = ${ctx.tenantId}::uuid
            AND c.current_stage = 'hired'
            AND c.updated_at >= ${options.startDate}::date
            AND c.updated_at <= (${options.endDate}::date + interval '1 day')
            ${options.orgUnitId ? tx`AND r.org_unit_id = ${options.orgUnitId}::uuid` : tx``}
        `;
      }),
      this.db.withTransaction(ctx, async (tx) => {
        return tx<any[]>`
          SELECT
            rc.category,
            SUM(rc.amount)::numeric AS total_amount
          FROM app.recruitment_costs rc
          JOIN app.requisitions r ON r.id = rc.requisition_id
          WHERE rc.tenant_id = ${ctx.tenantId}::uuid
            AND rc.currency = ${currency}
            AND rc.incurred_date >= ${options.startDate}::date
            AND rc.incurred_date <= ${options.endDate}::date
            ${options.orgUnitId ? tx`AND r.org_unit_id = ${options.orgUnitId}::uuid` : tx``}
          GROUP BY rc.category
          ORDER BY total_amount DESC
        `;
      }),
    ]);

    const totalCosts = Number(costRows[0]?.total_costs ?? costRows[0]?.totalCosts) || 0;
    const totalHires = Number(hireRows[0]?.total_hires ?? hireRows[0]?.totalHires) || 0;
    const costPerHire = totalHires > 0 ? Math.round((totalCosts / totalHires) * 100) / 100 : 0;

    const costsByCategory = categoryRows.map((r) => {
      const amount = Number(r.total_amount ?? r.totalAmount) || 0;
      return {
        category: r.category,
        total_amount: amount,
        percentage: totalCosts > 0 ? Math.round((amount / totalCosts) * 1000) / 10 : 0,
      };
    });

    return {
      total_costs: totalCosts,
      total_hires: totalHires,
      cost_per_hire: costPerHire,
      currency,
      costs_by_category: costsByCategory,
    };
  }

  /**
   * Source effectiveness: For each candidate source, count total applications,
   * hires, rejections, and calculate conversion rate and average time-to-hire.
   */
  async getSourceEffectiveness(
    ctx: TenantContext,
    options: {
      startDate: string;
      endDate: string;
      orgUnitId?: string;
    }
  ): Promise<{
    items: Array<{
      source: string;
      total_candidates: number;
      hired_count: number;
      rejected_count: number;
      in_pipeline_count: number;
      conversion_rate: number;
      avg_days_to_hire: number | null;
    }>;
    total_candidates: number;
    total_hired: number;
    overall_conversion_rate: number;
  }> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<any[]>`
        SELECT
          c.source,
          COUNT(*)::int AS total_candidates,
          COUNT(*) FILTER (WHERE c.current_stage = 'hired')::int AS hired_count,
          COUNT(*) FILTER (WHERE c.current_stage = 'rejected')::int AS rejected_count,
          COUNT(*) FILTER (WHERE c.current_stage NOT IN ('hired', 'rejected', 'withdrawn'))::int AS in_pipeline_count,
          ROUND(
            COUNT(*) FILTER (WHERE c.current_stage = 'hired')::numeric /
            NULLIF(COUNT(*)::numeric, 0) * 100,
            2
          ) AS conversion_rate,
          ROUND(
            AVG(
              CASE WHEN c.current_stage = 'hired'
                THEN EXTRACT(DAY FROM c.updated_at - c.created_at)
                ELSE NULL
              END
            ),
            1
          ) AS avg_days_to_hire
        FROM app.candidates c
        JOIN app.requisitions r ON r.id = c.requisition_id
        WHERE c.tenant_id = ${ctx.tenantId}::uuid
          AND c.created_at >= ${options.startDate}::date
          AND c.created_at <= (${options.endDate}::date + interval '1 day')
          ${options.orgUnitId ? tx`AND r.org_unit_id = ${options.orgUnitId}::uuid` : tx``}
        GROUP BY c.source
        ORDER BY total_candidates DESC
      `;
    });

    const items = rows.map((r) => ({
      source: r.source,
      total_candidates: Number(r.total_candidates ?? r.totalCandidates) || 0,
      hired_count: Number(r.hired_count ?? r.hiredCount) || 0,
      rejected_count: Number(r.rejected_count ?? r.rejectedCount) || 0,
      in_pipeline_count: Number(r.in_pipeline_count ?? r.inPipelineCount) || 0,
      conversion_rate: Number(r.conversion_rate ?? r.conversionRate) || 0,
      avg_days_to_hire: r.avg_days_to_hire ?? r.avgDaysToHire ?? null,
    }));

    const totalCandidates = items.reduce((s, i) => s + i.total_candidates, 0);
    const totalHired = items.reduce((s, i) => s + i.hired_count, 0);
    const overallConversionRate = totalCandidates > 0
      ? Math.round((totalHired / totalCandidates) * 10000) / 100
      : 0;

    return {
      items,
      total_candidates: totalCandidates,
      total_hired: totalHired,
      overall_conversion_rate: overallConversionRate,
    };
  }

  /**
   * Pipeline conversion rates: For each stage, how many candidates entered,
   * how many progressed to the next stage, and average time spent in each stage.
   *
   * Uses the immutable candidate_stage_events table for accurate transition data.
   */
  async getPipelineConversion(
    ctx: TenantContext,
    options: {
      startDate: string;
      endDate: string;
      orgUnitId?: string;
      requisitionId?: string;
    }
  ): Promise<{
    stages: Array<{
      stage: string;
      entered_count: number;
      progressed_count: number;
      conversion_rate: number;
      avg_days_in_stage: number | null;
    }>;
    overall_hire_rate: number;
  }> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<any[]>`
        WITH stage_entries AS (
          -- Count how many candidates entered each stage
          SELECT
            cse.to_stage AS stage,
            COUNT(DISTINCT cse.candidate_id)::int AS entered_count
          FROM app.candidate_stage_events cse
          JOIN app.candidates c ON c.id = cse.candidate_id
          JOIN app.requisitions r ON r.id = c.requisition_id
          WHERE cse.tenant_id = ${ctx.tenantId}::uuid
            AND cse.created_at >= ${options.startDate}::date
            AND cse.created_at <= (${options.endDate}::date + interval '1 day')
            ${options.orgUnitId ? tx`AND r.org_unit_id = ${options.orgUnitId}::uuid` : tx``}
            ${options.requisitionId ? tx`AND c.requisition_id = ${options.requisitionId}::uuid` : tx``}
          GROUP BY cse.to_stage
        ),
        stage_exits AS (
          -- Count how many left each stage to go to a forward (non-terminal-negative) stage
          SELECT
            cse.from_stage AS stage,
            COUNT(DISTINCT cse.candidate_id)::int AS progressed_count
          FROM app.candidate_stage_events cse
          JOIN app.candidates c ON c.id = cse.candidate_id
          JOIN app.requisitions r ON r.id = c.requisition_id
          WHERE cse.tenant_id = ${ctx.tenantId}::uuid
            AND cse.created_at >= ${options.startDate}::date
            AND cse.created_at <= (${options.endDate}::date + interval '1 day')
            AND cse.from_stage IS NOT NULL
            AND cse.to_stage NOT IN ('rejected', 'withdrawn')
            ${options.orgUnitId ? tx`AND r.org_unit_id = ${options.orgUnitId}::uuid` : tx``}
            ${options.requisitionId ? tx`AND c.requisition_id = ${options.requisitionId}::uuid` : tx``}
          GROUP BY cse.from_stage
        ),
        stage_durations AS (
          -- Calculate average time in each stage
          SELECT
            cse.from_stage AS stage,
            ROUND(
              AVG(
                EXTRACT(EPOCH FROM (cse.created_at - prev.created_at)) / 86400
              ),
              1
            ) AS avg_days_in_stage
          FROM app.candidate_stage_events cse
          JOIN app.candidates c ON c.id = cse.candidate_id
          JOIN app.requisitions r ON r.id = c.requisition_id
          LEFT JOIN LATERAL (
            SELECT cse2.created_at
            FROM app.candidate_stage_events cse2
            WHERE cse2.candidate_id = cse.candidate_id
              AND cse2.to_stage = cse.from_stage
            ORDER BY cse2.created_at DESC
            LIMIT 1
          ) prev ON true
          WHERE cse.tenant_id = ${ctx.tenantId}::uuid
            AND cse.created_at >= ${options.startDate}::date
            AND cse.created_at <= (${options.endDate}::date + interval '1 day')
            AND cse.from_stage IS NOT NULL
            AND prev.created_at IS NOT NULL
            ${options.orgUnitId ? tx`AND r.org_unit_id = ${options.orgUnitId}::uuid` : tx``}
            ${options.requisitionId ? tx`AND c.requisition_id = ${options.requisitionId}::uuid` : tx``}
          GROUP BY cse.from_stage
        ),
        all_stages AS (
          SELECT unnest(ARRAY['applied','screening','interview','offer','hired']) AS stage
        )
        SELECT
          a.stage,
          COALESCE(se.entered_count, 0) AS entered_count,
          COALESCE(sx.progressed_count, 0) AS progressed_count,
          CASE
            WHEN COALESCE(se.entered_count, 0) > 0
            THEN ROUND(COALESCE(sx.progressed_count, 0)::numeric / se.entered_count * 100, 2)
            ELSE 0
          END AS conversion_rate,
          sd.avg_days_in_stage
        FROM all_stages a
        LEFT JOIN stage_entries se ON se.stage::text = a.stage
        LEFT JOIN stage_exits sx ON sx.stage::text = a.stage
        LEFT JOIN stage_durations sd ON sd.stage::text = a.stage
        ORDER BY
          CASE a.stage
            WHEN 'applied' THEN 1
            WHEN 'screening' THEN 2
            WHEN 'interview' THEN 3
            WHEN 'offer' THEN 4
            WHEN 'hired' THEN 5
          END
      `;
    });

    const stages = rows.map((r) => ({
      stage: r.stage,
      entered_count: Number(r.entered_count ?? r.enteredCount) || 0,
      progressed_count: Number(r.progressed_count ?? r.progressedCount) || 0,
      conversion_rate: Number(r.conversion_rate ?? r.conversionRate) || 0,
      avg_days_in_stage: r.avg_days_in_stage != null
        ? Number(r.avg_days_in_stage)
        : r.avgDaysInStage != null
          ? Number(r.avgDaysInStage)
          : null,
    }));

    // Overall hire rate: hired / applied
    const appliedCount = stages.find((s) => s.stage === "applied")?.entered_count || 0;
    const hiredCount = stages.find((s) => s.stage === "hired")?.entered_count || 0;
    const overallHireRate = appliedCount > 0
      ? Math.round((hiredCount / appliedCount) * 10000) / 100
      : 0;

    return {
      stages,
      overall_hire_rate: overallHireRate,
    };
  }
}

// =============================================================================
// Additional Types
// =============================================================================

export interface RecruitmentCost {
  id: string;
  tenant_id: string;
  requisition_id: string;
  category: string;
  description: string | null;
  amount: number;
  currency: string;
  incurred_date: string;
  external_reference: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  // Joined fields
  requisition_title?: string;
}
