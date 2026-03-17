/**
 * Core HR Module - Org Unit Repository
 *
 * Provides data access methods for Organizational Unit entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql } from "../../plugins/db";
import type {
  CreateOrgUnit,
  UpdateOrgUnit,
  OrgUnitFilters,
  PaginationQuery,
} from "./schemas";
import type { TenantContext, OrgUnitRow, PaginatedResult } from "./repository.types";

// =============================================================================
// Org Unit Repository
// =============================================================================

export class OrgUnitRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Find org units with filters and pagination
   */
  async findOrgUnits(
    context: TenantContext,
    filters: OrgUnitFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<OrgUnitRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1; // Fetch one extra to check hasMore

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<OrgUnitRow[]>`
        SELECT
          id, tenant_id, parent_id, code, name, description,
          level, path::text, manager_position_id, cost_center_id,
          is_active, effective_from, effective_to, created_at, updated_at
        FROM app.org_units
        WHERE 1=1
          ${filters.parent_id !== undefined ? tx`AND parent_id = ${filters.parent_id}::uuid` : tx``}
          ${filters.parent_id === null ? tx`AND parent_id IS NULL` : tx``}
          ${filters.is_active !== undefined ? tx`AND is_active = ${filters.is_active}` : tx``}
          ${filters.level !== undefined ? tx`AND level = ${filters.level}` : tx``}
          ${filters.search ? tx`AND (name ILIKE ${'%' + filters.search + '%'} OR code ILIKE ${'%' + filters.search + '%'})` : tx``}
          ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
        ORDER BY level, name, id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find org unit by ID
   */
  async findOrgUnitById(
    context: TenantContext,
    id: string
  ): Promise<OrgUnitRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<OrgUnitRow[]>`
        SELECT
          id, tenant_id, parent_id, code, name, description,
          level, path::text, manager_position_id, cost_center_id,
          is_active, effective_from, effective_to, created_at, updated_at
        FROM app.org_units
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Find org unit by code
   */
  async findOrgUnitByCode(
    context: TenantContext,
    code: string
  ): Promise<OrgUnitRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<OrgUnitRow[]>`
        SELECT
          id, tenant_id, parent_id, code, name, description,
          level, path::text, manager_position_id, cost_center_id,
          is_active, effective_from, effective_to, created_at, updated_at
        FROM app.org_units
        WHERE code = ${code}
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Create org unit
   */
  async createOrgUnit(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateOrgUnit,
    createdBy: string
  ): Promise<OrgUnitRow> {
    const rows = await tx<OrgUnitRow[]>`
      INSERT INTO app.org_units (
        tenant_id, parent_id, code, name, description,
        manager_position_id, cost_center_id, effective_from
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.parent_id || null}::uuid,
        ${data.code},
        ${data.name},
        ${data.description || null},
        ${data.manager_position_id || null}::uuid,
        ${data.cost_center_id || null}::uuid,
        ${data.effective_from}::date
      )
      RETURNING
        id, tenant_id, parent_id, code, name, description,
        level, path::text, manager_position_id, cost_center_id,
        is_active, effective_from, effective_to, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update org unit
   */
  async updateOrgUnit(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateOrgUnit,
    updatedBy: string
  ): Promise<OrgUnitRow | null> {
    const rows = await tx<OrgUnitRow[]>`
      UPDATE app.org_units
      SET
        parent_id = COALESCE(${data.parent_id}::uuid, parent_id),
        code = COALESCE(${data.code}, code),
        name = COALESCE(${data.name}, name),
        description = COALESCE(${data.description}, description),
        manager_position_id = COALESCE(${data.manager_position_id}::uuid, manager_position_id),
        cost_center_id = COALESCE(${data.cost_center_id}::uuid, cost_center_id),
        is_active = COALESCE(${data.is_active}, is_active),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, parent_id, code, name, description,
        level, path::text, manager_position_id, cost_center_id,
        is_active, effective_from, effective_to, created_at, updated_at
    `;

    return rows[0] || null;
  }

  /**
   * Soft delete org unit
   */
  async deleteOrgUnit(
    tx: TransactionSql,
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      UPDATE app.org_units
      SET is_active = false, updated_at = now()
      WHERE id = ${id}::uuid
    `;

    return result.count > 0;
  }

  /**
   * Check if org unit has children
   */
  async orgUnitHasChildren(
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.org_units
          WHERE parent_id = ${id}::uuid AND is_active = true
        ) as exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Check if org unit has employees
   */
  async orgUnitHasEmployees(
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.position_assignments pa
          INNER JOIN app.employees e ON pa.employee_id = e.id
          WHERE pa.org_unit_id = ${id}::uuid
            AND pa.effective_to IS NULL
            AND e.status IN ('active', 'on_leave')
        ) as exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Get org unit hierarchy
   */
  async getOrgUnitHierarchy(
    context: TenantContext,
    rootId?: string
  ): Promise<OrgUnitRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      if (rootId) {
        const rows = await tx<OrgUnitRow[]>`
          SELECT
            id, tenant_id, parent_id, code, name, description,
            level, path::text, manager_position_id, cost_center_id,
            is_active, effective_from, effective_to, created_at, updated_at
          FROM app.get_org_unit_descendants(${rootId}::uuid)
          JOIN app.org_units USING (id)
        `;
        return rows;
      } else {
        const rows = await tx<OrgUnitRow[]>`
          SELECT
            id, tenant_id, parent_id, code, name, description,
            level, path::text, manager_position_id, cost_center_id,
            is_active, effective_from, effective_to, created_at, updated_at
          FROM app.org_units
          WHERE is_active = true
          ORDER BY level, name
        `;
        return rows;
      }
    });

    return result;
  }
}
