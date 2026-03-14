/**
 * Secondment Module - Service Layer
 *
 * Business logic for secondment management.
 * Enforces state machine transitions for secondment statuses.
 * Emits domain events via the outbox pattern for all mutations.
 */

import type { DatabaseClient } from "../../plugins/db";
import {
  SecondmentRepository,
  type SecondmentRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { emitDomainEvent } from "../../lib/outbox";
import type {
  CreateSecondment,
  UpdateSecondment,
  SecondmentStatusTransition,
  SecondmentFilters,
  SecondmentResponse,
  SecondmentStatus,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// State Machine
// =============================================================================

const VALID_TRANSITIONS: Record<SecondmentStatus, SecondmentStatus[]> = {
  proposed: ["approved", "cancelled"],
  approved: ["active", "cancelled"],
  active: ["extended", "completed", "cancelled"],
  extended: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// =============================================================================
// Mappers
// =============================================================================

function formatDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d);
}

function mapToResponse(row: SecondmentRow): SecondmentResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    employee_id: row.employeeId,
    employee_name: row.employeeName,
    employee_number: row.employeeNumber,
    from_org_unit_id: row.fromOrgUnitId,
    from_org_unit_name: row.fromOrgUnitName,
    to_org_unit_id: row.toOrgUnitId,
    to_org_unit_name: row.toOrgUnitName,
    to_external_org: row.toExternalOrg,
    start_date: formatDate(row.startDate) ?? "",
    expected_end_date: formatDate(row.expectedEndDate) ?? "",
    actual_end_date: formatDate(row.actualEndDate),
    reason: row.reason,
    terms: row.terms,
    status: row.status as SecondmentStatus,
    approved_by: row.approvedBy,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

// =============================================================================
// Service
// =============================================================================

export class SecondmentService {
  constructor(
    private repository: SecondmentRepository,
    private db: DatabaseClient
  ) {}

  async listSecondments(
    ctx: TenantContext,
    filters: SecondmentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<SecondmentResponse>> {
    const result = await this.repository.listSecondments(ctx, filters, pagination);
    return {
      items: result.items.map(mapToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getSecondment(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<SecondmentResponse>> {
    const secondment = await this.repository.getSecondmentById(ctx, id);
    if (!secondment) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Secondment not found", details: { id } },
      };
    }
    return { success: true, data: mapToResponse(secondment) };
  }

  async createSecondment(
    ctx: TenantContext,
    data: CreateSecondment
  ): Promise<ServiceResult<SecondmentResponse>> {
    // Validate dates
    if (data.expected_end_date < data.start_date) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Expected end date must be on or after start date",
          details: { start_date: data.start_date, expected_end_date: data.expected_end_date },
        },
      };
    }

    // Cannot second to the same org unit
    if (data.from_org_unit_id === data.to_org_unit_id && !data.to_external_org) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Source and destination org units must be different for internal secondments",
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      const secondment = await this.repository.createSecondment(ctx, data, tx);

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "secondment",
        aggregateId: secondment.id,
        eventType: "secondment.created",
        payload: { secondment: mapToResponse(secondment) },
        userId: ctx.userId,
      });

      return { success: true, data: mapToResponse(secondment) };
    });
  }

  async updateSecondment(
    ctx: TenantContext,
    id: string,
    data: UpdateSecondment
  ): Promise<ServiceResult<SecondmentResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getSecondmentByIdTx(id, tx);
      if (!existing) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Secondment not found", details: { id } },
        };
      }

      // Only proposed or approved secondments can be edited
      if (existing.status !== "proposed" && existing.status !== "approved") {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot edit a secondment in '${existing.status}' status. Only proposed or approved secondments can be edited.`,
            details: { status: existing.status },
          },
        };
      }

      const updated = await this.repository.updateSecondment(id, data, tx);
      if (!updated) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Failed to update secondment" },
        };
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "secondment",
        aggregateId: id,
        eventType: "secondment.updated",
        payload: { secondment: mapToResponse(updated), changes: data },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapToResponse(updated) };
    });
  }

  async transitionStatus(
    ctx: TenantContext,
    id: string,
    transition: SecondmentStatusTransition
  ): Promise<ServiceResult<SecondmentResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getSecondmentByIdTx(id, tx);
      if (!existing) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Secondment not found", details: { id } },
        };
      }

      const currentStatus = existing.status as SecondmentStatus;
      const allowed = VALID_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(transition.status)) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot transition secondment from '${currentStatus}' to '${transition.status}'`,
            details: { currentStatus, requestedStatus: transition.status, allowedTransitions: allowed },
          },
        };
      }

      const updates: {
        approvedBy?: string | null;
        actualEndDate?: string | null;
        expectedEndDate?: string | null;
      } = {};

      if (transition.status === "approved") {
        updates.approvedBy = ctx.userId ?? null;
      }
      if (transition.status === "completed") {
        updates.actualEndDate = transition.actual_end_date ?? new Date().toISOString().split("T")[0];
      }
      if (transition.status === "extended" && transition.expected_end_date) {
        updates.expectedEndDate = transition.expected_end_date;
      }

      const updated = await this.repository.transitionStatus(
        id,
        transition.status,
        updates,
        tx
      );
      if (!updated) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Failed to transition secondment status" },
        };
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "secondment",
        aggregateId: id,
        eventType: `secondment.status.${transition.status}`,
        payload: {
          secondment: mapToResponse(updated),
          previousStatus: currentStatus,
          newStatus: transition.status,
        },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapToResponse(updated) };
    });
  }
}
