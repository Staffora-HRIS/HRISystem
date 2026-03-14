/**
 * Approval Delegation Routes
 *
 * Endpoints for managing approval delegations:
 * - POST   /delegations         — Create a new delegation
 * - GET    /delegations         — List my delegations (as delegator)
 * - GET    /delegations/active  — Get active delegation for current user
 * - DELETE /delegations/:id     — Revoke a delegation
 * - GET    /delegations/:id/log — View delegation usage log
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema } from "../../lib/route-helpers";
import { DelegationRepository } from "./repository";
import { DelegationService } from "./service";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "./repository";
import {
  CreateDelegationSchema,
  IdParamsSchema,
} from "./schemas";

/**
 * Derived route context after .derive() adds delegationService
 */
interface DelegationRouteContext {
  db: DatabaseClient;
  delegationService: DelegationService;
  tenantContext: TenantContext;
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  error: (status: number, body: unknown) => unknown;
  set: { status: number };
}

export const delegationRoutes = new Elysia({ prefix: "/delegations", name: "delegation-routes" })
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repo = new DelegationRepository(db);
    const service = new DelegationService(repo);
    return { delegationService: service };
  })

  // -------------------------------------------------------------------------
  // POST /delegations — Create delegation
  // -------------------------------------------------------------------------
  .post(
    "/",
    async (ctx) => {
      const { delegationService, tenantContext, body, error } =
        ctx as unknown as DelegationRouteContext;

      const result = await delegationService.createDelegation(
        tenantContext,
        body as unknown as Parameters<DelegationService["createDelegation"]>[1]
      );

      if (!result.success) {
        const code = result.error?.code;
        const status =
          code === "SELF_DELEGATION" || code === "INVALID_DATE_RANGE"
            ? 400
            : code === "CIRCULAR_DELEGATION" || code === "OVERLAPPING_DELEGATION"
              ? 409
              : code === "UNAUTHORIZED"
                ? 401
                : 500;
        return error(status, { error: result.error });
      }

      ctx.set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("delegations", "write")],
      body: CreateDelegationSchema,
      response: {
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Delegations"],
        summary: "Create approval delegation",
        description:
          "Create a new approval delegation from the authenticated user to another user.",
      },
    }
  )

  // -------------------------------------------------------------------------
  // GET /delegations — List my delegations
  // -------------------------------------------------------------------------
  .get(
    "/",
    async (ctx) => {
      const { delegationService, tenantContext } =
        ctx as unknown as DelegationRouteContext;

      const result = await delegationService.listMyDelegations(tenantContext);
      if (!result.success) {
        throw new Error(result.error?.message || "Failed to list delegations");
      }

      return { items: result.data || [] };
    },
    {
      beforeHandle: [requirePermission("delegations", "read")],
      detail: {
        tags: ["Delegations"],
        summary: "List my delegations",
        description: "List all delegations created by the authenticated user.",
      },
    }
  )

  // -------------------------------------------------------------------------
  // GET /delegations/active — Get active delegation
  // -------------------------------------------------------------------------
  .get(
    "/active",
    async (ctx) => {
      const { delegationService, tenantContext, query } =
        ctx as unknown as DelegationRouteContext;

      const scope = (query as Record<string, string | undefined>).scope;
      const result = await delegationService.getActiveDelegation(tenantContext, scope);
      if (!result.success) {
        throw new Error(result.error?.message || "Failed to fetch active delegation");
      }

      return { delegation: result.data };
    },
    {
      beforeHandle: [requirePermission("delegations", "read")],
      query: t.Object({
        scope: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Delegations"],
        summary: "Get active delegation",
        description:
          "Get the currently active delegation for the authenticated user, optionally filtered by scope.",
      },
    }
  )

  // -------------------------------------------------------------------------
  // DELETE /delegations/:id — Revoke delegation
  // -------------------------------------------------------------------------
  .delete(
    "/:id",
    async (ctx) => {
      const { delegationService, tenantContext, params, error } =
        ctx as unknown as DelegationRouteContext;

      const result = await delegationService.revokeDelegation(tenantContext, params.id);
      if (!result.success) {
        const status = result.error?.code === "DELEGATION_NOT_FOUND" ? 404 : 500;
        return error(status, { error: result.error });
      }

      return { success: true, message: "Delegation revoked" };
    },
    {
      beforeHandle: [requirePermission("delegations", "write")],
      params: IdParamsSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Delegations"],
        summary: "Revoke delegation",
        description:
          "Revoke an active delegation. Only the delegator can revoke their own delegation.",
      },
    }
  )

  // -------------------------------------------------------------------------
  // GET /delegations/:id/log — View delegation log
  // -------------------------------------------------------------------------
  .get(
    "/:id/log",
    async (ctx) => {
      const { delegationService, tenantContext, params, error } =
        ctx as unknown as DelegationRouteContext;

      const result = await delegationService.getDelegationLog(tenantContext, params.id);
      if (!result.success) {
        const code = result.error?.code;
        const status =
          code === "DELEGATION_NOT_FOUND"
            ? 404
            : code === "FORBIDDEN"
              ? 403
              : 500;
        return error(status, { error: result.error });
      }

      return { items: result.data || [] };
    },
    {
      beforeHandle: [requirePermission("delegations", "read")],
      params: IdParamsSchema,
      response: {
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Delegations"],
        summary: "View delegation log",
        description:
          "View the usage log for a specific delegation. Only the delegator or delegate can view.",
      },
    }
  );

export type DelegationRoutes = typeof delegationRoutes;
