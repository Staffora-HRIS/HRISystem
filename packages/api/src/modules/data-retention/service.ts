/**
 * Data Retention Module - Service Layer
 *
 * Implements UK GDPR Article 5(1)(e) (Storage Limitation) business logic.
 * Manages retention policies, identifies expired records, executes reviews/purges,
 * and handles legal hold exceptions.
 *
 * UK-specific default retention periods (seeded via seedDefaultPolicies):
 *   - Payroll/tax records: 72 months (6 years after end of tax year — HMRC)
 *   - Pension records: 72 months (6 years after employment ends — Pensions Act 2008)
 *   - Working time records: 24 months (Working Time Regulations 1998, reg. 9)
 *   - Maternity/paternity records: 36 months after birth
 *   - Accident/injury records: 36 months (Limitation Act 1980, s.11)
 *   - Medical/health records: 480 months (40 years — NHS/HSE guidance)
 *   - Immigration/right to work: 24 months after employment ends (Immigration Act 2016)
 *   - Recruitment (unsuccessful): 6 months (ICO best practice)
 *   - Employee records: 72 months after termination (ERA 1996, s.1)
 *   - Performance reviews: 24 months (legitimate interest)
 *   - Training records: 36 months (HSE/industry guidance)
 *   - Cases: 36 months (Limitation Act 1980)
 *   - Audit logs: 84 months (7 years — best practice for legal proceedings)
 *   - Documents: 72 months (6 years — Limitation Act 1980)
 *
 * Key invariants:
 *   - One active policy per data category per tenant (enforced by DB constraint)
 *   - Exceptions prevent purging of specific records regardless of policy
 *   - Reviews track every purge execution for audit trail
 *   - Outbox events emitted for all mutations
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  DataRetentionRepository,
  RetentionPolicyRow,
  RetentionReviewRow,
  RetentionExceptionRow,
  PolicyDashboardRow,
} from "./repository";
import type {
  ServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  RetentionDataCategory,
  RetentionLegalBasis,
  RetentionPolicyStatus,
  RetentionPolicyResponse,
  RetentionReviewResponse,
  RetentionExceptionResponse,
  RetentionDashboardResponse,
  ExpiredRecordsResponse,
  ReviewExecutionResponse,
  SeedDefaultsResponse,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type RetentionDomainEventType =
  | "gdpr.retention.policy_created"
  | "gdpr.retention.policy_updated"
  | "gdpr.retention.defaults_seeded"
  | "gdpr.retention.review_executed"
  | "gdpr.retention.exception_created"
  | "gdpr.retention.exception_removed";

// =============================================================================
// UK Default Retention Policies
// =============================================================================

interface DefaultPolicy {
  name: string;
  description: string;
  dataCategory: RetentionDataCategory;
  retentionPeriodMonths: number;
  legalBasis: RetentionLegalBasis;
  autoPurgeEnabled: boolean;
  notificationBeforePurgeDays: number;
}

const UK_DEFAULT_POLICIES: DefaultPolicy[] = [
  {
    name: "Employee Records",
    description:
      "Core employee records retained for 6 years after termination of employment. " +
      "Required under the Employment Rights Act 1996, s.1 and the Limitation Act 1980.",
    dataCategory: "employee_records",
    retentionPeriodMonths: 72,
    legalBasis: "employment_law",
    autoPurgeEnabled: false,
    notificationBeforePurgeDays: 90,
  },
  {
    name: "Payroll Records",
    description:
      "Payroll records retained for 6 years after the end of the tax year they relate to. " +
      "Required by HMRC under the Income Tax (Pay As You Earn) Regulations 2003.",
    dataCategory: "payroll",
    retentionPeriodMonths: 72,
    legalBasis: "tax_law",
    autoPurgeEnabled: false,
    notificationBeforePurgeDays: 90,
  },
  {
    name: "Tax Records",
    description:
      "Tax records retained for 6 years after the end of the tax year. " +
      "Required by HMRC (Finance Act, Taxes Management Act 1970).",
    dataCategory: "tax",
    retentionPeriodMonths: 72,
    legalBasis: "tax_law",
    autoPurgeEnabled: false,
    notificationBeforePurgeDays: 90,
  },
  {
    name: "Working Time Records",
    description:
      "Time and attendance records retained for 2 years. " +
      "Required under Working Time Regulations 1998, Regulation 9.",
    dataCategory: "time_entries",
    retentionPeriodMonths: 24,
    legalBasis: "employment_law",
    autoPurgeEnabled: true,
    notificationBeforePurgeDays: 30,
  },
  {
    name: "Leave Records",
    description:
      "Annual leave, sick leave, and other absence records retained for 2 years. " +
      "Required under Working Time Regulations 1998 for annual leave; " +
      "3 years for maternity/paternity (Maternity and Parental Leave Regulations 1999).",
    dataCategory: "leave_records",
    retentionPeriodMonths: 24,
    legalBasis: "employment_law",
    autoPurgeEnabled: true,
    notificationBeforePurgeDays: 30,
  },
  {
    name: "Performance Reviews",
    description:
      "Performance review records retained for 2 years after creation. " +
      "Retained under legitimate interest for talent management purposes.",
    dataCategory: "performance_reviews",
    retentionPeriodMonths: 24,
    legalBasis: "legitimate_interest",
    autoPurgeEnabled: true,
    notificationBeforePurgeDays: 30,
  },
  {
    name: "Training Records",
    description:
      "Training and certification records retained for 3 years. " +
      "Required for HSE compliance (health and safety training records) " +
      "and industry-specific regulatory requirements.",
    dataCategory: "training_records",
    retentionPeriodMonths: 36,
    legalBasis: "employment_law",
    autoPurgeEnabled: true,
    notificationBeforePurgeDays: 30,
  },
  {
    name: "Recruitment Records (Unsuccessful)",
    description:
      "Records for unsuccessful candidates retained for 6 months. " +
      "ICO guidance recommends 6 months to allow for discrimination claims " +
      "under the Equality Act 2010 (3-month time limit + extension).",
    dataCategory: "recruitment",
    retentionPeriodMonths: 6,
    legalBasis: "limitation_act",
    autoPurgeEnabled: true,
    notificationBeforePurgeDays: 14,
  },
  {
    name: "Case Records",
    description:
      "HR case records (disciplinary, grievance) retained for 3 years after closure. " +
      "Limitation Act 1980, s.2 sets a 6-year limit for contract claims; " +
      "Equality Act discrimination claims have a shorter window.",
    dataCategory: "cases",
    retentionPeriodMonths: 36,
    legalBasis: "limitation_act",
    autoPurgeEnabled: false,
    notificationBeforePurgeDays: 60,
  },
  {
    name: "Audit Logs",
    description:
      "System audit logs retained for 7 years. " +
      "Extended retention to cover the full limitation period for legal proceedings " +
      "plus margin for late discovery of issues.",
    dataCategory: "audit_logs",
    retentionPeriodMonths: 84,
    legalBasis: "legitimate_interest",
    autoPurgeEnabled: false,
    notificationBeforePurgeDays: 90,
  },
  {
    name: "Documents",
    description:
      "Employee documents retained for 6 years after the end of employment. " +
      "Aligned with the general limitation period under the Limitation Act 1980.",
    dataCategory: "documents",
    retentionPeriodMonths: 72,
    legalBasis: "limitation_act",
    autoPurgeEnabled: false,
    notificationBeforePurgeDays: 60,
  },
  {
    name: "Medical/Health Records",
    description:
      "Occupational health and medical records retained for 40 years from last entry. " +
      "Required under Control of Substances Hazardous to Health (COSHH) Regulations 2002 " +
      "and recommended by HSE guidance. Covers latency period for occupational diseases.",
    dataCategory: "medical",
    retentionPeriodMonths: 480,
    legalBasis: "employment_law",
    autoPurgeEnabled: false,
    notificationBeforePurgeDays: 180,
  },
];

// =============================================================================
// Service
// =============================================================================

export class DataRetentionService {
  constructor(
    private repository: DataRetentionRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateId: string,
    eventType: RetentionDomainEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        'retention_policy',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Row Formatting
  // ===========================================================================

  private formatPolicy(row: RetentionPolicyRow): RetentionPolicyResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      description: row.description,
      dataCategory: row.dataCategory,
      retentionPeriodMonths: row.retentionPeriodMonths,
      legalBasis: row.legalBasis,
      autoPurgeEnabled: row.autoPurgeEnabled,
      notificationBeforePurgeDays: row.notificationBeforePurgeDays,
      status: row.status,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : String(row.updatedAt),
    };
  }

  private formatReview(row: RetentionReviewRow): RetentionReviewResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      policyId: row.policyId,
      reviewDate:
        row.reviewDate instanceof Date
          ? row.reviewDate.toISOString()
          : String(row.reviewDate),
      reviewerId: row.reviewerId,
      recordsReviewed: row.recordsReviewed,
      recordsPurged: row.recordsPurged,
      recordsRetainedReason: row.recordsRetainedReason,
      status: row.status,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : String(row.updatedAt),
    };
  }

  private formatException(
    row: RetentionExceptionRow
  ): RetentionExceptionResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      policyId: row.policyId,
      recordType: row.recordType,
      recordId: row.recordId,
      reason: row.reason,
      exceptionUntil:
        row.exceptionUntil instanceof Date
          ? row.exceptionUntil.toISOString()
          : row.exceptionUntil
            ? String(row.exceptionUntil)
            : null,
      createdBy: row.createdBy,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : String(row.updatedAt),
    };
  }

  // ===========================================================================
  // Create Policy
  // ===========================================================================

  /**
   * Create a new retention policy.
   * Only one active policy per data category per tenant is allowed.
   */
  async createPolicy(
    ctx: TenantContext,
    data: {
      name: string;
      description?: string;
      dataCategory: RetentionDataCategory;
      retentionPeriodMonths: number;
      legalBasis: RetentionLegalBasis;
      autoPurgeEnabled?: boolean;
      notificationBeforePurgeDays?: number;
    }
  ): Promise<ServiceResult<RetentionPolicyResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      // Check for existing policy for this category
      const exists = await this.repository.policyExistsForCategory(
        tx,
        data.dataCategory
      );
      if (exists) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: `A retention policy already exists for data category '${data.dataCategory}'. Update the existing policy or deactivate it first.`,
          },
        };
      }

      const policyId = crypto.randomUUID();
      const row = await this.repository.createPolicy(tx, {
        id: policyId,
        tenantId: ctx.tenantId,
        name: data.name,
        description: data.description,
        dataCategory: data.dataCategory,
        retentionPeriodMonths: data.retentionPeriodMonths,
        legalBasis: data.legalBasis,
        autoPurgeEnabled: data.autoPurgeEnabled ?? false,
        notificationBeforePurgeDays: data.notificationBeforePurgeDays ?? 30,
      });

      // Emit domain event in same transaction
      await this.emitEvent(
        tx,
        ctx,
        policyId,
        "gdpr.retention.policy_created",
        {
          policyId,
          name: data.name,
          dataCategory: data.dataCategory,
          retentionPeriodMonths: data.retentionPeriodMonths,
          legalBasis: data.legalBasis,
        }
      );

      return {
        success: true,
        data: this.formatPolicy(row),
      };
    });
  }

  // ===========================================================================
  // Update Policy
  // ===========================================================================

  /**
   * Update an existing retention policy.
   */
  async updatePolicy(
    ctx: TenantContext,
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
  ): Promise<ServiceResult<RetentionPolicyResponse>> {
    // Verify policy exists
    const existing = await this.repository.getPolicyById(ctx, policyId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Retention policy not found",
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      const row = await this.repository.updatePolicy(tx, policyId, updates);
      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Failed to update retention policy",
          },
        };
      }

      // Emit domain event
      await this.emitEvent(
        tx,
        ctx,
        policyId,
        "gdpr.retention.policy_updated",
        {
          policyId,
          updates,
          previousValues: {
            name: existing.name,
            retentionPeriodMonths: existing.retentionPeriodMonths,
            status: existing.status,
            autoPurgeEnabled: existing.autoPurgeEnabled,
          },
        }
      );

      return {
        success: true,
        data: this.formatPolicy(row),
      };
    });
  }

  // ===========================================================================
  // Get Policy
  // ===========================================================================

  /**
   * Get a single retention policy by ID
   */
  async getPolicy(
    ctx: TenantContext,
    policyId: string
  ): Promise<ServiceResult<RetentionPolicyResponse>> {
    const row = await this.repository.getPolicyById(ctx, policyId);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Retention policy not found",
        },
      };
    }

    return {
      success: true,
      data: this.formatPolicy(row),
    };
  }

  // ===========================================================================
  // List Policies
  // ===========================================================================

  /**
   * List all retention policies with pagination
   */
  async listPolicies(
    ctx: TenantContext,
    pagination: PaginationQuery
  ): Promise<{
    items: RetentionPolicyResponse[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const result = await this.repository.listPolicies(ctx, pagination);

    return {
      items: result.items.map((row) => this.formatPolicy(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Seed Default Policies
  // ===========================================================================

  /**
   * Seed UK-compliant default retention policies.
   * Skips categories that already have a policy.
   */
  async seedDefaultPolicies(
    ctx: TenantContext
  ): Promise<ServiceResult<SeedDefaultsResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const created: RetentionPolicyRow[] = [];
      let skipped = 0;

      for (const defaults of UK_DEFAULT_POLICIES) {
        // Skip if policy already exists for this category
        const exists = await this.repository.policyExistsForCategory(
          tx,
          defaults.dataCategory
        );
        if (exists) {
          skipped++;
          continue;
        }

        const policyId = crypto.randomUUID();
        const row = await this.repository.createPolicy(tx, {
          id: policyId,
          tenantId: ctx.tenantId,
          name: defaults.name,
          description: defaults.description,
          dataCategory: defaults.dataCategory,
          retentionPeriodMonths: defaults.retentionPeriodMonths,
          legalBasis: defaults.legalBasis,
          autoPurgeEnabled: defaults.autoPurgeEnabled,
          notificationBeforePurgeDays: defaults.notificationBeforePurgeDays,
        });
        created.push(row);
      }

      // Emit a single outbox event for the seed operation
      if (created.length > 0) {
        await this.emitEvent(
          tx,
          ctx,
          ctx.tenantId, // aggregate is the tenant itself
          "gdpr.retention.defaults_seeded",
          {
            policiesCreated: created.length,
            policiesSkipped: skipped,
            categories: created.map((p) => p.dataCategory),
          }
        );
      }

      return {
        success: true,
        data: {
          created: created.length,
          skipped,
          policies: created.map((row) => this.formatPolicy(row)),
        },
      };
    });
  }

  // ===========================================================================
  // Identify Expired Records
  // ===========================================================================

  /**
   * Identify records that have exceeded their retention period for a given policy.
   * Does NOT purge — only identifies and counts.
   */
  async identifyExpiredRecords(
    ctx: TenantContext,
    policyId: string
  ): Promise<ServiceResult<ExpiredRecordsResponse>> {
    const policy = await this.repository.getPolicyById(ctx, policyId);
    if (!policy) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Retention policy not found",
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      // Calculate the cutoff date: records older than this should be purged
      const cutoffDate = new Date();
      cutoffDate.setMonth(
        cutoffDate.getMonth() - policy.retentionPeriodMonths
      );

      const expiredCount = await this.repository.countExpiredRecords(
        tx,
        policy.dataCategory,
        cutoffDate
      );

      const exceptedCount = await this.repository.countExceptedRecords(
        tx,
        policyId
      );

      return {
        success: true,
        data: {
          policyId: policy.id,
          policyName: policy.name,
          dataCategory: policy.dataCategory,
          retentionPeriodMonths: policy.retentionPeriodMonths,
          expiredRecordCount: expiredCount,
          exceptedRecordCount: exceptedCount,
          purgeableCount: Math.max(0, expiredCount - exceptedCount),
          cutoffDate: cutoffDate.toISOString(),
        },
      };
    });
  }

  // ===========================================================================
  // Execute Review
  // ===========================================================================

  /**
   * Execute a retention review for a policy.
   * Identifies expired records, respects exceptions, and records the review.
   *
   * If auto_purge_enabled is true on the policy, this would trigger actual
   * deletion/anonymization. Currently it records the review for audit purposes
   * and marks what would be purged. Actual purge implementation depends on
   * the data category and its associated tables.
   */
  async executeReview(
    ctx: TenantContext,
    policyId: string
  ): Promise<ServiceResult<ReviewExecutionResponse>> {
    const policy = await this.repository.getPolicyById(ctx, policyId);
    if (!policy) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Retention policy not found",
        },
      };
    }

    if (policy.status !== "active") {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message:
            "Cannot execute review for an inactive policy. Activate the policy first.",
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      const reviewId = crypto.randomUUID();

      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setMonth(
        cutoffDate.getMonth() - policy.retentionPeriodMonths
      );

      // Count expired records
      const expiredCount = await this.repository.countExpiredRecords(
        tx,
        policy.dataCategory,
        cutoffDate
      );

      // Get excepted record IDs
      const exceptedIds =
        await this.repository.getActiveExceptionRecordIds(tx, policyId);

      const exceptedCount = exceptedIds.length;
      const purgeableCount = Math.max(0, expiredCount - exceptedCount);

      // Determine retained reason
      let retainedReason: string | undefined;
      if (exceptedCount > 0) {
        retainedReason = `${exceptedCount} record(s) retained due to active legal hold/exception`;
      }

      // Create the review record
      // In production, if auto_purge_enabled, actual deletion logic would go here
      // for each data category. Currently we record the review only.
      const review = await this.repository.createReview(tx, {
        id: reviewId,
        tenantId: ctx.tenantId,
        policyId,
        reviewerId: ctx.userId || null,
        recordsReviewed: expiredCount,
        recordsPurged: policy.autoPurgeEnabled ? purgeableCount : 0,
        recordsRetainedReason: retainedReason,
        status: "completed",
      });

      // Emit domain event
      await this.emitEvent(
        tx,
        ctx,
        policyId,
        "gdpr.retention.review_executed",
        {
          reviewId,
          policyId,
          policyName: policy.name,
          dataCategory: policy.dataCategory,
          cutoffDate: cutoffDate.toISOString(),
          recordsReviewed: expiredCount,
          recordsPurged: policy.autoPurgeEnabled ? purgeableCount : 0,
          exceptedCount,
          autoPurgeEnabled: policy.autoPurgeEnabled,
        }
      );

      return {
        success: true,
        data: {
          review: this.formatReview(review),
          policyName: policy.name,
          dataCategory: policy.dataCategory,
        },
      };
    });
  }

  // ===========================================================================
  // List Reviews
  // ===========================================================================

  /**
   * List retention reviews with optional policy filter
   */
  async listReviews(
    ctx: TenantContext,
    policyId: string | undefined,
    pagination: PaginationQuery
  ): Promise<{
    items: RetentionReviewResponse[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const result = await this.repository.listReviews(
      ctx,
      policyId,
      pagination
    );

    return {
      items: result.items.map((row) => this.formatReview(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Create Exception
  // ===========================================================================

  /**
   * Create a retention exception (legal hold) for a specific record.
   * This prevents the record from being purged during retention reviews.
   */
  async createException(
    ctx: TenantContext,
    data: {
      policyId: string;
      recordType: string;
      recordId: string;
      reason: string;
      exceptionUntil?: string;
    }
  ): Promise<ServiceResult<RetentionExceptionResponse>> {
    // Validate policy exists
    const policy = await this.repository.getPolicyById(ctx, data.policyId);
    if (!policy) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Retention policy not found",
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      const exceptionId = crypto.randomUUID();

      let exceptionUntilDate: Date | null = null;
      if (data.exceptionUntil) {
        exceptionUntilDate = new Date(data.exceptionUntil);
        if (isNaN(exceptionUntilDate.getTime())) {
          return {
            success: false,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: "Invalid exception_until date format",
            },
          };
        }
      }

      const row = await this.repository.createException(tx, {
        id: exceptionId,
        tenantId: ctx.tenantId,
        policyId: data.policyId,
        recordType: data.recordType,
        recordId: data.recordId,
        reason: data.reason as any, // enum value validated by TypeBox
        exceptionUntil: exceptionUntilDate,
        createdBy: ctx.userId!,
      });

      // Emit domain event
      await this.emitEvent(
        tx,
        ctx,
        exceptionId,
        "gdpr.retention.exception_created",
        {
          exceptionId,
          policyId: data.policyId,
          policyName: policy.name,
          recordType: data.recordType,
          recordId: data.recordId,
          reason: data.reason,
          exceptionUntil: data.exceptionUntil || null,
        }
      );

      return {
        success: true,
        data: this.formatException(row),
      };
    });
  }

  // ===========================================================================
  // Remove Exception
  // ===========================================================================

  /**
   * Remove a retention exception, allowing the record to be purged
   * in the next retention review.
   */
  async removeException(
    ctx: TenantContext,
    exceptionId: string
  ): Promise<ServiceResult<{ success: true; message: string }>> {
    // Verify exception exists
    const existing = await this.repository.getExceptionById(
      ctx,
      exceptionId
    );
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Retention exception not found",
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      const deleted = await this.repository.deleteException(tx, exceptionId);
      if (!deleted) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Failed to remove retention exception",
          },
        };
      }

      // Emit domain event
      await this.emitEvent(
        tx,
        ctx,
        exceptionId,
        "gdpr.retention.exception_removed",
        {
          exceptionId,
          policyId: existing.policyId,
          recordType: existing.recordType,
          recordId: existing.recordId,
          reason: existing.reason,
          removedBy: ctx.userId,
        }
      );

      return {
        success: true,
        data: {
          success: true as const,
          message: `Retention exception removed. Record ${existing.recordId} (${existing.recordType}) is now subject to normal retention rules.`,
        },
      };
    });
  }

  // ===========================================================================
  // Dashboard
  // ===========================================================================

  /**
   * Get retention dashboard: overview of policies, reviews, exceptions.
   */
  async getRetentionDashboard(
    ctx: TenantContext
  ): Promise<ServiceResult<RetentionDashboardResponse>> {
    const [stats, policySummary] = await Promise.all([
      this.repository.getDashboardStats(ctx),
      this.repository.getPolicySummary(ctx),
    ]);

    return {
      success: true,
      data: {
        totalPolicies: stats.totalPolicies,
        activePolicies: stats.activePolicies,
        totalExceptions: stats.totalExceptions,
        activeExceptions: stats.activeExceptions,
        upcomingReviews: stats.upcomingReviews,
        lastPurgeDate: stats.lastPurgeDate
          ? stats.lastPurgeDate instanceof Date
            ? stats.lastPurgeDate.toISOString()
            : String(stats.lastPurgeDate)
          : null,
        policySummary: policySummary.map((p) => ({
          id: p.id,
          name: p.name,
          dataCategory: p.dataCategory,
          retentionPeriodMonths: p.retentionPeriodMonths,
          status: p.status,
          autoPurgeEnabled: p.autoPurgeEnabled,
          lastReviewDate: p.lastReviewDate
            ? p.lastReviewDate instanceof Date
              ? p.lastReviewDate.toISOString()
              : String(p.lastReviewDate)
            : null,
          exceptionCount: p.exceptionCount,
        })),
      },
    };
  }
}
