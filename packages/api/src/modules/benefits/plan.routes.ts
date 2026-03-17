/**
 * Benefits Module - Plan Routes
 *
 * Benefit plan CRUD endpoints.
 * Mounted under /benefits by the parent routes.ts.
 *
 * Routes:
 *   GET    /plans      - List plans with filters
 *   GET    /plans/:id  - Get plan by ID
 *   POST   /plans      - Create plan
 *   PUT    /plans/:id  - Update plan
 *   DELETE /plans/:id  - Deactivate plan
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import {
  CreatePlan,
  UpdatePlan,
  PlanResponse,
  PlanFilters,
  PaginationQuery,
} from "./schemas";
import {
  SuccessSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  benefitsErrorStatusMap,
} from "./routes.shared";

export const planRoutes = new Elysia({ name: "benefits-plan-routes" })

  // GET /plans - List plans
  .get(
    "/plans",
    async (ctx) => {
      const { benefitsService, query, tenantContext } = ctx as any;
      const { cursor, limit, ...filters } = query;
      const parsedLimit = limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await benefitsService.listPlans(
        tenantContext,
        filters,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("benefits:plans", "read")],
      query: t.Composite([t.Partial(PlanFilters), t.Partial(PaginationQuery)]),
      response: t.Object({
        items: t.Array(PlanResponse),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Benefits - Plans"],
        summary: "List plans",
        description: "List benefit plans with optional filters and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /plans/:id - Get plan by ID
  .get(
    "/plans/:id",
    async (ctx) => {
      const { benefitsService, params, tenantContext, error } = ctx as any;
      const result = await benefitsService.getPlan(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:plans", "read")],
      params: IdParamsSchema,
      response: {
        200: PlanResponse,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Plans"],
        summary: "Get plan by ID",
        description: "Get a single benefit plan with cost details",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /plans - Create plan
  .post(
    "/plans",
    async (ctx) => {
      const { benefitsService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await benefitsService.createPlan(
        tenantContext,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "PLAN_CREATED",
          resourceType: "benefit_plan",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:plans", "write")],
      body: CreatePlan,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PlanResponse,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Plans"],
        summary: "Create plan",
        description: "Create a new benefit plan with costs by coverage level",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /plans/:id - Update plan
  .put(
    "/plans/:id",
    async (ctx) => {
      const { benefitsService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await benefitsService.getPlan(tenantContext, params.id);

      const result = await benefitsService.updatePlan(
        tenantContext,
        params.id,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "PLAN_UPDATED",
          resourceType: "benefit_plan",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:plans", "write")],
      params: IdParamsSchema,
      body: UpdatePlan,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PlanResponse,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Plans"],
        summary: "Update plan",
        description: "Update an existing benefit plan",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /plans/:id - Deactivate plan
  .delete(
    "/plans/:id",
    async (ctx) => {
      const { benefitsService, params, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await benefitsService.getPlan(tenantContext, params.id);

      const result = await benefitsService.deletePlan(
        tenantContext,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "PLAN_DEACTIVATED",
          resourceType: "benefit_plan",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return { success: true as const, message: "Plan deactivated successfully" };
    },
    {
      beforeHandle: [requirePermission("benefits:plans", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: SuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Plans"],
        summary: "Deactivate plan",
        description: "Soft delete (deactivate) a benefit plan",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type PlanRoutes = typeof planRoutes;
