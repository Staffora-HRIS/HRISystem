/**
 * Cost Centre Assignments Module - Repository Layer
 *
 * Database operations for effective-dated cost centre assignments.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateCostCentreAssignment,
  UpdateCostCentreAssignment,
  CostCentreAssignmentFilters,
  PaginationQuery,
  EntityType,
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

export interface CostCentreAssignmentRow extends Row {
  id: string;
  tenantId: string;
  entityType: EntityType;
  entityId: string;
  entityName?: string | null;
  costCentreId: string;
  costCentreCode?: string | null;
  costCentreName?: string | null;
  percentage: string; // numeric comes as string from postgres.js
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class CostCentreAssignmentRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * List cost centre assignments with filters and cursor-based pagination.
   * Joins to cost_centers, employees, org_units, and positions to resolve names.
   */
  async listAssignments(
    ctx: TenantContext,
    filters: CostCentreAssignmentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<CostCentreAssignmentRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<CostCentreAssignmentRow[]>`
        SELECT
          cca.id, cca.tenant_id, cca.entity_type, cca.entity_id,
          cca.cost_centre_id, cca.percentage::text,
          cca.effective_from, cca.effective_to,
          cca.created_by, cca.created_at, cca.updated_at,
          cc.code AS cost_centre_code,
          cc.name AS cost_centre_name,
          CASE cca.entity_type
            WHEN 'employee' THEN (
              SELECT app.get_employee_display_name(cca.entity_id)
            )
            WHEN 'department' THEN (
              SELECT ou.name FROM app.org_units ou WHERE ou.id = cca.entity_id LIMIT 1
            )
            WHEN 'position' THEN (
              SELECT p.title FROM app.positions p WHERE p.id = cca.entity_id LIMIT 1
            )
          END AS entity_name
        FROM app.cost_centre_assignments cca
        JOIN app.cost_centers cc ON cc.id = cca.cost_centre_id
        WHERE 1=1
          ${filters.entity_type ? tx`AND cca.entity_type = ${filters.entity_type}::app.cost_centre_entity_type` : tx``}
          ${filters.entity_id ? tx`AND cca.entity_id = ${filters.entity_id}::uuid` : tx``}
          ${filters.cost_centre_id ? tx`AND cca.cost_centre_id = ${filters.cost_centre_id}::uuid` : tx``}
          ${filters.current_only ? tx`AND cca.effective_to IS NULL` : tx``}
          ${filters.effective_at ? tx`AND cca.effective_from <= ${filters.effective_at}::date AND (cca.effective_to IS NULL OR cca.effective_to > ${filters.effective_at}::date)` : tx``}
          ${filters.search ? tx`AND (
            cc.code ILIKE ${"%" + filters.search + "%"}
            OR cc.name ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
          ${pagination.cursor ? tx`AND cca.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY cca.effective_from DESC, cca.created_at DESC, cca.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0 ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Get a single assignment by ID with joined names.
   */
  async getAssignmentById(
    ctx: TenantContext,
    id: string
  ): Promise<CostCentreAssignmentRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<CostCentreAssignmentRow[]>`
        SELECT
          cca.id, cca.tenant_id, cca.entity_type, cca.entity_id,
          cca.cost_centre_id, cca.percentage::text,
          cca.effective_from, cca.effective_to,
          cca.created_by, cca.created_at, cca.updated_at,
          cc.code AS cost_centre_code,
          cc.name AS cost_centre_name,
          CASE cca.entity_type
            WHEN 'employee' THEN (
              SELECT app.get_employee_display_name(cca.entity_id)
            )
            WHEN 'department' THEN (
              SELECT ou.name FROM app.org_units ou WHERE ou.id = cca.entity_id LIMIT 1
            )
            WHEN 'position' THEN (
              SELECT p.title FROM app.positions p WHERE p.id = cca.entity_id LIMIT 1
            )
          END AS entity_name
        FROM app.cost_centre_assignments cca
        JOIN app.cost_centers cc ON cc.id = cca.cost_centre_id
        WHERE cca.id = ${id}::uuid
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Get assignment by ID within an existing transaction (for update flows).
   */
  async getAssignmentByIdTx(
    id: string,
    tx: TransactionSql
  ): Promise<CostCentreAssignmentRow | null> {
    const rows = await tx<CostCentreAssignmentRow[]>`
      SELECT
        id, tenant_id, entity_type, entity_id,
        cost_centre_id, percentage::text,
        effective_from, effective_to,
        created_by, created_at, updated_at
      FROM app.cost_centre_assignments
      WHERE id = ${id}::uuid
    `;
    return rows[0] ?? null;
  }

  /**
   * Get the full effective-dated history for an entity (employee/department/position).
   * Returns all assignments ordered by effective_from descending.
   */
  async getEntityHistory(
    ctx: TenantContext,
    entityType: EntityType,
    entityId: string,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<CostCentreAssignmentRow>> {
    const limit = pagination.limit || 50;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<CostCentreAssignmentRow[]>`
        SELECT
          cca.id, cca.tenant_id, cca.entity_type, cca.entity_id,
          cca.cost_centre_id, cca.percentage::text,
          cca.effective_from, cca.effective_to,
          cca.created_by, cca.created_at, cca.updated_at,
          cc.code AS cost_centre_code,
          cc.name AS cost_centre_name
        FROM app.cost_centre_assignments cca
        JOIN app.cost_centers cc ON cc.id = cca.cost_centre_id
        WHERE cca.entity_type = ${entityType}::app.cost_centre_entity_type
          AND cca.entity_id = ${entityId}::uuid
          ${pagination.cursor ? tx`AND cca.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY cca.effective_from DESC, cca.created_at DESC, cca.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0 ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Check for effective date overlap for the same entity + cost_centre combination.
   * Returns true if an overlap exists.
   */
  async checkOverlap(
    ctx: TenantContext,
    entityType: EntityType,
    entityId: string,
    costCentreId: string,
    effectiveFrom: string,
    effectiveTo: string | null,
    excludeId?: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.cost_centre_assignments
          WHERE entity_type = ${entityType}::app.cost_centre_entity_type
            AND entity_id = ${entityId}::uuid
            AND cost_centre_id = ${costCentreId}::uuid
            ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
            AND effective_from < ${effectiveTo || "9999-12-31"}::date
            AND (effective_to IS NULL OR effective_to > ${effectiveFrom}::date)
        ) AS exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Verify that the referenced entity actually exists.
   * Returns true if the entity exists within the tenant.
   */
  async entityExists(
    ctx: TenantContext,
    entityType: EntityType,
    entityId: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      let rows: { exists: boolean }[];

      switch (entityType) {
        case "employee":
          rows = await tx<{ exists: boolean }[]>`
            SELECT EXISTS(
              SELECT 1 FROM app.employees WHERE id = ${entityId}::uuid
            ) AS exists
          `;
          break;
        case "department":
          rows = await tx<{ exists: boolean }[]>`
            SELECT EXISTS(
              SELECT 1 FROM app.org_units WHERE id = ${entityId}::uuid
            ) AS exists
          `;
          break;
        case "position":
          rows = await tx<{ exists: boolean }[]>`
            SELECT EXISTS(
              SELECT 1 FROM app.positions WHERE id = ${entityId}::uuid
            ) AS exists
          `;
          break;
        default:
          rows = [{ exists: false }];
      }

      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Verify that the cost centre exists and is active.
   */
  async costCentreExists(
    ctx: TenantContext,
    costCentreId: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.cost_centers
          WHERE id = ${costCentreId}::uuid AND is_active = true
        ) AS exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Create a new cost centre assignment.
   * Must be called within a transaction.
   */
  async createAssignment(
    ctx: TenantContext,
    data: CreateCostCentreAssignment,
    createdBy: string | undefined,
    tx: TransactionSql
  ): Promise<CostCentreAssignmentRow> {
    const [row] = await tx<CostCentreAssignmentRow[]>`
      INSERT INTO app.cost_centre_assignments (
        tenant_id, entity_type, entity_id, cost_centre_id,
        percentage, effective_from, effective_to, created_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.entity_type}::app.cost_centre_entity_type,
        ${data.entity_id}::uuid,
        ${data.cost_centre_id}::uuid,
        ${data.percentage ?? 100},
        ${data.effective_from}::date,
        ${data.effective_to ?? null}::date,
        ${createdBy ?? null}::uuid
      )
      RETURNING
        id, tenant_id, entity_type, entity_id, cost_centre_id,
        percentage::text, effective_from, effective_to,
        created_by, created_at, updated_at
    `;
    return row;
  }

  /**
   * Update an existing cost centre assignment (percentage, effective_to).
   * Must be called within a transaction.
   */
  async updateAssignment(
    id: string,
    data: UpdateCostCentreAssignment,
    tx: TransactionSql
  ): Promise<CostCentreAssignmentRow | null> {
    const [row] = await tx<CostCentreAssignmentRow[]>`
      UPDATE app.cost_centre_assignments
      SET
        percentage = COALESCE(${data.percentage ?? null}::numeric, percentage),
        effective_to = CASE
          WHEN ${data.effective_to !== undefined} THEN ${data.effective_to ?? null}::date
          ELSE effective_to
        END
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, entity_type, entity_id, cost_centre_id,
        percentage::text, effective_from, effective_to,
        created_by, created_at, updated_at
    `;
    return row ?? null;
  }

  /**
   * Close the current open assignment for an entity + cost centre
   * by setting effective_to to the given date.
   * Used when creating a new assignment that supersedes the current one.
   */
  async closeCurrentAssignment(
    ctx: TenantContext,
    entityType: EntityType,
    entityId: string,
    costCentreId: string,
    closeDate: string,
    tx: TransactionSql
  ): Promise<void> {
    await tx`
      UPDATE app.cost_centre_assignments
      SET effective_to = ${closeDate}::date, updated_at = now()
      WHERE entity_type = ${entityType}::app.cost_centre_entity_type
        AND entity_id = ${entityId}::uuid
        AND cost_centre_id = ${costCentreId}::uuid
        AND effective_to IS NULL
        AND effective_from < ${closeDate}::date
    `;
  }
}
