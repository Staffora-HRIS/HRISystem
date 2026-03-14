/**
 * Equipment Module - Service Layer
 *
 * Business logic for equipment catalog and request management.
 * Enforces state machine transitions for equipment request status.
 * Emits domain events via the outbox pattern for all mutations.
 *
 * Validates:
 * - Catalog item existence when creating a request with catalog_item_id
 * - State machine transitions for request status changes
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import {
  EquipmentRepository,
  type CatalogItemRow,
  type EquipmentRequestRow,
  type EquipmentRequestHistoryRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateCatalogItem,
  UpdateCatalogItem,
  CatalogFilters,
  CatalogItemResponse,
  CreateEquipmentRequest,
  EquipmentRequestResponse,
  EquipmentRequestFilters,
  EquipmentStatusTransition,
  EquipmentRequestHistory,
  EquipmentRequestStatus,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// State Machine
// =============================================================================

/**
 * Valid status transitions for equipment requests.
 *
 * pending   -> approved | rejected | cancelled
 * approved  -> ordered  | cancelled
 * ordered   -> received | cancelled
 * received  -> assigned
 * assigned  -> (terminal)
 * rejected  -> (terminal)
 * cancelled -> (terminal)
 */
const VALID_TRANSITIONS: Record<EquipmentRequestStatus, EquipmentRequestStatus[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["ordered", "cancelled"],
  ordered: ["received", "cancelled"],
  received: ["assigned"],
  assigned: [],
  rejected: [],
  cancelled: [],
};

// =============================================================================
// Domain Event Types
// =============================================================================

type EquipmentEventType =
  | "equipment.catalog_item.created"
  | "equipment.catalog_item.updated"
  | "equipment.catalog_item.deleted"
  | "equipment.request.created"
  | "equipment.request.status_changed";

// =============================================================================
// Mappers
// =============================================================================

function mapCatalogItemToResponse(row: CatalogItemRow): CatalogItemResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    name: row.name,
    equipment_type: row.equipmentType as CatalogItemResponse["equipment_type"],
    description: row.description,
    specifications: row.specifications,
    vendor: row.vendor,
    vendor_sku: row.vendorSku,
    unit_cost: row.unitCost !== null ? parseFloat(row.unitCost) : null,
    is_standard_issue: row.isStandardIssue,
    requires_approval: row.requiresApproval,
    lead_time_days: row.leadTimeDays,
    is_active: row.isActive,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function mapRequestToResponse(row: EquipmentRequestRow): EquipmentRequestResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    employee_id: row.employeeId,
    onboarding_id: row.onboardingId,
    catalog_item_id: row.catalogItemId,
    equipment_type: row.equipmentType as EquipmentRequestResponse["equipment_type"],
    custom_description: row.customDescription,
    specifications: row.specifications,
    quantity: row.quantity,
    priority: row.priority,
    needed_by: row.neededBy?.toISOString().split("T")[0] ?? null,
    status: row.status as EquipmentRequestResponse["status"],
    approved_by: row.approvedBy,
    approved_at: row.approvedAt?.toISOString() ?? null,
    rejection_reason: row.rejectionReason,
    ordered_at: row.orderedAt?.toISOString() ?? null,
    order_reference: row.orderReference,
    expected_delivery: row.expectedDelivery?.toISOString().split("T")[0] ?? null,
    received_at: row.receivedAt?.toISOString() ?? null,
    assigned_at: row.assignedAt?.toISOString() ?? null,
    asset_tag: row.assetTag,
    serial_number: row.serialNumber,
    notes: row.notes,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function mapHistoryToResponse(row: EquipmentRequestHistoryRow): EquipmentRequestHistory {
  return {
    id: row.id,
    request_id: row.requestId,
    from_status: row.fromStatus as EquipmentRequestHistory["from_status"],
    to_status: row.toStatus as EquipmentRequestHistory["to_status"],
    notes: row.notes,
    changed_by: row.changedBy,
    created_at: row.createdAt.toISOString(),
  };
}

// =============================================================================
// Service
// =============================================================================

export class EquipmentService {
  constructor(
    private repository: EquipmentRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox within the same transaction as the business write
   */
  private async emitEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    aggregateType: string,
    aggregateId: string,
    eventType: EquipmentEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        ${aggregateType},
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: ctx.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Catalog Operations
  // ===========================================================================

  /**
   * List catalog items with filters and pagination
   */
  async listCatalogItems(
    ctx: TenantContext,
    filters: CatalogFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<CatalogItemResponse>> {
    const result = await this.repository.listCatalogItems(ctx, filters, pagination);
    return {
      items: result.items.map(mapCatalogItemToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single catalog item by ID
   */
  async getCatalogItem(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<CatalogItemResponse>> {
    const item = await this.repository.getCatalogItemById(ctx, id);
    if (!item) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Catalog item not found",
          details: { id },
        },
      };
    }
    return { success: true, data: mapCatalogItemToResponse(item) };
  }

  /**
   * Create a catalog item with outbox event
   */
  async createCatalogItem(
    ctx: TenantContext,
    data: CreateCatalogItem
  ): Promise<ServiceResult<CatalogItemResponse>> {
    const item = await this.db.withTransaction(ctx, async (tx) => {
      const created = await this.repository.createCatalogItem(ctx, data, tx);

      await this.emitEvent(tx, ctx, "equipment_catalog", created.id, "equipment.catalog_item.created", {
        catalogItem: { id: created.id, name: data.name, type: data.equipment_type },
      });

      return created;
    });

    return { success: true, data: mapCatalogItemToResponse(item) };
  }

  /**
   * Update a catalog item with outbox event
   */
  async updateCatalogItem(
    ctx: TenantContext,
    id: string,
    data: UpdateCatalogItem
  ): Promise<ServiceResult<CatalogItemResponse>> {
    const existing = await this.repository.getCatalogItemById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Catalog item not found",
          details: { id },
        },
      };
    }

    const updated = await this.db.withTransaction(ctx, async (tx) => {
      const item = await this.repository.updateCatalogItem(ctx, id, data, tx);

      if (item) {
        await this.emitEvent(tx, ctx, "equipment_catalog", id, "equipment.catalog_item.updated", {
          catalogItemId: id,
          changes: data,
        });
      }

      return item;
    });

    if (!updated) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Catalog item not found after update",
          details: { id },
        },
      };
    }

    return { success: true, data: mapCatalogItemToResponse(updated) };
  }

  /**
   * Delete (deactivate) a catalog item with outbox event
   */
  async deleteCatalogItem(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    const existing = await this.repository.getCatalogItemById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Catalog item not found",
          details: { id },
        },
      };
    }

    await this.db.withTransaction(ctx, async (tx) => {
      await this.repository.deleteCatalogItem(ctx, id, tx);

      await this.emitEvent(tx, ctx, "equipment_catalog", id, "equipment.catalog_item.deleted", {
        catalogItemId: id,
      });
    });

    return { success: true, data: { deleted: true } };
  }

  // ===========================================================================
  // Equipment Request Operations
  // ===========================================================================

  /**
   * List equipment requests with filters and pagination
   */
  async listRequests(
    ctx: TenantContext,
    filters: EquipmentRequestFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<EquipmentRequestResponse>> {
    const result = await this.repository.listRequests(ctx, filters, pagination);
    return {
      items: result.items.map(mapRequestToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single equipment request with its status history
   */
  async getRequest(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<EquipmentRequestResponse & { history: EquipmentRequestHistory[] }>> {
    const request = await this.repository.getRequestById(ctx, id);
    if (!request) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Equipment request not found",
          details: { id },
        },
      };
    }

    const historyRows = await this.repository.getRequestHistory(ctx, id);

    return {
      success: true,
      data: {
        ...mapRequestToResponse(request),
        history: historyRows.map(mapHistoryToResponse),
      },
    };
  }

  /**
   * Create an equipment request.
   * Validates that catalog_item_id references an active catalog item when provided.
   */
  async createRequest(
    ctx: TenantContext,
    data: CreateEquipmentRequest
  ): Promise<ServiceResult<EquipmentRequestResponse>> {
    // Validate catalog item exists and is active if referenced
    if (data.catalog_item_id) {
      const catalogItem = await this.repository.getCatalogItemById(ctx, data.catalog_item_id);
      if (!catalogItem) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Referenced catalog item not found",
            details: { catalog_item_id: data.catalog_item_id },
          },
        };
      }
      if (!catalogItem.isActive) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Referenced catalog item is inactive",
            details: { catalog_item_id: data.catalog_item_id },
          },
        };
      }
    }

    const request = await this.db.withTransaction(ctx, async (tx) => {
      const created = await this.repository.createRequest(ctx, data, tx);

      await this.emitEvent(tx, ctx, "equipment_request", created.id, "equipment.request.created", {
        requestId: created.id,
        employeeId: data.employee_id,
        equipmentType: data.equipment_type,
        catalogItemId: data.catalog_item_id ?? null,
      });

      return created;
    });

    return { success: true, data: mapRequestToResponse(request) };
  }

  /**
   * Transition equipment request status (state machine enforced).
   * Writes history entry (with notes) and outbox event in the same transaction.
   */
  async transitionStatus(
    ctx: TenantContext,
    id: string,
    transition: EquipmentStatusTransition
  ): Promise<ServiceResult<EquipmentRequestResponse>> {
    const existing = await this.repository.getRequestById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Equipment request not found",
          details: { id },
        },
      };
    }

    const currentStatus = existing.status as EquipmentRequestStatus;
    const toStatus = transition.to_status;
    const validNext = VALID_TRANSITIONS[currentStatus] || [];

    if (!validNext.includes(toStatus)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot transition equipment request from '${currentStatus}' to '${toStatus}'. Valid transitions: ${validNext.join(", ") || "none (terminal state)"}`,
          details: { currentStatus, toStatus, validTransitions: validNext },
        },
      };
    }

    const updated = await this.db.withTransaction(ctx, async (tx) => {
      const extraFields = {
        rejectionReason: transition.rejection_reason,
        orderReference: transition.order_reference,
        expectedDelivery: transition.expected_delivery,
        assetTag: transition.asset_tag,
        serialNumber: transition.serial_number,
      };

      const request = await this.repository.transitionStatus(ctx, id, toStatus, extraFields, tx);

      if (request) {
        // The DB trigger automatically records the status change in
        // equipment_request_history. We add a manual entry only if
        // the caller provided transition notes (the trigger does not
        // capture notes).
        if (transition.notes) {
          await this.repository.addHistoryEntry(
            ctx,
            id,
            currentStatus,
            toStatus,
            transition.notes,
            tx
          );
        }

        // Outbox event for status transition
        await this.emitEvent(tx, ctx, "equipment_request", id, "equipment.request.status_changed", {
          requestId: id,
          employeeId: existing.employeeId,
          fromStatus: currentStatus,
          toStatus,
          notes: transition.notes ?? null,
        });
      }

      return request;
    });

    if (!updated) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Equipment request not found after transition",
          details: { id },
        },
      };
    }

    return { success: true, data: mapRequestToResponse(updated) };
  }

  /**
   * Get status history for an equipment request
   */
  async getRequestHistory(
    ctx: TenantContext,
    requestId: string
  ): Promise<ServiceResult<EquipmentRequestHistory[]>> {
    const request = await this.repository.getRequestById(ctx, requestId);
    if (!request) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Equipment request not found",
          details: { requestId },
        },
      };
    }

    const history = await this.repository.getRequestHistory(ctx, requestId);
    return { success: true, data: history.map(mapHistoryToResponse) };
  }
}
