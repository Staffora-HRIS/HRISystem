/**
 * Job Boards Module Schemas
 *
 * TypeBox schemas for job board posting API validation
 */

import { t } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  description: "UUID identifier",
});

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

// =============================================================================
// Job Board Enums
// =============================================================================

export const JobBoardNameSchema = t.Union([
  t.Literal("indeed"),
  t.Literal("linkedin"),
  t.Literal("reed"),
  t.Literal("totaljobs"),
]);

export const JobBoardPostingStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("posted"),
  t.Literal("expired"),
  t.Literal("removed"),
]);

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * POST /job-boards/postings - Publish a vacancy to a job board
 */
export const PublishPostingSchema = t.Object({
  vacancyId: UuidSchema,
  boardName: JobBoardNameSchema,
  applicationUrl: t.Optional(t.String({ format: "uri", maxLength: 2048 })),
  expiresAt: t.Optional(t.String({ format: "date-time", description: "When the posting should expire" })),
});

/**
 * GET /job-boards/postings - List postings with optional filters
 */
export const PostingFiltersSchema = t.Object({
  vacancyId: t.Optional(UuidSchema),
  boardName: t.Optional(JobBoardNameSchema),
  status: t.Optional(JobBoardPostingStatusSchema),
});

// =============================================================================
// Response Schemas
// =============================================================================

export const JobBoardPostingResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  vacancy_id: UuidSchema,
  board_name: t.String(),
  board_job_id: t.Union([t.String(), t.Null()]),
  posted_at: t.Union([t.String(), t.Null()]),
  expires_at: t.Union([t.String(), t.Null()]),
  status: t.String(),
  application_url: t.Union([t.String(), t.Null()]),
  created_by: t.Union([UuidSchema, t.Null()]),
  updated_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
  // Joined fields
  vacancy_title: t.Optional(t.String()),
  vacancy_code: t.Optional(t.String()),
});

export const PostingListResponseSchema = t.Object({
  postings: t.Array(JobBoardPostingResponseSchema),
  count: t.Number(),
  items: t.Array(JobBoardPostingResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});
