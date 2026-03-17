/**
 * Client Portal Module Routes
 *
 * Customer-facing portal API for staffora.co.uk.
 * Authentication is handled by BetterAuth (global authPlugin).
 * Portal users are identified by their BetterAuth user_id linking to a portal_users record.
 *
 * Route groups:
 * - Public: GET /auth/me (returns portal user profile using BetterAuth session)
 * - Authenticated: tickets, documents, news, billing, dashboard
 * - Admin: ticket management, user management, document/news CRUD
 *
 * Login/logout/forgot-password/reset-password are handled by BetterAuth at /api/auth/*.
 */

import { Elysia, t } from "elysia";
import { ErrorCodes } from "../../plugins/errors";
import { mapErrorToStatus } from "../../lib/route-helpers";
import { ClientPortalRepository } from "./repository";
import { ClientPortalService } from "./service";
import {
  CreateTicketSchema,
  CreateTicketMessageSchema,
  UpdateTicketSchema,
  CreateDocumentSchema,
  UpdateDocumentSchema,
  CreateNewsSchema,
  UpdateNewsSchema,
  CreateUserSchema,
  UpdateUserSchema,
} from "./schemas";

// =============================================================================
// Constants & Error Codes
// =============================================================================

const UuidSchema = t.String({ format: "uuid" });

const PORTAL_ERROR_CODES: Record<string, number> = {
  ACCOUNT_DISABLED: 403,
  ACCOUNT_LOCKED: 429,
  TICKET_CLOSED: 409,
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
  DELETE_FAILED: 500,
  REPLY_FAILED: 500,
};

// =============================================================================
// Portal Auth Middleware (BetterAuth-based)
// =============================================================================

/**
 * Portal auth guard using BetterAuth sessions.
 *
 * The global authPlugin (in plugins/auth-better.ts) already reads the BetterAuth
 * session cookie and sets ctx.user, ctx.session, ctx.isAuthenticated.
 *
 * This middleware:
 * 1. Checks that the user is authenticated (BetterAuth session valid)
 * 2. Looks up the portal_users profile by user_id = ctx.user.id
 * 3. If no portal_users record, returns 403 "Not a portal user"
 * 4. Sets ctx.portalUser, ctx.portalTenantContext for downstream handlers
 */
async function requirePortalUser(ctx: any) {
  const { user, isAuthenticated, set, portalRepository } = ctx;

  if (!isAuthenticated || !user) {
    set.status = 401;
    return {
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: "Authentication required. Please sign in via /api/auth/sign-in/email.",
      },
    };
  }

  // Look up portal profile by BetterAuth user ID
  const portalProfile = await portalRepository.findPortalProfileByUserId(user.id);

  if (!portalProfile) {
    set.status = 403;
    return {
      error: {
        code: ErrorCodes.PORTAL_ACCESS_DENIED,
        message: "Not a portal user. Your account does not have portal access.",
      },
    };
  }

  if (!portalProfile.isActive) {
    set.status = 403;
    return {
      error: {
        code: "ACCOUNT_DISABLED",
        message: "This portal account has been deactivated.",
      },
    };
  }

  // Fire-and-forget: update last_login_at timestamp
  portalRepository.updateLastLogin(portalProfile.id).catch(() => {});

  // Attach portal context to request
  ctx.portalUser = portalProfile;
  ctx.portalTenantContext = {
    tenantId: portalProfile.tenantId,
    userId: portalProfile.id,
  };
}

/**
 * Admin role check for portal admin routes.
 * Must be used after requirePortalUser.
 */
async function requirePortalAdmin(ctx: any) {
  const { portalUser, set } = ctx;

  if (!portalUser) {
    set.status = 401;
    return {
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: "Portal authentication required",
      },
    };
  }

  if (portalUser.role !== "admin" && portalUser.role !== "super_admin") {
    set.status = 403;
    return {
      error: {
        code: ErrorCodes.FORBIDDEN,
        message: "Admin access required",
      },
    };
  }
}

// =============================================================================
// Routes
// =============================================================================

export const clientPortalRoutes = new Elysia({ prefix: "/client-portal" })

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db } = ctx as any;
    const portalRepository = new ClientPortalRepository(db);
    const portalService = new ClientPortalService(portalRepository, db);
    return { portalRepository, portalService };
  })

  // =========================================================================
  // Auth: GET /auth/me - returns current portal user profile
  // Uses BetterAuth session (already validated by global authPlugin)
  // =========================================================================

  .get(
    "/auth/me",
    async (ctx) => {
      const { portalRepository, set } = ctx as any;
      const user = (ctx as any).user;
      const isAuthenticated = (ctx as any).isAuthenticated;

      if (!isAuthenticated || !user) {
        set.status = 401;
        return {
          error: {
            code: ErrorCodes.UNAUTHORIZED,
            message: "Not authenticated",
          },
        };
      }

      const portalProfile = await portalRepository.findPortalProfileByUserId(user.id);

      if (!portalProfile) {
        set.status = 403;
        return {
          error: {
            code: ErrorCodes.PORTAL_ACCESS_DENIED,
            message: "Not a portal user",
          },
        };
      }

      if (!portalProfile.isActive) {
        set.status = 403;
        return {
          error: {
            code: "ACCOUNT_DISABLED",
            message: "This portal account has been deactivated",
          },
        };
      }

      // Fire-and-forget: update last login
      portalRepository.updateLastLogin(portalProfile.id).catch(() => {});

      return {
        user: {
          id: portalProfile.id,
          tenantId: portalProfile.tenantId,
          userId: portalProfile.userId,
          email: portalProfile.email,
          firstName: portalProfile.firstName,
          lastName: portalProfile.lastName,
          avatarUrl: portalProfile.avatarUrl ?? null,
          role: portalProfile.role,
          isActive: portalProfile.isActive,
          lastLoginAt:
            portalProfile.lastLoginAt?.toISOString?.() ??
            portalProfile.lastLoginAt ??
            null,
          createdAt:
            portalProfile.createdAt?.toISOString?.() ?? portalProfile.createdAt,
          updatedAt:
            portalProfile.updatedAt?.toISOString?.() ?? portalProfile.updatedAt,
        },
      };
    },
    {
      detail: {
        tags: ["Client Portal"],
        summary: "Get current portal user profile",
      },
    }
  )

  // =========================================================================
  // Dashboard (Authenticated)
  // =========================================================================

  .get(
    "/dashboard",
    async (ctx) => {
      const { portalService, portalTenantContext, portalUser, set } =
        ctx as any;

      const result = await portalService.getDashboard(
        portalTenantContext,
        portalUser.id,
        portalUser.role
      );

      if (!result.success) {
        set.status = 500;
        return { error: result.error };
      }

      return result.data;
    },
    {
      beforeHandle: [requirePortalUser],
      detail: {
        tags: ["Client Portal"],
        summary: "Get dashboard data",
      },
    }
  )

  // =========================================================================
  // Ticket Routes (Authenticated)
  // =========================================================================

  .get(
    "/tickets",
    async (ctx) => {
      const { portalService, portalTenantContext, query, set } =
        ctx as any;

      const { cursor, limit, ...filters } = query;
      const result = await portalService.listMyTickets(
        portalTenantContext,
        filters,
        {
          cursor,
          limit: limit != null ? Number(limit) : undefined,
        }
      );

      if (!result.success) {
        set.status = 500;
        return { error: result.error };
      }

      return result.data;
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        category: t.Optional(t.String()),
        search: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
      beforeHandle: [requirePortalUser],
      detail: {
        tags: ["Client Portal"],
        summary: "List my tickets",
      },
    }
  )

  .post(
    "/tickets",
    async (ctx) => {
      const { portalService, portalTenantContext, body, set } =
        ctx as any;

      const result = await portalService.createTicket(
        portalTenantContext,
        body
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      set.status = 201;
      return result.data;
    },
    {
      body: CreateTicketSchema,
      beforeHandle: [requirePortalUser],
      detail: {
        tags: ["Client Portal"],
        summary: "Create ticket",
      },
    }
  )

  .get(
    "/tickets/:id",
    async (ctx) => {
      const { portalService, portalTenantContext, portalUser, params, set } =
        ctx as any;

      const result = await portalService.getTicket(
        portalTenantContext,
        params.id,
        portalUser.role
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      beforeHandle: [requirePortalUser],
      detail: {
        tags: ["Client Portal"],
        summary: "Get ticket by ID",
      },
    }
  )

  .post(
    "/tickets/:id/messages",
    async (ctx) => {
      const { portalService, portalTenantContext, portalUser, params, body, set } =
        ctx as any;

      // Non-admin users cannot post internal notes
      const isInternalNote =
        (portalUser.role === "admin" || portalUser.role === "super_admin") &&
        body.isInternalNote === true;

      const result = await portalService.replyToTicket(
        portalTenantContext,
        params.id,
        body.content,
        isInternalNote
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      set.status = 201;
      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      body: CreateTicketMessageSchema,
      beforeHandle: [requirePortalUser],
      detail: {
        tags: ["Client Portal"],
        summary: "Reply to ticket",
      },
    }
  )

  // =========================================================================
  // Document Routes (Authenticated)
  // =========================================================================

  .get(
    "/documents",
    async (ctx) => {
      const { portalService, portalTenantContext, query, set } =
        ctx as any;

      const { cursor, limit, ...filters } = query;
      const result = await portalService.listDocuments(
        portalTenantContext,
        filters,
        {
          cursor,
          limit: limit != null ? Number(limit) : undefined,
        }
      );

      if (!result.success) {
        set.status = 500;
        return { error: result.error };
      }

      return result.data;
    },
    {
      query: t.Object({
        documentType: t.Optional(t.String()),
        search: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
      beforeHandle: [requirePortalUser],
      detail: {
        tags: ["Client Portal"],
        summary: "List documents",
      },
    }
  )

  .get(
    "/documents/:id",
    async (ctx) => {
      const { portalService, portalTenantContext, params, set } =
        ctx as any;

      const result = await portalService.getDocument(
        portalTenantContext,
        params.id
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      beforeHandle: [requirePortalUser],
      detail: {
        tags: ["Client Portal"],
        summary: "Get document by ID",
      },
    }
  )

  .post(
    "/documents/:id/acknowledge",
    async (ctx) => {
      const { portalService, portalTenantContext, portalUser, params, set } =
        ctx as any;

      const ipAddress =
        ctx.request?.headers?.get("x-forwarded-for") ??
        ctx.request?.headers?.get("x-real-ip") ??
        null;

      const result = await portalService.acknowledgeDocument(
        portalTenantContext,
        params.id,
        portalUser.id,
        ipAddress
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      return { message: "Document acknowledged" };
    },
    {
      params: t.Object({ id: UuidSchema }),
      beforeHandle: [requirePortalUser],
      detail: {
        tags: ["Client Portal"],
        summary: "Acknowledge document",
      },
    }
  )

  // =========================================================================
  // News Routes (Authenticated)
  // =========================================================================

  .get(
    "/news",
    async (ctx) => {
      const { portalService, portalTenantContext, query, set } =
        ctx as any;

      const { cursor, limit, ...filters } = query;
      const result = await portalService.listNews(
        portalTenantContext,
        filters,
        {
          cursor,
          limit: limit != null ? Number(limit) : undefined,
        }
      );

      if (!result.success) {
        set.status = 500;
        return { error: result.error };
      }

      return result.data;
    },
    {
      query: t.Object({
        search: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
      beforeHandle: [requirePortalUser],
      detail: {
        tags: ["Client Portal"],
        summary: "List news articles",
      },
    }
  )

  .get(
    "/news/:slug",
    async (ctx) => {
      const { portalService, portalTenantContext, portalUser, params, set } =
        ctx as any;

      const result = await portalService.getNewsBySlug(
        portalTenantContext,
        params.slug,
        portalUser.id
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ slug: t.String({ minLength: 1 }) }),
      beforeHandle: [requirePortalUser],
      detail: {
        tags: ["Client Portal"],
        summary: "Get news article by slug",
      },
    }
  )

  // =========================================================================
  // Billing Routes (Authenticated)
  // =========================================================================

  .get(
    "/billing",
    async (ctx) => {
      const { portalService, portalTenantContext, set } = ctx as any;

      const result = await portalService.getBillingOverview(
        portalTenantContext
      );

      if (!result.success) {
        set.status = 500;
        return { error: result.error };
      }

      return result.data;
    },
    {
      beforeHandle: [requirePortalUser],
      detail: {
        tags: ["Client Portal"],
        summary: "Get billing overview",
      },
    }
  )

  .get(
    "/billing/invoices",
    async (ctx) => {
      const { portalService, portalTenantContext, query, set } =
        ctx as any;

      const { cursor, limit, ...filters } = query;
      const result = await portalService.listInvoices(
        portalTenantContext,
        filters,
        {
          cursor,
          limit: limit != null ? Number(limit) : undefined,
        }
      );

      if (!result.success) {
        set.status = 500;
        return { error: result.error };
      }

      return result.data;
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
      beforeHandle: [requirePortalUser],
      detail: {
        tags: ["Client Portal"],
        summary: "List invoices",
      },
    }
  )

  .get(
    "/billing/invoices/:id",
    async (ctx) => {
      const { portalService, portalTenantContext, params, set } =
        ctx as any;

      const result = await portalService.getInvoice(
        portalTenantContext,
        params.id
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      beforeHandle: [requirePortalUser],
      detail: {
        tags: ["Client Portal"],
        summary: "Get invoice by ID",
      },
    }
  )

  // =========================================================================
  // Admin Routes (Authenticated + Admin role)
  // =========================================================================

  // Admin: All tickets
  .get(
    "/admin/tickets",
    async (ctx) => {
      const { portalService, portalTenantContext, query, set } =
        ctx as any;

      const { cursor, limit, ...filters } = query;
      const result = await portalService.listAllTickets(
        portalTenantContext,
        filters,
        {
          cursor,
          limit: limit != null ? Number(limit) : undefined,
        }
      );

      if (!result.success) {
        set.status = 500;
        return { error: result.error };
      }

      return result.data;
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        category: t.Optional(t.String()),
        assigneeId: t.Optional(UuidSchema),
        search: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
      beforeHandle: [requirePortalUser, requirePortalAdmin],
      detail: {
        tags: ["Client Portal"],
        summary: "List all tickets (admin)",
      },
    }
  )

  // Admin: Update ticket
  .patch(
    "/admin/tickets/:id",
    async (ctx) => {
      const { portalService, portalTenantContext, params, body, set } =
        ctx as any;

      const result = await portalService.updateTicketAdmin(
        portalTenantContext,
        params.id,
        body
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      body: UpdateTicketSchema,
      beforeHandle: [requirePortalUser, requirePortalAdmin],
      detail: {
        tags: ["Client Portal"],
        summary: "Update ticket (admin)",
      },
    }
  )

  // Admin: Users
  .get(
    "/admin/users",
    async (ctx) => {
      const { portalService, portalTenantContext, query, set } =
        ctx as any;

      const { cursor, limit, ...filters } = query;
      const result = await portalService.listUsers(
        portalTenantContext,
        filters,
        {
          cursor,
          limit: limit != null ? Number(limit) : undefined,
        }
      );

      if (!result.success) {
        set.status = 500;
        return { error: result.error };
      }

      return result.data;
    },
    {
      query: t.Object({
        role: t.Optional(t.String()),
        isActive: t.Optional(t.Boolean()),
        search: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
      beforeHandle: [requirePortalUser, requirePortalAdmin],
      detail: {
        tags: ["Client Portal"],
        summary: "List portal users (admin)",
      },
    }
  )

  .post(
    "/admin/users",
    async (ctx) => {
      const { portalService, portalTenantContext, body, set } =
        ctx as any;

      const result = await portalService.createUser(
        portalTenantContext,
        body
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      set.status = 201;
      return result.data;
    },
    {
      body: CreateUserSchema,
      beforeHandle: [requirePortalUser, requirePortalAdmin],
      detail: {
        tags: ["Client Portal"],
        summary: "Create portal user (admin)",
      },
    }
  )

  .get(
    "/admin/users/:id",
    async (ctx) => {
      const { portalService, portalTenantContext, params, set } =
        ctx as any;

      const result = await portalService.getUser(
        portalTenantContext,
        params.id
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      beforeHandle: [requirePortalUser, requirePortalAdmin],
      detail: {
        tags: ["Client Portal"],
        summary: "Get portal user (admin)",
      },
    }
  )

  .patch(
    "/admin/users/:id",
    async (ctx) => {
      const { portalService, portalTenantContext, params, body, set } =
        ctx as any;

      const result = await portalService.updateUser(
        portalTenantContext,
        params.id,
        body
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      body: UpdateUserSchema,
      beforeHandle: [requirePortalUser, requirePortalAdmin],
      detail: {
        tags: ["Client Portal"],
        summary: "Update portal user (admin)",
      },
    }
  )

  // Admin: Documents
  .post(
    "/admin/documents",
    async (ctx) => {
      const { portalService, portalTenantContext, body, set } =
        ctx as any;

      const result = await portalService.createDocument(
        portalTenantContext,
        body
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      set.status = 201;
      return result.data;
    },
    {
      body: CreateDocumentSchema,
      beforeHandle: [requirePortalUser, requirePortalAdmin],
      detail: {
        tags: ["Client Portal"],
        summary: "Create document (admin)",
      },
    }
  )

  .patch(
    "/admin/documents/:id",
    async (ctx) => {
      const { portalService, portalTenantContext, params, body, set } =
        ctx as any;

      const result = await portalService.updateDocument(
        portalTenantContext,
        params.id,
        body
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      body: UpdateDocumentSchema,
      beforeHandle: [requirePortalUser, requirePortalAdmin],
      detail: {
        tags: ["Client Portal"],
        summary: "Update document (admin)",
      },
    }
  )

  .delete(
    "/admin/documents/:id",
    async (ctx) => {
      const { portalService, portalTenantContext, params, set } =
        ctx as any;

      const result = await portalService.deleteDocument(
        portalTenantContext,
        params.id
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      return { success: true, message: "Document deleted" };
    },
    {
      params: t.Object({ id: UuidSchema }),
      beforeHandle: [requirePortalUser, requirePortalAdmin],
      detail: {
        tags: ["Client Portal"],
        summary: "Delete document (admin)",
      },
    }
  )

  // Admin: News
  .post(
    "/admin/news",
    async (ctx) => {
      const { portalService, portalTenantContext, body, set } =
        ctx as any;

      const result = await portalService.createNews(
        portalTenantContext,
        body
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      set.status = 201;
      return result.data;
    },
    {
      body: CreateNewsSchema,
      beforeHandle: [requirePortalUser, requirePortalAdmin],
      detail: {
        tags: ["Client Portal"],
        summary: "Create news article (admin)",
      },
    }
  )

  .patch(
    "/admin/news/:id",
    async (ctx) => {
      const { portalService, portalTenantContext, params, body, set } =
        ctx as any;

      const result = await portalService.updateNews(
        portalTenantContext,
        params.id,
        body
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      body: UpdateNewsSchema,
      beforeHandle: [requirePortalUser, requirePortalAdmin],
      detail: {
        tags: ["Client Portal"],
        summary: "Update news article (admin)",
      },
    }
  )

  .delete(
    "/admin/news/:id",
    async (ctx) => {
      const { portalService, portalTenantContext, params, set } =
        ctx as any;

      const result = await portalService.deleteNews(
        portalTenantContext,
        params.id
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      return { success: true, message: "News article deleted" };
    },
    {
      params: t.Object({ id: UuidSchema }),
      beforeHandle: [requirePortalUser, requirePortalAdmin],
      detail: {
        tags: ["Client Portal"],
        summary: "Delete news article (admin)",
      },
    }
  );

export type ClientPortalRoutes = typeof clientPortalRoutes;
