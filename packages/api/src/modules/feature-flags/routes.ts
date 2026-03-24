/**
 * Feature Flags Module - Elysia Routes
 *
 * Admin CRUD endpoints for managing feature flags and a user-facing
 * evaluation endpoint consumed by the frontend React hook.
 *
 * Permission model:
 * - Admin endpoints: require feature-flags:read / write / delete
 * - Evaluation endpoint: any authenticated user with tenant context
 *
 * Endpoints:
 * - GET    /admin/feature-flags             -- List all flags for tenant
 * - POST   /admin/feature-flags             -- Create a flag
 * - PATCH  /admin/feature-flags/:id         -- Update a flag
 * - DELETE /admin/feature-flags/:id         -- Delete a flag
 * - POST   /feature-flags/evaluate          -- Evaluate flags for current user (preferred, avoids URL leakage)
 * - GET    /feature-flags/evaluate          -- Evaluate flags for current user (deprecated, query string leaks flag names)
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { requireAuthContext, requireTenantContext } from "../../plugins";
import { ErrorResponseSchema, DeleteSuccessSchema } from "../../lib/route-helpers";
import type { FeatureFlagService } from "../../lib/feature-flags";
import type { AuditHelper } from "../../plugins/audit";
import {
  CreateFeatureFlagSchema,
  UpdateFeatureFlagSchema,
  FeatureFlagResponseSchema,
  FeatureFlagEvalResponseSchema,
  IdParamsSchema,
  FlagNameQuerySchema,
  FlagEvalBodySchema,
  type CreateFeatureFlag,
  type UpdateFeatureFlag,
  type FlagEvalBody,
} from "./schemas";

// =============================================================================
// Context Types
// =============================================================================

interface FeatureFlagRouteContext {
  featureFlags: FeatureFlagService;
  tenant: { id: string } | null;
  user: { id: string } | null;
  permissions: { get: () => Promise<any> } | null;
  audit: AuditHelper | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  set: { status: number };
  error: (status: number, body: unknown) => never;
}

// =============================================================================
// Admin CRUD Routes
// =============================================================================

export const featureFlagAdminRoutes = new Elysia({
  prefix: "/admin/feature-flags",
  name: "feature-flags-admin-routes",
})

  // GET /admin/feature-flags — List all flags
  .get(
    "/",
    async (ctx) => {
      const { featureFlags, tenant, error } = ctx as typeof ctx & FeatureFlagRouteContext;

      if (!tenant) {
        return error(400, {
          error: { code: "MISSING_TENANT", message: "Tenant context required" },
        });
      }

      const flags = await featureFlags.getAllFlags(tenant.id);
      return { items: flags, total: flags.length };
    },
    {
      beforeHandle: [requirePermission("feature-flags", "read")],
      response: t.Object({
        items: t.Array(FeatureFlagResponseSchema),
        total: t.Number(),
      }),
      detail: {
        tags: ["Feature Flags"],
        summary: "List feature flags",
        description: "List all feature flags for the current tenant.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /admin/feature-flags — Create a flag
  .post(
    "/",
    async (ctx) => {
      const { featureFlags, tenant, user, audit, requestId, set, error } =
        ctx as typeof ctx & FeatureFlagRouteContext;
      const body = ctx.body as CreateFeatureFlag;

      if (!tenant) {
        return error(400, {
          error: { code: "MISSING_TENANT", message: "Tenant context required" },
        });
      }

      try {
        const flag = await featureFlags.setFlag(
          tenant.id,
          body,
          user?.id
        );

        if (audit) {
          await audit.log({
            action: "feature-flag.created",
            resourceType: "feature_flag",
            resourceId: flag.id,
            newValues: {
              name: flag.name,
              enabled: flag.enabled,
              percentage: flag.percentage,
              roles: flag.roles,
            },
            metadata: { requestId },
          });
        }

        set.status = 201;
        return flag;
      } catch (err: any) {
        // Handle unique constraint violation (duplicate flag name)
        if (
          err?.message?.includes("unique") ||
          err?.message?.includes("duplicate") ||
          err?.code === "23505"
        ) {
          return error(409, {
            error: {
              code: "CONFLICT",
              message: `Feature flag "${body.name}" already exists for this tenant`,
            },
          });
        }
        throw err;
      }
    },
    {
      beforeHandle: [requirePermission("feature-flags", "write")],
      body: CreateFeatureFlagSchema,
      response: {
        201: FeatureFlagResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
      },
      detail: {
        tags: ["Feature Flags"],
        summary: "Create feature flag",
        description:
          "Create a new feature flag for the current tenant. Flag names must be unique per tenant.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /admin/feature-flags/:id — Update a flag
  .patch(
    "/:id",
    async (ctx) => {
      const { featureFlags, tenant, user, audit, requestId, params, error } =
        ctx as typeof ctx & FeatureFlagRouteContext;
      const body = ctx.body as UpdateFeatureFlag;

      if (!tenant) {
        return error(400, {
          error: { code: "MISSING_TENANT", message: "Tenant context required" },
        });
      }

      try {
        const flag = await featureFlags.updateFlag(
          tenant.id,
          params.id,
          body,
          user?.id
        );

        if (!flag) {
          return error(404, {
            error: {
              code: "NOT_FOUND",
              message: `Feature flag ${params.id} not found`,
            },
          });
        }

        if (audit) {
          await audit.log({
            action: "feature-flag.updated",
            resourceType: "feature_flag",
            resourceId: flag.id,
            newValues: body as Record<string, unknown>,
            metadata: { requestId },
          });
        }

        return flag;
      } catch (err: any) {
        if (
          err?.message?.includes("unique") ||
          err?.message?.includes("duplicate") ||
          err?.code === "23505"
        ) {
          return error(409, {
            error: {
              code: "CONFLICT",
              message: `Feature flag name "${body.name}" already exists for this tenant`,
            },
          });
        }
        throw err;
      }
    },
    {
      beforeHandle: [requirePermission("feature-flags", "write")],
      params: IdParamsSchema,
      body: UpdateFeatureFlagSchema,
      response: {
        200: FeatureFlagResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
      },
      detail: {
        tags: ["Feature Flags"],
        summary: "Update feature flag",
        description: "Update an existing feature flag's properties.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /admin/feature-flags/:id — Delete a flag
  .delete(
    "/:id",
    async (ctx) => {
      const { featureFlags, tenant, audit, requestId, params, error } =
        ctx as typeof ctx & FeatureFlagRouteContext;

      if (!tenant) {
        return error(400, {
          error: { code: "MISSING_TENANT", message: "Tenant context required" },
        });
      }

      const deleted = await featureFlags.deleteFlag(tenant.id, params.id);

      if (!deleted) {
        return error(404, {
          error: {
            code: "NOT_FOUND",
            message: `Feature flag ${params.id} not found`,
          },
        });
      }

      if (audit) {
        await audit.log({
          action: "feature-flag.deleted",
          resourceType: "feature_flag",
          resourceId: params.id,
          metadata: { requestId },
        });
      }

      return { success: true as const, message: "Feature flag deleted" };
    },
    {
      beforeHandle: [requirePermission("feature-flags", "delete")],
      params: IdParamsSchema,
      response: {
        200: DeleteSuccessSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
      },
      detail: {
        tags: ["Feature Flags"],
        summary: "Delete feature flag",
        description: "Permanently delete a feature flag.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

// =============================================================================
// Evaluation Route (for frontend hooks)
// =============================================================================

export const featureFlagEvalRoutes = new Elysia({
  prefix: "/feature-flags",
  name: "feature-flags-eval-routes",
})

  // POST /feature-flags/evaluate — Evaluate flags for current user (preferred)
  // Uses POST with JSON body to avoid leaking flag names in URL query strings,
  // browser history, server access logs, and CDN logs.
  .post(
    "/evaluate",
    async (ctx) => {
      const { featureFlags, tenant, user, permissions } =
        ctx as typeof ctx & FeatureFlagRouteContext;
      const body = ctx.body as FlagEvalBody;

      if (!tenant || !user) {
        return { flags: {} };
      }

      // Resolve user roles for flag evaluation
      let userRoles: string[] = [];
      try {
        if (permissions) {
          const effective = await permissions.get();
          if (effective?.roles) {
            userRoles = effective.roles
              .map((r: any) => r.roleName ?? r.role_name ?? r.name)
              .filter(Boolean);
          }
        }
      } catch {
        // Role resolution failed; evaluate without roles
      }

      const flagContext = {
        tenantId: tenant.id,
        userId: user.id,
        roles: userRoles,
      };

      // Determine which flags to evaluate
      const requestedFlags =
        body.flags && body.flags.length > 0 ? body.flags : null;

      const allFlags = await featureFlags.getAllFlags(tenant.id);

      const flagsToEvaluate = requestedFlags
        ? allFlags.filter((f) => requestedFlags.includes(f.name))
        : allFlags;

      // Evaluate each flag
      const result: Record<string, boolean> = {};
      for (const flag of flagsToEvaluate) {
        result[flag.name] = await featureFlags.isEnabled(flag.name, flagContext);
      }

      return { flags: result };
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      body: FlagEvalBodySchema,
      response: FeatureFlagEvalResponseSchema,
      detail: {
        tags: ["Feature Flags"],
        summary: "Evaluate feature flags",
        description:
          "Evaluate feature flags for the current authenticated user. " +
          "Accepts an optional JSON body with a 'flags' array to evaluate specific flags. " +
          "Returns a map of flag names to boolean enabled state.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /feature-flags/evaluate — Evaluate flags for current user (deprecated)
  // Kept for backward compatibility. Prefer POST to avoid flag name leakage in URLs.
  .get(
    "/evaluate",
    async (ctx) => {
      const { featureFlags, tenant, user, permissions, query } =
        ctx as typeof ctx & FeatureFlagRouteContext;

      if (!tenant || !user) {
        return { flags: {} };
      }

      // Resolve user roles for flag evaluation
      let userRoles: string[] = [];
      try {
        if (permissions) {
          const effective = await permissions.get();
          if (effective?.roles) {
            userRoles = effective.roles
              .map((r: any) => r.roleName ?? r.role_name ?? r.name)
              .filter(Boolean);
          }
        }
      } catch {
        // Role resolution failed; evaluate without roles
      }

      const flagContext = {
        tenantId: tenant.id,
        userId: user.id,
        roles: userRoles,
      };

      // Determine which flags to evaluate
      const requestedFlags = query.flags
        ? (query.flags as string).split(",").map((f) => f.trim()).filter(Boolean)
        : null;

      const allFlags = await featureFlags.getAllFlags(tenant.id);

      const flagsToEvaluate = requestedFlags
        ? allFlags.filter((f) => requestedFlags.includes(f.name))
        : allFlags;

      // Evaluate each flag
      const result: Record<string, boolean> = {};
      for (const flag of flagsToEvaluate) {
        result[flag.name] = await featureFlags.isEnabled(flag.name, flagContext);
      }

      return { flags: result };
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      query: FlagNameQuerySchema,
      response: FeatureFlagEvalResponseSchema,
      detail: {
        tags: ["Feature Flags"],
        summary: "Evaluate feature flags (deprecated)",
        description:
          "DEPRECATED: Use POST /feature-flags/evaluate instead to avoid leaking flag names in URLs. " +
          "Evaluate feature flags for the current authenticated user. " +
          "Returns a map of flag names to boolean enabled state. " +
          "Optionally pass ?flags=flag1,flag2 to evaluate specific flags only.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type FeatureFlagAdminRoutes = typeof featureFlagAdminRoutes;
export type FeatureFlagEvalRoutes = typeof featureFlagEvalRoutes;
