/**
 * Succession Planning Module - Repository Layer
 *
 * Handles database operations for succession planning.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  CreateSuccessionPlan,
  UpdateSuccessionPlan,
  CreateCandidate,
  UpdateCandidate,
  PlanFilters,
  ReadinessLevel,
  RiskLevel,
} from "./schemas";

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface SuccessionPlanRow {
  id: string;
  tenantId: string;
  positionId: string;
  positionTitle: string;
  orgUnitId: string | null;
  orgUnitName: string | null;
  incumbentId: string | null;
  incumbentName: string | null;
  isCriticalRole: boolean;
  criticalityReason: string | null;
  riskLevel: RiskLevel;
  incumbentRetirementRisk: boolean;
  incumbentFlightRisk: boolean;
  marketScarcity: boolean;
  notes: string | null;
  candidateCount: number;
  readyNowCount: number;
  lastReviewedAt: Date | null;
  nextReviewDate: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CandidateRow {
  id: string;
  tenantId: string;
  planId: string;
  employeeId: string;
  employeeName: string;
  currentPosition: string | null;
  currentDepartment: string | null;
  readiness: ReadinessLevel;
  ranking: number;
  assessmentNotes: string | null;
  strengths: string[];
  developmentAreas: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineStatsRow {
  totalCriticalPositions: number;
  coveredPositions: number;
  uncoveredPositions: number;
  readyNowCandidates: number;
  highRiskPositions: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class SuccessionRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Plan Find Operations
  // ===========================================================================

  async findPlans(
    context: TenantContext,
    filters: PlanFilters = {},
    pagination: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedResult<SuccessionPlanRow>> {
    const limit = pagination.limit ?? 20;

    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<SuccessionPlanRow[]>`
        SELECT
          sp.id,
          sp.tenant_id as "tenantId",
          sp.position_id as "positionId",
          p.title as "positionTitle",
          p.org_unit_id as "orgUnitId",
          ou.name as "orgUnitName",
          pa.employee_id as "incumbentId",
          app.get_employee_display_name(pa.employee_id) as "incumbentName",
          sp.is_critical_role as "isCriticalRole",
          sp.criticality_reason as "criticalityReason",
          sp.risk_level as "riskLevel",
          sp.incumbent_retirement_risk as "incumbentRetirementRisk",
          sp.incumbent_flight_risk as "incumbentFlightRisk",
          sp.market_scarcity as "marketScarcity",
          sp.notes,
          COALESCE(c.candidate_count, 0)::int as "candidateCount",
          COALESCE(c.ready_now_count, 0)::int as "readyNowCount",
          sp.last_reviewed_at as "lastReviewedAt",
          sp.next_review_date as "nextReviewDate",
          sp.is_active as "isActive",
          sp.created_at as "createdAt",
          sp.updated_at as "updatedAt"
        FROM app.succession_plans sp
        INNER JOIN app.positions p ON sp.position_id = p.id
        LEFT JOIN app.org_units ou ON p.org_unit_id = ou.id
        LEFT JOIN LATERAL (
          SELECT pa2.employee_id
          FROM app.position_assignments pa2
          WHERE pa2.position_id = sp.position_id
            AND pa2.is_primary = true
            AND pa2.effective_to IS NULL
          LIMIT 1
        ) pa ON true
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int as candidate_count,
            COUNT(*) FILTER (WHERE sc.readiness = 'ready_now')::int as ready_now_count
          FROM app.succession_candidates sc
          WHERE sc.plan_id = sp.id AND sc.is_active = true
        ) c ON true
        WHERE sp.tenant_id = ${context.tenantId}::uuid
          AND sp.is_active = true
          ${filters.is_critical !== undefined ? tx`AND sp.is_critical_role = ${filters.is_critical}` : tx``}
          ${filters.risk_level ? tx`AND sp.risk_level = ${filters.risk_level}` : tx``}
          ${filters.org_unit_id ? tx`AND p.org_unit_id = ${filters.org_unit_id}::uuid` : tx``}
          ${filters.has_ready_successor !== undefined
            ? filters.has_ready_successor
              ? tx`AND COALESCE(c.ready_now_count, 0) > 0`
              : tx`AND COALESCE(c.ready_now_count, 0) = 0`
            : tx``}
          ${pagination.cursor ? tx`AND sp.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY sp.is_critical_role DESC, sp.risk_level DESC, sp.id
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  async findPlanById(
    context: TenantContext,
    id: string
  ): Promise<SuccessionPlanRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<SuccessionPlanRow[]>`
        SELECT
          sp.id,
          sp.tenant_id as "tenantId",
          sp.position_id as "positionId",
          p.title as "positionTitle",
          p.org_unit_id as "orgUnitId",
          ou.name as "orgUnitName",
          pa.employee_id as "incumbentId",
          app.get_employee_display_name(pa.employee_id) as "incumbentName",
          sp.is_critical_role as "isCriticalRole",
          sp.criticality_reason as "criticalityReason",
          sp.risk_level as "riskLevel",
          sp.incumbent_retirement_risk as "incumbentRetirementRisk",
          sp.incumbent_flight_risk as "incumbentFlightRisk",
          sp.market_scarcity as "marketScarcity",
          sp.notes,
          COALESCE(c.candidate_count, 0)::int as "candidateCount",
          COALESCE(c.ready_now_count, 0)::int as "readyNowCount",
          sp.last_reviewed_at as "lastReviewedAt",
          sp.next_review_date as "nextReviewDate",
          sp.is_active as "isActive",
          sp.created_at as "createdAt",
          sp.updated_at as "updatedAt"
        FROM app.succession_plans sp
        INNER JOIN app.positions p ON sp.position_id = p.id
        LEFT JOIN app.org_units ou ON p.org_unit_id = ou.id
        LEFT JOIN LATERAL (
          SELECT pa2.employee_id
          FROM app.position_assignments pa2
          WHERE pa2.position_id = sp.position_id
            AND pa2.is_primary = true
            AND pa2.effective_to IS NULL
          LIMIT 1
        ) pa ON true
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int as candidate_count,
            COUNT(*) FILTER (WHERE sc.readiness = 'ready_now')::int as ready_now_count
          FROM app.succession_candidates sc
          WHERE sc.plan_id = sp.id AND sc.is_active = true
        ) c ON true
        WHERE sp.id = ${id}::uuid
          AND sp.tenant_id = ${context.tenantId}::uuid
      `;
    });

    return rows[0] ?? null;
  }

  // ===========================================================================
  // Candidate Find Operations
  // ===========================================================================

  async findCandidates(
    context: TenantContext,
    planId: string
  ): Promise<CandidateRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<CandidateRow[]>`
        SELECT
          sc.id,
          sc.tenant_id as "tenantId",
          sc.plan_id as "planId",
          sc.employee_id as "employeeId",
          app.get_employee_display_name(sc.employee_id) as "employeeName",
          (
            SELECT p.title
            FROM app.position_assignments pa
            INNER JOIN app.positions p ON pa.position_id = p.id
            WHERE pa.employee_id = sc.employee_id
              AND pa.is_primary = true
              AND pa.effective_to IS NULL
            LIMIT 1
          ) as "currentPosition",
          (
            SELECT ou.name
            FROM app.position_assignments pa
            INNER JOIN app.positions p ON pa.position_id = p.id
            INNER JOIN app.org_units ou ON p.org_unit_id = ou.id
            WHERE pa.employee_id = sc.employee_id
              AND pa.is_primary = true
              AND pa.effective_to IS NULL
            LIMIT 1
          ) as "currentDepartment",
          sc.readiness,
          sc.ranking,
          sc.assessment_notes as "assessmentNotes",
          sc.strengths,
          sc.development_areas as "developmentAreas",
          sc.is_active as "isActive",
          sc.created_at as "createdAt",
          sc.updated_at as "updatedAt"
        FROM app.succession_candidates sc
        WHERE sc.plan_id = ${planId}::uuid
          AND sc.tenant_id = ${context.tenantId}::uuid
          AND sc.is_active = true
        ORDER BY sc.ranking
      `;
    });
  }

  async findCandidateById(
    context: TenantContext,
    id: string
  ): Promise<CandidateRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<CandidateRow[]>`
        SELECT
          sc.id,
          sc.tenant_id as "tenantId",
          sc.plan_id as "planId",
          sc.employee_id as "employeeId",
          app.get_employee_display_name(sc.employee_id) as "employeeName",
          (
            SELECT p.title
            FROM app.position_assignments pa
            INNER JOIN app.positions p ON pa.position_id = p.id
            WHERE pa.employee_id = sc.employee_id
              AND pa.is_primary = true
              AND pa.effective_to IS NULL
            LIMIT 1
          ) as "currentPosition",
          (
            SELECT ou.name
            FROM app.position_assignments pa
            INNER JOIN app.positions p ON pa.position_id = p.id
            INNER JOIN app.org_units ou ON p.org_unit_id = ou.id
            WHERE pa.employee_id = sc.employee_id
              AND pa.is_primary = true
              AND pa.effective_to IS NULL
            LIMIT 1
          ) as "currentDepartment",
          sc.readiness,
          sc.ranking,
          sc.assessment_notes as "assessmentNotes",
          sc.strengths,
          sc.development_areas as "developmentAreas",
          sc.is_active as "isActive",
          sc.created_at as "createdAt",
          sc.updated_at as "updatedAt"
        FROM app.succession_candidates sc
        WHERE sc.id = ${id}::uuid
          AND sc.tenant_id = ${context.tenantId}::uuid
      `;
    });

    return rows[0] ?? null;
  }

  // ===========================================================================
  // Write Operations
  // ===========================================================================

  async createPlan(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateSuccessionPlan
  ): Promise<SuccessionPlanRow> {
    const rows = await tx<SuccessionPlanRow[]>`
      INSERT INTO app.succession_plans (
        tenant_id, position_id, is_critical_role, criticality_reason,
        risk_level, incumbent_retirement_risk, incumbent_flight_risk,
        market_scarcity, notes, next_review_date
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.position_id}::uuid,
        ${data.is_critical_role ?? false},
        ${data.criticality_reason ?? null},
        ${data.risk_level ?? "medium"},
        ${data.incumbent_retirement_risk ?? false},
        ${data.incumbent_flight_risk ?? false},
        ${data.market_scarcity ?? false},
        ${data.notes ?? null},
        ${data.next_review_date ?? null}::date
      )
      RETURNING
        id,
        tenant_id as "tenantId",
        position_id as "positionId",
        is_critical_role as "isCriticalRole",
        criticality_reason as "criticalityReason",
        risk_level as "riskLevel",
        incumbent_retirement_risk as "incumbentRetirementRisk",
        incumbent_flight_risk as "incumbentFlightRisk",
        market_scarcity as "marketScarcity",
        notes,
        0 as "candidateCount",
        0 as "readyNowCount",
        last_reviewed_at as "lastReviewedAt",
        next_review_date as "nextReviewDate",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    return rows[0]!;
  }

  async updatePlan(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateSuccessionPlan
  ): Promise<SuccessionPlanRow | null> {
    const rows = await tx<SuccessionPlanRow[]>`
      UPDATE app.succession_plans
      SET
        is_critical_role = COALESCE(${data.is_critical_role ?? null}, is_critical_role),
        criticality_reason = COALESCE(${data.criticality_reason ?? null}, criticality_reason),
        risk_level = COALESCE(${data.risk_level ?? null}, risk_level),
        incumbent_retirement_risk = COALESCE(${data.incumbent_retirement_risk ?? null}, incumbent_retirement_risk),
        incumbent_flight_risk = COALESCE(${data.incumbent_flight_risk ?? null}, incumbent_flight_risk),
        market_scarcity = COALESCE(${data.market_scarcity ?? null}, market_scarcity),
        notes = COALESCE(${data.notes ?? null}, notes),
        next_review_date = COALESCE(${data.next_review_date ?? null}::date, next_review_date),
        last_reviewed_by = ${context.userId}::uuid,
        last_reviewed_at = now(),
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
      RETURNING
        id,
        tenant_id as "tenantId",
        position_id as "positionId",
        is_critical_role as "isCriticalRole",
        criticality_reason as "criticalityReason",
        risk_level as "riskLevel",
        incumbent_retirement_risk as "incumbentRetirementRisk",
        incumbent_flight_risk as "incumbentFlightRisk",
        market_scarcity as "marketScarcity",
        notes,
        last_reviewed_at as "lastReviewedAt",
        next_review_date as "nextReviewDate",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    return rows[0] ?? null;
  }

  async deletePlan(
    tx: TransactionSql,
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      UPDATE app.succession_plans
      SET is_active = false, updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
    `;

    return result.count > 0;
  }

  async createCandidate(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateCandidate
  ): Promise<CandidateRow> {
    // Get max ranking if not provided
    let ranking = data.ranking;
    if (!ranking) {
      const maxResult = await tx<{ maxRanking: number | null }[]>`
        SELECT MAX(ranking) as "maxRanking"
        FROM app.succession_candidates
        WHERE plan_id = ${data.plan_id}::uuid
          AND is_active = true
      `;
      ranking = (maxResult[0]?.maxRanking ?? 0) + 1;
    }

    const rows = await tx<CandidateRow[]>`
      INSERT INTO app.succession_candidates (
        tenant_id, plan_id, employee_id, readiness, ranking,
        assessment_notes, strengths, development_areas
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.plan_id}::uuid,
        ${data.employee_id}::uuid,
        ${data.readiness},
        ${ranking},
        ${data.assessment_notes ?? null},
        ${data.strengths ?? []}::text[],
        ${data.development_areas ?? []}::text[]
      )
      RETURNING
        id,
        tenant_id as "tenantId",
        plan_id as "planId",
        employee_id as "employeeId",
        readiness,
        ranking,
        assessment_notes as "assessmentNotes",
        strengths,
        development_areas as "developmentAreas",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    return rows[0]!;
  }

  async updateCandidate(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateCandidate
  ): Promise<CandidateRow | null> {
    const rows = await tx<CandidateRow[]>`
      UPDATE app.succession_candidates
      SET
        readiness = COALESCE(${data.readiness ?? null}, readiness),
        ranking = COALESCE(${data.ranking ?? null}, ranking),
        assessment_notes = COALESCE(${data.assessment_notes ?? null}, assessment_notes),
        strengths = COALESCE(${data.strengths ?? null}::text[], strengths),
        development_areas = COALESCE(${data.development_areas ?? null}::text[], development_areas),
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
      RETURNING
        id,
        tenant_id as "tenantId",
        plan_id as "planId",
        employee_id as "employeeId",
        readiness,
        ranking,
        assessment_notes as "assessmentNotes",
        strengths,
        development_areas as "developmentAreas",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    return rows[0] ?? null;
  }

  async deleteCandidate(
    tx: TransactionSql,
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      UPDATE app.succession_candidates
      SET is_active = false, updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
    `;

    return result.count > 0;
  }

  // ===========================================================================
  // Pipeline & Gap Analysis
  // ===========================================================================

  async getPipeline(context: TenantContext): Promise<any[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT position_id, position_title, org_unit_name,
               is_critical, risk_level, incumbent_name,
               candidate_count, ready_now_count, ready_1_year_count
        FROM app.get_succession_pipeline(${context.tenantId}::uuid)
      `;
    });
  }

  async getGaps(context: TenantContext): Promise<any[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT position_id, position_title, org_unit_name,
               risk_level, gap_severity
        FROM app.get_succession_gaps(${context.tenantId}::uuid)
      `;
    });
  }

  async getPipelineStats(context: TenantContext): Promise<PipelineStatsRow> {
    return await this.db.withTransaction(context, async (tx) => {
      // Get total critical positions (positions with active succession plans)
      const [criticalRow] = await tx<{ count: number }[]>`
        SELECT COUNT(DISTINCT sp.position_id)::int as count
        FROM app.succession_plans sp
        WHERE sp.is_active = true
      `;

      // Get covered positions (have at least one ready-now candidate)
      const [coveredRow] = await tx<{ count: number }[]>`
        SELECT COUNT(DISTINCT sp.position_id)::int as count
        FROM app.succession_plans sp
        JOIN app.succession_candidates sc ON sc.plan_id = sp.id
        WHERE sp.is_active = true
          AND sc.is_active = true
          AND sc.readiness = 'ready_now'
      `;

      // Get ready now candidates
      const [readyNowRow] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int as count
        FROM app.succession_candidates sc
        JOIN app.succession_plans sp ON sp.id = sc.plan_id
        WHERE sp.is_active = true
          AND sc.is_active = true
          AND sc.readiness = 'ready_now'
      `;

      // Get high risk positions (active plans with no successors at all)
      const [highRiskRow] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int as count
        FROM app.succession_plans sp
        WHERE sp.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM app.succession_candidates sc
            WHERE sc.plan_id = sp.id AND sc.is_active = true
          )
      `;

      const totalCritical = criticalRow?.count ?? 0;
      const covered = coveredRow?.count ?? 0;

      return {
        totalCriticalPositions: totalCritical,
        coveredPositions: covered,
        uncoveredPositions: totalCritical - covered,
        readyNowCandidates: readyNowRow?.count ?? 0,
        highRiskPositions: highRiskRow?.count ?? 0,
      };
    });
  }
}
