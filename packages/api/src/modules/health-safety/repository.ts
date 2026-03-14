/**
 * Health & Safety Module - Repository Layer
 *
 * Provides data access methods for Health & Safety entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * Tables: hs_incidents, hs_risk_assessments, hs_dse_assessments
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateIncident,
  UpdateIncident,
  IncidentFilters,
  CreateRiskAssessment,
  UpdateRiskAssessment,
  RiskAssessmentFilters,
  CreateDSEAssessment,
  UpdateDSEAssessment,
  DSEAssessmentFilters,
  PaginationQuery,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface IncidentRow extends Row {
  id: string;
  tenantId: string;
  reportedByEmployeeId: string | null;
  injuredEmployeeId: string | null;
  incidentDate: Date;
  reportedDate: Date;
  location: string | null;
  description: string;
  severity: string;
  injuryType: string | null;
  bodyPartAffected: string | null;
  treatmentGiven: string | null;
  witnessNames: string[] | null;
  status: string;
  investigationFindings: string | null;
  correctiveActions: string | null;
  riddorReportable: boolean;
  riddorReference: string | null;
  riddorReportedDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RiskAssessmentRow extends Row {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  areaOrActivity: string | null;
  assessorEmployeeId: string | null;
  assessmentDate: string;
  reviewDate: string;
  status: string;
  hazards: unknown;
  overallRiskLevel: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DSEAssessmentRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  assessmentDate: string;
  nextReviewDate: string | null;
  assessorEmployeeId: string | null;
  workstationAdequate: boolean | null;
  chairAdjustable: boolean | null;
  screenPositionOk: boolean | null;
  lightingAdequate: boolean | null;
  breaksTaken: boolean | null;
  eyeTestOffered: boolean | null;
  issuesFound: string | null;
  actionsRequired: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class HealthSafetyRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Incidents
  // ===========================================================================

  async listIncidents(
    ctx: TenantContext,
    filters: IncidentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<IncidentRow>> {
    const limit = pagination.limit || 20;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<IncidentRow[]>`
        SELECT
          id, tenant_id, reported_by_employee_id, injured_employee_id,
          incident_date, reported_date, location, description,
          severity, injury_type, body_part_affected, treatment_given,
          witness_names, status, investigation_findings, corrective_actions,
          riddor_reportable, riddor_reference, riddor_reported_date,
          created_at, updated_at
        FROM hs_incidents
        WHERE tenant_id = ${ctx.tenantId}
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.severity ? tx`AND severity = ${filters.severity}` : tx``}
          ${filters.riddor_reportable !== undefined ? tx`AND riddor_reportable = ${filters.riddor_reportable}` : tx``}
          ${filters.injured_employee_id ? tx`AND injured_employee_id = ${filters.injured_employee_id}` : tx``}
          ${filters.date_from ? tx`AND incident_date >= ${filters.date_from}::date` : tx``}
          ${filters.date_to ? tx`AND incident_date <= ${filters.date_to}::date + interval '1 day'` : tx``}
          ${filters.search ? tx`AND (description ILIKE ${"%" + filters.search + "%"} OR location ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${pagination.cursor ? tx`AND id < ${pagination.cursor}` : tx``}
        ORDER BY incident_date DESC, id DESC
        LIMIT ${limit + 1}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

      return { items, nextCursor, hasMore };
    });
  }

  async getIncidentById(
    ctx: TenantContext,
    id: string
  ): Promise<IncidentRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<IncidentRow[]>`
        SELECT
          id, tenant_id, reported_by_employee_id, injured_employee_id,
          incident_date, reported_date, location, description,
          severity, injury_type, body_part_affected, treatment_given,
          witness_names, status, investigation_findings, corrective_actions,
          riddor_reportable, riddor_reference, riddor_reported_date,
          created_at, updated_at
        FROM hs_incidents
        WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
      `;
      return rows[0] || null;
    });
  }

  async createIncident(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: CreateIncident
  ): Promise<IncidentRow> {
    const rows = await tx<IncidentRow[]>`
      INSERT INTO hs_incidents (
        id, tenant_id, reported_by_employee_id, injured_employee_id,
        incident_date, reported_date, location, description,
        severity, injury_type, body_part_affected, treatment_given,
        witness_names, riddor_reportable
      ) VALUES (
        ${id}, ${ctx.tenantId},
        ${data.reported_by_employee_id || null},
        ${data.injured_employee_id || null},
        ${data.incident_date}::timestamptz,
        now(),
        ${data.location || null},
        ${data.description},
        ${data.severity},
        ${data.injury_type || null},
        ${data.body_part_affected || null},
        ${data.treatment_given || null},
        ${data.witness_names ? tx`${data.witness_names}` : tx`NULL`},
        ${data.riddor_reportable || false}
      )
      RETURNING
        id, tenant_id, reported_by_employee_id, injured_employee_id,
        incident_date, reported_date, location, description,
        severity, injury_type, body_part_affected, treatment_given,
        witness_names, status, investigation_findings, corrective_actions,
        riddor_reportable, riddor_reference, riddor_reported_date,
        created_at, updated_at
    `;
    return rows[0]!;
  }

  async updateIncident(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: UpdateIncident
  ): Promise<IncidentRow | null> {
    // Check if there's anything to update
    const hasChanges = [
      data.location, data.description, data.severity, data.injury_type,
      data.body_part_affected, data.treatment_given, data.witness_names,
      data.status, data.investigation_findings, data.corrective_actions,
      data.riddor_reportable, data.riddor_reference, data.riddor_reported_date,
    ].some((v) => v !== undefined);

    if (!hasChanges) return this.getIncidentById(ctx, id);

    // UPDATE with all fields that were provided (conditional SET via tagged template)
    const rows = await tx<IncidentRow[]>`
      UPDATE hs_incidents SET
        ${data.location !== undefined ? tx`location = ${data.location},` : tx``}
        ${data.description !== undefined ? tx`description = ${data.description},` : tx``}
        ${data.severity !== undefined ? tx`severity = ${data.severity},` : tx``}
        ${data.injury_type !== undefined ? tx`injury_type = ${data.injury_type},` : tx``}
        ${data.body_part_affected !== undefined ? tx`body_part_affected = ${data.body_part_affected},` : tx``}
        ${data.treatment_given !== undefined ? tx`treatment_given = ${data.treatment_given},` : tx``}
        ${data.witness_names !== undefined ? tx`witness_names = ${data.witness_names},` : tx``}
        ${data.status !== undefined ? tx`status = ${data.status},` : tx``}
        ${data.investigation_findings !== undefined ? tx`investigation_findings = ${data.investigation_findings},` : tx``}
        ${data.corrective_actions !== undefined ? tx`corrective_actions = ${data.corrective_actions},` : tx``}
        ${data.riddor_reportable !== undefined ? tx`riddor_reportable = ${data.riddor_reportable},` : tx``}
        ${data.riddor_reference !== undefined ? tx`riddor_reference = ${data.riddor_reference},` : tx``}
        ${data.riddor_reported_date !== undefined ? tx`riddor_reported_date = ${data.riddor_reported_date},` : tx``}
        updated_at = now()
      WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
      RETURNING
        id, tenant_id, reported_by_employee_id, injured_employee_id,
        incident_date, reported_date, location, description,
        severity, injury_type, body_part_affected, treatment_given,
        witness_names, status, investigation_findings, corrective_actions,
        riddor_reportable, riddor_reference, riddor_reported_date,
        created_at, updated_at
    `;

    return rows[0] || null;
  }

  async getRIDDORIncidents(
    ctx: TenantContext,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<IncidentRow>> {
    const limit = pagination.limit || 20;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<IncidentRow[]>`
        SELECT
          id, tenant_id, reported_by_employee_id, injured_employee_id,
          incident_date, reported_date, location, description,
          severity, injury_type, body_part_affected, treatment_given,
          witness_names, status, investigation_findings, corrective_actions,
          riddor_reportable, riddor_reference, riddor_reported_date,
          created_at, updated_at
        FROM hs_incidents
        WHERE tenant_id = ${ctx.tenantId}
          AND riddor_reportable = true
          ${pagination.cursor ? tx`AND id < ${pagination.cursor}` : tx``}
        ORDER BY incident_date DESC, id DESC
        LIMIT ${limit + 1}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

      return { items, nextCursor, hasMore };
    });
  }

  // ===========================================================================
  // Risk Assessments
  // ===========================================================================

  async listRiskAssessments(
    ctx: TenantContext,
    filters: RiskAssessmentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<RiskAssessmentRow>> {
    const limit = pagination.limit || 20;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<RiskAssessmentRow[]>`
        SELECT
          id, tenant_id, title, description, area_or_activity,
          assessor_employee_id, assessment_date, review_date,
          status, hazards, overall_risk_level,
          approved_by, approved_at, created_at, updated_at
        FROM hs_risk_assessments
        WHERE tenant_id = ${ctx.tenantId}
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.overall_risk_level ? tx`AND overall_risk_level = ${filters.overall_risk_level}` : tx``}
          ${filters.assessor_employee_id ? tx`AND assessor_employee_id = ${filters.assessor_employee_id}` : tx``}
          ${filters.overdue ? tx`AND review_date < CURRENT_DATE AND status IN ('active', 'review_due')` : tx``}
          ${filters.search ? tx`AND (title ILIKE ${"%" + filters.search + "%"} OR area_or_activity ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${pagination.cursor ? tx`AND id < ${pagination.cursor}` : tx``}
        ORDER BY review_date ASC, id DESC
        LIMIT ${limit + 1}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

      return { items, nextCursor, hasMore };
    });
  }

  async getRiskAssessmentById(
    ctx: TenantContext,
    id: string
  ): Promise<RiskAssessmentRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<RiskAssessmentRow[]>`
        SELECT
          id, tenant_id, title, description, area_or_activity,
          assessor_employee_id, assessment_date, review_date,
          status, hazards, overall_risk_level,
          approved_by, approved_at, created_at, updated_at
        FROM hs_risk_assessments
        WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
      `;
      return rows[0] || null;
    });
  }

  async createRiskAssessment(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: CreateRiskAssessment
  ): Promise<RiskAssessmentRow> {
    const hazardsJson = data.hazards ? JSON.stringify(data.hazards) : "[]";

    const rows = await tx<RiskAssessmentRow[]>`
      INSERT INTO hs_risk_assessments (
        id, tenant_id, title, description, area_or_activity,
        assessor_employee_id, assessment_date, review_date,
        hazards, overall_risk_level
      ) VALUES (
        ${id}, ${ctx.tenantId},
        ${data.title},
        ${data.description || null},
        ${data.area_or_activity || null},
        ${data.assessor_employee_id || null},
        ${data.assessment_date}::date,
        ${data.review_date}::date,
        ${hazardsJson}::jsonb,
        ${data.overall_risk_level || "low"}
      )
      RETURNING
        id, tenant_id, title, description, area_or_activity,
        assessor_employee_id, assessment_date, review_date,
        status, hazards, overall_risk_level,
        approved_by, approved_at, created_at, updated_at
    `;
    return rows[0]!;
  }

  async updateRiskAssessment(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: UpdateRiskAssessment
  ): Promise<RiskAssessmentRow | null> {
    const hazardsJson = data.hazards !== undefined ? JSON.stringify(data.hazards) : undefined;

    const rows = await tx<RiskAssessmentRow[]>`
      UPDATE hs_risk_assessments SET
        ${data.title !== undefined ? tx`title = ${data.title},` : tx``}
        ${data.description !== undefined ? tx`description = ${data.description},` : tx``}
        ${data.area_or_activity !== undefined ? tx`area_or_activity = ${data.area_or_activity},` : tx``}
        ${data.assessor_employee_id !== undefined ? tx`assessor_employee_id = ${data.assessor_employee_id},` : tx``}
        ${data.assessment_date !== undefined ? tx`assessment_date = ${data.assessment_date}::date,` : tx``}
        ${data.review_date !== undefined ? tx`review_date = ${data.review_date}::date,` : tx``}
        ${data.status !== undefined ? tx`status = ${data.status},` : tx``}
        ${hazardsJson !== undefined ? tx`hazards = ${hazardsJson}::jsonb,` : tx``}
        ${data.overall_risk_level !== undefined ? tx`overall_risk_level = ${data.overall_risk_level},` : tx``}
        updated_at = now()
      WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
      RETURNING
        id, tenant_id, title, description, area_or_activity,
        assessor_employee_id, assessment_date, review_date,
        status, hazards, overall_risk_level,
        approved_by, approved_at, created_at, updated_at
    `;

    return rows[0] || null;
  }

  async approveRiskAssessment(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    approverEmployeeId: string
  ): Promise<RiskAssessmentRow | null> {
    const rows = await tx<RiskAssessmentRow[]>`
      UPDATE hs_risk_assessments SET
        status = 'active',
        approved_by = ${approverEmployeeId},
        approved_at = now(),
        updated_at = now()
      WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
      RETURNING
        id, tenant_id, title, description, area_or_activity,
        assessor_employee_id, assessment_date, review_date,
        status, hazards, overall_risk_level,
        approved_by, approved_at, created_at, updated_at
    `;
    return rows[0] || null;
  }

  // ===========================================================================
  // DSE Assessments
  // ===========================================================================

  async listDSEAssessments(
    ctx: TenantContext,
    filters: DSEAssessmentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<DSEAssessmentRow>> {
    const limit = pagination.limit || 20;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<DSEAssessmentRow[]>`
        SELECT
          id, tenant_id, employee_id, assessment_date, next_review_date,
          assessor_employee_id, workstation_adequate, chair_adjustable,
          screen_position_ok, lighting_adequate, breaks_taken,
          eye_test_offered, issues_found, actions_required,
          status, created_at, updated_at
        FROM hs_dse_assessments
        WHERE tenant_id = ${ctx.tenantId}
          ${filters.employee_id ? tx`AND employee_id = ${filters.employee_id}` : tx``}
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.overdue ? tx`AND next_review_date < CURRENT_DATE AND status IN ('completed', 'review_due')` : tx``}
          ${pagination.cursor ? tx`AND id < ${pagination.cursor}` : tx``}
        ORDER BY assessment_date DESC, id DESC
        LIMIT ${limit + 1}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

      return { items, nextCursor, hasMore };
    });
  }

  async getDSEAssessmentById(
    ctx: TenantContext,
    id: string
  ): Promise<DSEAssessmentRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<DSEAssessmentRow[]>`
        SELECT
          id, tenant_id, employee_id, assessment_date, next_review_date,
          assessor_employee_id, workstation_adequate, chair_adjustable,
          screen_position_ok, lighting_adequate, breaks_taken,
          eye_test_offered, issues_found, actions_required,
          status, created_at, updated_at
        FROM hs_dse_assessments
        WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
      `;
      return rows[0] || null;
    });
  }

  async getDSEAssessmentsByEmployee(
    ctx: TenantContext,
    employeeId: string,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<DSEAssessmentRow>> {
    const limit = pagination.limit || 20;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<DSEAssessmentRow[]>`
        SELECT
          id, tenant_id, employee_id, assessment_date, next_review_date,
          assessor_employee_id, workstation_adequate, chair_adjustable,
          screen_position_ok, lighting_adequate, breaks_taken,
          eye_test_offered, issues_found, actions_required,
          status, created_at, updated_at
        FROM hs_dse_assessments
        WHERE tenant_id = ${ctx.tenantId}
          AND employee_id = ${employeeId}
          ${pagination.cursor ? tx`AND id < ${pagination.cursor}` : tx``}
        ORDER BY assessment_date DESC, id DESC
        LIMIT ${limit + 1}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

      return { items, nextCursor, hasMore };
    });
  }

  async createDSEAssessment(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: CreateDSEAssessment
  ): Promise<DSEAssessmentRow> {
    const nextReview = data.next_review_date || null;

    const rows = await tx<DSEAssessmentRow[]>`
      INSERT INTO hs_dse_assessments (
        id, tenant_id, employee_id, assessment_date, next_review_date,
        assessor_employee_id, workstation_adequate, chair_adjustable,
        screen_position_ok, lighting_adequate, breaks_taken,
        eye_test_offered, issues_found, actions_required, status
      ) VALUES (
        ${id}, ${ctx.tenantId},
        ${data.employee_id},
        ${data.assessment_date}::date,
        ${nextReview}::date,
        ${data.assessor_employee_id || null},
        ${data.workstation_adequate ?? null},
        ${data.chair_adjustable ?? null},
        ${data.screen_position_ok ?? null},
        ${data.lighting_adequate ?? null},
        ${data.breaks_taken ?? null},
        ${data.eye_test_offered ?? null},
        ${data.issues_found || null},
        ${data.actions_required || null},
        ${data.status || "completed"}
      )
      RETURNING
        id, tenant_id, employee_id, assessment_date, next_review_date,
        assessor_employee_id, workstation_adequate, chair_adjustable,
        screen_position_ok, lighting_adequate, breaks_taken,
        eye_test_offered, issues_found, actions_required,
        status, created_at, updated_at
    `;
    return rows[0]!;
  }

  async updateDSEAssessment(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: UpdateDSEAssessment
  ): Promise<DSEAssessmentRow | null> {
    const rows = await tx<DSEAssessmentRow[]>`
      UPDATE hs_dse_assessments SET
        ${data.next_review_date !== undefined ? tx`next_review_date = ${data.next_review_date},` : tx``}
        ${data.assessor_employee_id !== undefined ? tx`assessor_employee_id = ${data.assessor_employee_id},` : tx``}
        ${data.workstation_adequate !== undefined ? tx`workstation_adequate = ${data.workstation_adequate},` : tx``}
        ${data.chair_adjustable !== undefined ? tx`chair_adjustable = ${data.chair_adjustable},` : tx``}
        ${data.screen_position_ok !== undefined ? tx`screen_position_ok = ${data.screen_position_ok},` : tx``}
        ${data.lighting_adequate !== undefined ? tx`lighting_adequate = ${data.lighting_adequate},` : tx``}
        ${data.breaks_taken !== undefined ? tx`breaks_taken = ${data.breaks_taken},` : tx``}
        ${data.eye_test_offered !== undefined ? tx`eye_test_offered = ${data.eye_test_offered},` : tx``}
        ${data.issues_found !== undefined ? tx`issues_found = ${data.issues_found},` : tx``}
        ${data.actions_required !== undefined ? tx`actions_required = ${data.actions_required},` : tx``}
        ${data.status !== undefined ? tx`status = ${data.status},` : tx``}
        updated_at = now()
      WHERE id = ${id} AND tenant_id = ${ctx.tenantId}
      RETURNING
        id, tenant_id, employee_id, assessment_date, next_review_date,
        assessor_employee_id, workstation_adequate, chair_adjustable,
        screen_position_ok, lighting_adequate, breaks_taken,
        eye_test_offered, issues_found, actions_required,
        status, created_at, updated_at
    `;

    return rows[0] || null;
  }

  // ===========================================================================
  // Dashboard / Aggregations
  // ===========================================================================

  async getDashboardStats(ctx: TenantContext): Promise<{
    openIncidents: number;
    investigatingIncidents: number;
    riddorReportableTotal: number;
    riddorUnreported: number;
    activeRiskAssessments: number;
    overdueRiskReviews: number;
    highCriticalRisks: number;
    dseActionsPending: number;
    dseReviewsDue: number;
  }> {
    return this.db.withTransaction(ctx, async (tx) => {
      // Run all counts in a single query for efficiency
      const [stats] = await tx<Array<{
        openIncidents: string;
        investigatingIncidents: string;
        riddorReportableTotal: string;
        riddorUnreported: string;
        activeRiskAssessments: string;
        overdueRiskReviews: string;
        highCriticalRisks: string;
        dseActionsPending: string;
        dseReviewsDue: string;
      }>>`
        SELECT
          (SELECT COUNT(*) FROM hs_incidents WHERE tenant_id = ${ctx.tenantId} AND status = 'reported') AS open_incidents,
          (SELECT COUNT(*) FROM hs_incidents WHERE tenant_id = ${ctx.tenantId} AND status = 'investigating') AS investigating_incidents,
          (SELECT COUNT(*) FROM hs_incidents WHERE tenant_id = ${ctx.tenantId} AND riddor_reportable = true) AS riddor_reportable_total,
          (SELECT COUNT(*) FROM hs_incidents WHERE tenant_id = ${ctx.tenantId} AND riddor_reportable = true AND riddor_reported_date IS NULL) AS riddor_unreported,
          (SELECT COUNT(*) FROM hs_risk_assessments WHERE tenant_id = ${ctx.tenantId} AND status = 'active') AS active_risk_assessments,
          (SELECT COUNT(*) FROM hs_risk_assessments WHERE tenant_id = ${ctx.tenantId} AND status IN ('active', 'review_due') AND review_date < CURRENT_DATE) AS overdue_risk_reviews,
          (SELECT COUNT(*) FROM hs_risk_assessments WHERE tenant_id = ${ctx.tenantId} AND status IN ('active', 'draft') AND overall_risk_level IN ('high', 'critical')) AS high_critical_risks,
          (SELECT COUNT(*) FROM hs_dse_assessments WHERE tenant_id = ${ctx.tenantId} AND status = 'actions_pending') AS dse_actions_pending,
          (SELECT COUNT(*) FROM hs_dse_assessments WHERE tenant_id = ${ctx.tenantId} AND status IN ('completed', 'review_due') AND next_review_date < CURRENT_DATE) AS dse_reviews_due
      `;

      return {
        openIncidents: Number(stats?.openIncidents || 0),
        investigatingIncidents: Number(stats?.investigatingIncidents || 0),
        riddorReportableTotal: Number(stats?.riddorReportableTotal || 0),
        riddorUnreported: Number(stats?.riddorUnreported || 0),
        activeRiskAssessments: Number(stats?.activeRiskAssessments || 0),
        overdueRiskReviews: Number(stats?.overdueRiskReviews || 0),
        highCriticalRisks: Number(stats?.highCriticalRisks || 0),
        dseActionsPending: Number(stats?.dseActionsPending || 0),
        dseReviewsDue: Number(stats?.dseReviewsDue || 0),
      };
    });
  }
}
