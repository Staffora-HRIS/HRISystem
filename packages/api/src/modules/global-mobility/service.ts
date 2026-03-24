/**
 * Global Mobility Module - Service Layer
 *
 * Business logic for international assignment management.
 * Enforces state machine transitions for assignment statuses.
 * Emits domain events via the outbox pattern for all mutations.
 */

import type { DatabaseClient } from "../../plugins/db";
import {
  GlobalMobilityRepository,
  type AssignmentRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { emitDomainEvent } from "../../lib/outbox";
import type {
  CreateAssignment,
  UpdateAssignment,
  AssignmentStatusTransition,
  AssignmentFilters,
  AssignmentResponse,
  AssignmentStatus,
  PaginationQuery,
  ExpiringAssignmentsQuery,
} from "./schemas";

// =============================================================================
// State Machine
// =============================================================================

const VALID_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  planned: ["active", "cancelled"],
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

function mapToResponse(row: AssignmentRow): AssignmentResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    employee_id: row.employeeId,
    employee_name: row.employeeName,
    employee_number: row.employeeNumber,
    assignment_type: row.assignmentType as AssignmentResponse["assignment_type"],
    home_country: row.homeCountry,
    host_country: row.hostCountry,
    start_date: formatDate(row.startDate) ?? "",
    end_date: formatDate(row.endDate),
    tax_equalisation: row.taxEqualisation,
    housing_allowance: row.housingAllowance,
    relocation_package: row.relocationPackage,
    visa_status: row.visaStatus as AssignmentResponse["visa_status"],
    status: row.status as AssignmentStatus,
    notes: row.notes,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

// =============================================================================
// Service
// =============================================================================

export class GlobalMobilityService {
  constructor(
    private repository: GlobalMobilityRepository,
    private db: DatabaseClient
  ) {}

  async listAssignments(
    ctx: TenantContext,
    filters: AssignmentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<AssignmentResponse>> {
    const result = await this.repository.listAssignments(ctx, filters, pagination);
    return {
      items: result.items.map(mapToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getAssignment(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<AssignmentResponse>> {
    const assignment = await this.repository.getAssignmentById(ctx, id);
    if (!assignment) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "International assignment not found", details: { id } },
      };
    }
    return { success: true, data: mapToResponse(assignment) };
  }

  async createAssignment(
    ctx: TenantContext,
    data: CreateAssignment
  ): Promise<ServiceResult<AssignmentResponse>> {
    // Validate that home and host countries differ
    if (data.home_country === data.host_country) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Home country and host country must be different",
          details: { home_country: data.home_country, host_country: data.host_country },
        },
      };
    }

    // Validate dates
    if (data.end_date && data.end_date < data.start_date) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "End date must be on or after start date",
          details: { start_date: data.start_date, end_date: data.end_date },
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      const assignment = await this.repository.createAssignment(ctx, data, tx);

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "international_assignment",
        aggregateId: assignment.id,
        eventType: "global_mobility.assignment.created",
        payload: { assignment: mapToResponse(assignment) },
        userId: ctx.userId,
      });

      return { success: true, data: mapToResponse(assignment) };
    });
  }

  async updateAssignment(
    ctx: TenantContext,
    id: string,
    data: UpdateAssignment
  ): Promise<ServiceResult<AssignmentResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getAssignmentByIdTx(id, tx);
      if (!existing) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "International assignment not found", details: { id } },
        };
      }

      // Only planned or active assignments can be edited
      if (existing.status !== "planned" && existing.status !== "active") {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot edit an assignment in '${existing.status}' status. Only planned or active assignments can be edited.`,
            details: { status: existing.status },
          },
        };
      }

      // Validate countries differ if both are being changed
      const effectiveHome = data.home_country ?? existing.homeCountry;
      const effectiveHost = data.host_country ?? existing.hostCountry;
      if (effectiveHome === effectiveHost) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Home country and host country must be different",
            details: { home_country: effectiveHome, host_country: effectiveHost },
          },
        };
      }

      const updated = await this.repository.updateAssignment(id, data, tx);
      if (!updated) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Failed to update international assignment" },
        };
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "international_assignment",
        aggregateId: id,
        eventType: "global_mobility.assignment.updated",
        payload: { assignment: mapToResponse(updated), changes: data },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapToResponse(updated) };
    });
  }

  async transitionStatus(
    ctx: TenantContext,
    id: string,
    transition: AssignmentStatusTransition
  ): Promise<ServiceResult<AssignmentResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getAssignmentByIdTx(id, tx);
      if (!existing) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "International assignment not found", details: { id } },
        };
      }

      const currentStatus = existing.status as AssignmentStatus;
      const allowed = VALID_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(transition.status)) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot transition assignment from '${currentStatus}' to '${transition.status}'`,
            details: { currentStatus, requestedStatus: transition.status, allowedTransitions: allowed },
          },
        };
      }

      const updated = await this.repository.transitionStatus(
        id,
        transition.status,
        tx
      );
      if (!updated) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Failed to transition assignment status" },
        };
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "international_assignment",
        aggregateId: id,
        eventType: `global_mobility.assignment.status.${transition.status}`,
        payload: {
          assignment: mapToResponse(updated),
          previousStatus: currentStatus,
          newStatus: transition.status,
        },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapToResponse(updated) };
    });
  }

  async listExpiringAssignments(
    ctx: TenantContext,
    query: ExpiringAssignmentsQuery
  ): Promise<PaginatedResult<AssignmentResponse>> {
    const result = await this.repository.listExpiringAssignments(ctx, query);
    return {
      items: result.items.map(mapToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }
}
