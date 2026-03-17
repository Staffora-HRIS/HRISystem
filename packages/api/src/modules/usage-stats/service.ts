/**
 * Usage Stats Module - Service Layer
 *
 * Implements business logic for per-tenant usage analytics.
 * Aggregation logic for the scheduler job and query logic
 * for the API endpoint.
 */

import type { DatabaseClient, TenantContext } from "../../plugins/db";
import type { UsageStatsRepository } from "./repository";
import type {
  UsageStatsQuery,
  UsageStatsRecord,
  MonthlyUsageStats,
} from "./schemas";
import type { ServiceResult } from "../../types/service-result";

// =============================================================================
// Service
// =============================================================================

export class UsageStatsService {
  constructor(
    private repository: UsageStatsRepository,
    private db: DatabaseClient
  ) {}

  /**
   * Get usage stats for the current tenant.
   * Supports daily and monthly period granularity.
   */
  async getUsageStats(
    context: TenantContext,
    query: UsageStatsQuery = {}
  ): Promise<
    ServiceResult<{
      items: UsageStatsRecord[] | MonthlyUsageStats[];
      period: string;
      total_items: number;
    }>
  > {
    const period = query.period || "monthly";
    const limit = query.limit || 30;

    // Default date range: last 12 months for monthly, last 30 days for daily
    const now = new Date();
    const defaultEnd = now.toISOString().split("T")[0]!;
    let defaultStart: string;

    if (period === "monthly") {
      const monthsAgo = new Date(now);
      monthsAgo.setMonth(monthsAgo.getMonth() - 12);
      defaultStart = monthsAgo.toISOString().split("T")[0]!;
    } else {
      const daysAgo = new Date(now);
      daysAgo.setDate(daysAgo.getDate() - 30);
      defaultStart = daysAgo.toISOString().split("T")[0]!;
    }

    const startDate = query.start_date || defaultStart;
    const endDate = query.end_date || defaultEnd;

    // Validate date range
    if (startDate > endDate) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "start_date must be before or equal to end_date",
        },
      };
    }

    if (period === "monthly") {
      const rows = await this.repository.getMonthlyStats(
        context,
        startDate,
        endDate,
        limit
      );

      const items: MonthlyUsageStats[] = rows.map((row) => ({
        period_start: String(row.periodStart),
        period_end: String(row.periodEnd),
        active_users: Number(row.activeUsers) || 0,
        total_api_requests: Number(row.totalApiRequests) || 0,
        avg_daily_api_requests: Number(row.avgDailyApiRequests) || 0,
        max_storage_bytes: Number(row.maxStorageBytes) || 0,
        avg_employee_count: Number(row.avgEmployeeCount) || 0,
        days_tracked: Number(row.daysTracked) || 0,
      }));

      return {
        success: true,
        data: {
          items,
          period: "monthly",
          total_items: items.length,
        },
      };
    }

    // Daily stats
    const rows = await this.repository.getDailyStats(
      context,
      startDate,
      endDate,
      limit
    );

    const items: UsageStatsRecord[] = rows.map((row) => ({
      id: row.id,
      tenant_id: row.tenantId,
      period_start: String(row.periodStart),
      period_end: String(row.periodEnd),
      active_users: Number(row.activeUsers) || 0,
      api_requests: Number(row.apiRequests) || 0,
      storage_bytes: Number(row.storageBytes) || 0,
      employee_count: Number(row.employeeCount) || 0,
      module_usage: row.moduleUsage || {},
      created_at: String(row.createdAt),
    }));

    return {
      success: true,
      data: {
        items,
        period: "daily",
        total_items: items.length,
      },
    };
  }

  /**
   * Calculate and store daily usage stats for a single tenant.
   * Called by the scheduler job for each active tenant.
   */
  async calculateDailyStats(
    context: TenantContext,
    date: string
  ): Promise<ServiceResult<UsageStatsRecord>> {
    const activeUsers = await this.repository.countActiveUsers(context, date);
    const employeeCount = await this.repository.countActiveEmployees(context);

    // API requests and storage_bytes are tracked externally (e.g., via Redis
    // counters or log aggregation). For now we store 0 and allow the scheduler
    // to pass in collected values when available.
    const stats = {
      tenantId: context.tenantId,
      periodStart: date,
      periodEnd: date,
      activeUsers,
      apiRequests: 0,
      storageBytes: 0,
      employeeCount,
      moduleUsage: {},
    };

    const row = await this.repository.upsertDailyStats(context, stats);

    return {
      success: true,
      data: {
        id: row.id,
        tenant_id: row.tenantId,
        period_start: String(row.periodStart),
        period_end: String(row.periodEnd),
        active_users: Number(row.activeUsers) || 0,
        api_requests: Number(row.apiRequests) || 0,
        storage_bytes: Number(row.storageBytes) || 0,
        employee_count: Number(row.employeeCount) || 0,
        module_usage: row.moduleUsage || {},
        created_at: String(row.createdAt),
      },
    };
  }

  /**
   * Calculate and store daily usage stats for a single tenant,
   * with externally-collected metrics (API requests, storage, module usage).
   */
  async calculateDailyStatsWithMetrics(
    context: TenantContext,
    date: string,
    metrics: {
      apiRequests?: number;
      storageBytes?: number;
      moduleUsage?: Record<string, number>;
    }
  ): Promise<ServiceResult<UsageStatsRecord>> {
    const activeUsers = await this.repository.countActiveUsers(context, date);
    const employeeCount = await this.repository.countActiveEmployees(context);

    const stats = {
      tenantId: context.tenantId,
      periodStart: date,
      periodEnd: date,
      activeUsers,
      apiRequests: metrics.apiRequests || 0,
      storageBytes: metrics.storageBytes || 0,
      employeeCount,
      moduleUsage: metrics.moduleUsage || {},
    };

    const row = await this.repository.upsertDailyStats(context, stats);

    return {
      success: true,
      data: {
        id: row.id,
        tenant_id: row.tenantId,
        period_start: String(row.periodStart),
        period_end: String(row.periodEnd),
        active_users: Number(row.activeUsers) || 0,
        api_requests: Number(row.apiRequests) || 0,
        storage_bytes: Number(row.storageBytes) || 0,
        employee_count: Number(row.employeeCount) || 0,
        module_usage: row.moduleUsage || {},
        created_at: String(row.createdAt),
      },
    };
  }
}
