/**
 * Equipment Module - Repository Layer
 *
 * Database operations for equipment catalog, requests, and history.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 * Uses parameterized queries throughout — no tx.unsafe().
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateCatalogItem,
  UpdateCatalogItem,
  CatalogFilters,
  CreateEquipmentRequest,
  EquipmentRequestFilters,
  PaginationQuery,
  EquipmentRequestStatus,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Raw DB row for equipment_catalog */
export interface CatalogItemRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  equipmentType: string;
  description: string | null;
  specifications: Record<string, unknown>;
  vendor: string | null;
  vendorSku: string | null;
  unitCost: string | null; // decimal comes as string
  isStandardIssue: boolean;
  requiresApproval: boolean;
  leadTimeDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Raw DB row for equipment_requests */
export interface EquipmentRequestRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  onboardingId: string | null;
  catalogItemId: string | null;
  equipmentType: string;
  customDescription: string | null;
  specifications: Record<string, unknown>;
  quantity: number;
  priority: string;
  neededBy: Date | null;
  status: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
  orderedAt: Date | null;
  orderReference: string | null;
  expectedDelivery: Date | null;
  receivedAt: Date | null;
  assignedAt: Date | null;
  assetTag: string | null;
  serialNumber: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Raw DB row for equipment_request_history */
export interface EquipmentRequestHistoryRow extends Row {
  id: string;
  tenantId: string;
  requestId: string;
  fromStatus: string | null;
  toStatus: string;
  notes: string | null;
  changedBy: string | null;
  createdAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class EquipmentRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Catalog Operations
  // ===========================================================================

  /**
   * List catalog items with cursor-based pagination.
   * Uses parameterized queries for all filter values.
   */
  async listCatalogItems(
    ctx: TenantContext,
    filters: CatalogFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<CatalogItemRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<CatalogItemRow[]>`
        SELECT
          id, tenant_id, name, equipment_type,
          description, specifications,
          vendor, vendor_sku, unit_cost,
          is_standard_issue, requires_approval, lead_time_days,
          is_active,
          created_at, updated_at
        FROM equipment_catalog
        WHERE 1=1
          ${filters.equipment_type ? tx`AND equipment_type = ${filters.equipment_type}` : tx``}
          ${filters.is_active !== undefined ? tx`AND is_active = ${filters.is_active}` : tx``}
          ${filters.is_standard_issue !== undefined ? tx`AND is_standard_issue = ${filters.is_standard_issue}` : tx``}
          ${filters.search ? tx`AND (name ILIKE ${"%" + filters.search + "%"} OR description ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${pagination.cursor ? tx`AND id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY name ASC, id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].id
          : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Get a single catalog item by ID
   */
  async getCatalogItemById(
    ctx: TenantContext,
    id: string
  ): Promise<CatalogItemRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<CatalogItemRow[]>`
        SELECT
          id, tenant_id, name, equipment_type,
          description, specifications,
          vendor, vendor_sku, unit_cost,
          is_standard_issue, requires_approval, lead_time_days,
          is_active,
          created_at, updated_at
        FROM equipment_catalog
        WHERE id = ${id}
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Create a catalog item within an existing transaction
   */
  async createCatalogItem(
    ctx: TenantContext,
    data: CreateCatalogItem,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<CatalogItemRow> {
    const rows = await tx<CatalogItemRow[]>`
      INSERT INTO equipment_catalog (
        tenant_id, name, equipment_type,
        description, specifications,
        vendor, vendor_sku, unit_cost,
        is_standard_issue, requires_approval, lead_time_days
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.name},
        ${data.equipment_type},
        ${data.description ?? null},
        ${JSON.stringify(data.specifications ?? {})}::jsonb,
        ${data.vendor ?? null},
        ${data.vendor_sku ?? null},
        ${data.unit_cost ?? null},
        ${data.is_standard_issue ?? false},
        ${data.requires_approval ?? true},
        ${data.lead_time_days ?? 7}
      )
      RETURNING
        id, tenant_id, name, equipment_type,
        description, specifications,
        vendor, vendor_sku, unit_cost,
        is_standard_issue, requires_approval, lead_time_days,
        is_active,
        created_at, updated_at
    `;
    return rows[0];
  }

  /**
   * Update a catalog item within an existing transaction.
   * Builds SET clause using parameterized fragments.
   */
  async updateCatalogItem(
    ctx: TenantContext,
    id: string,
    data: UpdateCatalogItem,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<CatalogItemRow | null> {
    // Build an array of parameterized SQL fragments for each changed field
    const updates: ReturnType<typeof tx>[] = [];

    if (data.name !== undefined) updates.push(tx`name = ${data.name}`);
    if (data.equipment_type !== undefined) updates.push(tx`equipment_type = ${data.equipment_type}`);
    if (data.description !== undefined) updates.push(tx`description = ${data.description}`);
    if (data.specifications !== undefined) updates.push(tx`specifications = ${JSON.stringify(data.specifications)}::jsonb`);
    if (data.vendor !== undefined) updates.push(tx`vendor = ${data.vendor}`);
    if (data.vendor_sku !== undefined) updates.push(tx`vendor_sku = ${data.vendor_sku}`);
    if (data.unit_cost !== undefined) updates.push(tx`unit_cost = ${data.unit_cost}`);
    if (data.is_standard_issue !== undefined) updates.push(tx`is_standard_issue = ${data.is_standard_issue}`);
    if (data.requires_approval !== undefined) updates.push(tx`requires_approval = ${data.requires_approval}`);
    if (data.lead_time_days !== undefined) updates.push(tx`lead_time_days = ${data.lead_time_days}`);
    if (data.is_active !== undefined) updates.push(tx`is_active = ${data.is_active}`);

    if (updates.length === 0) {
      return this.getCatalogItemById(ctx, id);
    }

    // postgres.js supports chaining fragments with tx`...${fragment}...`
    // We manually build the SET expression by joining fragments
    let setFragment = updates[0];
    for (let i = 1; i < updates.length; i++) {
      setFragment = tx`${setFragment}, ${updates[i]}`;
    }

    const rows = await tx<CatalogItemRow[]>`
      UPDATE equipment_catalog
      SET ${setFragment}
      WHERE id = ${id}
      RETURNING
        id, tenant_id, name, equipment_type,
        description, specifications,
        vendor, vendor_sku, unit_cost,
        is_standard_issue, requires_approval, lead_time_days,
        is_active,
        created_at, updated_at
    `;
    return rows[0] ?? null;
  }

  /**
   * Soft-delete a catalog item (set is_active = false)
   */
  async deleteCatalogItem(
    _ctx: TenantContext,
    id: string,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<boolean> {
    const rows = await tx`
      UPDATE equipment_catalog
      SET is_active = false
      WHERE id = ${id}
    `;
    return rows.count > 0;
  }

  // ===========================================================================
  // Equipment Request Operations
  // ===========================================================================

  /**
   * List equipment requests with cursor-based pagination.
   * Uses parameterized queries for all filter values.
   */
  async listRequests(
    ctx: TenantContext,
    filters: EquipmentRequestFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<EquipmentRequestRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<EquipmentRequestRow[]>`
        SELECT
          id, tenant_id, employee_id, onboarding_id,
          catalog_item_id, equipment_type, custom_description,
          specifications, quantity, priority, needed_by,
          status,
          approved_by, approved_at, rejection_reason,
          ordered_at, order_reference, expected_delivery,
          received_at, assigned_at,
          asset_tag, serial_number, notes,
          created_at, updated_at
        FROM equipment_requests
        WHERE 1=1
          ${filters.employee_id ? tx`AND employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.onboarding_id ? tx`AND onboarding_id = ${filters.onboarding_id}::uuid` : tx``}
          ${filters.equipment_type ? tx`AND equipment_type = ${filters.equipment_type}` : tx``}
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.priority ? tx`AND priority = ${filters.priority}` : tx``}
          ${filters.search ? tx`AND (custom_description ILIKE ${"%" + filters.search + "%"} OR notes ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${pagination.cursor ? tx`AND created_at < ${pagination.cursor}::timestamptz` : tx``}
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].createdAt.toISOString()
          : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Get a single equipment request by ID
   */
  async getRequestById(
    ctx: TenantContext,
    id: string
  ): Promise<EquipmentRequestRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<EquipmentRequestRow[]>`
        SELECT
          id, tenant_id, employee_id, onboarding_id,
          catalog_item_id, equipment_type, custom_description,
          specifications, quantity, priority, needed_by,
          status,
          approved_by, approved_at, rejection_reason,
          ordered_at, order_reference, expected_delivery,
          received_at, assigned_at,
          asset_tag, serial_number, notes,
          created_at, updated_at
        FROM equipment_requests
        WHERE id = ${id}
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Create an equipment request within an existing transaction
   */
  async createRequest(
    ctx: TenantContext,
    data: CreateEquipmentRequest,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<EquipmentRequestRow> {
    const rows = await tx<EquipmentRequestRow[]>`
      INSERT INTO equipment_requests (
        tenant_id, employee_id, onboarding_id,
        catalog_item_id, equipment_type, custom_description,
        specifications, quantity, priority, needed_by,
        notes
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.onboarding_id ?? null},
        ${data.catalog_item_id ?? null},
        ${data.equipment_type},
        ${data.custom_description ?? null},
        ${JSON.stringify(data.specifications ?? {})}::jsonb,
        ${data.quantity ?? 1},
        ${data.priority ?? "normal"},
        ${data.needed_by ?? null},
        ${data.notes ?? null}
      )
      RETURNING
        id, tenant_id, employee_id, onboarding_id,
        catalog_item_id, equipment_type, custom_description,
        specifications, quantity, priority, needed_by,
        status,
        approved_by, approved_at, rejection_reason,
        ordered_at, order_reference, expected_delivery,
        received_at, assigned_at,
        asset_tag, serial_number, notes,
        created_at, updated_at
    `;
    return rows[0];
  }

  /**
   * Transition equipment request status within an existing transaction.
   * Builds SET clause using parameterized fragments — no tx.unsafe().
   */
  async transitionStatus(
    ctx: TenantContext,
    id: string,
    toStatus: EquipmentRequestStatus,
    extraFields: {
      rejectionReason?: string;
      orderReference?: string;
      expectedDelivery?: string;
      assetTag?: string;
      serialNumber?: string;
    },
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<EquipmentRequestRow | null> {
    const updates: ReturnType<typeof tx>[] = [tx`status = ${toStatus}`];

    // Add timestamp and context fields based on target status
    if (toStatus === "approved" && ctx.userId) {
      updates.push(tx`approved_by = ${ctx.userId}::uuid`);
      updates.push(tx`approved_at = now()`);
    }
    if (toStatus === "ordered") {
      updates.push(tx`ordered_at = now()`);
      if (extraFields.orderReference) {
        updates.push(tx`order_reference = ${extraFields.orderReference}`);
      }
      if (extraFields.expectedDelivery) {
        updates.push(tx`expected_delivery = ${extraFields.expectedDelivery}::date`);
      }
    }
    if (toStatus === "received") {
      updates.push(tx`received_at = now()`);
    }
    if (toStatus === "assigned") {
      updates.push(tx`assigned_at = now()`);
      if (extraFields.assetTag) {
        updates.push(tx`asset_tag = ${extraFields.assetTag}`);
      }
      if (extraFields.serialNumber) {
        updates.push(tx`serial_number = ${extraFields.serialNumber}`);
      }
    }
    if (toStatus === "rejected" && extraFields.rejectionReason) {
      updates.push(tx`rejection_reason = ${extraFields.rejectionReason}`);
    }

    let setFragment = updates[0];
    for (let i = 1; i < updates.length; i++) {
      setFragment = tx`${setFragment}, ${updates[i]}`;
    }

    const rows = await tx<EquipmentRequestRow[]>`
      UPDATE equipment_requests
      SET ${setFragment}
      WHERE id = ${id}
      RETURNING
        id, tenant_id, employee_id, onboarding_id,
        catalog_item_id, equipment_type, custom_description,
        specifications, quantity, priority, needed_by,
        status,
        approved_by, approved_at, rejection_reason,
        ordered_at, order_reference, expected_delivery,
        received_at, assigned_at,
        asset_tag, serial_number, notes,
        created_at, updated_at
    `;
    return rows[0] ?? null;
  }

  /**
   * Record a manual history entry (the DB trigger handles status changes
   * automatically, but this allows service-level notes to be stored).
   */
  async addHistoryEntry(
    ctx: TenantContext,
    requestId: string,
    fromStatus: EquipmentRequestStatus | null,
    toStatus: EquipmentRequestStatus,
    notes: string | null,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<void> {
    await tx`
      INSERT INTO equipment_request_history (
        tenant_id, request_id, from_status, to_status, notes, changed_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${requestId}::uuid,
        ${fromStatus},
        ${toStatus},
        ${notes},
        ${ctx.userId ?? null}
      )
    `;
  }

  /**
   * Get status history for an equipment request
   */
  async getRequestHistory(
    ctx: TenantContext,
    requestId: string
  ): Promise<EquipmentRequestHistoryRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      return tx<EquipmentRequestHistoryRow[]>`
        SELECT
          id, tenant_id, request_id,
          from_status, to_status,
          notes, changed_by,
          created_at
        FROM equipment_request_history
        WHERE request_id = ${requestId}::uuid
        ORDER BY created_at ASC
      `;
    });
  }
}
