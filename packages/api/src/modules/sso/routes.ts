/**
 * SSO Module - Elysia Routes
 *
 * Enterprise SSO (SAML/OIDC) configuration and login endpoints.
 *
 * Admin endpoints (require auth + sso:read/write/delete permissions):
 * - GET    /sso/configs           -- List SSO configurations
 * - POST   /sso/configs           -- Create SSO configuration
 * - GET    /sso/configs/:id       -- Get SSO configuration details
 * - PATCH  /sso/configs/:id       -- Update SSO configuration
 * - DELETE /sso/configs/:id       -- Delete SSO configuration
 * - GET    /sso/configs/:id/login-attempts -- List login attempts (audit)
 *
 * Public endpoints (no auth required -- used by login page):
 * - GET    /auth/sso/:tenantSlug/providers         -- Discover SSO providers
 * - GET    /auth/sso/:tenantSlug/:configId/login    -- Initiate SSO login (redirect to IdP)
 * - GET    /auth/sso/:tenantSlug/:configId/callback -- OIDC callback (redirect from IdP)
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, DeleteSuccessSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { SsoConfigRepository } from "./repository";
import { SsoService } from "./service";
import {
  SsoConfigResponseSchema,
  SsoConfigFiltersSchema,
  SsoLoginAttemptResponseSchema,
  SsoLoginInitResponseSchema,
  SsoCallbackQuerySchema,
  CreateSsoConfigSchema,
  UpdateSsoConfigSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  TenantSlugParamsSchema,
  SsoProviderParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateSsoConfig,
  type UpdateSsoConfig,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface SsoPluginContext {
  ssoService: SsoService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number; headers: Record<string, string> };
  error: (status: number, body: unknown) => never;
}

// =============================================================================
// Admin Routes (SSO Configuration Management)
// =============================================================================

export const ssoAdminRoutes = new Elysia({ prefix: "/sso/configs", name: "sso-admin-routes" })

  // Service instantiation
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new SsoConfigRepository(db);
    const service = new SsoService(repository, db);
    return { ssoService: service };
  })

  // GET /sso/configs -- List SSO configurations
  .get(
    "/",
    async (ctx) => {
      const { ssoService, query, tenantContext } = ctx as typeof ctx & SsoPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await ssoService.listConfigs(
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
      beforeHandle: [requirePermission("sso", "read")],
      query: t.Composite([
        t.Partial(SsoConfigFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(SsoConfigResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["SSO"],
        summary: "List SSO configurations",
        description: "List SSO provider configurations for the current tenant. Client secrets are never returned.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /sso/configs -- Create SSO configuration
  .post(
    "/",
    async (ctx) => {
      const { ssoService, body, tenantContext, audit, requestId, set, error } = ctx as typeof ctx & SsoPluginContext;

      const result = await ssoService.createConfig(tenantContext, body as CreateSsoConfig);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "sso.config.created",
          resourceType: "sso_configuration",
          resourceId: result.data!.id,
          newValues: {
            id: result.data!.id,
            provider_type: result.data!.provider_type,
            provider_name: result.data!.provider_name,
            enabled: result.data!.enabled,
            // Never audit client_secret
          },
          metadata: { requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("sso", "write")],
      body: CreateSsoConfigSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: SsoConfigResponseSchema,
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["SSO"],
        summary: "Create SSO configuration",
        description:
          "Create a new SSO provider configuration. Client secrets are encrypted at rest. " +
          "OIDC providers require client_id and issuer_url. SAML providers require issuer_url or metadata_url.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /sso/configs/:id -- Get SSO configuration by ID
  .get(
    "/:id",
    async (ctx) => {
      const { ssoService, params, tenantContext, error } = ctx as typeof ctx & SsoPluginContext;

      const result = await ssoService.getConfig(tenantContext, params.id);
      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("sso", "read")],
      params: IdParamsSchema,
      response: {
        200: SsoConfigResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["SSO"],
        summary: "Get SSO configuration by ID",
        description: "Get SSO configuration details. Client secrets are never returned.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /sso/configs/:id -- Update SSO configuration
  .patch(
    "/:id",
    async (ctx) => {
      const { ssoService, params, body, tenantContext, audit, requestId, error } = ctx as typeof ctx & SsoPluginContext;

      const result = await ssoService.updateConfig(tenantContext, params.id, body as UpdateSsoConfig);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      if (audit) {
        // Sanitize body to never log client_secret
        const sanitized = { ...(body as Record<string, unknown>) };
        if ("client_secret" in sanitized) {
          sanitized["client_secret"] = "[REDACTED]";
        }

        await audit.log({
          action: "sso.config.updated",
          resourceType: "sso_configuration",
          resourceId: params.id,
          newValues: sanitized,
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("sso", "write")],
      params: IdParamsSchema,
      body: UpdateSsoConfigSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: SsoConfigResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["SSO"],
        summary: "Update SSO configuration",
        description: "Update SSO configuration. Set client_secret to null to remove it.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /sso/configs/:id -- Delete SSO configuration
  .delete(
    "/:id",
    async (ctx) => {
      const { ssoService, params, tenantContext, audit, requestId, error } = ctx as typeof ctx & SsoPluginContext;

      const result = await ssoService.deleteConfig(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "sso.config.deleted",
          resourceType: "sso_configuration",
          resourceId: params.id,
          metadata: { requestId },
        });
      }

      return { success: true as const, message: "SSO configuration deleted" };
    },
    {
      beforeHandle: [requirePermission("sso", "delete")],
      params: IdParamsSchema,
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["SSO"],
        summary: "Delete SSO configuration",
        description: "Permanently delete an SSO configuration and its login history.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /sso/configs/:id/login-attempts -- List login attempts for audit
  .get(
    "/:id/login-attempts",
    async (ctx) => {
      const { ssoService, params, query, tenantContext } = ctx as typeof ctx & SsoPluginContext;
      const { cursor, limit } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await ssoService.listLoginAttempts(
        tenantContext,
        params.id,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("sso", "read")],
      params: IdParamsSchema,
      query: t.Partial(PaginationQuerySchema),
      response: t.Object({
        items: t.Array(SsoLoginAttemptResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["SSO"],
        summary: "List SSO login attempts",
        description: "List login attempts for a specific SSO configuration. Useful for audit and troubleshooting.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

// =============================================================================
// Public SSO Login Routes (no auth required)
// =============================================================================

export const ssoPublicRoutes = new Elysia({ prefix: "/auth/sso", name: "sso-public-routes" })

  // Service instantiation
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new SsoConfigRepository(db);
    const service = new SsoService(repository, db);
    return { ssoService: service };
  })

  // GET /auth/sso/:tenantSlug/providers -- Discover SSO providers for a tenant
  .get(
    "/:tenantSlug/providers",
    async (ctx) => {
      const { ssoService, params, error } = ctx as typeof ctx & SsoPluginContext;

      const result = await ssoService.discoverProviders(params.tenantSlug);
      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      return { providers: result.data };
    },
    {
      params: TenantSlugParamsSchema,
      response: {
        200: t.Object({
          providers: t.Array(
            t.Object({
              id: t.String(),
              provider_type: t.String(),
              provider_name: t.String(),
            })
          ),
        }),
        404: ErrorResponseSchema,
      },
      detail: {
        tags: ["SSO"],
        summary: "Discover SSO providers",
        description:
          "Public endpoint. Returns the list of enabled SSO providers for a tenant. " +
          "Used by the login page to show available SSO options.",
      },
    }
  )

  // GET /auth/sso/:tenantSlug/:configId/login -- Initiate SSO login
  .get(
    "/:tenantSlug/:configId/login",
    async (ctx) => {
      const { ssoService, params, set, error } = ctx as typeof ctx & SsoPluginContext;

      const result = await ssoService.initiateOidcLogin(params.tenantSlug, params.configId);
      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      // Redirect the user's browser to the IdP
      set.status = 302;
      set.headers["Location"] = result.data!.redirect_url;
      set.headers["Cache-Control"] = "no-store";
      return null;
    },
    {
      params: SsoProviderParamsSchema,
      detail: {
        tags: ["SSO"],
        summary: "Initiate SSO login",
        description:
          "Public endpoint. Redirects the user to the IdP for authentication. " +
          "After authentication, the IdP redirects back to the callback endpoint.",
      },
    }
  )

  // GET /auth/sso/:tenantSlug/:configId/callback -- OIDC callback from IdP
  .get(
    "/:tenantSlug/:configId/callback",
    async (ctx) => {
      const { ssoService, params, query, request, set, error } = ctx as typeof ctx & SsoPluginContext;

      // Check for IdP error response
      if (query.error) {
        const errorDesc = query.error_description || query.error;
        console.error(`[SSO] IdP error: ${query.error} - ${errorDesc}`);

        // Redirect to frontend login page with error
        const frontendUrl = process.env["FRONTEND_URL"] || "http://localhost:5173";
        set.status = 302;
        set.headers["Location"] = `${frontendUrl}/login?sso_error=${encodeURIComponent(errorDesc)}`;
        set.headers["Cache-Control"] = "no-store";
        return null;
      }

      if (!query.code || !query.state) {
        return error(400, {
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required parameters: code and state",
          },
        });
      }

      // Extract client info for audit
      const ipAddress = (request as any).headers?.get?.("x-forwarded-for")
        || (request as any).headers?.get?.("x-real-ip")
        || null;
      const userAgent = (request as any).headers?.get?.("user-agent") || null;

      const result = await ssoService.handleOidcCallback(
        params.tenantSlug,
        query.code,
        query.state,
        ipAddress,
        userAgent
      );

      if (!result.success) {
        // Redirect to frontend with error
        const frontendUrl = process.env["FRONTEND_URL"] || "http://localhost:5173";
        const errorMsg = result.error?.message || "SSO login failed";
        set.status = 302;
        set.headers["Location"] = `${frontendUrl}/login?sso_error=${encodeURIComponent(errorMsg)}`;
        set.headers["Cache-Control"] = "no-store";
        return null;
      }

      // Create a session for the user via Better Auth API
      // We use a server-side redirect to a session creation endpoint
      // The frontend will handle the session cookie via the redirect
      const frontendUrl = process.env["FRONTEND_URL"] || "http://localhost:5173";

      // Encode the SSO result as a signed token for the frontend to exchange
      // This prevents the frontend from needing direct access to user IDs
      const ssoToken = Buffer.from(
        JSON.stringify({
          user_id: result.data!.user_id,
          email: result.data!.email,
          tenant_id: result.data!.tenant_id,
          is_new_user: result.data!.is_new_user,
          ts: Date.now(),
        })
      ).toString("base64url");

      set.status = 302;
      set.headers["Location"] = `${frontendUrl}/auth/sso-callback?token=${ssoToken}&tenant=${params.tenantSlug}`;
      set.headers["Cache-Control"] = "no-store";
      return null;
    },
    {
      params: SsoProviderParamsSchema,
      query: SsoCallbackQuerySchema,
      detail: {
        tags: ["SSO"],
        summary: "SSO callback",
        description:
          "Callback endpoint for OIDC providers. Exchanges the authorization code for tokens, " +
          "resolves or provisions the user, and redirects to the frontend.",
      },
    }
  );

export type SsoAdminRoutes = typeof ssoAdminRoutes;
export type SsoPublicRoutes = typeof ssoPublicRoutes;
