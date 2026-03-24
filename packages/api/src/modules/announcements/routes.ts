/**
 * Announcements Module Routes
 *
 * Admin CRUD for company announcements plus employee-facing read endpoint.
 * All routes require authentication.
 *
 * Endpoints:
 * - GET    /announcements              — List announcements (admin, all statuses)
 * - POST   /announcements              — Create announcement (admin)
 * - GET    /announcements/active       — List active announcements (employee, filtered)
 * - GET    /announcements/:id          — Get single announcement
 * - PUT    /announcements/:id          — Update announcement (admin)
 * - POST   /announcements/:id/publish  — Publish an announcement immediately (admin)
 * - DELETE /announcements/:id          — Delete announcement (admin)
 */

import { Elysia, t } from "elysia";
import {
  ErrorResponseSchema,
  DeleteSuccessSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { AnnouncementsRepository } from "./repository";
import { AnnouncementsService } from "./service";
import {
  AnnouncementResponseSchema,
  AnnouncementFiltersSchema,
  CreateAnnouncementSchema,
  UpdateAnnouncementSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  IdempotencyHeaderSchema,
} from "./schemas";

/** Elysia context shape after plugins inject db/tenant/user */
interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string; roles?: string[] };
}

/** Elysia context after derive injects service + tenantContext */
interface DerivedContext {
  announcementsService: AnnouncementsService;
  tenantContext: { tenantId: string; userId: string | undefined };
  currentUserId: string;
  currentUserRoles: string[];
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
}

export const announcementsRoutes = new Elysia({ prefix: "/announcements" })

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const repository = new AnnouncementsRepository(db);
    const service = new AnnouncementsService(repository, db);

    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return {
      announcementsService: service,
      tenantContext,
      currentUserId: user?.id || "",
      currentUserRoles: (user as unknown as { roles?: string[] })?.roles ?? [],
    };
  })

  // =========================================================================
  // GET /announcements — List announcements (admin)
  // =========================================================================
  .get(
    "/",
    async (ctx) => {
      const { announcementsService, tenantContext, query, set } =
        ctx as unknown as DerivedContext;

      try {
        const { cursor, limit, ...filters } = query;
        const result = await announcementsService.listAnnouncements(
          tenantContext,
          filters as { priority?: "info" | "urgent" | "important"; search?: string; published?: boolean },
          {
            cursor: cursor as string | undefined,
            limit:
              limit !== undefined && limit !== null ? Number(limit) : undefined,
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
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    {
      query: t.Intersect([PaginationQuerySchema, AnnouncementFiltersSchema]),
      detail: {
        tags: ["Announcements"],
        summary: "List announcements (admin)",
      },
    }
  )

  // =========================================================================
  // GET /announcements/active — List active announcements (employee)
  // =========================================================================
  .get(
    "/active",
    async (ctx) => {
      const { announcementsService, tenantContext, currentUserRoles, query, set } =
        ctx as unknown as DerivedContext;

      try {
        const departmentId = query.department_id as string | undefined;
        const cursor = query.cursor as string | undefined;
        const limit =
          query.limit !== undefined && query.limit !== null
            ? Number(query.limit)
            : undefined;

        const result = await announcementsService.listActiveAnnouncements(
          tenantContext,
          {
            departmentId,
            roleNames: currentUserRoles,
            limit,
            cursor,
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
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    {
      query: t.Object({
        cursor: t.Optional(t.String({ minLength: 1 })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
        department_id: t.Optional(t.String({ minLength: 1 })),
      }),
      detail: {
        tags: ["Announcements"],
        summary: "List active announcements for current employee",
      },
    }
  )

  // =========================================================================
  // POST /announcements — Create announcement (admin)
  // =========================================================================
  .post(
    "/",
    async (ctx) => {
      const { announcementsService, tenantContext, body, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await announcementsService.createAnnouncement(
          tenantContext,
          body as {
            title: string;
            content: string;
            priority?: "info" | "important" | "urgent";
            published_at?: string | null;
            expires_at?: string | null;
            target_departments?: string[];
            target_roles?: string[];
          }
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: result.error };
        }

        set.status = 201;
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    {
      body: CreateAnnouncementSchema,
      headers: IdempotencyHeaderSchema,
      detail: {
        tags: ["Announcements"],
        summary: "Create a new announcement",
      },
    }
  )

  // =========================================================================
  // GET /announcements/:id — Get single announcement
  // =========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { announcementsService, tenantContext, params, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await announcementsService.getAnnouncement(
          tenantContext,
          params.id
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: result.error };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    {
      params: IdParamsSchema,
      response: {
        200: AnnouncementResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Announcements"],
        summary: "Get an announcement by ID",
      },
    }
  )

  // =========================================================================
  // PUT /announcements/:id — Update announcement (admin)
  // =========================================================================
  .put(
    "/:id",
    async (ctx) => {
      const { announcementsService, tenantContext, params, body, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await announcementsService.updateAnnouncement(
          tenantContext,
          params.id,
          body as {
            title?: string;
            content?: string;
            priority?: "info" | "important" | "urgent";
            published_at?: string | null;
            expires_at?: string | null;
            target_departments?: string[];
            target_roles?: string[];
          }
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: result.error };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    {
      params: IdParamsSchema,
      body: UpdateAnnouncementSchema,
      headers: IdempotencyHeaderSchema,
      response: {
        200: AnnouncementResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Announcements"],
        summary: "Update an announcement",
      },
    }
  )

  // =========================================================================
  // POST /announcements/:id/publish — Publish announcement immediately
  // =========================================================================
  .post(
    "/:id/publish",
    async (ctx) => {
      const { announcementsService, tenantContext, params, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await announcementsService.publishAnnouncement(
          tenantContext,
          params.id
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: result.error };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    {
      params: IdParamsSchema,
      headers: IdempotencyHeaderSchema,
      response: {
        200: AnnouncementResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Announcements"],
        summary: "Publish an announcement immediately",
      },
    }
  )

  // =========================================================================
  // DELETE /announcements/:id — Delete announcement (admin)
  // =========================================================================
  .delete(
    "/:id",
    async (ctx) => {
      const { announcementsService, tenantContext, params, set } =
        ctx as unknown as DerivedContext;

      try {
        const result = await announcementsService.deleteAnnouncement(
          tenantContext,
          params.id
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: result.error };
        }

        return { success: true as const, message: "Announcement deleted" };
      } catch (error: unknown) {
        set.status = 500;
        return {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
    {
      params: IdParamsSchema,
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Announcements"],
        summary: "Delete an announcement",
      },
    }
  );

export type AnnouncementsRoutes = typeof announcementsRoutes;
