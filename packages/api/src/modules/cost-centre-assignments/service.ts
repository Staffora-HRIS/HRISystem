/**
 * Cost Centre Assignments Module - Service Layer
 *
 * Business logic for effective-dated cost centre assignment tracking.
 * Enforces overlap prevention, entity/cost-centre existence validation,
 * and emits domain events via the outbox pattern for all mutations.
 */

import type { DatabaseClient } from "../../plugins/db";
import {
  CostCentreAssignmentRepository,
  type CostCentreAssignmentRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { emitDomainEvent } from "../../lib/outbox";
import type {
  CreateCostCentreAssignment,
  UpdateCostCentreAssignment,
  CostCentreAssignmentFilters,
  CostCentreAssignmentResponse,
  EntityType,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Mappers
// =============================================================================

function formatDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d);
}

function mapToResponse(row: CostCentreAssignmentRow): CostCentreAssignmentResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    entity_type: row.entityType,
    entity_id: row.entityId,
    entity_name: row.entityName ?? null,
    cost_centre_id: row.costCentreId,
    cost_centre_code: row.costCentreCode ?? null,
    cost_centre_name: row.costCentreName ?? null,
    percentage: Number(row.percentage),
    effective_from: formatDate(row.effectiveFrom) ?? "",
    effective_to: formatDate(row.effectiveTo),
    created_by: row.createdBy,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

// =============================================================================
// Service
// =============================================================================

export class CostCentreAssignmentService {
  constructor(
    private repository: CostCentreAssignmentRepository,
    private db: DatabaseClient
  ) {}

  /**
   * List cost centre assignments with optional filters.
   */
  async listAssignments(
    ctx: TenantContext,
    filters: CostCentreAssignmentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<CostCentreAssignmentResponse>> {
    const result = await this.repository.listAssignments(ctx, filters, pagination);
    return {
      items: result.items.map(mapToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single assignment by ID.
   */
  async getAssignment(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<CostCentreAssignmentResponse>> {
    const assignment = await this.repository.getAssignmentById(ctx, id);
    if (!assignment) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Cost centre assignment not found",
          details: { id },
        },
      };
    }
    return { success: true, data: mapToResponse(assignment) };
  }

  /**
   * Get the full effective-dated history for an entity.
   */
  async getEntityHistory(
    ctx: TenantContext,
    entityType: EntityType,
    entityId: string,
    pagination: PaginationQuery
  ): Promise<ServiceResult<PaginatedResult<CostCentreAssignmentResponse>>> {
    // Verify entity exists
    const entityExists = await this.repository.entityExists(ctx, entityType, entityId);
    if (!entityExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `${entityType} not found`,
          details: { entityType, entityId },
        },
      };
    }

    const result = await this.repository.getEntityHistory(ctx, entityType, entityId, pagination);
    return {
      success: true,
      data: {
        items: result.items.map(mapToResponse),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  /**
   * Create a new cost centre assignment.
   *
   * Validates:
   * - Entity exists
   * - Cost centre exists and is active
   * - No overlapping assignment for the same entity+cost_centre in the date range
   * - effective_to > effective_from when set
   *
   * Automatically closes the current open assignment for the same entity+cost_centre
   * if one exists, setting its effective_to to the new assignment's effective_from.
   */
  async createAssignment(
    ctx: TenantContext,
    data: CreateCostCentreAssignment
  ): Promise<ServiceResult<CostCentreAssignmentResponse>> {
    // Validate effective_to > effective_from
    if (data.effective_to && data.effective_to <= data.effective_from) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "effective_to must be after effective_from",
          details: {
            effective_from: data.effective_from,
            effective_to: data.effective_to,
          },
        },
      };
    }

    // Validate entity exists
    const entityExists = await this.repository.entityExists(ctx, data.entity_type, data.entity_id);
    if (!entityExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `${data.entity_type} not found`,
          details: { entityType: data.entity_type, entityId: data.entity_id },
        },
      };
    }

    // Validate cost centre exists and is active
    const costCentreExists = await this.repository.costCentreExists(ctx, data.cost_centre_id);
    if (!costCentreExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Cost centre not found or inactive",
          details: { costCentreId: data.cost_centre_id },
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      // Close the current open assignment for this entity+cost_centre
      // so the new one takes over cleanly (effective dating pattern).
      await this.repository.closeCurrentAssignment(
        ctx,
        data.entity_type,
        data.entity_id,
        data.cost_centre_id,
        data.effective_from,
        tx
      );

      // Check for overlap after closing (there could still be future-dated records)
      const hasOverlap = await this.repository.checkOverlap(
        ctx,
        data.entity_type,
        data.entity_id,
        data.cost_centre_id,
        data.effective_from,
        data.effective_to ?? null
      );

      if (hasOverlap) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.EFFECTIVE_DATE_OVERLAP,
            message: "An overlapping cost centre assignment already exists for this entity and cost centre in the given date range",
            details: {
              entityType: data.entity_type,
              entityId: data.entity_id,
              costCentreId: data.cost_centre_id,
              effectiveFrom: data.effective_from,
              effectiveTo: data.effective_to,
            },
          },
        };
      }

      const assignment = await this.repository.createAssignment(ctx, data, ctx.userId, tx);

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "cost_centre_assignment",
        aggregateId: assignment.id,
        eventType: "hr.cost_centre_assignment.created",
        payload: {
          assignment: mapToResponse(assignment),
          entityType: data.entity_type,
          entityId: data.entity_id,
          costCentreId: data.cost_centre_id,
        },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapToResponse(assignment) };
    });
  }

  /**
   * Update an existing cost centre assignment (percentage, effective_to).
   */
  async updateAssignment(
    ctx: TenantContext,
    id: string,
    data: UpdateCostCentreAssignment
  ): Promise<ServiceResult<CostCentreAssignmentResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getAssignmentByIdTx(id, tx);
      if (!existing) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Cost centre assignment not found",
            details: { id },
          },
        };
      }

      // Validate effective_to > effective_from when changing effective_to
      if (data.effective_to !== undefined && data.effective_to !== null) {
        const effectiveFrom = formatDate(existing.effectiveFrom) ?? "";
        if (data.effective_to <= effectiveFrom) {
          return {
            success: false as const,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: "effective_to must be after effective_from",
              details: {
                effective_from: effectiveFrom,
                effective_to: data.effective_to,
              },
            },
          };
        }
      }

      const updated = await this.repository.updateAssignment(id, data, tx);
      if (!updated) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Failed to update cost centre assignment",
          },
        };
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "cost_centre_assignment",
        aggregateId: id,
        eventType: "hr.cost_centre_assignment.updated",
        payload: {
          assignment: mapToResponse(updated),
          changes: data,
        },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapToResponse(updated) };
    });
  }
}
