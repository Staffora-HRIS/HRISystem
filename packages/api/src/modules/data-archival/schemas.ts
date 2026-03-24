/**
 * Data Archival Module - TypeBox Schemas
 *
 * Defines validation schemas for the data archival system endpoints.
 * Supports archiving old completed records (terminated employees >7 years,
 * closed cases >5 years, etc.) and restoring from archive.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Source categories for archivable data
 */
export const ArchivalSourceCategorySchema = t.Union([
  t.Literal("employee_records"),
  t.Literal("payroll"),
  t.Literal("tax"),
  t.Literal("time_entries"),
  t.Literal("leave_records"),
  t.Literal("performance_reviews"),
  t.Literal("training_records"),
  t.Literal("recruitment"),
  t.Literal("cases"),
  t.Literal("audit_logs"),
  t.Literal("documents"),
  t.Literal("medical"),
]);

export type ArchivalSourceCategory = Static<
  typeof ArchivalSourceCategorySchema
>;

/**
 * Archival record status
 */
export const ArchivalStatusSchema = t.Union([
  t.Literal("archived"),
  t.Literal("restored"),
]);

export type ArchivalStatus = Static<typeof ArchivalStatusSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern:
    "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(
    t.String({ minLength: 1, maxLength: 100 })
  ),
});

export type OptionalIdempotencyHeader = Static<
  typeof OptionalIdempotencyHeaderSchema
>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Filters for listing archived records
 */
export const ArchivedRecordsQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
  source_table: t.Optional(t.String({ minLength: 1 })),
  source_category: t.Optional(ArchivalSourceCategorySchema),
  status: t.Optional(ArchivalStatusSchema),
});

export type ArchivedRecordsQuery = Static<typeof ArchivedRecordsQuerySchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Manual archive request: archive a specific record by source_table + source_id
 */
export const ArchiveRecordSchema = t.Object({
  source_table: t.String({ minLength: 1, maxLength: 200 }),
  source_id: UuidSchema,
  source_category: ArchivalSourceCategorySchema,
  retention_until: t.Optional(t.String({ format: "date-time" })),
});

export type ArchiveRecordRequest = Static<typeof ArchiveRecordSchema>;

/**
 * Restore from archive request
 */
export const RestoreRecordSchema = t.Object({
  reason: t.String({ minLength: 1, maxLength: 2000 }),
});

export type RestoreRecordRequest = Static<typeof RestoreRecordSchema>;

/**
 * Trigger automated archival run for a specific category
 */
export const RunArchivalSchema = t.Object({
  source_category: t.Optional(ArchivalSourceCategorySchema),
  dry_run: t.Optional(t.Boolean({ default: false })),
});

export type RunArchivalRequest = Static<typeof RunArchivalSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Archived record response
 */
export const ArchivedRecordResponseSchema = t.Object({
  id: t.String(),
  tenantId: t.String(),
  sourceTable: t.String(),
  sourceId: t.String(),
  sourceCategory: ArchivalSourceCategorySchema,
  archivedData: t.Unknown(),
  archivedAt: t.String(),
  archivedBy: t.Union([t.String(), t.Null()]),
  retentionUntil: t.Union([t.String(), t.Null()]),
  restoreReason: t.Union([t.String(), t.Null()]),
  restoredAt: t.Union([t.String(), t.Null()]),
  restoredBy: t.Union([t.String(), t.Null()]),
  status: ArchivalStatusSchema,
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type ArchivedRecordResponse = Static<
  typeof ArchivedRecordResponseSchema
>;

/**
 * List of archived records with cursor pagination
 */
export const ArchivedRecordListResponseSchema = t.Object({
  items: t.Array(ArchivedRecordResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type ArchivedRecordListResponse = Static<
  typeof ArchivedRecordListResponseSchema
>;

/**
 * Archival run result
 */
export const ArchivalRunResultSchema = t.Object({
  category: t.Union([t.String(), t.Null()]),
  recordsArchived: t.Number(),
  recordsSkipped: t.Number(),
  dryRun: t.Boolean(),
  details: t.Array(
    t.Object({
      sourceTable: t.String(),
      sourceCategory: t.String(),
      count: t.Number(),
    })
  ),
});

export type ArchivalRunResult = Static<typeof ArchivalRunResultSchema>;

/**
 * Restore result
 */
export const RestoreResultSchema = t.Object({
  success: t.Literal(true),
  message: t.String(),
  archivedRecord: ArchivedRecordResponseSchema,
});

export type RestoreResult = Static<typeof RestoreResultSchema>;

/**
 * Dashboard / statistics
 */
export const ArchivalDashboardResponseSchema = t.Object({
  totalArchived: t.Number(),
  totalRestored: t.Number(),
  byCategory: t.Array(
    t.Object({
      sourceCategory: t.String(),
      archivedCount: t.Number(),
      restoredCount: t.Number(),
    })
  ),
  recentArchivalRuns: t.Array(
    t.Object({
      category: t.String(),
      recordsArchived: t.Number(),
      archivedAt: t.String(),
    })
  ),
});

export type ArchivalDashboardResponse = Static<
  typeof ArchivalDashboardResponseSchema
>;

/**
 * Archival rule response
 */
export const ArchivalRuleResponseSchema = t.Object({
  id: t.String(),
  tenantId: t.String(),
  sourceCategory: ArchivalSourceCategorySchema,
  sourceTable: t.String(),
  statusColumn: t.Union([t.String(), t.Null()]),
  statusValue: t.Union([t.String(), t.Null()]),
  dateColumn: t.String(),
  retentionYears: t.Number(),
  enabled: t.Boolean(),
  description: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type ArchivalRuleResponse = Static<typeof ArchivalRuleResponseSchema>;

/**
 * List of archival rules
 */
export const ArchivalRuleListResponseSchema = t.Object({
  items: t.Array(ArchivalRuleResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type ArchivalRuleListResponse = Static<
  typeof ArchivalRuleListResponseSchema
>;

/**
 * Seed defaults result
 */
export const SeedDefaultsResponseSchema = t.Object({
  created: t.Number(),
  skipped: t.Number(),
  rules: t.Array(ArchivalRuleResponseSchema),
});

export type SeedDefaultsResponse = Static<typeof SeedDefaultsResponseSchema>;

/**
 * Delete success
 */
export const DeleteSuccessResponseSchema = t.Object({
  success: t.Literal(true),
  message: t.String(),
});

export type DeleteSuccessResponse = Static<typeof DeleteSuccessResponseSchema>;

// =============================================================================
// Archive Policy Schemas (TODO-225)
// =============================================================================

/**
 * POST /data-archival/policies - Create an archive policy
 */
export const CreateArchivePolicySchema = t.Object({
  source_table: t.String({ minLength: 1, maxLength: 200, description: "Database table name to archive from" }),
  archive_after_days: t.Number({ minimum: 1, description: "Number of days after which records are eligible for archival" }),
  status_filter: t.Optional(t.String({ maxLength: 200, description: "Only archive records matching this status value" })),
  enabled: t.Optional(t.Boolean({ default: true, description: "Whether the policy is active" })),
  description: t.Optional(t.String({ maxLength: 2000, description: "Human-readable policy description" })),
});
export type CreateArchivePolicy = Static<typeof CreateArchivePolicySchema>;

/**
 * PATCH /data-archival/policies/:id - Update an archive policy
 */
export const UpdateArchivePolicySchema = t.Partial(
  t.Object({
    source_table: t.String({ minLength: 1, maxLength: 200, description: "Database table name to archive from" }),
    archive_after_days: t.Number({ minimum: 1, description: "Number of days after which records are eligible for archival" }),
    status_filter: t.Union([t.String({ maxLength: 200 }), t.Null()]),
    enabled: t.Boolean({ description: "Whether the policy is active" }),
    description: t.Union([t.String({ maxLength: 2000 }), t.Null()]),
  })
);
export type UpdateArchivePolicy = Static<typeof UpdateArchivePolicySchema>;

/**
 * Archive policy response
 */
export const ArchivePolicyResponseSchema = t.Object({
  id: t.String(),
  tenantId: t.String(),
  sourceTable: t.String(),
  archiveAfterDays: t.Number(),
  statusFilter: t.Union([t.String(), t.Null()]),
  enabled: t.Boolean(),
  description: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});
export type ArchivePolicyResponse = Static<typeof ArchivePolicyResponseSchema>;

/**
 * List of archive policies with cursor pagination
 */
export const ArchivePolicyListResponseSchema = t.Object({
  items: t.Array(ArchivePolicyResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});
export type ArchivePolicyListResponse = Static<typeof ArchivePolicyListResponseSchema>;

// =============================================================================
// Archive Log Schemas (TODO-225)
// =============================================================================

/**
 * Archive log entry response
 */
export const ArchiveLogEntryResponseSchema = t.Object({
  id: t.String(),
  tenantId: t.String(),
  policyId: t.Union([t.String(), t.Null()]),
  sourceTable: t.String(),
  sourceId: t.String(),
  action: t.String(),
  details: t.Union([t.Unknown(), t.Null()]),
  executedBy: t.Union([t.String(), t.Null()]),
  executedAt: t.String(),
  createdAt: t.String(),
});
export type ArchiveLogEntryResponse = Static<typeof ArchiveLogEntryResponseSchema>;

/**
 * List of archive log entries with cursor pagination
 */
export const ArchiveLogListResponseSchema = t.Object({
  items: t.Array(ArchiveLogEntryResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});
export type ArchiveLogListResponse = Static<typeof ArchiveLogListResponseSchema>;

/**
 * GET /data-archival/log - Query filters
 */
export const ArchiveLogQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
  policy_id: t.Optional(UuidSchema),
  source_table: t.Optional(t.String({ minLength: 1 })),
});
export type ArchiveLogQuery = Static<typeof ArchiveLogQuerySchema>;

// =============================================================================
// Policy-Based Archival Run Schemas (TODO-225)
// =============================================================================

/**
 * POST /data-archival/archival/run - Trigger policy-based archival
 */
export const RunPolicyArchivalSchema = t.Object({
  policy_id: t.Optional(UuidSchema),
  dry_run: t.Optional(t.Boolean({ default: false })),
});
export type RunPolicyArchivalRequest = Static<typeof RunPolicyArchivalSchema>;

/**
 * Policy archival run result
 */
export const PolicyArchivalRunResultSchema = t.Object({
  policyId: t.Union([t.String(), t.Null()]),
  recordsArchived: t.Number(),
  recordsSkipped: t.Number(),
  dryRun: t.Boolean(),
  details: t.Array(
    t.Object({
      sourceTable: t.String(),
      count: t.Number(),
    })
  ),
});
export type PolicyArchivalRunResult = Static<typeof PolicyArchivalRunResultSchema>;

// =============================================================================
// Policy-Based Restore Schemas (TODO-225)
// =============================================================================

/**
 * POST /data-archival/archival/:id/restore - Restore from archive
 */
export const RestoreFromArchiveSchema = t.Object({
  source_table: t.String({ minLength: 1, maxLength: 200 }),
  source_id: UuidSchema,
  reason: t.String({ minLength: 1, maxLength: 2000, description: "Reason for restoring the archived record" }),
});
export type RestoreFromArchiveRequest = Static<typeof RestoreFromArchiveSchema>;

/**
 * Policy restore result
 */
export const PolicyRestoreResultSchema = t.Object({
  success: t.Literal(true),
  message: t.String(),
  sourceTable: t.String(),
  sourceId: t.String(),
  restoredAt: t.String(),
});
export type PolicyRestoreResult = Static<typeof PolicyRestoreResultSchema>;
