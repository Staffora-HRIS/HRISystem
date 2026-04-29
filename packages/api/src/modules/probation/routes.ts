/**
 * Probation Module Routes
 *
 * Probation review management and reminder tracking.
 * All routes require authentication and appropriate permissions.
 *
 * Endpoints:
 * - GET    /probation/reviews              — List all probation reviews
 * - GET    /probation/reviews/upcoming     — Reviews due in next 30 days
 * - GET    /probation/reviews/overdue      — Reviews past due date
 * - GET    /probation/reviews/:id          — Get review with reminders
 * - POST   /probation/reviews              — Create probation review
 * - PATCH  /probation/reviews/:id/extend   — Extend probation period
 * - PATCH  /probation/reviews/:id/complete — Record probation outcome
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { ProbationRepository } from "./repository";
import { ProbationService } from "./service";
import {
  ProbationFiltersSchema,
  CreateProbationReviewSchema,
  ExtendProbationSchema,
  CompleteProbationSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";

/** Elysia context shape after plugins inject db/tenant/user */
interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string };
}

/** Elysia context after derive injects service + tenantContext */
interface DerivedContext {
  probationService: ProbationService;
  tenantContext: { tenantId: string; userId: string | undefined };
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
}

/** Module-specific error code overrides */
const PROBATION_ERROR_CODES: Record<string, number> = {
  STATE_MACHINE_VIOLATION: 409,
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
};

export const probationRoutes = new Elysia({ prefix: "/probation", name: "probation-routes" })

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const repository = new ProbationRepository(db);
    const service = new ProbationService(repository, db);

    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { probationService: service, tenantContext };
  })

  // =========================================================================
  // List Endpoints
  // =========================================================================

  // GET /probation/reviews — List all probation reviews
  .get(
    "/reviews",
    async (ctx) => {
      const { probationService, tenantContext, query, set } =
        ctx as unknown as DerivedContext;

      try {
        const { cursor, limit, ...filters } = query;
        const result = await probationService.listReviews(
          tenantContext,
          filters as Record<string, unknown>,
          {
            cursor: cursor as string | undefined,
            limit: limit !== undefined && limit !== null ? Number(limit) : undefined,
          }
        );

        return {
          items: result.items,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          count: result.items.length,
        };
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      query: t.Intersect([PaginationQuerySchema, ProbationFiltersSchema]),
      beforeHandle: [requirePermission("employees", "read")],
      detail: { tags: ["Probation"], summary: "List probation reviews" },
    }
  )

  // GET /probation/reviews/upcoming — Reviews due in next 30 days
  .get(
    "/reviews/upcoming",
    async (ctx) => {
      const { probationService, tenantContext, query, set } =
        ctx as unknown as DerivedContext;

      try {
        const { cursor, limit, days } = query as {
          cursor?: string;
          limit?: number;
          days?: number;
        };
        const daysAhead = days !== undefined && days !== null ? Number(days) : 30;
        const result = await probationService.listUpcoming(
          tenantContext,
          daysAhead,
          {
            cursor,
            limit: limit !== undefined && limit !== null ? Number(limit) : undefined,
          }
        );

        return {
          items: result.items,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          count: result.items.length,
        };
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      query: t.Intersect([
        PaginationQuerySchema,
        t.Object({
          days: t.Optional(t.Number({ minimum: 1, maximum: 365, default: 30 })),
        }),
      ]),
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Probation"],
        summary: "List upcoming probation reviews",
        description: "Returns pending probation reviews due within the specified number of days (default 30).",
      },
    }
  )

  // GET /probation/reviews/overdue — Reviews past due date
  .get(
    "/reviews/overdue",
    async (ctx) => {
      const { probationService, tenantContext, query, set } =
        ctx as unknown as DerivedContext;

      try {
        const { cursor, limit } = query as {
          cursor?: string;
          limit?: number;
        };
        const result = await probationService.listOverdue(tenantContext, {
          cursor,
          limit: limit !== undefined && limit !== null ? Number(limit) : undefined,
        });

        return {
          items: result.items,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          count: result.items.length,
        };
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      query: PaginationQuerySchema,
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Probation"],
        summary: "List overdue probation reviews",
        description: "Returns pending probation reviews whose end date has passed without a recorded outcome.",
      },
    }
  )

  // =========================================================================
  // Detail Endpoint
  // =========================================================================

  // GET /probation/reviews/:id — Get review with reminders
  .get(
    "/reviews/:id",
    async (ctx) => {
      const { probationService, tenantContext, params, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await probationService.getReview(tenantContext, params.id);
        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, PROBATION_ERROR_CODES);
          return { error: result.error };
        }
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("employees", "read")],
      detail: { tags: ["Probation"], summary: "Get probation review by ID" },
    }
  )

  // =========================================================================
  // Create Endpoint
  // =========================================================================

  // POST /probation/reviews — Create probation review
  .post(
    "/reviews",
    async (ctx) => {
      const { probationService, tenantContext, body, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await probationService.createReview(
          tenantContext,
          body as Parameters<ProbationService["createReview"]>[1]
        );
        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, PROBATION_ERROR_CODES);
          return { error: result.error };
        }
        set.status = 201;
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      body: CreateProbationReviewSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Probation"],
        summary: "Create probation review",
        description: "Creates a probation review record and automatically schedules reminders (30 days, 14 days, due date).",
      },
    }
  )

  // =========================================================================
  // Mutation Endpoints
  // =========================================================================

  // PATCH /probation/reviews/:id/extend — Extend probation period
  .patch(
    "/reviews/:id/extend",
    async (ctx) => {
      const { probationService, tenantContext, params, body, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await probationService.extendReview(
          tenantContext,
          params.id,
          body as Parameters<ProbationService["extendReview"]>[2]
        );
        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, PROBATION_ERROR_CODES);
          return { error: result.error };
        }
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      params: IdParamsSchema,
      body: ExtendProbationSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Probation"],
        summary: "Extend probation period",
        description: "Extends the probation period by a specified number of weeks. Reschedules reminders for the new end date.",
      },
    }
  )

  // PATCH /probation/reviews/:id/complete — Record probation outcome
  .patch(
    "/reviews/:id/complete",
    async (ctx) => {
      const { probationService, tenantContext, params, body, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await probationService.completeReview(
          tenantContext,
          params.id,
          body as Parameters<ProbationService["completeReview"]>[2]
        );
        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, PROBATION_ERROR_CODES);
          return { error: result.error };
        }
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    {
      params: IdParamsSchema,
      body: CompleteProbationSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Probation"],
        summary: "Complete probation review",
        description: "Records the final outcome of a probation review (passed, failed, or terminated). Clears unsent reminders.",
      },
    }
  );

export type ProbationRoutes = typeof probationRoutes;
