/**
 * Core HR Module - Position Service
 *
 * Implements business logic for Position operations.
 * Enforces invariants and emits domain events via the outbox pattern.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { HRRepository, PositionRow } from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreatePosition,
  UpdatePosition,
  PositionFilters,
  PaginationQuery,
  PositionResponse,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

type PositionDomainEventType =
  | "hr.position.created"
  | "hr.position.updated"
  | "hr.position.deleted";

// =============================================================================
// Position Service
// =============================================================================

export class PositionService {
  constructor(
    private repository: HRRepository,
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
    eventType: PositionDomainEventType,
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
  // Position Business Logic
  // ===========================================================================

  /**
   * List positions with filters
   */
  async listPositions(
    context: TenantContext,
    filters: PositionFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<PositionResponse>> {
    const result = await this.repository.findPositions(context, filters, pagination);

    return {
      items: result.items.map(this.mapPositionToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get position by ID
   */
  async getPosition(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<PositionResponse>> {
    const position = await this.repository.findPositionById(context, id);

    if (!position) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Position not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapPositionToResponse(position),
    };
  }

  /**
   * Create position
   */
  async createPosition(
    context: TenantContext,
    data: CreatePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<PositionResponse>> {
    // Validate org unit exists
    const orgUnit = await this.repository.findOrgUnitById(context, data.org_unit_id);
    if (!orgUnit) {
      return {
        success: false,
        error: {
          code: "INVALID_ORG_UNIT",
          message: "Org unit not found",
          details: { org_unit_id: data.org_unit_id },
        },
      };
    }

    // Validate salary range
    if (data.min_salary !== undefined && data.max_salary !== undefined) {
      if (data.min_salary > data.max_salary) {
        return {
          success: false,
          error: {
            code: "INVALID_SALARY_RANGE",
            message: "Minimum salary cannot exceed maximum salary",
            details: { min_salary: data.min_salary, max_salary: data.max_salary },
          },
        };
      }
    }

    // Create in transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      const position = await this.repository.createPosition(
        tx,
        context,
        data,
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "position", position.id, "hr.position.created", {
        position: this.mapPositionToResponse(position),
      });

      return position;
    });

    return {
      success: true,
      data: this.mapPositionToResponse(result),
    };
  }

  /**
   * Update position
   */
  async updatePosition(
    context: TenantContext,
    id: string,
    data: UpdatePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<PositionResponse>> {
    // Check position exists
    const existing = await this.repository.findPositionById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Position not found",
          details: { id },
        },
      };
    }

    // Validate org unit if changing
    if (data.org_unit_id) {
      const orgUnit = await this.repository.findOrgUnitById(context, data.org_unit_id);
      if (!orgUnit) {
        return {
          success: false,
          error: {
            code: "INVALID_ORG_UNIT",
            message: "Org unit not found",
            details: { org_unit_id: data.org_unit_id },
          },
        };
      }
    }

    // Update in transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      const position = await this.repository.updatePosition(
        tx,
        context,
        id,
        data,
        context.userId || "system"
      );

      if (!position) {
        throw new Error("Failed to update position");
      }

      // Emit event
      await this.emitEvent(tx, context, "position", id, "hr.position.updated", {
        position: this.mapPositionToResponse(position),
        changes: data,
      });

      return position;
    });

    return {
      success: true,
      data: this.mapPositionToResponse(result),
    };
  }

  /**
   * Delete position (soft delete)
   */
  async deletePosition(
    context: TenantContext,
    id: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Check position exists
    const existing = await this.repository.findPositionById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Position not found",
          details: { id },
        },
      };
    }

    // Check for active assignments
    const hasAssignments = await this.repository.positionHasActiveAssignments(context, id);
    if (hasAssignments) {
      return {
        success: false,
        error: {
          code: "HAS_ASSIGNMENTS",
          message: "Cannot delete position with active assignments",
          details: { id },
        },
      };
    }

    // Delete in transaction
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.deletePosition(tx, context, id);

      // Emit event
      await this.emitEvent(tx, context, "position", id, "hr.position.deleted", {
        positionId: id,
      });
    });

    return { success: true };
  }

  // ===========================================================================
  // Mapping Helper
  // ===========================================================================

  mapPositionToResponse(row: PositionRow): PositionResponse {
    // Handle both camelCase (TypeScript interface) and snake_case (PostgreSQL columns)
    // PostgreSQL returns snake_case, but our interface expects camelCase
    const rawRow = row as Record<string, unknown>;

    const tenantId = rawRow.tenantId ?? rawRow.tenant_id;
    const orgUnitId = rawRow.orgUnitId ?? rawRow.org_unit_id;
    const orgUnitName = rawRow.orgUnitName ?? rawRow.org_unit_name;
    const jobGrade = rawRow.jobGrade ?? rawRow.job_grade;
    const minSalary = rawRow.minSalary ?? rawRow.min_salary;
    const maxSalary = rawRow.maxSalary ?? rawRow.max_salary;
    const isManager = rawRow.isManager ?? rawRow.is_manager;
    const currentHeadcount = rawRow.currentHeadcount ?? rawRow.current_headcount;
    const reportsToPositionId = rawRow.reportsToPositionId ?? rawRow.reports_to_position_id;
    const isActive = rawRow.isActive ?? rawRow.is_active;
    const createdAt = rawRow.createdAt ?? rawRow.created_at;
    const updatedAt = rawRow.updatedAt ?? rawRow.updated_at;

    // Helper to safely convert to ISO string
    const toISOString = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === "string") {
        return value;
      }
      return new Date().toISOString();
    };

    return {
      id: row.id,
      tenant_id: String(tenantId),
      code: row.code,
      title: row.title,
      description: row.description,
      org_unit_id: orgUnitId ? String(orgUnitId) : null,
      org_unit_name: orgUnitName ? String(orgUnitName) : undefined,
      job_grade: jobGrade ? String(jobGrade) : null,
      min_salary: minSalary ? parseFloat(String(minSalary)) : null,
      max_salary: maxSalary ? parseFloat(String(maxSalary)) : null,
      currency: row.currency,
      is_manager: Boolean(isManager),
      headcount: row.headcount,
      current_headcount: currentHeadcount != null ? Number(currentHeadcount) : undefined,
      reports_to_position_id: reportsToPositionId ? String(reportsToPositionId) : null,
      is_active: isActive !== false,
      created_at: toISOString(createdAt),
      updated_at: toISOString(updatedAt),
    };
  }
}
