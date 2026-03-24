/**
 * Talent Pools Module - Elysia Routes
 *
 * Defines the API endpoints for talent pool management.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - talent_pools: read, write, delete
 *
 * Endpoints:
 * - GET    /talent-pools                         List pools
 * - POST   /talent-pools                         Create pool
 * - GET    /talent-pools/:id                     Get pool by ID
 * - PATCH  /talent-pools/:id                     Update pool
 * - DELETE /talent-pools/:id                     Delete pool
 * - GET    /talent-pools/:poolId/members         List members
 * - POST   /talent-pools/:poolId/members         Add member
 * - PATCH  /talent-pools/:poolId/members/:memberId   Update member
 * - DELETE /talent-pools/:poolId/members/:memberId   Remove member
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { TalentPoolRepository } from "./repository";
import { TalentPoolService } from "./service";
import {
  CreateTalentPoolSchema,
  UpdateTalentPoolSchema,
  AddMemberSchema,
  UpdateMemberSchema,
  PoolFiltersSchema,
  MemberFiltersSchema,
  PaginationQuerySchema,
  TalentPoolResponseSchema,
  TalentPoolMemberResponseSchema,
  UuidSchema,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/**
 * Idempotency header schema (optional)
 */
const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

/**
 * Success response schema for delete operations
 */
const SuccessSchema = t.Object({
  success: t.Literal(true),
  message: t.String(),
});

/**
 * Module-specific error code overrides
 */
const TALENT_POOL_ERROR_CODES: Record<string, number> = {
  POOL_NOT_FOUND: 404,
  MEMBER_NOT_FOUND: 404,
  DUPLICATE_MEMBER: 409,
  POOL_ARCHIVED: 409,
};

// =============================================================================
// Routes
// =============================================================================

export const talentPoolRoutes = new Elysia({ prefix: "/talent-pools", name: "talent-pool-routes" })

  // ===========================================================================
  // Plugin Setup - Derive tenant context, service, and repository
  // ===========================================================================
  .derive((ctx) => {
    const { db, tenant, user } = ctx as any;
    const repository = new TalentPoolRepository(db);
    const service = new TalentPoolService(repository, db);
    const tenantContext = {
      tenantId: (tenant as any)?.id || "",
      userId: (user as any)?.id,
    };
    return { talentPoolService: service, talentPoolRepository: repository, tenantContext };
  })

  // ===========================================================================
  // Pool CRUD Routes
  // ===========================================================================

  // GET /talent-pools - List talent pools
  .get(
    "/",
    async (ctx) => {
      const { talentPoolService, tenantContext, query, error } = ctx as any;
      const { cursor, limit = 20, ...filters } = query;

      try {
        const result = await talentPoolService.listPools(
          tenantContext,
          filters,
          { cursor, limit: Number(limit) }
        );

        return {
          items: result.items,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        };
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("talent_pools", "read")],
      query: t.Partial(t.Object({
        ...PoolFiltersSchema.properties,
        ...PaginationQuerySchema.properties,
      })),
      response: {
        200: t.Object({
          items: t.Array(TalentPoolResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent Pools"],
        summary: "List talent pools",
        description: "List talent pools with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /talent-pools - Create talent pool
  .post(
    "/",
    async (ctx) => {
      const { talentPoolService, tenantContext, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await talentPoolService.createPool(tenantContext, body);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_POOL_ERROR_CODES), {
          error: result.error,
        });
      }

      // Audit log the creation
      if (audit) {
        await (audit as any).log({
          action: "talent_pool.pool.created",
          resourceType: "talent_pool",
          resourceId: result.data.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("talent_pools", "write")],
      body: CreateTalentPoolSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: TalentPoolResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent Pools"],
        summary: "Create talent pool",
        description: "Create a new talent pool",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /talent-pools/:id - Get talent pool by ID
  .get(
    "/:id",
    async (ctx) => {
      const { talentPoolService, tenantContext, params, error } = ctx as any;

      const result = await talentPoolService.getPool(tenantContext, params.id);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_POOL_ERROR_CODES), {
          error: result.error,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("talent_pools", "read")],
      params: t.Object({ id: UuidSchema }),
      response: {
        200: TalentPoolResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent Pools"],
        summary: "Get talent pool by ID",
        description: "Get a single talent pool by its ID, including member counts",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /talent-pools/:id - Update talent pool
  .patch(
    "/:id",
    async (ctx) => {
      const { talentPoolService, tenantContext, params, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await talentPoolService.updatePool(tenantContext, params.id, body);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_POOL_ERROR_CODES), {
          error: result.error,
        });
      }

      // Audit log the update
      if (audit) {
        await (audit as any).log({
          action: "talent_pool.pool.updated",
          resourceType: "talent_pool",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("talent_pools", "write")],
      params: t.Object({ id: UuidSchema }),
      body: UpdateTalentPoolSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: TalentPoolResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent Pools"],
        summary: "Update talent pool",
        description: "Update an existing talent pool",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /talent-pools/:id - Delete talent pool
  .delete(
    "/:id",
    async (ctx) => {
      const { talentPoolService, tenantContext, params, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await talentPoolService.deletePool(tenantContext, params.id);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_POOL_ERROR_CODES), {
          error: result.error,
        });
      }

      // Audit log the deletion
      if (audit) {
        await (audit as any).log({
          action: "talent_pool.pool.deleted",
          resourceType: "talent_pool",
          resourceId: params.id,
          metadata: { idempotencyKey, requestId },
        });
      }

      return { success: true as const, message: "Talent pool deleted successfully" };
    },
    {
      beforeHandle: [requirePermission("talent_pools", "delete")],
      params: t.Object({ id: UuidSchema }),
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: SuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent Pools"],
        summary: "Delete talent pool",
        description: "Delete a talent pool and all its member associations",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Member Routes
  // ===========================================================================

  // GET /talent-pools/:id/members - List pool members
  .get(
    "/:id/members",
    async (ctx) => {
      const { talentPoolService, tenantContext, params, query, error } = ctx as any;
      const { cursor, limit = 20, ...filters } = query;

      const result = await talentPoolService.listMembers(
        tenantContext,
        params.id,
        filters,
        { cursor, limit: Number(limit) }
      );

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_POOL_ERROR_CODES), {
          error: result.error,
        });
      }

      return {
        items: result.data!.items,
        nextCursor: result.data!.nextCursor,
        hasMore: result.data!.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("talent_pools", "read")],
      params: t.Object({ id: UuidSchema }),
      query: t.Partial(t.Object({
        ...MemberFiltersSchema.properties,
        ...PaginationQuerySchema.properties,
      })),
      response: {
        200: t.Object({
          items: t.Array(TalentPoolMemberResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent Pools"],
        summary: "List pool members",
        description: "List members of a talent pool with optional readiness filter and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /talent-pools/:id/members - Add member to pool
  .post(
    "/:id/members",
    async (ctx) => {
      const { talentPoolService, tenantContext, params, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await talentPoolService.addMember(tenantContext, params.id, body);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_POOL_ERROR_CODES), {
          error: result.error,
        });
      }

      // Audit log
      if (audit) {
        await (audit as any).log({
          action: "talent_pool.member.added",
          resourceType: "talent_pool_member",
          resourceId: result.data.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, poolId: params.id },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("talent_pools", "write")],
      params: t.Object({ id: UuidSchema }),
      body: AddMemberSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: TalentPoolMemberResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent Pools"],
        summary: "Add member to pool",
        description: "Add an employee to a talent pool with optional readiness assessment",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /talent-pools/:id/members/:memberId - Update member
  .patch(
    "/:id/members/:memberId",
    async (ctx) => {
      const { talentPoolService, tenantContext, params, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await talentPoolService.updateMember(tenantContext, params.memberId, body);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_POOL_ERROR_CODES), {
          error: result.error,
        });
      }

      // Audit log
      if (audit) {
        await (audit as any).log({
          action: "talent_pool.member.updated",
          resourceType: "talent_pool_member",
          resourceId: params.memberId,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, poolId: params.id },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("talent_pools", "write")],
      params: t.Object({ id: UuidSchema, memberId: UuidSchema }),
      body: UpdateMemberSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: TalentPoolMemberResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent Pools"],
        summary: "Update pool member",
        description: "Update readiness level or notes for a talent pool member",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /talent-pools/:id/members/:memberId - Remove member
  .delete(
    "/:id/members/:memberId",
    async (ctx) => {
      const { talentPoolService, tenantContext, params, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await talentPoolService.removeMember(tenantContext, params.memberId);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_POOL_ERROR_CODES), {
          error: result.error,
        });
      }

      // Audit log
      if (audit) {
        await (audit as any).log({
          action: "talent_pool.member.removed",
          resourceType: "talent_pool_member",
          resourceId: params.memberId,
          metadata: { idempotencyKey, requestId, poolId: params.id },
        });
      }

      return { success: true as const, message: "Member removed from talent pool" };
    },
    {
      beforeHandle: [requirePermission("talent_pools", "delete")],
      params: t.Object({ id: UuidSchema, memberId: UuidSchema }),
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: SuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent Pools"],
        summary: "Remove pool member",
        description: "Remove an employee from a talent pool (soft delete)",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type TalentPoolRoutes = typeof talentPoolRoutes;
