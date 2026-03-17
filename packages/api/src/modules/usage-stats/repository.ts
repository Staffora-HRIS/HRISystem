/**
 * Usage Stats Module - Repository Layer
 *
 * Handles database operations for tenant usage analytics.
 * All queries respect RLS via DatabaseClient.withTransaction.
 */

import type { DatabaseClient, TenantContext } from "../../plugins/db";

// =============================================================================
// Types
// =============================================================================

export interface UsageStatsRow {
  id: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  activeUsers: number;
  apiRequests: number;
  storageBytes: number | string;
  employeeCount: number;
  moduleUsage: Record<string, number>;
  createdAt: string;
}

export interface MonthlyAggregateRow {
  periodStart: string;
  periodEnd: string;
  activeUsers: number;
  totalApiRequests: number;
  avgDailyApiRequests: number;
  maxStorageBytes: number | string;
  avgEmployeeCount: number;
  daysTracked: number;
}

export interface DailyStatsInput {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  activeUsers: number;
  apiRequests: number;
  storageBytes: number;
  employeeCount: number;
  moduleUsage: Record<string, number>;
}

// =============================================================================
// Repository
// =============================================================================

export class UsageStatsRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Get daily usage stats for a tenant within a date range.
   * Results are ordered by period_start descending (newest first).
   */
  async getDailyStats(
    context: TenantContext,
    startDate: string,
    endDate: string,
    limit: number = 30
  ): Promise<UsageStatsRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      const rows = await tx<UsageStatsRow[]>`
        SELECT
          id,
          tenant_id,
          period_start,
          period_end,
          active_users,
          api_requests,
          storage_bytes,
          employee_count,
          module_usage,
          created_at
        FROM tenant_usage_stats
        WHERE period_start >= ${startDate}
          AND period_end <= ${endDate}
        ORDER BY period_start DESC
        LIMIT ${limit}
      `;
      return rows;
    });
  }

  /**
   * Get monthly aggregated usage stats for a tenant.
   * Aggregates daily rows into monthly buckets using SQL window functions.
   */
  async getMonthlyStats(
    context: TenantContext,
    startDate: string,
    endDate: string,
    limit: number = 12
  ): Promise<MonthlyAggregateRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      const rows = await tx<MonthlyAggregateRow[]>`
        SELECT
          date_trunc('month', period_start)::date AS period_start,
          (date_trunc('month', period_start) + interval '1 month' - interval '1 day')::date AS period_end,
          MAX(active_users) AS active_users,
          SUM(api_requests)::integer AS total_api_requests,
          ROUND(AVG(api_requests))::integer AS avg_daily_api_requests,
          MAX(storage_bytes) AS max_storage_bytes,
          ROUND(AVG(employee_count))::integer AS avg_employee_count,
          COUNT(*)::integer AS days_tracked
        FROM tenant_usage_stats
        WHERE period_start >= ${startDate}
          AND period_end <= ${endDate}
        GROUP BY date_trunc('month', period_start)
        ORDER BY date_trunc('month', period_start) DESC
        LIMIT ${limit}
      `;
      return rows;
    });
  }

  /**
   * Upsert a daily usage stats record.
   * Uses the unique constraint (tenant_id, period_start, period_end) to
   * update if a record already exists for the same day.
   */
  async upsertDailyStats(
    context: TenantContext,
    stats: DailyStatsInput
  ): Promise<UsageStatsRow> {
    return this.db.withTransaction(context, async (tx) => {
      const [row] = await tx<UsageStatsRow[]>`
        INSERT INTO tenant_usage_stats (
          id,
          tenant_id,
          period_start,
          period_end,
          active_users,
          api_requests,
          storage_bytes,
          employee_count,
          module_usage,
          created_at
        ) VALUES (
          gen_random_uuid(),
          ${stats.tenantId},
          ${stats.periodStart},
          ${stats.periodEnd},
          ${stats.activeUsers},
          ${stats.apiRequests},
          ${stats.storageBytes},
          ${stats.employeeCount},
          ${JSON.stringify(stats.moduleUsage)}::jsonb,
          now()
        )
        ON CONFLICT (tenant_id, period_start, period_end)
        DO UPDATE SET
          active_users   = EXCLUDED.active_users,
          api_requests   = EXCLUDED.api_requests,
          storage_bytes  = EXCLUDED.storage_bytes,
          employee_count = EXCLUDED.employee_count,
          module_usage   = EXCLUDED.module_usage
        RETURNING *
      `;
      return row!;
    });
  }

  /**
   * Count active users for a tenant on a given day.
   * An "active user" is one who has an active session in Better Auth.
   */
  async countActiveUsers(
    context: TenantContext,
    date: string
  ): Promise<number> {
    return this.db.withTransaction(context, async (tx) => {
      const [row] = await tx<{ count: number }[]>`
        SELECT COUNT(DISTINCT u.id)::integer AS count
        FROM users u
        JOIN "session" s ON s."userId" = u.id::text
        WHERE u.tenant_id = ${context.tenantId}
          AND s."expiresAt" >= ${date}::date
          AND s."createdAt" <= (${date}::date + interval '1 day')
      `;
      return Number(row?.count ?? 0);
    });
  }

  /**
   * Count active employees for a tenant.
   */
  async countActiveEmployees(
    context: TenantContext
  ): Promise<number> {
    return this.db.withTransaction(context, async (tx) => {
      const [row] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::integer AS count
        FROM employees
        WHERE status IN ('active', 'on_leave')
      `;
      return Number(row?.count ?? 0);
    });
  }
}
