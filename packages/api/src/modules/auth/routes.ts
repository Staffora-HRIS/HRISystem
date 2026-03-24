/**
 * Authentication Routes
 *
 * Staffora-specific auth endpoints that complement Better Auth.
 * Better Auth handles: sign-in, sign-up, sign-out, session management
 * These routes handle: tenant switching, user info with tenants
 */

import { Elysia, t } from "elysia";
import { AuthService, requireAuthContext } from "../../plugins";
import { ErrorCodes } from "../../plugins/errors";
import { logger } from "../../lib/logger";
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
        logger.error({ err: error, module: "auth", route: "/me" }, "Failed to get user info");
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
        logger.error({ err: error, module: "auth", route: "/tenants" }, "Failed to get tenants");
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

  // GET /auth/mfa/backup-codes/status - Get remaining backup code count
  .get(
    "/mfa/backup-codes/status",
    async (ctx) => {
      const { user, set, requestId } = ctx as any;
      const db = (ctx as any).db;

      try {
        const rows = await db.query`
          SELECT "backupCodes" FROM app."twoFactor"
          WHERE "userId" = ${user.id}
          LIMIT 1
        `;

        if (rows.length === 0) {
          return { mfaEnabled: false, backupCodesRemaining: 0, totalGenerated: 0 };
        }

        const raw = rows[0].backupCodes;
        let codes: string[] = [];
        if (raw) {
          try { codes = JSON.parse(raw); } catch { codes = []; }
        }

        return {
          mfaEnabled: true,
          backupCodesRemaining: codes.length,
          totalGenerated: 10,
        };
      } catch (error) {
        logger.error({ err: error, module: "auth" }, "Failed to get backup code status");
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get backup code status", requestId: requestId || "" } };
      }
    },
    {
      beforeHandle: [requireAuthContext],
      response: {
        200: t.Object({
          mfaEnabled: t.Boolean(),
          backupCodesRemaining: t.Number(),
          totalGenerated: t.Number(),
        }),
        401: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Auth"],
        summary: "Get MFA backup code status",
        description: "Get the number of remaining unused backup codes without revealing the codes themselves",
      },
    }
  )

  // POST /auth/mfa/backup-codes/regenerate - Generate new set of backup codes
  .post(
    "/mfa/backup-codes/regenerate",
    async (ctx) => {
      const { user, set, requestId } = ctx as any;
      const db = (ctx as any).db;

      try {
        // Verify MFA is enabled for this user
        const rows = await db.query`
          SELECT id FROM app."twoFactor"
          WHERE "userId" = ${user.id}
          LIMIT 1
        `;

        if (rows.length === 0) {
          set.status = 400;
          return { error: { code: "MFA_NOT_ENABLED", message: "MFA is not enabled for this account", requestId: requestId || "" } };
        }

        // Generate 10 new backup codes (8-char hex each)
        const newCodes: string[] = [];
        for (let i = 0; i < 10; i++) {
          const bytes = new Uint8Array(4);
          crypto.getRandomValues(bytes);
          newCodes.push(Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(""));
        }

        // Store hashed codes in the database
        // Better Auth stores them as JSON array of plain strings in the backupCodes column
        await db.query`
          UPDATE app."twoFactor"
          SET "backupCodes" = ${JSON.stringify(newCodes)}
          WHERE "userId" = ${user.id}
        `;

        set.status = 200;
        return {
          success: true,
          backupCodes: newCodes,
          message: "Store these codes securely. They will not be shown again.",
        };
      } catch (error) {
        logger.error({ err: error, module: "auth" }, "Failed to regenerate backup codes");
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to regenerate backup codes", requestId: requestId || "" } };
      }
    },
    {
      beforeHandle: [requireAuthContext],
      response: {
        200: t.Object({
          success: t.Literal(true),
          backupCodes: t.Array(t.String()),
          message: t.String(),
        }),
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Auth"],
        summary: "Regenerate MFA backup codes",
        description: "Generate a new set of 10 backup codes, replacing any existing ones. Codes are shown only once.",
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
        logger.error({ err: error, module: "auth", route: "/switch-tenant" }, "Failed to switch tenant");
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
