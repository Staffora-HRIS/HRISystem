/**
 * Dashboard Module - Service Layer
 *
 * Implements business logic for dashboard operations.
 * Delegates data access to the repository layer.
 * Adds Redis caching for frequently polled dashboard data.
 */

import type { DashboardRepository, AdminStatsData, RecentActivityRow } from "./repository";
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
  recentActivity: (tenantId: string, limit: number) =>
    `dashboard:${tenantId}:recent-activity:${limit}`,
} as const;

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
   * Results are cached for 60 seconds (CacheTTL.SHORT) to reduce database
   * load from frequent dashboard polling. Cache is tenant-scoped.
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

      // Fetch from database
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
