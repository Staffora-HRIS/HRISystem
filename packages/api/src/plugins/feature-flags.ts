/**
 * Feature Flags Elysia Plugin
 *
 * Derives the FeatureFlagService into the request context and provides
 * a beforeHandle guard for gating routes behind feature flags.
 *
 * Registration order: After cache and db plugins, after auth and tenant.
 * This plugin should be registered after rbacPlugin so that user roles
 * are available in the context for role-based flag evaluation.
 *
 * Usage:
 * ```ts
 * import { featureFlagsPlugin, requireFeatureFlag } from './plugins/feature-flags';
 *
 * const app = new Elysia()
 *   .use(dbPlugin())
 *   .use(cachePlugin())
 *   .use(authPlugin())
 *   .use(tenantPlugin())
 *   .use(rbacPlugin())
 *   .use(featureFlagsPlugin())
 *   .get('/new-feature', handler, {
 *     beforeHandle: [requireFeatureFlag('new-feature')],
 *   });
 * ```
 */

import { Elysia } from "elysia";
import { FeatureFlagService, type FeatureFlagContext } from "../lib/feature-flags";
import type { DatabaseClient } from "./db";
import type { CacheClient } from "./cache";

// =============================================================================
// Singleton
// =============================================================================

let featureFlagServiceSingleton: FeatureFlagService | null = null;

/**
 * Get or create the singleton FeatureFlagService.
 */
function getFeatureFlagService(
  db: DatabaseClient | null,
  cache: CacheClient | null
): FeatureFlagService {
  if (!featureFlagServiceSingleton) {
    featureFlagServiceSingleton = new FeatureFlagService(db, cache);
  }
  return featureFlagServiceSingleton;
}

// =============================================================================
// Plugin
// =============================================================================

/**
 * Feature flags plugin for Elysia.
 *
 * Adds `featureFlags` (FeatureFlagService) to the request context.
 */
export function featureFlagsPlugin() {
  return new Elysia({ name: "feature-flags" })
    .derive({ as: "global" }, (ctx) => {
      const db = (ctx as any).db as DatabaseClient | undefined;
      const cache = (ctx as any).cache as CacheClient | undefined;

      const featureFlags = getFeatureFlagService(db ?? null, cache ?? null);

      return { featureFlags };
    });
}

// =============================================================================
// Guards
// =============================================================================

/**
 * Feature flag guard for beforeHandle arrays.
 *
 * Returns 404 (not 403) when a flag is disabled to avoid leaking
 * information about unreleased features.
 *
 * Usage:
 * ```ts
 * app.get('/beta-endpoint', handler, {
 *   beforeHandle: [requireFeatureFlag('beta-endpoint')],
 * });
 * ```
 */
export function requireFeatureFlag(flagName: string) {
  return async (ctx: any) => {
    const featureFlags: FeatureFlagService | undefined = ctx.featureFlags;

    if (!featureFlags) {
      // Plugin not registered -- fail closed
      ctx.set.status = 404;
      throw new Error("Not found");
    }

    const tenant = ctx.tenant as { id: string } | null | undefined;
    const user = ctx.user as { id: string } | null | undefined;

    if (!tenant || !user) {
      // No tenant or user context -- flag cannot be evaluated, fail closed
      ctx.set.status = 404;
      throw new Error("Not found");
    }

    // Build evaluation context
    const flagContext: FeatureFlagContext = {
      tenantId: tenant.id,
      userId: user.id,
      roles: [],
    };

    // Attempt to read user roles from RBAC permissions (lazy-loaded)
    try {
      const permissions = ctx.permissions as { get: () => Promise<any> } | undefined;
      if (permissions) {
        const effective = await permissions.get();
        if (effective?.roles) {
          flagContext.roles = effective.roles.map((r: any) => r.roleName ?? r.role_name ?? r.name).filter(Boolean);
        }
      }
    } catch {
      // Role resolution failed; evaluate without roles
    }

    const enabled = await featureFlags.isEnabled(flagName, flagContext);

    if (!enabled) {
      ctx.set.status = 404;
      throw new Error("Not found");
    }
  };
}

// =============================================================================
// Exports
// =============================================================================

export { FeatureFlagService } from "../lib/feature-flags";
export type { FeatureFlag, FeatureFlagContext, CreateFeatureFlagInput, UpdateFeatureFlagInput } from "../lib/feature-flags";
