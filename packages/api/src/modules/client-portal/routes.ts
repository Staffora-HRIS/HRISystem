/**
 * Client Portal Module Routes
 *
 * Customer-facing portal API for staffora.co.uk.
 * Uses its own session-based auth (portal_sessions) separate from the main HRIS auth.
 *
 * Route groups:
 * - Public: login, forgot-password, reset-password
 * - Authenticated: tickets, documents, news, billing, dashboard
 * - Admin: ticket management, user management, document/news CRUD
 */

import { Elysia, t } from "elysia";
import { ErrorCodes } from "../../plugins/errors";
import { mapErrorToStatus } from "../../lib/route-helpers";
import { ClientPortalRepository } from "./repository";
import { ClientPortalService } from "./service";
import {
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
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

const PORTAL_COOKIE_NAME = "staffora_portal_session";
const SESSION_SLIDING_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// =============================================================================
// Portal Auth Middleware
// =============================================================================

/**
 * Custom portal auth guard.
 * Reads the staffora_portal_session cookie, hashes the token with SHA-256,
 * and looks up the session in portal_sessions.
 *
 * On success:
 * - ctx.portalUser is set to the user
 * - ctx.portalSession is set to the session
 * - ctx.portalTenantContext is set for repository queries
 * - Sliding window extends the session if activity threshold is reached
 *
 * On failure:
 * - Returns 401
 */
async function requirePortalAuth(ctx: any) {
  const { portalRepository, cookie, set } = ctx;

  const sessionCookie = cookie?.[PORTAL_COOKIE_NAME];
  const rawToken = sessionCookie?.value;

  if (!rawToken) {
    set.status = 401;
    return {
      error: {
        code: ErrorCodes.UNAUTHORIZED,
        message: "Portal authentication required",
      },
    };
  }

  const tokenHash = await hashToken(rawToken);
  const session = await portalRepository.findSessionByTokenHash(tokenHash);

  if (!session) {
    set.status = 401;
    // Clear stale cookie
    if (sessionCookie && typeof sessionCookie.set === "function") {
      sessionCookie.set({
        value: "",
        maxAge: 0,
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      });
    }
    return {
      error: {
        code: ErrorCodes.SESSION_EXPIRED,
        message: "Portal session has expired",
      },
    };
  }

  if (!(session.user.isActive ?? session.user.is_active)) {
    set.status = 403;
    return {
      error: {
        code: "ACCOUNT_DISABLED",
        message: "This account has been deactivated",
      },
    };
  }

  // Sliding window: extend session if last activity was > threshold ago
  const lastActivity = session.lastActivityAt
    ? new Date(session.lastActivityAt).getTime()
    : 0;
  if (Date.now() - lastActivity > SESSION_SLIDING_WINDOW_MS) {
    const newExpiry = new Date(
      Date.now() + (session.expiresAt.getTime() - lastActivity)
    );
    await portalRepository.extendSession(session.id, newExpiry);
  }

  // Attach portal context to request
  ctx.portalUser = session.user;
  ctx.portalSession = {
    id: session.id,
    userId: session.userId,
    tenantId: session.tenantId,
    expiresAt: session.expiresAt,
  };
  ctx.portalTenantContext = {
    tenantId: session.tenantId,
    userId: session.userId,
  };
}

/**
 * Admin role check for portal admin routes.
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
// Helper
// =============================================================================

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
  // Public Routes (no auth)
  // =========================================================================

  .post(
    "/auth/login",
    async (ctx) => {
      const { portalService, body, set, cookie } = ctx as any;

      const ipAddress =
        ctx.request?.headers?.get("x-forwarded-for") ??
        ctx.request?.headers?.get("x-real-ip") ??
        null;
      const userAgent =
        ctx.request?.headers?.get("user-agent") ?? null;

      const result = await portalService.login(
        body.email,
        body.password,
        body.rememberMe ?? false,
        ipAddress,
        userAgent
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      // Set session cookie
      const maxAge = body.rememberMe
        ? 30 * 24 * 60 * 60 // 30 days
        : 24 * 60 * 60; // 24 hours

      if (cookie?.[PORTAL_COOKIE_NAME]) {
        cookie[PORTAL_COOKIE_NAME].set({
          value: result.data!.token,
          maxAge,
          path: "/",
          httpOnly: true,
          secure: process.env["NODE_ENV"] === "production",
          sameSite: "lax",
        });
      }

      return { user: result.data!.user };
    },
    {
      body: LoginSchema,
      detail: {
        tags: ["Client Portal"],
        summary: "Portal login",
      },
    }
  )

  .post(
    "/auth/forgot-password",
    async (ctx) => {
      const { portalService, body } = ctx as any;
      await portalService.forgotPassword(body.email);
      return {
        message:
          "If an account exists with that email, a password reset link has been sent.",
      };
    },
    {
      body: ForgotPasswordSchema,
      detail: {
        tags: ["Client Portal"],
        summary: "Request password reset",
      },
    }
  )

  .post(
    "/auth/reset-password",
    async (ctx) => {
      const { portalService, body, set } = ctx as any;

      const result = await portalService.resetPassword(
        body.token,
        body.newPassword
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, PORTAL_ERROR_CODES);
        return { error: result.error };
      }

      return { message: "Password has been reset successfully." };
    },
    {
      body: ResetPasswordSchema,
      detail: {
        tags: ["Client Portal"],
        summary: "Reset password with token",
      },
    }
  )

  // =========================================================================
  // Authenticated Routes
  // =========================================================================

  .post(
    "/auth/logout",
    async (ctx) => {
      const { portalService, portalSession, cookie, set } = ctx as any;

      if (!portalSession) {
        return { message: "Logged out" };
      }

      await portalService.logout(portalSession.id);

      // Clear cookie
      if (cookie?.[PORTAL_COOKIE_NAME]) {
        cookie[PORTAL_COOKIE_NAME].set({
          value: "",
          maxAge: 0,
          path: "/",
          httpOnly: true,
          sameSite: "lax",
        });
      }

      return { message: "Logged out" };
    },
    {
      beforeHandle: [requirePortalAuth],
      detail: {
        tags: ["Client Portal"],
        summary: "Portal logout",
      },
    }
  )

  // Dashboard
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
      beforeHandle: [requirePortalAuth],
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
      beforeHandle: [requirePortalAuth],
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
      beforeHandle: [requirePortalAuth],
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
      beforeHandle: [requirePortalAuth],
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
      beforeHandle: [requirePortalAuth],
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
      beforeHandle: [requirePortalAuth],
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
      beforeHandle: [requirePortalAuth],
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
      beforeHandle: [requirePortalAuth],
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
      beforeHandle: [requirePortalAuth],
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
      beforeHandle: [requirePortalAuth],
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
      beforeHandle: [requirePortalAuth],
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
      beforeHandle: [requirePortalAuth],
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
      beforeHandle: [requirePortalAuth],
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
      beforeHandle: [requirePortalAuth, requirePortalAdmin],
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
      beforeHandle: [requirePortalAuth, requirePortalAdmin],
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
      beforeHandle: [requirePortalAuth, requirePortalAdmin],
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
      beforeHandle: [requirePortalAuth, requirePortalAdmin],
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
      beforeHandle: [requirePortalAuth, requirePortalAdmin],
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
      beforeHandle: [requirePortalAuth, requirePortalAdmin],
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
      beforeHandle: [requirePortalAuth, requirePortalAdmin],
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
      beforeHandle: [requirePortalAuth, requirePortalAdmin],
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
      beforeHandle: [requirePortalAuth, requirePortalAdmin],
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
      beforeHandle: [requirePortalAuth, requirePortalAdmin],
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
      beforeHandle: [requirePortalAuth, requirePortalAdmin],
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
      beforeHandle: [requirePortalAuth, requirePortalAdmin],
      detail: {
        tags: ["Client Portal"],
        summary: "Delete news article (admin)",
      },
    }
  );

export type ClientPortalRoutes = typeof clientPortalRoutes;
