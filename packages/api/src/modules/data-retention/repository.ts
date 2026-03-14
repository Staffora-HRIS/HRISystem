/**
 * Data Retention Module - Repository Layer
 *
 * Provides data access methods for UK GDPR Article 5(1)(e) storage limitation.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  RetentionDataCategory,
  RetentionLegalBasis,
  RetentionPolicyStatus,
  RetentionReviewStatus,
  RetentionExceptionReason,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

export interface RetentionPolicyRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  dataCategory: RetentionDataCategory;
  retentionPeriodMonths: number;
  legalBasis: RetentionLegalBasis;
  autoPurgeEnabled: boolean;
  notificationBeforePurgeDays: number;
  status: RetentionPolicyStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetentionReviewRow extends Row {
  id: string;
  tenantId: string;
  policyId: string;
  reviewDate: Date;
  reviewerId: string | null;
  recordsReviewed: number;
  recordsPurged: number;
  recordsRetainedReason: string | null;
  status: RetentionReviewStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetentionExceptionRow extends Row {
  id: string;
  tenantId: string;
  policyId: string;
  recordType: string;
  recordId: string;
  reason: RetentionExceptionReason;
  exceptionUntil: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PolicyDashboardRow extends Row {
  id: string;
  name: string;
  dataCategory: string;
  retentionPeriodMonths: number;
  status: string;
  autoPurgeEnabled: boolean;
  lastReviewDate: Date | null;
  exceptionCount: number;
}

// =============================================================================
// Repository
// =============================================================================

export class DataRetentionRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Retention Policies
  // ===========================================================================

  /**
   * Create a new retention policy
   */
  async createPolicy(
    tx: TransactionSql,
    data: {
      id: string;
      tenantId: string;
      name: string;
      description?: string;
      dataCategory: RetentionDataCategory;
      retentionPeriodMonths: number;
      legalBasis: RetentionLegalBasis;
      autoPurgeEnabled: boolean;
      notificationBeforePurgeDays: number;
    }
  ): Promise<RetentionPolicyRow> {
    const [row] = await tx<RetentionPolicyRow[]>`
      INSERT INTO retention_policies (
        id, tenant_id, name, description,
        data_category, retention_period_months, legal_basis,
        auto_purge_enabled, notification_before_purge_days
      )
      VALUES (
        ${data.id}::uuid,
        ${data.tenantId}::uuid,
        ${data.name},
        ${data.description || null},
        ${data.dataCategory}::app.retention_data_category,
        ${data.retentionPeriodMonths},
        ${data.legalBasis}::app.retention_legal_basis,
        ${data.autoPurgeEnabled},
        ${data.notificationBeforePurgeDays}
      )
      RETURNING
        id, tenant_id, name, description,
        data_category, retention_period_months, legal_basis,
        auto_purge_enabled, notification_before_purge_days,
        status, created_at, updated_at
    `;
    return row;
  }

  /**
   * Get a retention policy by ID
   */
  async getPolicyById(
    ctx: TenantContext,
    policyId: string
  ): Promise<RetentionPolicyRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<RetentionPolicyRow[]>`
        SELECT
          id, tenant_id, name, description,
          data_category, retention_period_months, legal_basis,
          auto_purge_enabled, notification_before_purge_days,
          status, created_at, updated_at
        FROM retention_policies
        WHERE id = ${policyId}::uuid
      `;
    });
    return rows[0] || null;
  }

  /**
   * List retention policies with cursor-based pagination
   */
  async listPolicies(
    ctx: TenantContext,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<RetentionPolicyRow>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor;

    return await this.db.withTransaction(ctx, async (tx) => {
      let rows: RetentionPolicyRow[];

      if (cursor) {
        rows = await tx<RetentionPolicyRow[]>`
          SELECT
            id, tenant_id, name, description,
            data_category, retention_period_months, legal_basis,
            auto_purge_enabled, notification_before_purge_days,
            status, created_at, updated_at
          FROM retention_policies
          WHERE created_at < (
            SELECT created_at FROM retention_policies WHERE id = ${cursor}::uuid
          )
          ORDER BY created_at DESC
          LIMIT ${limit + 1}
        `;
      } else {
        rows = await tx<RetentionPolicyRow[]>`
          SELECT
            id, tenant_id, name, description,
            data_category, retention_period_months, legal_basis,
            auto_purge_enabled, notification_before_purge_days,
            status, created_at, updated_at
          FROM retention_policies
          ORDER BY created_at DESC
          LIMIT ${limit + 1}
        `;
      }

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Update a retention policy
   */
  async updatePolicy(
    tx: TransactionSql,
    policyId: string,
    updates: {
      name?: string;
      description?: string | null;
      retentionPeriodMonths?: number;
      legalBasis?: RetentionLegalBasis;
      autoPurgeEnabled?: boolean;
      notificationBeforePurgeDays?: number;
      status?: RetentionPolicyStatus;
    }
  ): Promise<RetentionPolicyRow | null> {
    const [row] = await tx<RetentionPolicyRow[]>`
      UPDATE retention_policies SET
        name = COALESCE(${updates.name ?? null}, name),
        description = CASE
          WHEN ${updates.description !== undefined} THEN ${updates.description ?? null}
          ELSE description
        END,
        retention_period_months = COALESCE(${updates.retentionPeriodMonths ?? null}::int, retention_period_months),
        legal_basis = COALESCE(${updates.legalBasis ?? null}::app.retention_legal_basis, legal_basis),
        auto_purge_enabled = COALESCE(${updates.autoPurgeEnabled ?? null}::bool, auto_purge_enabled),
        notification_before_purge_days = COALESCE(${updates.notificationBeforePurgeDays ?? null}::int, notification_before_purge_days),
        status = COALESCE(${updates.status ?? null}::app.retention_policy_status, status)
      WHERE id = ${policyId}::uuid
      RETURNING
        id, tenant_id, name, description,
        data_category, retention_period_months, legal_basis,
        auto_purge_enabled, notification_before_purge_days,
        status, created_at, updated_at
    `;
    return row || null;
  }

  /**
   * Check if a policy already exists for a data category in this tenant
   */
  async policyExistsForCategory(
    tx: TransactionSql,
    dataCategory: RetentionDataCategory,
    excludeId?: string
  ): Promise<boolean> {
    const [row] = await tx<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM retention_policies
        WHERE data_category = ${dataCategory}::app.retention_data_category
          ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
      ) as exists
    `;
    return row?.exists === true;
  }

  // ===========================================================================
  // Retention Reviews
  // ===========================================================================

  /**
   * Create a retention review
   */
  async createReview(
    tx: TransactionSql,
    data: {
      id: string;
      tenantId: string;
      policyId: string;
      reviewerId: string | null;
      recordsReviewed: number;
      recordsPurged: number;
      recordsRetainedReason?: string;
      status: RetentionReviewStatus;
    }
  ): Promise<RetentionReviewRow> {
    const [row] = await tx<RetentionReviewRow[]>`
      INSERT INTO retention_reviews (
        id, tenant_id, policy_id, reviewer_id,
        records_reviewed, records_purged, records_retained_reason,
        status
      )
      VALUES (
        ${data.id}::uuid,
        ${data.tenantId}::uuid,
        ${data.policyId}::uuid,
        ${data.reviewerId}::uuid,
        ${data.recordsReviewed},
        ${data.recordsPurged},
        ${data.recordsRetainedReason || null},
        ${data.status}::app.retention_review_status
      )
      RETURNING
        id, tenant_id, policy_id, review_date,
        reviewer_id, records_reviewed, records_purged,
        records_retained_reason, status,
        created_at, updated_at
    `;
    return row;
  }

  /**
   * Update review status
   */
  async updateReviewStatus(
    tx: TransactionSql,
    reviewId: string,
    status: RetentionReviewStatus,
    recordsReviewed?: number,
    recordsPurged?: number,
    recordsRetainedReason?: string
  ): Promise<RetentionReviewRow | null> {
    const [row] = await tx<RetentionReviewRow[]>`
      UPDATE retention_reviews SET
        status = ${status}::app.retention_review_status,
        records_reviewed = COALESCE(${recordsReviewed ?? null}::int, records_reviewed),
        records_purged = COALESCE(${recordsPurged ?? null}::int, records_purged),
        records_retained_reason = COALESCE(${recordsRetainedReason ?? null}, records_retained_reason)
      WHERE id = ${reviewId}::uuid
      RETURNING
        id, tenant_id, policy_id, review_date,
        reviewer_id, records_reviewed, records_purged,
        records_retained_reason, status,
        created_at, updated_at
    `;
    return row || null;
  }

  /**
   * List retention reviews with optional policy filter
   */
  async listReviews(
    ctx: TenantContext,
    policyId: string | undefined,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<RetentionReviewRow>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor;

    return await this.db.withTransaction(ctx, async (tx) => {
      let rows: RetentionReviewRow[];

      if (cursor && policyId) {
        rows = await tx<RetentionReviewRow[]>`
          SELECT
            id, tenant_id, policy_id, review_date,
            reviewer_id, records_reviewed, records_purged,
            records_retained_reason, status,
            created_at, updated_at
          FROM retention_reviews
          WHERE policy_id = ${policyId}::uuid
            AND created_at < (SELECT created_at FROM retention_reviews WHERE id = ${cursor}::uuid)
          ORDER BY created_at DESC
          LIMIT ${limit + 1}
        `;
      } else if (cursor) {
        rows = await tx<RetentionReviewRow[]>`
          SELECT
            id, tenant_id, policy_id, review_date,
            reviewer_id, records_reviewed, records_purged,
            records_retained_reason, status,
            created_at, updated_at
          FROM retention_reviews
          WHERE created_at < (SELECT created_at FROM retention_reviews WHERE id = ${cursor}::uuid)
          ORDER BY created_at DESC
          LIMIT ${limit + 1}
        `;
      } else if (policyId) {
        rows = await tx<RetentionReviewRow[]>`
          SELECT
            id, tenant_id, policy_id, review_date,
            reviewer_id, records_reviewed, records_purged,
            records_retained_reason, status,
            created_at, updated_at
          FROM retention_reviews
          WHERE policy_id = ${policyId}::uuid
          ORDER BY created_at DESC
          LIMIT ${limit + 1}
        `;
      } else {
        rows = await tx<RetentionReviewRow[]>`
          SELECT
            id, tenant_id, policy_id, review_date,
            reviewer_id, records_reviewed, records_purged,
            records_retained_reason, status,
            created_at, updated_at
          FROM retention_reviews
          ORDER BY created_at DESC
          LIMIT ${limit + 1}
        `;
      }

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Get the most recent completed review for a policy
   */
  async getLastCompletedReview(
    ctx: TenantContext,
    policyId: string
  ): Promise<RetentionReviewRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<RetentionReviewRow[]>`
        SELECT
          id, tenant_id, policy_id, review_date,
          reviewer_id, records_reviewed, records_purged,
          records_retained_reason, status,
          created_at, updated_at
        FROM retention_reviews
        WHERE policy_id = ${policyId}::uuid
          AND status = 'completed'
        ORDER BY review_date DESC
        LIMIT 1
      `;
    });
    return rows[0] || null;
  }

  // ===========================================================================
  // Retention Exceptions
  // ===========================================================================

  /**
   * Create a retention exception
   */
  async createException(
    tx: TransactionSql,
    data: {
      id: string;
      tenantId: string;
      policyId: string;
      recordType: string;
      recordId: string;
      reason: RetentionExceptionReason;
      exceptionUntil: Date | null;
      createdBy: string;
    }
  ): Promise<RetentionExceptionRow> {
    const [row] = await tx<RetentionExceptionRow[]>`
      INSERT INTO retention_exceptions (
        id, tenant_id, policy_id,
        record_type, record_id, reason,
        exception_until, created_by
      )
      VALUES (
        ${data.id}::uuid,
        ${data.tenantId}::uuid,
        ${data.policyId}::uuid,
        ${data.recordType},
        ${data.recordId}::uuid,
        ${data.reason}::app.retention_exception_reason,
        ${data.exceptionUntil},
        ${data.createdBy}::uuid
      )
      RETURNING
        id, tenant_id, policy_id,
        record_type, record_id, reason,
        exception_until, created_by,
        created_at, updated_at
    `;
    return row;
  }

  /**
   * Get a retention exception by ID
   */
  async getExceptionById(
    ctx: TenantContext,
    exceptionId: string
  ): Promise<RetentionExceptionRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<RetentionExceptionRow[]>`
        SELECT
          id, tenant_id, policy_id,
          record_type, record_id, reason,
          exception_until, created_by,
          created_at, updated_at
        FROM retention_exceptions
        WHERE id = ${exceptionId}::uuid
      `;
    });
    return rows[0] || null;
  }

  /**
   * Delete a retention exception
   */
  async deleteException(
    tx: TransactionSql,
    exceptionId: string
  ): Promise<boolean> {
    const [row] = await tx<{ id: string }[]>`
      DELETE FROM retention_exceptions
      WHERE id = ${exceptionId}::uuid
      RETURNING id
    `;
    return !!row;
  }

  /**
   * Get active exception count for a policy
   */
  async getActiveExceptionCount(
    ctx: TenantContext,
    policyId: string
  ): Promise<number> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM retention_exceptions
        WHERE policy_id = ${policyId}::uuid
          AND (exception_until IS NULL OR exception_until > now())
      `;
    });
    return rows[0]?.count ?? 0;
  }

  /**
   * Get all active exception record IDs for a policy
   */
  async getActiveExceptionRecordIds(
    tx: TransactionSql,
    policyId: string
  ): Promise<string[]> {
    const rows = await tx<{ recordId: string }[]>`
      SELECT record_id
      FROM retention_exceptions
      WHERE policy_id = ${policyId}::uuid
        AND (exception_until IS NULL OR exception_until > now())
    `;
    return rows.map((r) => r.recordId);
  }

  // ===========================================================================
  // Dashboard Aggregates
  // ===========================================================================

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(
    ctx: TenantContext
  ): Promise<{
    totalPolicies: number;
    activePolicies: number;
    totalExceptions: number;
    activeExceptions: number;
    upcomingReviews: number;
    lastPurgeDate: Date | null;
  }> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const [policyStats] = await tx<
        { total: number; active: number }[]
      >`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active
        FROM retention_policies
      `;

      const [exceptionStats] = await tx<
        { total: number; active: number }[]
      >`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE exception_until IS NULL OR exception_until > now()
          )::int AS active
        FROM retention_exceptions
      `;

      // Upcoming reviews: policies that have auto_purge_enabled and
      // haven't been reviewed in the last 30 days
      const [upcomingStats] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM retention_policies p
        WHERE p.status = 'active'
          AND p.auto_purge_enabled = true
          AND NOT EXISTS (
            SELECT 1 FROM retention_reviews r
            WHERE r.policy_id = p.id
              AND r.status = 'completed'
              AND r.review_date > now() - interval '30 days'
          )
      `;

      const [lastPurge] = await tx<{ lastDate: Date | null }[]>`
        SELECT MAX(review_date) AS last_date
        FROM retention_reviews
        WHERE status = 'completed'
          AND records_purged > 0
      `;

      return {
        totalPolicies: policyStats?.total ?? 0,
        activePolicies: policyStats?.active ?? 0,
        totalExceptions: exceptionStats?.total ?? 0,
        activeExceptions: exceptionStats?.active ?? 0,
        upcomingReviews: upcomingStats?.count ?? 0,
        lastPurgeDate: lastPurge?.lastDate ?? null,
      };
    });
  }

  /**
   * Get per-policy summary for dashboard
   */
  async getPolicySummary(
    ctx: TenantContext
  ): Promise<PolicyDashboardRow[]> {
    return await this.db.withTransaction(ctx, async (tx) => {
      return await tx<PolicyDashboardRow[]>`
        SELECT
          p.id,
          p.name,
          p.data_category,
          p.retention_period_months,
          p.status,
          p.auto_purge_enabled,
          (
            SELECT MAX(r.review_date)
            FROM retention_reviews r
            WHERE r.policy_id = p.id AND r.status = 'completed'
          ) AS last_review_date,
          (
            SELECT COUNT(*)::int
            FROM retention_exceptions e
            WHERE e.policy_id = p.id
              AND (e.exception_until IS NULL OR e.exception_until > now())
          ) AS exception_count
        FROM retention_policies p
        ORDER BY p.name ASC
      `;
    });
  }

  // ===========================================================================
  // Expired Record Identification
  // ===========================================================================

  /**
   * Count expired records for a given data category.
   *
   * Each data category maps to a specific table and date column.
   * Uses explicit per-category queries to avoid dynamic SQL and
   * ensure type safety with postgres.js tagged templates.
   *
   * Returns 0 if the target table does not exist or has no matching records.
   */
  async countExpiredRecords(
    tx: TransactionSql,
    dataCategory: RetentionDataCategory,
    cutoffDate: Date
  ): Promise<number> {
    try {
      let rows: { count: number }[];

      switch (dataCategory) {
        case "employee_records":
          rows = await tx<{ count: number }[]>`
            SELECT COUNT(*)::int AS count
            FROM employees
            WHERE termination_date IS NOT NULL
              AND termination_date < ${cutoffDate}
          `;
          break;
        case "payroll":
        case "tax":
          rows = await tx<{ count: number }[]>`
            SELECT COUNT(*)::int AS count
            FROM compensation_history
            WHERE effective_from < ${cutoffDate}
          `;
          break;
        case "time_entries":
          rows = await tx<{ count: number }[]>`
            SELECT COUNT(*)::int AS count
            FROM time_entries
            WHERE clock_in < ${cutoffDate}
          `;
          break;
        case "leave_records":
          rows = await tx<{ count: number }[]>`
            SELECT COUNT(*)::int AS count
            FROM leave_requests
            WHERE created_at < ${cutoffDate}
          `;
          break;
        case "performance_reviews":
          rows = await tx<{ count: number }[]>`
            SELECT COUNT(*)::int AS count
            FROM performance_cycles
            WHERE created_at < ${cutoffDate}
          `;
          break;
        case "training_records":
          rows = await tx<{ count: number }[]>`
            SELECT COUNT(*)::int AS count
            FROM course_enrollments
            WHERE created_at < ${cutoffDate}
          `;
          break;
        case "recruitment":
          rows = await tx<{ count: number }[]>`
            SELECT COUNT(*)::int AS count
            FROM candidates
            WHERE created_at < ${cutoffDate}
          `;
          break;
        case "cases":
          rows = await tx<{ count: number }[]>`
            SELECT COUNT(*)::int AS count
            FROM cases
            WHERE created_at < ${cutoffDate}
          `;
          break;
        case "audit_logs":
          rows = await tx<{ count: number }[]>`
            SELECT COUNT(*)::int AS count
            FROM audit_log
            WHERE created_at < ${cutoffDate}
          `;
          break;
        case "documents":
          rows = await tx<{ count: number }[]>`
            SELECT COUNT(*)::int AS count
            FROM documents
            WHERE created_at < ${cutoffDate}
          `;
          break;
        case "medical":
          rows = await tx<{ count: number }[]>`
            SELECT COUNT(*)::int AS count
            FROM ssp_records
            WHERE created_at < ${cutoffDate}
          `;
          break;
        default:
          return 0;
      }

      return rows[0]?.count ?? 0;
    } catch {
      // Table might not exist yet — return 0
      return 0;
    }
  }

  /**
   * Count records that have active exceptions for a policy
   */
  async countExceptedRecords(
    tx: TransactionSql,
    policyId: string
  ): Promise<number> {
    const [row] = await tx<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM retention_exceptions
      WHERE policy_id = ${policyId}::uuid
        AND (exception_until IS NULL OR exception_until > now())
    `;
    return row?.count ?? 0;
  }
}
