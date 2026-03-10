/**
 * Competencies Module - Repository Layer
 *
 * Handles database operations for competency management.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  CreateCompetency,
  UpdateCompetency,
  CreateJobCompetency,
  UpdateJobCompetency,
  CreatePositionCompetency,
  UpdatePositionCompetency,
  CreateEmployeeCompetency,
  UpdateEmployeeCompetency,
  CompetencyFilters,
  CompetencyCategory,
} from "./schemas";

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface CompetencyRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  category: CompetencyCategory;
  description: string | null;
  levels: any[];
  assessmentCriteria: string[];
  behavioralIndicators: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobCompetencyRow {
  id: string;
  tenantId: string;
  jobId: string;
  competencyId: string;
  competencyName: string;
  competencyCategory: CompetencyCategory;
  requiredLevel: number;
  isRequired: boolean;
  weight: number;
  createdAt: Date;
}

export interface PositionCompetencyRow {
  id: string;
  tenantId: string;
  positionId: string;
  competencyId: string;
  competencyName: string;
  competencyCategory: CompetencyCategory;
  requiredLevel: number;
  isRequired: boolean;
  weight: number;
  createdAt: Date;
}

export interface EmployeeCompetencyRow {
  id: string;
  tenantId: string;
  employeeId: string;
  employeeName: string;
  competencyId: string;
  competencyName: string;
  competencyCategory: CompetencyCategory;
  currentLevel: number | null;
  targetLevel: number | null;
  selfAssessmentLevel: number | null;
  managerAssessmentLevel: number | null;
  assessmentNotes: string | null;
  assessedAt: Date | null;
  assessedBy: string | null;
  assessmentSource: string | null;
  nextAssessmentDue: Date | null;
  evidence: any[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CompetencyGapRow {
  competencyId: string;
  competencyName: string;
  competencyCategory: CompetencyCategory;
  requiredLevel: number;
  currentLevel: number;
  gap: number;
  isRequired: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class CompetenciesRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Competency Library Operations
  // ===========================================================================

  async findCompetencies(
    context: TenantContext,
    filters: CompetencyFilters = {},
    pagination: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedResult<CompetencyRow>> {
    const limit = pagination.limit ?? 20;

    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<CompetencyRow[]>`
        SELECT
          id,
          tenant_id as "tenantId",
          code,
          name,
          category,
          description,
          levels,
          assessment_criteria as "assessmentCriteria",
          behavioral_indicators as "behavioralIndicators",
          is_active as "isActive",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM app.competencies
        WHERE tenant_id = ${context.tenantId}::uuid
          ${filters.category ? tx`AND category = ${filters.category}` : tx``}
          ${filters.is_active !== undefined ? tx`AND is_active = ${filters.is_active}` : tx``}
          ${filters.search ? tx`AND (name ILIKE ${"%" + filters.search + "%"} OR code ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${pagination.cursor ? tx`AND id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY category, name, id
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  async findCompetencyById(
    context: TenantContext,
    id: string
  ): Promise<CompetencyRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<CompetencyRow[]>`
        SELECT
          id,
          tenant_id as "tenantId",
          code,
          name,
          category,
          description,
          levels,
          assessment_criteria as "assessmentCriteria",
          behavioral_indicators as "behavioralIndicators",
          is_active as "isActive",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM app.competencies
        WHERE id = ${id}::uuid
          AND tenant_id = ${context.tenantId}::uuid
      `;
    });

    return rows[0] ?? null;
  }

  async createCompetency(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateCompetency
  ): Promise<CompetencyRow> {
    const rows = await tx<CompetencyRow[]>`
      INSERT INTO app.competencies (
        tenant_id, code, name, category, description,
        levels, assessment_criteria, behavioral_indicators
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.code},
        ${data.name},
        ${data.category},
        ${data.description ?? null},
        ${JSON.stringify(data.levels ?? [])}::jsonb,
        ${data.assessment_criteria ?? []}::jsonb,
        ${data.behavioral_indicators ?? []}::jsonb
      )
      RETURNING
        id,
        tenant_id as "tenantId",
        code,
        name,
        category,
        description,
        levels,
        assessment_criteria as "assessmentCriteria",
        behavioral_indicators as "behavioralIndicators",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    return rows[0]!;
  }

  async updateCompetency(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateCompetency
  ): Promise<CompetencyRow | null> {
    const rows = await tx<CompetencyRow[]>`
      UPDATE app.competencies
      SET
        name = COALESCE(${data.name ?? null}, name),
        category = COALESCE(${data.category ?? null}, category),
        description = COALESCE(${data.description ?? null}, description),
        levels = COALESCE(${data.levels ? JSON.stringify(data.levels) : null}::jsonb, levels),
        assessment_criteria = COALESCE(${data.assessment_criteria ?? null}::jsonb, assessment_criteria),
        behavioral_indicators = COALESCE(${data.behavioral_indicators ?? null}::jsonb, behavioral_indicators),
        is_active = COALESCE(${data.is_active ?? null}, is_active),
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
      RETURNING
        id,
        tenant_id as "tenantId",
        code,
        name,
        category,
        description,
        levels,
        assessment_criteria as "assessmentCriteria",
        behavioral_indicators as "behavioralIndicators",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    return rows[0] ?? null;
  }

  async deleteCompetency(
    tx: TransactionSql,
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      UPDATE app.competencies
      SET is_active = false, updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
    `;

    return result.count > 0;
  }

  // ===========================================================================
  // Job Competency Operations
  // ===========================================================================

  async findJobCompetencies(
    context: TenantContext,
    jobId: string
  ): Promise<JobCompetencyRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<JobCompetencyRow[]>`
        SELECT
          jc.id,
          jc.tenant_id as "tenantId",
          jc.job_id as "jobId",
          jc.competency_id as "competencyId",
          c.name as "competencyName",
          c.category as "competencyCategory",
          jc.required_level as "requiredLevel",
          jc.is_required as "isRequired",
          jc.weight,
          jc.created_at as "createdAt"
        FROM app.job_competencies jc
        INNER JOIN app.competencies c ON jc.competency_id = c.id
        WHERE jc.job_id = ${jobId}::uuid
          AND jc.tenant_id = ${context.tenantId}::uuid
        ORDER BY jc.is_required DESC, jc.weight DESC
      `;
    });
  }

  async createJobCompetency(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateJobCompetency
  ): Promise<JobCompetencyRow> {
    const rows = await tx<JobCompetencyRow[]>`
      INSERT INTO app.job_competencies (
        tenant_id, job_id, competency_id, required_level, is_required, weight
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.job_id}::uuid,
        ${data.competency_id}::uuid,
        ${data.required_level},
        ${data.is_required ?? true},
        ${data.weight ?? 1}
      )
      RETURNING
        id,
        tenant_id as "tenantId",
        job_id as "jobId",
        competency_id as "competencyId",
        required_level as "requiredLevel",
        is_required as "isRequired",
        weight,
        created_at as "createdAt"
    `;

    return rows[0]!;
  }

  async updateJobCompetency(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateJobCompetency
  ): Promise<boolean> {
    const result = await tx`
      UPDATE app.job_competencies
      SET
        required_level = COALESCE(${data.required_level ?? null}, required_level),
        is_required = COALESCE(${data.is_required ?? null}, is_required),
        weight = COALESCE(${data.weight ?? null}, weight),
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
    `;

    return result.count > 0;
  }

  async deleteJobCompetency(
    tx: TransactionSql,
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM app.job_competencies
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
    `;

    return result.count > 0;
  }

  // ===========================================================================
  // Employee Competency Operations
  // ===========================================================================

  async findEmployeeCompetencies(
    context: TenantContext,
    employeeId: string
  ): Promise<EmployeeCompetencyRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<EmployeeCompetencyRow[]>`
        SELECT
          ec.id,
          ec.tenant_id as "tenantId",
          ec.employee_id as "employeeId",
          app.get_employee_display_name(ec.employee_id) as "employeeName",
          ec.competency_id as "competencyId",
          c.name as "competencyName",
          c.category as "competencyCategory",
          ec.current_level as "currentLevel",
          ec.target_level as "targetLevel",
          ec.self_assessment_level as "selfAssessmentLevel",
          ec.manager_assessment_level as "managerAssessmentLevel",
          ec.assessment_notes as "assessmentNotes",
          ec.assessed_at as "assessedAt",
          ec.assessed_by as "assessedBy",
          ec.assessment_source as "assessmentSource",
          ec.next_assessment_due as "nextAssessmentDue",
          ec.evidence,
          ec.created_at as "createdAt",
          ec.updated_at as "updatedAt"
        FROM app.employee_competencies ec
        INNER JOIN app.competencies c ON ec.competency_id = c.id
        WHERE ec.employee_id = ${employeeId}::uuid
          AND ec.tenant_id = ${context.tenantId}::uuid
        ORDER BY c.category, c.name
      `;
    });
  }

  async findEmployeeCompetencyById(
    context: TenantContext,
    id: string
  ): Promise<EmployeeCompetencyRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<EmployeeCompetencyRow[]>`
        SELECT
          ec.id,
          ec.tenant_id as "tenantId",
          ec.employee_id as "employeeId",
          app.get_employee_display_name(ec.employee_id) as "employeeName",
          ec.competency_id as "competencyId",
          c.name as "competencyName",
          c.category as "competencyCategory",
          ec.current_level as "currentLevel",
          ec.target_level as "targetLevel",
          ec.self_assessment_level as "selfAssessmentLevel",
          ec.manager_assessment_level as "managerAssessmentLevel",
          ec.assessment_notes as "assessmentNotes",
          ec.assessed_at as "assessedAt",
          ec.assessed_by as "assessedBy",
          ec.assessment_source as "assessmentSource",
          ec.next_assessment_due as "nextAssessmentDue",
          ec.evidence,
          ec.created_at as "createdAt",
          ec.updated_at as "updatedAt"
        FROM app.employee_competencies ec
        INNER JOIN app.competencies c ON ec.competency_id = c.id
        WHERE ec.id = ${id}::uuid
          AND ec.tenant_id = ${context.tenantId}::uuid
      `;
    });

    return rows[0] ?? null;
  }

  async createEmployeeCompetency(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateEmployeeCompetency
  ): Promise<EmployeeCompetencyRow> {
    const rows = await tx<EmployeeCompetencyRow[]>`
      INSERT INTO app.employee_competencies (
        tenant_id, employee_id, competency_id,
        current_level, target_level, self_assessment_level,
        assessment_notes, assessment_source, next_assessment_due,
        assessed_by, assessed_at
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.competency_id}::uuid,
        ${data.current_level ?? null},
        ${data.target_level ?? null},
        ${data.self_assessment_level ?? null},
        ${data.assessment_notes ?? null},
        ${data.assessment_source ?? null},
        ${data.next_assessment_due ?? null}::date,
        ${context.userId}::uuid,
        now()
      )
      RETURNING
        id,
        tenant_id as "tenantId",
        employee_id as "employeeId",
        competency_id as "competencyId",
        current_level as "currentLevel",
        target_level as "targetLevel",
        self_assessment_level as "selfAssessmentLevel",
        manager_assessment_level as "managerAssessmentLevel",
        assessment_notes as "assessmentNotes",
        assessed_at as "assessedAt",
        assessed_by as "assessedBy",
        assessment_source as "assessmentSource",
        next_assessment_due as "nextAssessmentDue",
        evidence,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    return rows[0]!;
  }

  async updateEmployeeCompetency(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateEmployeeCompetency
  ): Promise<EmployeeCompetencyRow | null> {
    const rows = await tx<EmployeeCompetencyRow[]>`
      UPDATE app.employee_competencies
      SET
        current_level = COALESCE(${data.current_level ?? null}, current_level),
        target_level = COALESCE(${data.target_level ?? null}, target_level),
        self_assessment_level = COALESCE(${data.self_assessment_level ?? null}, self_assessment_level),
        manager_assessment_level = COALESCE(${data.manager_assessment_level ?? null}, manager_assessment_level),
        assessment_notes = COALESCE(${data.assessment_notes ?? null}, assessment_notes),
        assessment_source = COALESCE(${data.assessment_source ?? null}, assessment_source),
        next_assessment_due = COALESCE(${data.next_assessment_due ?? null}::date, next_assessment_due),
        evidence = COALESCE(${data.evidence ? JSON.stringify(data.evidence) : null}::jsonb, evidence),
        assessed_by = ${context.userId}::uuid,
        assessed_at = now(),
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
      RETURNING
        id,
        tenant_id as "tenantId",
        employee_id as "employeeId",
        competency_id as "competencyId",
        current_level as "currentLevel",
        target_level as "targetLevel",
        self_assessment_level as "selfAssessmentLevel",
        manager_assessment_level as "managerAssessmentLevel",
        assessment_notes as "assessmentNotes",
        assessed_at as "assessedAt",
        assessed_by as "assessedBy",
        assessment_source as "assessmentSource",
        next_assessment_due as "nextAssessmentDue",
        evidence,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    return rows[0] ?? null;
  }

  // ===========================================================================
  // Gap Analysis
  // ===========================================================================

  async getCompetencyGaps(
    context: TenantContext,
    employeeId: string
  ): Promise<CompetencyGapRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<CompetencyGapRow[]>`
        SELECT * FROM app.get_competency_gaps(${employeeId}::uuid)
      `;
    });
  }

  async getCompetenciesDueAssessment(
    context: TenantContext,
    daysAhead: number = 30
  ): Promise<any[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT * FROM app.get_competencies_due_assessment(
          ${context.tenantId}::uuid,
          ${daysAhead}
        )
      `;
    });
  }

  async getTeamCompetencyOverview(
    context: TenantContext,
    managerId: string
  ): Promise<any[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT * FROM app.get_team_competency_overview(${managerId}::uuid)
      `;
    });
  }
}
