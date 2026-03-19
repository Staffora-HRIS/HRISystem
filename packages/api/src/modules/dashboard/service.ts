/**
 * Dashboard Module - Service Layer
 *
 * Implements business logic for dashboard operations.
 * Delegates data access to the repository layer.
 * Adds Redis caching for frequently polled dashboard data.
 *
 * Data flow: Redis cache (60s) -> Materialized views -> Live CTE queries
 */

import type {
  DashboardRepository,
  AdminStatsData,
  DashboardExtendedStats,
  RecentActivityRow,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import type { CacheClient } from "../../plugins/cache";
import { CacheTTL } from "../../plugins/cache";
import { ErrorCodes } from "../../plugins/errors";
import { logger } from "../../lib/logger";

// =============================================================================
// Cache Key Helpers
// =============================================================================

/**
 * Cache key patterns scoped to tenant for dashboard data.
 */
const DashboardCacheKeys = {
  adminStats: (tenantId: string) => `dashboard:${tenantId}:admin-stats`,
  extendedStats: (tenantId: string) => `dashboard:${tenantId}:extended-stats`,
  recentActivity: (tenantId: string, limit: number) =>
    `dashboard:${tenantId}:recent-activity:${limit}`,
} as const;

// =============================================================================
// Cache Invalidation Helper
// =============================================================================

/**
 * Invalidate all dashboard caches for a given tenant.
 *
 * Called by domain event handlers when data that feeds dashboard stats changes
 * (employee created/terminated, leave approved, workflow completed, etc.).
 *
 * This is best-effort: cache failures are logged but do not propagate errors.
 */
export async function invalidateDashboardCache(
  cache: CacheClient,
  tenantId: string,
): Promise<void> {
  try {
    await cache.del(DashboardCacheKeys.adminStats(tenantId));
    await cache.del(DashboardCacheKeys.extendedStats(tenantId));

    // Invalidate recent activity caches (common limit values)
    const commonLimits = [5, 10, 20, 25, 50];
    for (const limit of commonLimits) {
      await cache.del(DashboardCacheKeys.recentActivity(tenantId, limit));
    }

    logger.debug(
      { tenantId },
      "dashboard cache invalidated for tenant",
    );
  } catch (err) {
    logger.warn(
      { err, tenantId },
      "failed to invalidate dashboard cache (non-critical)",
    );
  }
}

// =============================================================================
// Service
// =============================================================================

export class DashboardService {
  constructor(
    private readonly repository: DashboardRepository,
    private readonly cache: CacheClient | null = null,
  ) {}

  /**
   * Get admin dashboard statistics.
   *
   * Returns aggregate counts for employees, departments, open positions,
   * pending workflows, and pending approvals within the tenant scope.
   *
   * Data flow: Redis cache (60s) -> Materialized view -> Live CTE query.
   */
  async getAdminStats(ctx: TenantContext): Promise<ServiceResult<AdminStatsData>> {
    try {
      const cacheKey = DashboardCacheKeys.adminStats(ctx.tenantId);

      // Attempt cache read first
      if (this.cache) {
        try {
          const cached = await this.cache.get<AdminStatsData>(cacheKey);
          if (cached !== null) {
            logger.debug({ tenantId: ctx.tenantId }, "dashboard admin stats served from cache");
            return { success: true, data: cached };
          }
        } catch (cacheErr) {
          // Cache failures should not block the request; fall through to DB
          logger.warn(
            { err: cacheErr, tenantId: ctx.tenantId },
            "dashboard cache read failed, falling back to database",
          );
        }
      }

      // Fetch from database (tries MV first, then live query)
      const stats = await this.repository.getAdminStats(ctx);

      // Store in cache (fire-and-forget; failure is non-critical)
      if (this.cache) {
        this.cache
          .set(cacheKey, stats, CacheTTL.SHORT)
          .catch((err) => {
            logger.warn(
              { err, tenantId: ctx.tenantId },
              "dashboard cache write failed",
            );
          });
      }

      return { success: true, data: stats };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch dashboard stats";
      logger.error(
        { err: error, tenantId: ctx.tenantId },
        "dashboard getAdminStats failed",
      );

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message,
        },
      };
    }
  }

  /**
   * Get extended dashboard statistics including leave, case, and onboarding data.
   *
   * Uses materialized views for all aggregate counts with fallback to live queries.
   * Cached for 60 seconds.
   */
  async getExtendedStats(
    ctx: TenantContext,
  ): Promise<ServiceResult<DashboardExtendedStats>> {
    try {
      const cacheKey = DashboardCacheKeys.extendedStats(ctx.tenantId);

      // Attempt cache read first
      if (this.cache) {
        try {
          const cached = await this.cache.get<DashboardExtendedStats>(cacheKey);
          if (cached !== null) {
            logger.debug({ tenantId: ctx.tenantId }, "dashboard extended stats served from cache");
            return { success: true, data: cached };
          }
        } catch (cacheErr) {
          logger.warn(
            { err: cacheErr, tenantId: ctx.tenantId },
            "dashboard cache read failed for extended stats",
          );
        }
      }

      const stats = await this.repository.getExtendedStats(ctx);

      if (this.cache) {
        this.cache
          .set(cacheKey, stats, CacheTTL.SHORT)
          .catch((err) => {
            logger.warn(
              { err, tenantId: ctx.tenantId },
              "dashboard cache write failed for extended stats",
            );
          });
      }

      return { success: true, data: stats };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to fetch extended dashboard stats";
      logger.error(
        { err: error, tenantId: ctx.tenantId },
        "dashboard getExtendedStats failed",
      );

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message,
        },
      };
    }
  }

  /**
   * Get recent activity for the tenant dashboard.
   *
   * Returns the most recent audit log entries within the tenant scope.
   * Cached for 60 seconds to reduce polling load.
   */
  async getRecentActivity(
    ctx: TenantContext,
    limit: number = 10,
  ): Promise<ServiceResult<RecentActivityRow[]>> {
    try {
      const cacheKey = DashboardCacheKeys.recentActivity(ctx.tenantId, limit);

      // Attempt cache read first
      if (this.cache) {
        try {
          const cached = await this.cache.get<RecentActivityRow[]>(cacheKey);
          if (cached !== null) {
            logger.debug({ tenantId: ctx.tenantId }, "dashboard recent activity served from cache");
            return { success: true, data: cached };
          }
        } catch (cacheErr) {
          logger.warn(
            { err: cacheErr, tenantId: ctx.tenantId },
            "dashboard cache read failed for recent activity",
          );
        }
      }

      const activity = await this.repository.getRecentActivity(ctx, limit);

      if (this.cache) {
        this.cache
          .set(cacheKey, activity, CacheTTL.SHORT)
          .catch((err) => {
            logger.warn(
              { err, tenantId: ctx.tenantId },
              "dashboard cache write failed for recent activity",
            );
          });
      }

      return { success: true, data: activity };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch recent activity";
      logger.error(
        { err: error, tenantId: ctx.tenantId },
        "dashboard getRecentActivity failed",
      );

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message,
        },
      };
    }
  }
}
