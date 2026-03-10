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

    const rows = await this.db.query<Requisition>`
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
      ${status ? this.db.client`AND r.status = ${status}` : this.db.client``}
      ${hiringManagerId ? this.db.client`AND r.hiring_manager_id = ${hiringManagerId}::uuid` : this.db.client``}
      ${orgUnitId ? this.db.client`AND r.org_unit_id = ${orgUnitId}::uuid` : this.db.client``}
      ${search ? this.db.client`AND (r.title ILIKE ${"%" + search + "%"} OR r.code ILIKE ${"%" + search + "%"})` : this.db.client``}
      ${cursor ? this.db.client`AND r.id > ${cursor}::uuid` : this.db.client``}
      ORDER BY r.priority ASC, r.created_at DESC, r.id ASC
      LIMIT ${limit + 1}
    `;

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getRequisitionById(ctx: TenantContext, id: string): Promise<Requisition | null> {
    const rows = await this.db.query<Requisition>`
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
    const rows = await this.db.query<Requisition>`
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
    const rows = await this.db.query<RequisitionStatsRow>`
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

    const rows = await this.db.query<Candidate>`
      SELECT
        c.*,
        r.title as requisition_title
      FROM app.candidates c
      JOIN app.requisitions r ON r.id = c.requisition_id
      WHERE c.tenant_id = ${ctx.tenantId}::uuid
      ${requisitionId ? this.db.client`AND c.requisition_id = ${requisitionId}::uuid` : this.db.client``}
      ${stage ? this.db.client`AND c.current_stage = ${stage}::app.candidate_stage` : this.db.client``}
      ${source ? this.db.client`AND c.source = ${source}` : this.db.client``}
      ${search ? this.db.client`AND (c.first_name ILIKE ${"%" + search + "%"} OR c.last_name ILIKE ${"%" + search + "%"} OR c.email ILIKE ${"%" + search + "%"})` : this.db.client``}
      ${cursor ? this.db.client`AND c.id > ${cursor}::uuid` : this.db.client``}
      ORDER BY c.created_at DESC, c.id ASC
      LIMIT ${limit + 1}
    `;

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getCandidateById(ctx: TenantContext, id: string): Promise<Candidate | null> {
    const rows = await this.db.query<Candidate>`
      SELECT
        c.*,
        r.title as requisition_title
      FROM app.candidates c
      JOIN app.requisitions r ON r.id = c.requisition_id
      WHERE c.id = ${id}::uuid AND c.tenant_id = ${ctx.tenantId}::uuid
    `;
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
    const rows = await this.db.query<Candidate>`
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
    const rows = await this.db.query<Candidate>`
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
    return rows[0] || null;
  }

  async advanceCandidateStage(
    ctx: TenantContext,
    candidateId: string,
    newStage: string,
    reason?: string
  ): Promise<boolean> {
    const rows = await this.db.query<{ result: boolean }>`
      SELECT app.advance_candidate_stage(
        ${candidateId}::uuid,
        ${newStage}::app.candidate_stage,
        ${ctx.userId || null}::uuid,
        ${reason || null}
      ) as result
    `;
    return rows[0]?.result || false;
  }

  async getRequisitionPipeline(ctx: TenantContext, requisitionId: string): Promise<PipelineStage[]> {
    const rows = await this.db.query<{ stage: string; count: number }>`
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
    const rows = await this.db.query<CandidateStatsRow>`
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
}
