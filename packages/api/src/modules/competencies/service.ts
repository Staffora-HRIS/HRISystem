/**
 * Competencies Module - Service Layer
 *
 * Business logic for competency management.
 */

import type { DatabaseClient } from "../../plugins/db";
import {
  CompetenciesRepository,
  type TenantContext,
  type CompetencyRow,
  type JobCompetencyRow,
  type EmployeeCompetencyRow,
  type CompetencyGapRow,
  type PaginatedResult,
} from "./repository";
import type {
  CreateCompetency,
  UpdateCompetency,
  CreateJobCompetency,
  UpdateJobCompetency,
  CreateEmployeeCompetency,
  UpdateEmployeeCompetency,
  CompetencyFilters,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

// =============================================================================
// Service
// =============================================================================

export class CompetenciesService {
  private repository: CompetenciesRepository;

  constructor(private db: DatabaseClient) {
    this.repository = new CompetenciesRepository(db);
  }

  // ===========================================================================
  // Competency Library Operations
  // ===========================================================================

  async listCompetencies(
    context: TenantContext,
    filters: CompetencyFilters = {},
    pagination: { cursor?: string; limit?: number } = {}
  ): Promise<ServiceResult<PaginatedResult<CompetencyRow>>> {
    const result = await this.repository.findCompetencies(context, filters, pagination);
    return { success: true, data: result };
  }

  async getCompetency(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<CompetencyRow>> {
    const competency = await this.repository.findCompetencyById(context, id);

    if (!competency) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Competency not found",
          details: { id },
        },
      };
    }

    return { success: true, data: competency };
  }

  async createCompetency(
    context: TenantContext,
    data: CreateCompetency
  ): Promise<ServiceResult<CompetencyRow>> {
    const competency = await this.db.withTransaction(context, async (tx) => {
      const created = await this.repository.createCompetency(tx, context, data);

      // Emit domain event
      await tx`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        )
        VALUES (
          ${context.tenantId}::uuid,
          'competency',
          ${created.id}::uuid,
          'competency.created',
          ${JSON.stringify({
            competency: created,
            actor: context.userId,
          })}::jsonb
        )
      `;

      return created;
    });

    return { success: true, data: competency };
  }

  async updateCompetency(
    context: TenantContext,
    id: string,
    data: UpdateCompetency
  ): Promise<ServiceResult<CompetencyRow>> {
    const existing = await this.repository.findCompetencyById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Competency not found",
          details: { id },
        },
      };
    }

    const competency = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateCompetency(tx, context, id, data);

      if (updated) {
        await tx`
          INSERT INTO app.domain_outbox (
            tenant_id, aggregate_type, aggregate_id, event_type, payload
          )
          VALUES (
            ${context.tenantId}::uuid,
            'competency',
            ${id}::uuid,
            'competency.updated',
            ${JSON.stringify({
              competency: updated,
              changes: data,
              actor: context.userId,
            })}::jsonb
          )
        `;
      }

      return updated;
    });

    if (!competency) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: "Failed to update competency",
          details: { id },
        },
      };
    }

    return { success: true, data: competency };
  }

  async deleteCompetency(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    const existing = await this.repository.findCompetencyById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Competency not found",
          details: { id },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.deleteCompetency(tx, context, id);

      await tx`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        )
        VALUES (
          ${context.tenantId}::uuid,
          'competency',
          ${id}::uuid,
          'competency.deactivated',
          ${JSON.stringify({
            competencyId: id,
            actor: context.userId,
          })}::jsonb
        )
      `;
    });

    return { success: true };
  }

  // ===========================================================================
  // Job Competency Operations
  // ===========================================================================

  async listJobCompetencies(
    context: TenantContext,
    jobId: string
  ): Promise<ServiceResult<JobCompetencyRow[]>> {
    const competencies = await this.repository.findJobCompetencies(context, jobId);
    return { success: true, data: competencies };
  }

  async addJobCompetency(
    context: TenantContext,
    data: CreateJobCompetency
  ): Promise<ServiceResult<JobCompetencyRow>> {
    const competency = await this.db.withTransaction(context, async (tx) => {
      return await this.repository.createJobCompetency(tx, context, data);
    });

    return { success: true, data: competency };
  }

  async updateJobCompetency(
    context: TenantContext,
    id: string,
    data: UpdateJobCompetency
  ): Promise<ServiceResult<void>> {
    const updated = await this.db.withTransaction(context, async (tx) => {
      return await this.repository.updateJobCompetency(tx, context, id, data);
    });

    if (!updated) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Job competency not found",
          details: { id },
        },
      };
    }

    return { success: true };
  }

  async removeJobCompetency(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    const deleted = await this.db.withTransaction(context, async (tx) => {
      return await this.repository.deleteJobCompetency(tx, context, id);
    });

    if (!deleted) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Job competency not found",
          details: { id },
        },
      };
    }

    return { success: true };
  }

  // ===========================================================================
  // Employee Competency Operations
  // ===========================================================================

  async listEmployeeCompetencies(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<EmployeeCompetencyRow[]>> {
    const competencies = await this.repository.findEmployeeCompetencies(context, employeeId);
    return { success: true, data: competencies };
  }

  async getEmployeeCompetency(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<EmployeeCompetencyRow>> {
    const competency = await this.repository.findEmployeeCompetencyById(context, id);

    if (!competency) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Employee competency not found",
          details: { id },
        },
      };
    }

    return { success: true, data: competency };
  }

  async assessEmployeeCompetency(
    context: TenantContext,
    data: CreateEmployeeCompetency
  ): Promise<ServiceResult<EmployeeCompetencyRow>> {
    const competency = await this.db.withTransaction(context, async (tx) => {
      const created = await this.repository.createEmployeeCompetency(tx, context, data);

      await tx`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        )
        VALUES (
          ${context.tenantId}::uuid,
          'employee_competency',
          ${created.id}::uuid,
          'employee.competency.assessed',
          ${JSON.stringify({
            employeeCompetency: created,
            actor: context.userId,
          })}::jsonb
        )
      `;

      return created;
    });

    return { success: true, data: competency };
  }

  async updateEmployeeCompetency(
    context: TenantContext,
    id: string,
    data: UpdateEmployeeCompetency
  ): Promise<ServiceResult<EmployeeCompetencyRow>> {
    const existing = await this.repository.findEmployeeCompetencyById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Employee competency not found",
          details: { id },
        },
      };
    }

    const competency = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateEmployeeCompetency(tx, context, id, data);

      if (updated) {
        await tx`
          INSERT INTO app.domain_outbox (
            tenant_id, aggregate_type, aggregate_id, event_type, payload
          )
          VALUES (
            ${context.tenantId}::uuid,
            'employee_competency',
            ${id}::uuid,
            'employee.competency.updated',
            ${JSON.stringify({
              employeeCompetency: updated,
              previousLevel: existing.currentLevel,
              newLevel: updated.currentLevel,
              actor: context.userId,
            })}::jsonb
          )
        `;
      }

      return updated;
    });

    if (!competency) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: "Failed to update employee competency",
          details: { id },
        },
      };
    }

    return { success: true, data: competency };
  }

  // ===========================================================================
  // Gap Analysis
  // ===========================================================================

  async getCompetencyGaps(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<CompetencyGapRow[]>> {
    const gaps = await this.repository.getCompetencyGaps(context, employeeId);
    return { success: true, data: gaps };
  }

  async getAssessmentsDue(
    context: TenantContext,
    daysAhead: number = 30
  ): Promise<ServiceResult<any[]>> {
    const due = await this.repository.getCompetenciesDueAssessment(context, daysAhead);
    return { success: true, data: due };
  }

  async getTeamOverview(
    context: TenantContext,
    managerId: string
  ): Promise<ServiceResult<any[]>> {
    const overview = await this.repository.getTeamCompetencyOverview(context, managerId);
    return { success: true, data: overview };
  }
}
