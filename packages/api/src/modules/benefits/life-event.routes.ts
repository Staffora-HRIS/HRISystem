/**
 * Benefits Module - Life Event Routes
 *
 * Life event triggers and self-service life event viewing.
 * Mounted under /benefits by the parent routes.ts.
 *
 * Routes:
 *   GET    /life-events                          - List life events
 *   POST   /employees/:employeeId/life-events    - Report life event
 *   POST   /life-events/:id/review               - Review (approve/reject) life event
 *   GET    /my-life-events                        - Get current user's life events
 */

import { Elysia, t } from "elysia";
import { requireAuthContext, requireTenantContext } from "../../plugins";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { ErrorCodes } from "../../plugins/errors";
import {
  CreateLifeEvent,
  ReviewLifeEvent,
  LifeEventResponse,
  PaginationQuery,
} from "./schemas";
import {
  UuidSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  benefitsErrorStatusMap,
} from "./routes.shared";

export const lifeEventRoutes = new Elysia({ name: "benefits-life-event-routes" })

  // GET /life-events - List life events
  .get(
    "/life-events",
    async (ctx) => {
      const { benefitsService, query, tenantContext } = ctx as any;
      const { cursor, limit, status } = query;
      const parsedLimit = limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await benefitsService.listLifeEvents(
        tenantContext,
        status,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("benefits:life_events", "read")],
      query: t.Composite([
        t.Object({ status: t.Optional(t.String()) }),
        t.Partial(PaginationQuery),
      ]),
      response: t.Object({
        items: t.Array(LifeEventResponse),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Benefits - Life Events"],
        summary: "List life events",
        description: "List life events with optional status filter and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /employees/:employeeId/life-events - Report life event
  .post(
    "/employees/:employeeId/life-events",
    async (ctx) => {
      const { benefitsService, params, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await benefitsService.createLifeEvent(
        tenantContext,
        params.employeeId,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "LIFE_EVENT_REPORTED",
          resourceType: "life_event",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, employeeId: params.employeeId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:life_events", "write")],
      params: t.Object({ employeeId: UuidSchema }),
      body: CreateLifeEvent,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: LifeEventResponse,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Life Events"],
        summary: "Report life event",
        description: "Report a qualifying life event for special enrollment",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /life-events/:id/review - Review life event
  .post(
    "/life-events/:id/review",
    async (ctx) => {
      const { benefitsService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await benefitsService.getLifeEvent(tenantContext, params.id);

      const result = await benefitsService.reviewLifeEvent(
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
          action: "LIFE_EVENT_REVIEWED",
          resourceType: "life_event",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, decision: (body as any).status },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:life_events", "approve")],
      params: IdParamsSchema,
      body: ReviewLifeEvent,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: LifeEventResponse,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Life Events"],
        summary: "Review life event",
        description: "Approve or reject a life event request",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Self-Service: My Life Events
  // ===========================================================================

  // GET /my-life-events - Get current user's life events
  .get(
    "/my-life-events",
    async (ctx) => {
      const { benefitsService, user, tenant, db, set } = ctx as any;

      try {
        // Get employee ID for current user
        const [employee] = await db.withTransaction(
          { tenantId: tenant.id, userId: user.id },
          async (tx: any) => {
            return tx`
              SELECT id FROM app.employees
              WHERE user_id = ${user.id}::uuid AND tenant_id = ${tenant.id}::uuid
              LIMIT 1
            `;
          }
        );

        if (!employee) {
          return { items: [], message: "No employee record found" };
        }

        // Query life events for this employee
        const lifeEvents = await db.withTransaction(
          { tenantId: tenant.id, userId: user.id },
          async (tx: any) => {
            return tx`
              SELECT
                id, employee_id, event_type, event_date,
                enrollment_deadline, status, notes,
                created_at, updated_at
              FROM app.life_events
              WHERE employee_id = ${employee.id}::uuid
                AND tenant_id = ${tenant.id}::uuid
              ORDER BY event_date DESC
              LIMIT 50
            `;
          }
        );

        return {
          items: lifeEvents.map((e: any) => ({
            id: e.id,
            employeeId: e.employeeId,
            eventType: e.eventType,
            eventDate: e.eventDate,
            enrollmentDeadline: e.enrollmentDeadline,
            status: e.status,
            notes: e.notes,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
          })),
        };
      } catch (error) {
        console.error("Benefits /my-life-events error:", error);
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get life events" } };
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      response: {
        200: t.Object({
          items: t.Array(t.Object({
            id: t.String(),
            employeeId: t.String(),
            eventType: t.String(),
            eventDate: t.String(),
            enrollmentDeadline: t.Union([t.String(), t.Null()]),
            status: t.String(),
            notes: t.Union([t.String(), t.Null()]),
            createdAt: t.String(),
            updatedAt: t.String(),
          })),
          message: t.Optional(t.String()),
        }),
        401: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Self Service"],
        summary: "Get my life events",
        description: "Get current user's benefit life events",
      },
    }
  );

export type LifeEventRoutes = typeof lifeEventRoutes;
