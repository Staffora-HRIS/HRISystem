/**
 * Talent Pools Module - Repository Layer
 *
 * Handles database operations for talent pool management.
 * All queries respect RLS via tenant context.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  CreateTalentPool,
  UpdateTalentPool,
  AddMember,
  UpdateMember,
  PoolFilters,
  MemberFilters,
  TalentPoolReadiness,
} from "./schemas";

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface TalentPoolRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  category: string | null;
  status: string;
  criteria: Record<string, unknown>;
  memberCount: number;
  readyNowCount: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TalentPoolMemberRow {
  id: string;
  tenantId: string;
  poolId: string;
  employeeId: string;
  employeeName: string;
  currentPosition: string | null;
  currentDepartment: string | null;
  readiness: TalentPoolReadiness;
  notes: string | null;
  isActive: boolean;
  addedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class TalentPoolRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Pool Find Operations
  // ===========================================================================

  async findPools(
    context: TenantContext,
    filters: PoolFilters = {},
    pagination: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedResult<TalentPoolRow>> {
    const limit = pagination.limit ?? 20;

    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<TalentPoolRow[]>`
        SELECT
          tp.id,
          tp.tenant_id,
          tp.name,
          tp.description,
          tp.category,
          tp.status,
          tp.criteria,
          tp.created_by,
          tp.created_at,
          tp.updated_at,
          COALESCE(m.member_count, 0)::int AS "memberCount",
          COALESCE(m.ready_now_count, 0)::int AS "readyNowCount"
        FROM app.talent_pools tp
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS member_count,
            COUNT(*) FILTER (WHERE tpm.readiness = 'ready_now')::int AS ready_now_count
          FROM app.talent_pool_members tpm
          WHERE tpm.pool_id = tp.id AND tpm.is_active = true
        ) m ON true
        WHERE tp.tenant_id = ${context.tenantId}::uuid
          ${filters.status ? tx`AND tp.status = ${filters.status}` : tx``}
          ${filters.category ? tx`AND tp.category = ${filters.category}` : tx``}
          ${filters.search ? tx`AND (tp.name ILIKE ${"%" + filters.search + "%"} OR tp.description ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${pagination.cursor ? tx`AND tp.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY tp.name, tp.id
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  async findPoolById(
    context: TenantContext,
    id: string
  ): Promise<TalentPoolRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<TalentPoolRow[]>`
        SELECT
          tp.id,
          tp.tenant_id,
          tp.name,
          tp.description,
          tp.category,
          tp.status,
          tp.criteria,
          tp.created_by,
          tp.created_at,
          tp.updated_at,
          COALESCE(m.member_count, 0)::int AS "memberCount",
          COALESCE(m.ready_now_count, 0)::int AS "readyNowCount"
        FROM app.talent_pools tp
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS member_count,
            COUNT(*) FILTER (WHERE tpm.readiness = 'ready_now')::int AS ready_now_count
          FROM app.talent_pool_members tpm
          WHERE tpm.pool_id = tp.id AND tpm.is_active = true
        ) m ON true
        WHERE tp.id = ${id}::uuid
          AND tp.tenant_id = ${context.tenantId}::uuid
      `;
    });

    return rows[0] ?? null;
  }

  async findPoolByName(
    context: TenantContext,
    name: string,
    excludeId?: string
  ): Promise<TalentPoolRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<TalentPoolRow[]>`
        SELECT
          tp.id,
          tp.tenant_id,
          tp.name,
          tp.description,
          tp.category,
          tp.status,
          tp.criteria,
          tp.created_by,
          tp.created_at,
          tp.updated_at,
          0::int AS "memberCount",
          0::int AS "readyNowCount"
        FROM app.talent_pools tp
        WHERE tp.tenant_id = ${context.tenantId}::uuid
          AND tp.name = ${name}
          ${excludeId ? tx`AND tp.id != ${excludeId}::uuid` : tx``}
      `;
    });

    return rows[0] ?? null;
  }

  // ===========================================================================
  // Pool Write Operations
  // ===========================================================================

  async createPool(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateTalentPool
  ): Promise<TalentPoolRow> {
    const rows = await tx<TalentPoolRow[]>`
      INSERT INTO app.talent_pools (
        tenant_id, name, description, category, criteria, created_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.name},
        ${data.description ?? null},
        ${data.category ?? null},
        ${JSON.stringify(data.criteria ?? {})}::jsonb,
        ${context.userId ?? null}::uuid
      )
      RETURNING
        id,
        tenant_id,
        name,
        description,
        category,
        status,
        criteria,
        created_by,
        created_at,
        updated_at,
        0::int AS "memberCount",
        0::int AS "readyNowCount"
    `;

    return rows[0]!;
  }

  async updatePool(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateTalentPool
  ): Promise<TalentPoolRow | null> {
    const rows = await tx<TalentPoolRow[]>`
      UPDATE app.talent_pools
      SET
        name = COALESCE(${data.name ?? null}, name),
        description = COALESCE(${data.description ?? null}, description),
        category = COALESCE(${data.category ?? null}, category),
        status = COALESCE(${data.status ?? null}, status),
        criteria = COALESCE(${data.criteria ? JSON.stringify(data.criteria) : null}::jsonb, criteria),
        updated_by = ${context.userId ?? null}::uuid,
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
      RETURNING
        id,
        tenant_id,
        name,
        description,
        category,
        status,
        criteria,
        created_by,
        created_at,
        updated_at
    `;

    return rows[0] ?? null;
  }

  async deletePool(
    tx: TransactionSql,
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM app.talent_pools
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
    `;

    return result.count > 0;
  }

  // ===========================================================================
  // Member Find Operations
  // ===========================================================================

  async findMembers(
    context: TenantContext,
    poolId: string,
    filters: MemberFilters = {},
    pagination: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedResult<TalentPoolMemberRow>> {
    const limit = pagination.limit ?? 20;

    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<TalentPoolMemberRow[]>`
        SELECT
          tpm.id,
          tpm.tenant_id,
          tpm.pool_id,
          tpm.employee_id,
          e.first_name || ' ' || e.last_name AS "employeeName",
          (
            SELECT p.title
            FROM app.position_assignments pa
            INNER JOIN app.positions p ON pa.position_id = p.id
            WHERE pa.employee_id = tpm.employee_id
              AND pa.is_primary = true
              AND pa.effective_to IS NULL
            LIMIT 1
          ) AS "currentPosition",
          (
            SELECT ou.name
            FROM app.position_assignments pa
            INNER JOIN app.positions p ON pa.position_id = p.id
            INNER JOIN app.org_units ou ON p.org_unit_id = ou.id
            WHERE pa.employee_id = tpm.employee_id
              AND pa.is_primary = true
              AND pa.effective_to IS NULL
            LIMIT 1
          ) AS "currentDepartment",
          tpm.readiness,
          tpm.notes,
          tpm.is_active,
          tpm.added_by,
          tpm.created_at,
          tpm.updated_at
        FROM app.talent_pool_members tpm
        JOIN app.employees e ON e.id = tpm.employee_id
        WHERE tpm.pool_id = ${poolId}::uuid
          AND tpm.tenant_id = ${context.tenantId}::uuid
          AND tpm.is_active = true
          ${filters.readiness ? tx`AND tpm.readiness = ${filters.readiness}` : tx``}
          ${pagination.cursor ? tx`AND tpm.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY e.last_name, e.first_name, tpm.id
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  async findMemberById(
    context: TenantContext,
    id: string
  ): Promise<TalentPoolMemberRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<TalentPoolMemberRow[]>`
        SELECT
          tpm.id,
          tpm.tenant_id,
          tpm.pool_id,
          tpm.employee_id,
          e.first_name || ' ' || e.last_name AS "employeeName",
          (
            SELECT p.title
            FROM app.position_assignments pa
            INNER JOIN app.positions p ON pa.position_id = p.id
            WHERE pa.employee_id = tpm.employee_id
              AND pa.is_primary = true
              AND pa.effective_to IS NULL
            LIMIT 1
          ) AS "currentPosition",
          (
            SELECT ou.name
            FROM app.position_assignments pa
            INNER JOIN app.positions p ON pa.position_id = p.id
            INNER JOIN app.org_units ou ON p.org_unit_id = ou.id
            WHERE pa.employee_id = tpm.employee_id
              AND pa.is_primary = true
              AND pa.effective_to IS NULL
            LIMIT 1
          ) AS "currentDepartment",
          tpm.readiness,
          tpm.notes,
          tpm.is_active,
          tpm.added_by,
          tpm.created_at,
          tpm.updated_at
        FROM app.talent_pool_members tpm
        JOIN app.employees e ON e.id = tpm.employee_id
        WHERE tpm.id = ${id}::uuid
          AND tpm.tenant_id = ${context.tenantId}::uuid
      `;
    });

    return rows[0] ?? null;
  }

  async findMemberByPoolAndEmployee(
    context: TenantContext,
    poolId: string,
    employeeId: string
  ): Promise<TalentPoolMemberRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<TalentPoolMemberRow[]>`
        SELECT
          tpm.id,
          tpm.tenant_id,
          tpm.pool_id,
          tpm.employee_id,
          e.first_name || ' ' || e.last_name AS "employeeName",
          tpm.readiness,
          tpm.notes,
          tpm.is_active,
          tpm.added_by,
          tpm.created_at,
          tpm.updated_at
        FROM app.talent_pool_members tpm
        JOIN app.employees e ON e.id = tpm.employee_id
        WHERE tpm.pool_id = ${poolId}::uuid
          AND tpm.employee_id = ${employeeId}::uuid
          AND tpm.tenant_id = ${context.tenantId}::uuid
      `;
    });

    return rows[0] ?? null;
  }

  // ===========================================================================
  // Member Write Operations
  // ===========================================================================

  async addMember(
    tx: TransactionSql,
    context: TenantContext,
    poolId: string,
    data: AddMember
  ): Promise<TalentPoolMemberRow> {
    const rows = await tx<TalentPoolMemberRow[]>`
      INSERT INTO app.talent_pool_members (
        tenant_id, pool_id, employee_id, readiness, notes, added_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${poolId}::uuid,
        ${data.employee_id}::uuid,
        ${data.readiness ?? "not_assessed"},
        ${data.notes ?? null},
        ${context.userId ?? null}::uuid
      )
      RETURNING
        id,
        tenant_id,
        pool_id,
        employee_id,
        readiness,
        notes,
        is_active,
        added_by,
        created_at,
        updated_at
    `;

    return rows[0]!;
  }

  async updateMember(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateMember
  ): Promise<TalentPoolMemberRow | null> {
    const rows = await tx<TalentPoolMemberRow[]>`
      UPDATE app.talent_pool_members
      SET
        readiness = COALESCE(${data.readiness ?? null}, readiness),
        notes = COALESCE(${data.notes ?? null}, notes),
        updated_by = ${context.userId ?? null}::uuid,
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
      RETURNING
        id,
        tenant_id,
        pool_id,
        employee_id,
        readiness,
        notes,
        is_active,
        added_by,
        created_at,
        updated_at
    `;

    return rows[0] ?? null;
  }

  async removeMember(
    tx: TransactionSql,
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      UPDATE app.talent_pool_members
      SET is_active = false, updated_at = now(), updated_by = ${context.userId ?? null}::uuid
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
    `;

    return result.count > 0;
  }

  async reactivateMember(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: AddMember
  ): Promise<TalentPoolMemberRow | null> {
    const rows = await tx<TalentPoolMemberRow[]>`
      UPDATE app.talent_pool_members
      SET
        is_active = true,
        readiness = ${data.readiness ?? "not_assessed"},
        notes = ${data.notes ?? null},
        updated_by = ${context.userId ?? null}::uuid,
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
      RETURNING
        id,
        tenant_id,
        pool_id,
        employee_id,
        readiness,
        notes,
        is_active,
        added_by,
        created_at,
        updated_at
    `;

    return rows[0] ?? null;
  }
}
