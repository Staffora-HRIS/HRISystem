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
