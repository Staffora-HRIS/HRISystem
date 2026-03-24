/**
 * Core HR Module - Org Unit Service
 *
 * Implements business logic for Organizational Unit operations.
 * Enforces invariants and emits domain events via the outbox pattern.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { HRRepository, OrgUnitRow } from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type { CacheClient } from "../../plugins/cache";
import { CacheKeys, CacheTTL } from "../../plugins/cache";
import { logger } from "../../lib/logger";
import type {
  CreateOrgUnit,
  UpdateOrgUnit,
  OrgUnitFilters,
  PaginationQuery,
  OrgUnitResponse,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

type OrgUnitDomainEventType =
  | "hr.org_unit.created"
  | "hr.org_unit.updated"
  | "hr.org_unit.deleted";

// =============================================================================
// Org Unit Service
// =============================================================================

export class OrgUnitService {
  constructor(
    private repository: HRRepository,
    private db: DatabaseClient,
    private cache: CacheClient | null = null
  ) {}

  // ===========================================================================
  // Cache Helpers
  // ===========================================================================

  /**
   * Invalidate the org tree cache for a tenant.
   * Best-effort: cache failures are logged but do not propagate.
   */
  private async invalidateOrgTreeCache(tenantId: string): Promise<void> {
    if (!this.cache) return;
    try {
      await this.cache.del(CacheKeys.orgTree(tenantId));
    } catch (err) {
      logger.warn({ err, module: "hr-org-units" }, "Failed to invalidate org tree cache");
    }
  }

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateType: string,
    aggregateId: string,
    eventType: OrgUnitDomainEventType,
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
  // Org Unit Business Logic
  // ===========================================================================

  /**
   * List org units with filters
   */
  async listOrgUnits(
    context: TenantContext,
    filters: OrgUnitFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<OrgUnitResponse>> {
    const result = await this.repository.findOrgUnits(context, filters, pagination);

    return {
      items: result.items.map(this.mapOrgUnitToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get org unit by ID
   */
  async getOrgUnit(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<OrgUnitResponse>> {
    const orgUnit = await this.repository.findOrgUnitById(context, id);

    if (!orgUnit) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Org unit not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapOrgUnitToResponse(orgUnit),
    };
  }

  /**
   * Get org unit hierarchy
   *
   * When fetching the full tree (no rootId), results are cached per-tenant
   * for 5 minutes (CacheTTL.SESSION). Subtree queries bypass the cache since
   * they are less frequent and vary by rootId.
   */
  async getOrgUnitHierarchy(
    context: TenantContext,
    rootId?: string
  ): Promise<ServiceResult<OrgUnitResponse[]>> {
    // Only cache the full tree (no rootId filter)
    if (!rootId && this.cache) {
      const cacheKey = CacheKeys.orgTree(context.tenantId);
      try {
        const cached = await this.cache.get<OrgUnitResponse[]>(cacheKey);
        if (cached !== null) {
          return { success: true, data: cached };
        }
      } catch (cacheErr) {
        logger.warn({ err: cacheErr, module: "hr-org-units" }, "Cache read failed for org tree, falling back to DB");
      }
    }

    const orgUnits = await this.repository.getOrgUnitHierarchy(context, rootId);
    const data = orgUnits.map(this.mapOrgUnitToResponse);

    // Populate cache for full tree (fire-and-forget)
    if (!rootId && this.cache) {
      this.cache
        .set(CacheKeys.orgTree(context.tenantId), data, CacheTTL.SESSION)
        .catch((err) => logger.warn({ err, module: "hr-org-units" }, "Cache write failed for org tree"));
    }

    return {
      success: true,
      data,
    };
  }

  /**
   * Create org unit
   */
  async createOrgUnit(
    context: TenantContext,
    data: CreateOrgUnit,
    idempotencyKey?: string
  ): Promise<ServiceResult<OrgUnitResponse>> {
    // Validate parent exists if specified
    if (data.parent_id) {
      const parent = await this.repository.findOrgUnitById(context, data.parent_id);
      if (!parent) {
        return {
          success: false,
          error: {
            code: "INVALID_PARENT",
            message: "Parent org unit not found",
            details: { parent_id: data.parent_id },
          },
        };
      }
      if (!parent.isActive) {
        return {
          success: false,
          error: {
            code: "INACTIVE_PARENT",
            message: "Cannot create org unit under inactive parent",
            details: { parent_id: data.parent_id },
          },
        };
      }
    }

    // Check for duplicate code
    const existing = await this.repository.findOrgUnitByCode(context, data.code);
    if (existing) {
      return {
        success: false,
        error: {
          code: "DUPLICATE_CODE",
          message: "Org unit with this code already exists",
          details: { code: data.code },
        },
      };
    }

    // Create org unit in transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      const orgUnit = await this.repository.createOrgUnit(
        tx,
        context,
        data,
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "org_unit", orgUnit.id, "hr.org_unit.created", {
        orgUnit: this.mapOrgUnitToResponse(orgUnit),
      });

      return orgUnit;
    });

    await this.invalidateOrgTreeCache(context.tenantId);

    return {
      success: true,
      data: this.mapOrgUnitToResponse(result),
    };
  }

  /**
   * Update org unit
   */
  async updateOrgUnit(
    context: TenantContext,
    id: string,
    data: UpdateOrgUnit,
    idempotencyKey?: string
  ): Promise<ServiceResult<OrgUnitResponse>> {
    // Check org unit exists
    const existing = await this.repository.findOrgUnitById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Org unit not found",
          details: { id },
        },
      };
    }

    // Validate parent change doesn't create circular hierarchy
    if (data.parent_id !== undefined && data.parent_id !== null) {
      // Check parent exists
      const parent = await this.repository.findOrgUnitById(context, data.parent_id);
      if (!parent) {
        return {
          success: false,
          error: {
            code: "INVALID_PARENT",
            message: "Parent org unit not found",
            details: { parent_id: data.parent_id },
          },
        };
      }

      // Check for circular hierarchy
      if (parent.path && parent.path.includes(id)) {
        return {
          success: false,
          error: {
            code: "CIRCULAR_HIERARCHY",
            message: "Cannot set parent that would create circular hierarchy",
            details: { parent_id: data.parent_id, org_unit_id: id },
          },
        };
      }
    }

    // Update in transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      const orgUnit = await this.repository.updateOrgUnit(
        tx,
        context,
        id,
        data,
        context.userId || "system"
      );

      if (!orgUnit) {
        throw new Error("Failed to update org unit");
      }

      // Emit event
      await this.emitEvent(tx, context, "org_unit", id, "hr.org_unit.updated", {
        orgUnit: this.mapOrgUnitToResponse(orgUnit),
        changes: data,
      });

      return orgUnit;
    });

    await this.invalidateOrgTreeCache(context.tenantId);

    return {
      success: true,
      data: this.mapOrgUnitToResponse(result),
    };
  }

  /**
   * Delete org unit (soft delete)
   */
  async deleteOrgUnit(
    context: TenantContext,
    id: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Check org unit exists
    const existing = await this.repository.findOrgUnitById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Org unit not found",
          details: { id },
        },
      };
    }

    // Check for children
    const hasChildren = await this.repository.orgUnitHasChildren(context, id);
    if (hasChildren) {
      return {
        success: false,
        error: {
          code: "HAS_CHILDREN",
          message: "Cannot delete org unit with active children",
          details: { id },
        },
      };
    }

    // Check for employees
    const hasEmployees = await this.repository.orgUnitHasEmployees(context, id);
    if (hasEmployees) {
      return {
        success: false,
        error: {
          code: "HAS_EMPLOYEES",
          message: "Cannot delete org unit with active employees",
          details: { id },
        },
      };
    }

    // Delete in transaction
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.deleteOrgUnit(tx, context, id);

      // Emit event
      await this.emitEvent(tx, context, "org_unit", id, "hr.org_unit.deleted", {
        orgUnitId: id,
      });
    });

    await this.invalidateOrgTreeCache(context.tenantId);

    return { success: true };
  }

  // ===========================================================================
  // Mapping Helper
  // ===========================================================================

  mapOrgUnitToResponse(row: OrgUnitRow): OrgUnitResponse {
    const formatDateOnly = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString().split("T")[0]!;
      }

      if (typeof value === "string") {
        return value.includes("T") ? value.split("T")[0]! : value;
      }

      return "";
    };

    const formatDateTime = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString();
      }

      if (typeof value === "string") {
        return value;
      }

      return new Date(0).toISOString();
    };

    const effectiveFromRaw = (row as any).effectiveFrom ?? (row as any).effective_from;
    const effectiveToRaw = (row as any).effectiveTo ?? (row as any).effective_to;
    const createdAtRaw = (row as any).createdAt ?? (row as any).created_at;
    const updatedAtRaw = (row as any).updatedAt ?? (row as any).updated_at;

    const tenantIdRaw = (row as any).tenantId ?? (row as any).tenant_id;
    const parentIdRaw = (row as any).parentId ?? (row as any).parent_id ?? null;
    const managerPositionIdRaw =
      (row as any).managerPositionId ?? (row as any).manager_position_id ?? null;
    const costCenterIdRaw = (row as any).costCenterId ?? (row as any).cost_center_id ?? null;
    const isActiveRaw = (row as any).isActive ?? (row as any).is_active;

    return {
      id: row.id,
      tenant_id: tenantIdRaw,
      parent_id: parentIdRaw,
      code: row.code,
      name: row.name,
      description: row.description,
      level: row.level,
      path: row.path,
      manager_position_id: managerPositionIdRaw,
      cost_center_id: costCenterIdRaw,
      is_active: typeof isActiveRaw === "boolean" ? isActiveRaw : true,
      effective_from: formatDateOnly(effectiveFromRaw),
      effective_to: effectiveToRaw ? formatDateOnly(effectiveToRaw) : null,
      created_at: formatDateTime(createdAtRaw),
      updated_at: formatDateTime(updatedAtRaw),
    };
  }
}
