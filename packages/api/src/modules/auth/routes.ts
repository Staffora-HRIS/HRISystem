/**
 * Authentication Routes
 *
 * HRIS-specific auth endpoints that complement Better Auth.
 * Better Auth handles: sign-in, sign-up, sign-out, session management
 * These routes handle: tenant switching, user info with tenants
 */

import { Elysia, t } from "elysia";
import { AuthService, requireAuthContext } from "../../plugins";
import { ErrorCodes } from "../../plugins/errors";
import { ErrorResponseSchema } from "../../lib/route-helpers";

// =============================================================================
// Request Schemas
// =============================================================================

const SwitchTenantBodySchema = t.Object({
  tenantId: t.String({ format: "uuid" }),
});

// =============================================================================
// Response Schemas
// =============================================================================

const UserResponseSchema = t.Object({
  id: t.String(),
  email: t.String(),
  name: t.Union([t.String(), t.Null()]),
  emailVerified: t.Boolean(),
  status: t.Optional(t.String()),
  mfaEnabled: t.Optional(t.Boolean()),
});

const SessionResponseSchema = t.Object({
  id: t.String(),
  userId: t.String(),
  expiresAt: t.String(),
});

const TenantResponseSchema = t.Object({
  id: t.String(),
  name: t.String(),
  slug: t.String(),
  isPrimary: t.Boolean(),
});

const TenantListItemSchema = t.Object({
  id: t.String(),
  name: t.String(),
  slug: t.String(),
  isPrimary: t.Boolean(),
  role: t.String(),
});

const MeResponseSchema = t.Object({
  user: UserResponseSchema,
  session: SessionResponseSchema,
  currentTenant: t.Union([TenantResponseSchema, t.Null()]),
  tenants: t.Array(TenantResponseSchema),
});

const SuccessResponseSchema = t.Object({
  success: t.Literal(true),
});

const SwitchTenantResponseSchema = t.Object({
  success: t.Literal(true),
  tenantId: t.String(),
});

// =============================================================================
// Routes
// =============================================================================

export const authRoutes = new Elysia({ prefix: "/auth", name: "auth-routes" })
  .derive((ctx) => {
    const anyCtx = ctx as any;
    const db = anyCtx.db;
    const cache = anyCtx.cache;

    return {
      authService: anyCtx.authService ?? new AuthService(db, cache),
    } as Record<string, unknown>;
  })

  // GET /auth/me - Get current user info with tenants
  .get(
    "/me",
    async (ctx) => {
      const { authService, user, session, set, requestId } = ctx as any;

      try {
        const userWithTenants = await authService.getUserWithTenants(user.id);
        const currentTenantId = await authService.getSessionTenant(session.id, user.id);

        // Find current tenant from user's tenants
        const currentTenant = userWithTenants?.tenants.find(
          (t: any) => t.id === currentTenantId
        ) || userWithTenants?.tenants.find((t: any) => t.isPrimary) || null;

        return {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified,
            status: user.status,
            mfaEnabled: user.mfaEnabled,
          },
          session: {
            id: session.id,
            userId: session.userId,
            expiresAt: session.expiresAt instanceof Date 
              ? session.expiresAt.toISOString() 
              : session.expiresAt,
          },
          currentTenant,
          tenants: userWithTenants?.tenants || [],
        };
      } catch (error) {
        console.error("Get me error:", error instanceof Error ? error.message : "Unknown error");
        set.status = 500;
        return {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to get user info",
            requestId: requestId || "",
          },
        };
      }
    },
    {
      beforeHandle: [requireAuthContext],
      response: {
        200: MeResponseSchema,
        401: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Auth"],
        summary: "Get current user",
        description: "Get current authenticated user with session and tenant info",
      },
    }
  )

  // GET /auth/tenants - List tenants user can access
  .get(
    "/tenants",
    async (ctx) => {
      const { authService, user, session, set, requestId } = ctx as any;

      try {
        const userWithTenants = await authService.getUserWithTenants(user.id);
        const tenants = userWithTenants?.tenants ?? [];

        return tenants.map((t: any) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          isPrimary: !!t.isPrimary,
          role: t.isPrimary ? "primary" : "member",
        }));
      } catch (error) {
        console.error("Get tenants error:", error instanceof Error ? error.message : "Unknown error");
        set.status = 500;
        return {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to get tenants",
            requestId: requestId || "",
          },
        };
      }
    },
    {
      beforeHandle: [requireAuthContext],
      response: {
        200: t.Array(TenantListItemSchema),
        401: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Auth"],
        summary: "List user tenants",
        description: "List tenants the current user can access",
      },
    }
  )

  // POST /auth/switch-tenant - Switch tenant context
  .post(
    "/switch-tenant",
    async (ctx) => {
      const { authService, user, session, body, set, requestId } = ctx as any;

      try {
        const tenantId = (body as any).tenantId;
        const canSwitch = await authService.switchTenant(user.id, session.id, tenantId);

        if (!canSwitch) {
          set.status = 403;
          return {
            error: {
              code: ErrorCodes.FORBIDDEN,
              message: "You do not have access to this tenant",
              requestId: requestId || "",
            },
          };
        }

        return { success: true as const, tenantId };
      } catch (error) {
        console.error("Switch tenant error:", error instanceof Error ? error.message : "Unknown error");
        set.status = 500;
        return {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to switch tenant",
            requestId: requestId || "",
          },
        };
      }
    },
    {
      beforeHandle: [requireAuthContext],
      body: SwitchTenantBodySchema,
      response: {
        200: SwitchTenantResponseSchema,
        401: ErrorResponseSchema,
        403: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Auth"],
        summary: "Switch tenant",
        description: "Switch the current session to a different tenant",
      },
    }
  );

export type AuthRoutes = typeof authRoutes;
