import { Elysia } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { logger } from "../../lib/logger";

// =============================================================================
// User Table Sync Health Check
// =============================================================================

/**
 * Runs read-only queries in system context to detect user table sync drift
 * between app."user" (Better Auth) and app.users (legacy HRIS table).
 * Does NOT repair -- this is purely diagnostic.
 */
async function checkUserSyncHealth(db: any): Promise<{
  status: "synced" | "drifted" | "error";
  betterAuthUserCount: number;
  appUsersCount: number;
  missingInAppUsers: number;
  missingInBetterAuth: number;
  driftedFields: number;
  samples: {
    missingInAppUsers: string[];
    missingInBetterAuth: string[];
    driftedFields: string[];
  };
  checkedAt: string;
}> {
  const checkedAt = new Date().toISOString();

  try {
    return await db.withSystemContext(async (tx: any) => {
      // Total counts
      const [baCount] = await tx`
        SELECT count(*)::text AS count FROM app."user"
      `;
      const [auCount] = await tx`
        SELECT count(*)::text AS count FROM app.users
      `;

      // Missing in app.users (exists in Better Auth but not in legacy table)
      const missingInAu = await tx`
        SELECT ba.id
        FROM app."user" ba
        LEFT JOIN app.users au ON au.id = ba.id::uuid
        WHERE au.id IS NULL
          AND ba.id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        LIMIT 5
      `;

      // Missing in Better Auth (exists in legacy table but not in Better Auth)
      const missingInBa = await tx`
        SELECT au.id::text AS id
        FROM app.users au
        LEFT JOIN app."user" ba ON ba.id = au.id::text
        WHERE ba.id IS NULL
        LIMIT 5
      `;

      // Drifted fields (both rows exist but key fields differ)
      const drifted = await tx`
        SELECT ba.id
        FROM app."user" ba
        JOIN app.users au ON au.id = ba.id::uuid
        WHERE ba.email != au.email
           OR ba.name IS DISTINCT FROM au.name
           OR COALESCE(ba.status, 'active') != COALESCE(au.status, 'active')
           OR COALESCE(ba."mfaEnabled", false) != COALESCE(au.mfa_enabled, false)
           OR COALESCE(ba."emailVerified", false) != COALESCE(au.email_verified, false)
        LIMIT 5
      `;

      // Get full counts for missing/drifted (separate count queries for accuracy)
      const [missingInAuCount] = await tx`
        SELECT count(*)::text AS count
        FROM app."user" ba
        LEFT JOIN app.users au ON au.id = ba.id::uuid
        WHERE au.id IS NULL
          AND ba.id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      `;
      const [missingInBaCount] = await tx`
        SELECT count(*)::text AS count
        FROM app.users au
        LEFT JOIN app."user" ba ON ba.id = au.id::text
        WHERE ba.id IS NULL
      `;
      const [driftedCount] = await tx`
        SELECT count(*)::text AS count
        FROM app."user" ba
        JOIN app.users au ON au.id = ba.id::uuid
        WHERE ba.email != au.email
           OR ba.name IS DISTINCT FROM au.name
           OR COALESCE(ba.status, 'active') != COALESCE(au.status, 'active')
           OR COALESCE(ba."mfaEnabled", false) != COALESCE(au.mfa_enabled, false)
           OR COALESCE(ba."emailVerified", false) != COALESCE(au.email_verified, false)
      `;

      const missingInAppUsersN = parseInt(missingInAuCount.count, 10);
      const missingInBetterAuthN = parseInt(missingInBaCount.count, 10);
      const driftedFieldsN = parseInt(driftedCount.count, 10);

      const hasDrift = missingInAppUsersN > 0 || missingInBetterAuthN > 0 || driftedFieldsN > 0;

      return {
        status: hasDrift ? ("drifted" as const) : ("synced" as const),
        betterAuthUserCount: parseInt(baCount.count, 10),
        appUsersCount: parseInt(auCount.count, 10),
        missingInAppUsers: missingInAppUsersN,
        missingInBetterAuth: missingInBetterAuthN,
        driftedFields: driftedFieldsN,
        samples: {
          missingInAppUsers: missingInAu.map((r: any) => r.id),
          missingInBetterAuth: missingInBa.map((r: any) => r.id),
          driftedFields: drifted.map((r: any) => r.id),
        },
        checkedAt,
      };
    });
  } catch (error) {
    logger.error({ err: error, module: "system" }, "User sync health check failed");
    return {
      status: "error" as const,
      betterAuthUserCount: 0,
      appUsersCount: 0,
      missingInAppUsers: 0,
      missingInBetterAuth: 0,
      driftedFields: 0,
      samples: {
        missingInAppUsers: [],
        missingInBetterAuth: [],
        driftedFields: [],
      },
      checkedAt,
    };
  }
}

// =============================================================================
// Routes
// =============================================================================

export const systemRoutes = new Elysia({ prefix: "/system" })
  .get(
    "/health",
    async (ctx) => {
      const { db, cache } = ctx as any;

      const dbHealth = await db.healthCheck();
      const redisHealth = await cache.healthCheck();

      const services = [
        {
          name: "database",
          status: dbHealth.status === "up" ? ("healthy" as const) : ("down" as const),
          latency: dbHealth.latency,
        },
        {
          name: "redis",
          status: redisHealth.status === "up" ? ("healthy" as const) : ("down" as const),
          latency: redisHealth.latency,
        },
      ];

      const allHealthy = services.every((s) => s.status === "healthy");
      const anyDown = services.some((s) => s.status === "down");

      const status = allHealthy
        ? ("healthy" as const)
        : anyDown
          ? ("down" as const)
          : ("degraded" as const);

      return { status, services };
    },
    {
      // Tie system health visibility to the dashboard read permission
      // (admin dashboard calls this endpoint)
      beforeHandle: [requirePermission("dashboards", "read")],
      detail: {
        tags: ["System"],
        summary: "System health",
        description: "Health for internal services used by the platform",
      },
    }
  )
  .get(
    "/user-sync-health",
    async (ctx) => {
      const { db } = ctx as any;
      return checkUserSyncHealth(db);
    },
    {
      beforeHandle: [requirePermission("dashboards", "read")],
      detail: {
        tags: ["System"],
        summary: "User table sync health",
        description:
          "Detects drift between the Better Auth canonical user table (app.\"user\") " +
          "and the legacy application table (app.users). Returns counts and sample IDs " +
          "for missing rows and field mismatches. Does not repair -- use the reconciliation " +
          "CLI (bun run reconcile:users -- --fix) to apply repairs.",
      },
    }
  );

export type SystemRoutes = typeof systemRoutes;
