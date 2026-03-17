/**
 * Talent Pools Module - Service Layer
 *
 * Implements business logic for talent pool management.
 * Handles validation, domain events, and transaction management.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  TalentPoolRepository,
  TenantContext,
  TalentPoolRow,
  TalentPoolMemberRow,
} from "./repository";
import type {
  CreateTalentPool,
  UpdateTalentPool,
  AddMember,
  UpdateMember,
  PoolFilters,
  MemberFilters,
  TalentPoolResponse,
  TalentPoolMemberResponse,
} from "./schemas";

import type { ServiceResult, PaginatedServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

// =============================================================================
// Types
// =============================================================================

type DomainEventType =
  | "talent_pool.pool.created"
  | "talent_pool.pool.updated"
  | "talent_pool.pool.deleted"
  | "talent_pool.member.added"
  | "talent_pool.member.updated"
  | "talent_pool.member.removed";

// =============================================================================
// Service
// =============================================================================

export class TalentPoolService {
  constructor(
    private repository: TalentPoolRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateType: string,
    aggregateId: string,
    eventType: DomainEventType,
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
  // Pool Methods
  // ===========================================================================

  async listPools(
    context: TenantContext,
    filters: PoolFilters = {},
    pagination: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedServiceResult<TalentPoolResponse>> {
    const result = await this.repository.findPools(context, filters, pagination);

    return {
      items: result.items.map(this.mapPoolToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getPool(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<TalentPoolResponse>> {
    const pool = await this.repository.findPoolById(context, id);

    if (!pool) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Talent pool not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapPoolToResponse(pool),
    };
  }

  async createPool(
    context: TenantContext,
    data: CreateTalentPool
  ): Promise<ServiceResult<TalentPoolResponse>> {
    // Check for duplicate name
    const existing = await this.repository.findPoolByName(context, data.name);
    if (existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: `A talent pool with the name '${data.name}' already exists`,
          details: { name: data.name },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const pool = await this.repository.createPool(tx, context, data);

      await this.emitEvent(
        tx,
        context,
        "talent_pool",
        pool.id,
        "talent_pool.pool.created",
        { poolId: pool.id, name: data.name }
      );

      return pool;
    });

    // Fetch full pool with member counts
    const fullPool = await this.repository.findPoolById(context, result.id);

    return {
      success: true,
      data: this.mapPoolToResponse(fullPool!),
    };
  }

  async updatePool(
    context: TenantContext,
    id: string,
    data: UpdateTalentPool
  ): Promise<ServiceResult<TalentPoolResponse>> {
    const existing = await this.repository.findPoolById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Talent pool not found",
          details: { id },
        },
      };
    }

    // If name is being changed, check for duplicates
    if (data.name && data.name !== existing.name) {
      const duplicate = await this.repository.findPoolByName(context, data.name, id);
      if (duplicate) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: `A talent pool with the name '${data.name}' already exists`,
            details: { name: data.name },
          },
        };
      }
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.updatePool(tx, context, id, data);

      await this.emitEvent(
        tx,
        context,
        "talent_pool",
        id,
        "talent_pool.pool.updated",
        { changes: data }
      );
    });

    const updated = await this.repository.findPoolById(context, id);

    return {
      success: true,
      data: this.mapPoolToResponse(updated!),
    };
  }

  async deletePool(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    const existing = await this.repository.findPoolById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Talent pool not found",
          details: { id },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.deletePool(tx, context, id);

      await this.emitEvent(
        tx,
        context,
        "talent_pool",
        id,
        "talent_pool.pool.deleted",
        { poolId: id, name: existing.name }
      );
    });

    return { success: true };
  }

  // ===========================================================================
  // Member Methods
  // ===========================================================================

  async listMembers(
    context: TenantContext,
    poolId: string,
    filters: MemberFilters = {},
    pagination: { cursor?: string; limit?: number } = {}
  ): Promise<ServiceResult<PaginatedServiceResult<TalentPoolMemberResponse>>> {
    // Verify pool exists
    const pool = await this.repository.findPoolById(context, poolId);
    if (!pool) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Talent pool not found",
          details: { poolId },
        },
      };
    }

    const result = await this.repository.findMembers(context, poolId, filters, pagination);

    return {
      success: true,
      data: {
        items: result.items.map(this.mapMemberToResponse),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  async addMember(
    context: TenantContext,
    poolId: string,
    data: AddMember
  ): Promise<ServiceResult<TalentPoolMemberResponse>> {
    // Verify pool exists and is active
    const pool = await this.repository.findPoolById(context, poolId);
    if (!pool) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Talent pool not found",
          details: { poolId },
        },
      };
    }

    if (pool.status !== "active") {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Cannot add members to an archived talent pool",
          details: { poolId, status: pool.status },
        },
      };
    }

    // Check if employee is already in this pool
    const existingMember = await this.repository.findMemberByPoolAndEmployee(
      context,
      poolId,
      data.employee_id
    );

    if (existingMember && existingMember.isActive) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Employee is already a member of this talent pool",
          details: { poolId, employeeId: data.employee_id },
        },
      };
    }

    let resultId: string;

    if (existingMember && !existingMember.isActive) {
      // Reactivate the soft-deleted member
      const reactivated = await this.db.withTransaction(context, async (tx) => {
        const member = await this.repository.reactivateMember(tx, context, existingMember.id, data);

        await this.emitEvent(
          tx,
          context,
          "talent_pool_member",
          existingMember.id,
          "talent_pool.member.added",
          { poolId, employeeId: data.employee_id, reactivated: true }
        );

        return member;
      });

      resultId = reactivated!.id;
    } else {
      // Create new member
      const result = await this.db.withTransaction(context, async (tx) => {
        const member = await this.repository.addMember(tx, context, poolId, data);

        await this.emitEvent(
          tx,
          context,
          "talent_pool_member",
          member.id,
          "talent_pool.member.added",
          { poolId, employeeId: data.employee_id }
        );

        return member;
      });

      resultId = result.id;
    }

    // Fetch full member with relations
    const fullMember = await this.repository.findMemberById(context, resultId);

    return {
      success: true,
      data: this.mapMemberToResponse(fullMember!),
    };
  }

  async updateMember(
    context: TenantContext,
    memberId: string,
    data: UpdateMember
  ): Promise<ServiceResult<TalentPoolMemberResponse>> {
    const existing = await this.repository.findMemberById(context, memberId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Talent pool member not found",
          details: { memberId },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.updateMember(tx, context, memberId, data);

      await this.emitEvent(
        tx,
        context,
        "talent_pool_member",
        memberId,
        "talent_pool.member.updated",
        { changes: data, poolId: existing.poolId }
      );
    });

    const updated = await this.repository.findMemberById(context, memberId);

    return {
      success: true,
      data: this.mapMemberToResponse(updated!),
    };
  }

  async removeMember(
    context: TenantContext,
    memberId: string
  ): Promise<ServiceResult<void>> {
    const existing = await this.repository.findMemberById(context, memberId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Talent pool member not found",
          details: { memberId },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.removeMember(tx, context, memberId);

      await this.emitEvent(
        tx,
        context,
        "talent_pool_member",
        memberId,
        "talent_pool.member.removed",
        { poolId: existing.poolId, employeeId: existing.employeeId }
      );
    });

    return { success: true };
  }

  // ===========================================================================
  // Mapping Helpers
  // ===========================================================================

  private mapPoolToResponse(row: TalentPoolRow): TalentPoolResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      name: row.name,
      description: row.description ?? undefined,
      category: row.category ?? undefined,
      status: row.status as "active" | "archived",
      criteria: (row.criteria as Record<string, unknown>) ?? undefined,
      member_count: row.memberCount ?? 0,
      ready_now_count: row.readyNowCount ?? 0,
      created_by: row.createdBy ?? undefined,
      created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }

  private mapMemberToResponse(row: TalentPoolMemberRow): TalentPoolMemberResponse {
    return {
      id: row.id,
      pool_id: row.poolId,
      employee_id: row.employeeId,
      employee_name: row.employeeName ?? "",
      current_position: row.currentPosition ?? undefined,
      current_department: row.currentDepartment ?? undefined,
      readiness: row.readiness,
      notes: row.notes ?? undefined,
      is_active: row.isActive,
      added_by: row.addedBy ?? undefined,
      created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }
}
