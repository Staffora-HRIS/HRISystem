/**
 * Data Archival Module - Service Layer
 *
 * Implements business logic for archiving old completed records and
 * restoring them when needed. Integrates with the data retention module
 * for compliance with UK GDPR storage limitation requirements.
 *
 * Default archival rules (seeded via seedDefaultRules):
 *   - Terminated employees: >7 years after termination_date
 *   - Closed cases: >5 years after closed_at
 *   - Completed leave requests: >3 years after created_at
 *   - Old time entries: >3 years after clock_in
 *   - Completed performance cycles: >3 years after created_at
 *   - Completed training enrollments: >3 years after created_at
 *   - Unsuccessful recruitment candidates: >2 years after created_at
 *   - Old audit logs: >7 years after created_at
 *   - Old documents: >7 years after created_at
 *
 * Key invariants:
 *   - A record can only be archived once (duplicate prevention via unique index)
 *   - Restored records are re-inserted into the source table atomically
 *   - Outbox events emitted for all mutations
 *   - All operations respect tenant RLS isolation
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  DataArchivalRepository,
  ArchivedRecordRow,
  ArchivalRuleRow,
} from "./repository";
import type {
  ServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  ArchivalSourceCategory,
  ArchivalStatus,
  ArchivedRecordResponse,
  ArchivalRunResult,
  ArchivalDashboardResponse,
  ArchivalRuleResponse,
  SeedDefaultsResponse,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type ArchivalDomainEventType =
  | "data.archival.record_archived"
  | "data.archival.record_restored"
  | "data.archival.run_completed"
  | "data.archival.defaults_seeded";

// =============================================================================
// UK Default Archival Rules
// =============================================================================

interface DefaultRule {
  sourceCategory: ArchivalSourceCategory;
  sourceTable: string;
  statusColumn: string | null;
  statusValue: string | null;
  dateColumn: string;
  retentionYears: number;
  description: string;
}

const UK_DEFAULT_ARCHIVAL_RULES: DefaultRule[] = [
  {
    sourceCategory: "employee_records",
    sourceTable: "employees",
    statusColumn: "status",
    statusValue: "terminated",
    dateColumn: "termination_date",
    retentionYears: 7,
    description:
      "Archive terminated employee records after 7 years. " +
      "Aligned with the Limitation Act 1980 (6 years) plus 1 year buffer.",
  },
  {
    sourceCategory: "cases",
    sourceTable: "cases",
    statusColumn: "status",
    statusValue: "closed",
    dateColumn: "closed_at",
    retentionYears: 5,
    description:
      "Archive closed HR case records after 5 years. " +
      "Covers the 3-year limitation period for personal injury claims " +
      "plus buffer for complex cases.",
  },
  {
    sourceCategory: "leave_records",
    sourceTable: "leave_requests",
    statusColumn: "status",
    statusValue: "approved",
    dateColumn: "created_at",
    retentionYears: 3,
    description:
      "Archive completed leave requests after 3 years. " +
      "Aligned with Working Time Regulations 1998 (2 years) plus buffer.",
  },
  {
    sourceCategory: "time_entries",
    sourceTable: "time_entries",
    statusColumn: null,
    statusValue: null,
    dateColumn: "clock_in",
    retentionYears: 3,
    description:
      "Archive time entries after 3 years. " +
      "Working Time Regulations 1998 require 2-year retention.",
  },
  {
    sourceCategory: "performance_reviews",
    sourceTable: "performance_cycles",
    statusColumn: "status",
    statusValue: "completed",
    dateColumn: "created_at",
    retentionYears: 3,
    description:
      "Archive completed performance review cycles after 3 years. " +
      "Retained under legitimate interest for talent management.",
  },
  {
    sourceCategory: "training_records",
    sourceTable: "course_enrollments",
    statusColumn: "status",
    statusValue: "completed",
    dateColumn: "created_at",
    retentionYears: 3,
    description:
      "Archive completed training enrollments after 3 years. " +
      "HSE/industry guidance recommends 3-year retention.",
  },
  {
    sourceCategory: "recruitment",
    sourceTable: "candidates",
    statusColumn: "status",
    statusValue: "rejected",
    dateColumn: "created_at",
    retentionYears: 2,
    description:
      "Archive unsuccessful candidate records after 2 years. " +
      "ICO guidance recommends 6 months; extended for Equality Act claims.",
  },
  {
    sourceCategory: "audit_logs",
    sourceTable: "audit_log",
    statusColumn: null,
    statusValue: null,
    dateColumn: "created_at",
    retentionYears: 7,
    description:
      "Archive audit log entries after 7 years. " +
      "Extended retention for legal proceedings coverage.",
  },
  {
    sourceCategory: "documents",
    sourceTable: "documents",
    statusColumn: null,
    statusValue: null,
    dateColumn: "created_at",
    retentionYears: 7,
    description:
      "Archive old documents after 7 years. " +
      "Aligned with the Limitation Act 1980 general period.",
  },
];

// Whitelist of allowed source tables for safety (prevents injection via table names)
const ALLOWED_SOURCE_TABLES = new Set(
  UK_DEFAULT_ARCHIVAL_RULES.map((r) => r.sourceTable)
);

// =============================================================================
// Service
// =============================================================================

export class DataArchivalService {
  constructor(
    private repository: DataArchivalRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateId: string,
    eventType: ArchivalDomainEventType,
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
        'archived_record',
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

  private formatArchivedRecord(
    row: ArchivedRecordRow
  ): ArchivedRecordResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      sourceTable: row.sourceTable,
      sourceId: row.sourceId,
      sourceCategory: row.sourceCategory,
      archivedData: row.archivedData,
      archivedAt:
        row.archivedAt instanceof Date
          ? row.archivedAt.toISOString()
          : String(row.archivedAt),
      archivedBy: row.archivedBy,
      retentionUntil:
        row.retentionUntil instanceof Date
          ? row.retentionUntil.toISOString()
          : row.retentionUntil
            ? String(row.retentionUntil)
            : null,
      restoreReason: row.restoreReason,
      restoredAt:
        row.restoredAt instanceof Date
          ? row.restoredAt.toISOString()
          : row.restoredAt
            ? String(row.restoredAt)
            : null,
      restoredBy: row.restoredBy,
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

  private formatRule(row: ArchivalRuleRow): ArchivalRuleResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      sourceCategory: row.sourceCategory,
      sourceTable: row.sourceTable,
      statusColumn: row.statusColumn,
      statusValue: row.statusValue,
      dateColumn: row.dateColumn,
      retentionYears: row.retentionYears,
      enabled: row.enabled,
      description: row.description,
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
  // Archive a Single Record (Manual)
  // ===========================================================================

  /**
   * Manually archive a specific record by source_table and source_id.
   * Fetches the record data, stores it in archived_records, then deletes
   * the source record.
   */
  async archiveRecord(
    ctx: TenantContext,
    data: {
      sourceTable: string;
      sourceId: string;
      sourceCategory: ArchivalSourceCategory;
      retentionUntil?: string;
    }
  ): Promise<ServiceResult<ArchivedRecordResponse>> {
    // Validate source table is allowed
    if (!ALLOWED_SOURCE_TABLES.has(data.sourceTable)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Source table '${data.sourceTable}' is not in the allowed archival whitelist`,
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      // Check if already archived
      const alreadyArchived = await this.repository.isRecordArchived(
        tx,
        data.sourceTable,
        data.sourceId
      );
      if (alreadyArchived) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: `Record ${data.sourceId} from ${data.sourceTable} is already archived`,
          },
        };
      }

      // Fetch the source record data
      const sourceData = await this.repository.fetchSourceRecord(
        tx,
        data.sourceTable,
        data.sourceId
      );
      if (!sourceData) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Record ${data.sourceId} not found in ${data.sourceTable}`,
          },
        };
      }

      // Parse retention_until if provided
      let retentionUntilDate: Date | null = null;
      if (data.retentionUntil) {
        retentionUntilDate = new Date(data.retentionUntil);
        if (isNaN(retentionUntilDate.getTime())) {
          return {
            success: false,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: "Invalid retention_until date format",
            },
          };
        }
      }

      const archiveId = crypto.randomUUID();

      // Create the archived record
      const archived = await this.repository.createArchivedRecord(tx, {
        id: archiveId,
        tenantId: ctx.tenantId,
        sourceTable: data.sourceTable,
        sourceId: data.sourceId,
        sourceCategory: data.sourceCategory,
        archivedData: sourceData,
        archivedBy: ctx.userId || null,
        retentionUntil: retentionUntilDate,
      });

      // Delete the source record
      const deleted = await this.repository.deleteSourceRecord(
        tx,
        data.sourceTable,
        data.sourceId
      );

      if (!deleted) {
        // If we cannot delete the source, this is not necessarily fatal
        // (the record may have foreign key constraints). Log but continue.
        console.warn(
          `[DataArchival] Could not delete source record ${data.sourceId} from ${data.sourceTable} - it may have FK constraints`
        );
      }

      // Emit domain event
      await this.emitEvent(tx, ctx, archiveId, "data.archival.record_archived", {
        archiveId,
        sourceTable: data.sourceTable,
        sourceId: data.sourceId,
        sourceCategory: data.sourceCategory,
      });

      return {
        success: true,
        data: this.formatArchivedRecord(archived),
      };
    });
  }

  // ===========================================================================
  // Restore from Archive
  // ===========================================================================

  /**
   * Restore an archived record back to its source table.
   * Re-inserts the data and marks the archive record as restored.
   */
  async restoreRecord(
    ctx: TenantContext,
    archiveId: string,
    reason: string
  ): Promise<
    ServiceResult<{
      success: true;
      message: string;
      archivedRecord: ArchivedRecordResponse;
    }>
  > {
    // Verify archive record exists
    const existing = await this.repository.getArchivedRecordById(
      ctx,
      archiveId
    );
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Archived record not found",
        },
      };
    }

    if (existing.status !== "archived") {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Cannot restore a record with status '${existing.status}'. Only 'archived' records can be restored.`,
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      // Attempt to re-insert the source record
      const reinserted = await this.repository.reinsertSourceRecord(
        tx,
        existing.sourceTable,
        existing.archivedData as Record<string, unknown>
      );

      if (!reinserted) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message:
              "Failed to restore record to source table. The table schema may have changed " +
              "since the record was archived, or the record ID may conflict with an existing row.",
          },
        };
      }

      // Mark as restored
      const restored = await this.repository.restoreArchivedRecord(
        tx,
        archiveId,
        ctx.userId!,
        reason
      );

      if (!restored) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Failed to update archive record status",
          },
        };
      }

      // Emit domain event
      await this.emitEvent(
        tx,
        ctx,
        archiveId,
        "data.archival.record_restored",
        {
          archiveId,
          sourceTable: existing.sourceTable,
          sourceId: existing.sourceId,
          sourceCategory: existing.sourceCategory,
          reason,
        }
      );

      return {
        success: true,
        data: {
          success: true as const,
          message: `Record ${existing.sourceId} restored to ${existing.sourceTable} successfully`,
          archivedRecord: this.formatArchivedRecord(restored),
        },
      };
    });
  }

  // ===========================================================================
  // Get Archived Record
  // ===========================================================================

  async getArchivedRecord(
    ctx: TenantContext,
    recordId: string
  ): Promise<ServiceResult<ArchivedRecordResponse>> {
    const row = await this.repository.getArchivedRecordById(ctx, recordId);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Archived record not found",
        },
      };
    }

    return {
      success: true,
      data: this.formatArchivedRecord(row),
    };
  }

  // ===========================================================================
  // List Archived Records
  // ===========================================================================

  async listArchivedRecords(
    ctx: TenantContext,
    filters: {
      sourceTable?: string;
      sourceCategory?: ArchivalSourceCategory;
      status?: ArchivalStatus;
    },
    pagination: PaginationQuery
  ): Promise<{
    items: ArchivedRecordResponse[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const result = await this.repository.listArchivedRecords(
      ctx,
      filters,
      pagination
    );

    return {
      items: result.items.map((row) => this.formatArchivedRecord(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Run Automated Archival
  // ===========================================================================

  /**
   * Execute an automated archival run.
   * Reads enabled archival rules, finds eligible records, and archives them.
   * Supports dry_run mode that counts but does not archive.
   */
  async runArchival(
    ctx: TenantContext,
    options: {
      sourceCategory?: ArchivalSourceCategory;
      dryRun?: boolean;
    }
  ): Promise<ServiceResult<ArchivalRunResult>> {
    const dryRun = options.dryRun ?? false;

    return await this.db.withTransaction(ctx, async (tx) => {
      // Get enabled rules
      const rules = await this.repository.getEnabledRules(
        tx,
        options.sourceCategory
      );

      if (rules.length === 0) {
        return {
          success: true,
          data: {
            category: options.sourceCategory || null,
            recordsArchived: 0,
            recordsSkipped: 0,
            dryRun,
            details: [],
          },
        };
      }

      let totalArchived = 0;
      let totalSkipped = 0;
      const details: Array<{
        sourceTable: string;
        sourceCategory: string;
        count: number;
      }> = [];

      for (const rule of rules) {
        // Calculate cutoff date based on retention years
        const cutoffDate = new Date();
        cutoffDate.setFullYear(
          cutoffDate.getFullYear() - rule.retentionYears
        );

        // Find eligible records
        const eligible = await this.repository.findEligibleRecords(
          tx,
          rule,
          cutoffDate,
          500 // Batch limit
        );

        if (eligible.length === 0) {
          continue;
        }

        if (dryRun) {
          details.push({
            sourceTable: rule.sourceTable,
            sourceCategory: rule.sourceCategory,
            count: eligible.length,
          });
          totalArchived += eligible.length;
          continue;
        }

        // Archive each eligible record
        let archivedCount = 0;
        for (const record of eligible) {
          try {
            // Fetch source data
            const sourceData = await this.repository.fetchSourceRecord(
              tx,
              rule.sourceTable,
              record.id
            );
            if (!sourceData) {
              totalSkipped++;
              continue;
            }

            // Check if already archived
            const alreadyArchived = await this.repository.isRecordArchived(
              tx,
              rule.sourceTable,
              record.id
            );
            if (alreadyArchived) {
              totalSkipped++;
              continue;
            }

            const archiveId = crypto.randomUUID();

            // Calculate retention_until based on rule
            const retentionUntil = new Date();
            retentionUntil.setFullYear(
              retentionUntil.getFullYear() + rule.retentionYears
            );

            // Create archive record
            await this.repository.createArchivedRecord(tx, {
              id: archiveId,
              tenantId: ctx.tenantId,
              sourceTable: rule.sourceTable,
              sourceId: record.id,
              sourceCategory: rule.sourceCategory,
              archivedData: sourceData,
              archivedBy: ctx.userId || null,
              retentionUntil,
            });

            // Delete source record
            await this.repository.deleteSourceRecord(
              tx,
              rule.sourceTable,
              record.id
            );

            archivedCount++;
          } catch (err) {
            console.warn(
              `[DataArchival] Failed to archive record ${record.id} from ${rule.sourceTable}:`,
              err
            );
            totalSkipped++;
          }
        }

        if (archivedCount > 0) {
          details.push({
            sourceTable: rule.sourceTable,
            sourceCategory: rule.sourceCategory,
            count: archivedCount,
          });
        }

        totalArchived += archivedCount;
      }

      // Emit domain event for the run (if not dry run and something was archived)
      if (!dryRun && totalArchived > 0) {
        await this.emitEvent(
          tx,
          ctx,
          ctx.tenantId,
          "data.archival.run_completed",
          {
            category: options.sourceCategory || "all",
            recordsArchived: totalArchived,
            recordsSkipped: totalSkipped,
            details,
            dryRun,
          }
        );
      }

      return {
        success: true,
        data: {
          category: options.sourceCategory || null,
          recordsArchived: totalArchived,
          recordsSkipped: totalSkipped,
          dryRun,
          details,
        },
      };
    });
  }

  // ===========================================================================
  // Dashboard
  // ===========================================================================

  async getDashboard(
    ctx: TenantContext
  ): Promise<ServiceResult<ArchivalDashboardResponse>> {
    const [stats, categoryStats, recentActivity] = await Promise.all([
      this.repository.getStats(ctx),
      this.repository.getCategoryStats(ctx),
      this.repository.getRecentArchivalActivity(ctx),
    ]);

    return {
      success: true,
      data: {
        totalArchived: stats.totalArchived,
        totalRestored: stats.totalRestored,
        byCategory: categoryStats.map((c) => ({
          sourceCategory: c.sourceCategory,
          archivedCount: c.archivedCount,
          restoredCount: c.restoredCount,
        })),
        recentArchivalRuns: recentActivity.map((a) => ({
          category: a.sourceCategory,
          recordsArchived: a.recordsArchived,
          archivedAt:
            a.archivedAt instanceof Date
              ? a.archivedAt.toISOString()
              : String(a.archivedAt),
        })),
      },
    };
  }

  // ===========================================================================
  // List Rules
  // ===========================================================================

  async listRules(
    ctx: TenantContext,
    pagination: PaginationQuery
  ): Promise<{
    items: ArchivalRuleResponse[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const result = await this.repository.listRules(ctx, pagination);

    return {
      items: result.items.map((row) => this.formatRule(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Seed Default Archival Rules
  // ===========================================================================

  /**
   * Seed UK-compliant default archival rules.
   * Skips categories that already have an enabled rule.
   */
  async seedDefaultRules(
    ctx: TenantContext
  ): Promise<ServiceResult<SeedDefaultsResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const created: ArchivalRuleRow[] = [];
      let skipped = 0;

      for (const defaults of UK_DEFAULT_ARCHIVAL_RULES) {
        const exists = await this.repository.ruleExistsForCategory(
          tx,
          defaults.sourceCategory
        );
        if (exists) {
          skipped++;
          continue;
        }

        const ruleId = crypto.randomUUID();
        const row = await this.repository.createRule(tx, {
          id: ruleId,
          tenantId: ctx.tenantId,
          sourceCategory: defaults.sourceCategory,
          sourceTable: defaults.sourceTable,
          statusColumn: defaults.statusColumn,
          statusValue: defaults.statusValue,
          dateColumn: defaults.dateColumn,
          retentionYears: defaults.retentionYears,
          enabled: true,
          description: defaults.description,
        });
        created.push(row);
      }

      if (created.length > 0) {
        await this.emitEvent(
          tx,
          ctx,
          ctx.tenantId,
          "data.archival.defaults_seeded",
          {
            rulesCreated: created.length,
            rulesSkipped: skipped,
            categories: created.map((r) => r.sourceCategory),
          }
        );
      }

      return {
        success: true,
        data: {
          created: created.length,
          skipped,
          rules: created.map((row) => this.formatRule(row)),
        },
      };
    });
  }
}
