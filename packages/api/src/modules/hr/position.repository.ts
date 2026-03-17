/**
 * Core HR Module - Position Repository
 *
 * Provides data access methods for Position entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql } from "../../plugins/db";
import type {
  CreatePosition,
  UpdatePosition,
  PositionFilters,
  PaginationQuery,
} from "./schemas";
import type { TenantContext, PositionRow, PaginatedResult } from "./repository.types";

// =============================================================================
// Position Repository
// =============================================================================

export class PositionRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Find positions with filters and pagination
   */
  async findPositions(
    context: TenantContext,
    filters: PositionFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<PositionRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<PositionRow[]>`
        SELECT
          p.id, p.tenant_id, p.code, p.title, p.description,
          p.org_unit_id, ou.name as org_unit_name, p.job_grade,
          p.min_salary::text, p.max_salary::text, p.currency,
          p.is_manager, p.headcount, p.reports_to_position_id,
          p.is_active, p.created_at, p.updated_at,
          (
            SELECT COUNT(*)
            FROM app.position_assignments pa
            INNER JOIN app.employees e ON pa.employee_id = e.id
            WHERE pa.position_id = p.id
              AND pa.effective_to IS NULL
              AND e.status IN ('active', 'on_leave')
          )::integer as current_headcount
        FROM app.positions p
        LEFT JOIN app.org_units ou ON p.org_unit_id = ou.id
        WHERE 1=1
          ${filters.org_unit_id ? tx`AND p.org_unit_id = ${filters.org_unit_id}::uuid` : tx``}
          ${filters.is_active !== undefined ? tx`AND p.is_active = ${filters.is_active}` : tx``}
          ${filters.is_manager !== undefined ? tx`AND p.is_manager = ${filters.is_manager}` : tx``}
          ${filters.job_grade ? tx`AND p.job_grade = ${filters.job_grade}` : tx``}
          ${filters.search ? tx`AND (p.title ILIKE ${'%' + filters.search + '%'} OR p.code ILIKE ${'%' + filters.search + '%'})` : tx``}
          ${cursor ? tx`AND p.id > ${cursor}::uuid` : tx``}
        ORDER BY p.title, p.id
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
   * Find position by ID
   */
  async findPositionById(
    context: TenantContext,
    id: string
  ): Promise<PositionRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<PositionRow[]>`
        SELECT
          p.id, p.tenant_id, p.code, p.title, p.description,
          p.org_unit_id, ou.name as org_unit_name, p.job_grade,
          p.min_salary::text, p.max_salary::text, p.currency,
          p.is_manager, p.headcount, p.reports_to_position_id,
          p.is_active, p.created_at, p.updated_at,
          (
            SELECT COUNT(*)
            FROM app.position_assignments pa
            INNER JOIN app.employees e ON pa.employee_id = e.id
            WHERE pa.position_id = p.id
              AND pa.effective_to IS NULL
              AND e.status IN ('active', 'on_leave')
          )::integer as current_headcount
        FROM app.positions p
        LEFT JOIN app.org_units ou ON p.org_unit_id = ou.id
        WHERE p.id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Create position
   */
  async createPosition(
    tx: TransactionSql,
    context: TenantContext,
    data: CreatePosition,
    createdBy: string
  ): Promise<PositionRow> {
    const rows = await tx<PositionRow[]>`
      INSERT INTO app.positions (
        tenant_id, code, title, description, org_unit_id,
        job_grade, min_salary, max_salary, currency,
        is_manager, headcount, reports_to_position_id
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.code},
        ${data.title},
        ${data.description || null},
        ${data.org_unit_id}::uuid,
        ${data.job_grade || null},
        ${data.min_salary || null},
        ${data.max_salary || null},
        ${data.currency || 'GBP'},
        ${data.is_manager || false},
        ${data.headcount || 1},
        ${data.reports_to_position_id || null}::uuid
      )
      RETURNING
        id, tenant_id, code, title, description, org_unit_id,
        job_grade, min_salary::text, max_salary::text, currency,
        is_manager, headcount, reports_to_position_id,
        is_active, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update position
   */
  async updatePosition(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdatePosition,
    updatedBy: string
  ): Promise<PositionRow | null> {
    const rows = await tx<PositionRow[]>`
      UPDATE app.positions
      SET
        code = COALESCE(${data.code}, code),
        title = COALESCE(${data.title}, title),
        description = COALESCE(${data.description}, description),
        org_unit_id = COALESCE(${data.org_unit_id}::uuid, org_unit_id),
        job_grade = COALESCE(${data.job_grade}, job_grade),
        min_salary = COALESCE(${data.min_salary}, min_salary),
        max_salary = COALESCE(${data.max_salary}, max_salary),
        currency = COALESCE(${data.currency}, currency),
        is_manager = COALESCE(${data.is_manager}, is_manager),
        headcount = COALESCE(${data.headcount}, headcount),
        reports_to_position_id = COALESCE(${data.reports_to_position_id}::uuid, reports_to_position_id),
        is_active = COALESCE(${data.is_active}, is_active),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, code, title, description, org_unit_id,
        job_grade, min_salary::text, max_salary::text, currency,
        is_manager, headcount, reports_to_position_id,
        is_active, created_at, updated_at
    `;

    return rows[0] || null;
  }

  /**
   * Soft delete position
   */
  async deletePosition(
    tx: TransactionSql,
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      UPDATE app.positions
      SET is_active = false, updated_at = now()
      WHERE id = ${id}::uuid
    `;

    return result.count > 0;
  }

  /**
   * Check if position has active assignments
   */
  async positionHasActiveAssignments(
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.position_assignments pa
          INNER JOIN app.employees e ON pa.employee_id = e.id
          WHERE pa.position_id = ${id}::uuid
            AND pa.effective_to IS NULL
            AND e.status IN ('active', 'on_leave')
        ) as exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Get position headcount
   */
  async getPositionHeadcount(
    context: TenantContext,
    positionId: string
  ): Promise<{ headcount: number; currentCount: number }> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ headcount: number; currentCount: string }[]>`
        SELECT
          p.headcount,
          (
            SELECT COUNT(*)
            FROM app.position_assignments pa
            INNER JOIN app.employees e ON pa.employee_id = e.id
            WHERE pa.position_id = p.id
              AND pa.effective_to IS NULL
              AND e.status IN ('active', 'on_leave')
          )::text as current_count
        FROM app.positions p
        WHERE p.id = ${positionId}::uuid
      `;
      return rows;
    });

    const row = result[0];
    return {
      headcount: row?.headcount || 0,
      currentCount: parseInt(row?.currentCount || "0", 10),
    };
  }
}
