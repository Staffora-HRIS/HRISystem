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

export const JobIdParamsSchema = t.Object({
  jobId: UuidSchema,
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
  t.Literal("cwjobs"),
]);

export const JobBoardPostingStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("posted"),
  t.Literal("expired"),
  t.Literal("withdrawn"),
  t.Literal("removed"),
]);

/**
 * Provider enum - all supported UK job board providers.
 * Used for integration configuration and query filters.
 */
export const JobBoardProviderSchema = t.Union([
  t.Literal("indeed"),
  t.Literal("linkedin"),
  t.Literal("reed"),
  t.Literal("totaljobs"),
  t.Literal("cwjobs"),
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
 * POST /job-boards/integrations - Create a new job board integration
 */
export const CreateIntegrationSchema = t.Object({
  provider: JobBoardProviderSchema,
  config: t.Record(t.String(), t.Unknown(), {
    description: "Provider-specific configuration (API keys, account IDs, etc.)",
  }),
  enabled: t.Optional(t.Boolean({ default: true, description: "Whether the integration is active" })),
  displayName: t.Optional(t.String({ maxLength: 255, description: "Human-readable label for this integration" })),
});

/**
 * PATCH /job-boards/integrations/:id - Update an existing integration
 */
export const UpdateIntegrationSchema = t.Partial(
  t.Object({
    config: t.Record(t.String(), t.Unknown(), {
      description: "Provider-specific configuration (API keys, account IDs, etc.)",
    }),
    enabled: t.Boolean({ description: "Whether the integration is active" }),
    displayName: t.Union([t.String({ maxLength: 255 }), t.Null()], {
      description: "Human-readable label for this integration, or null to clear",
    }),
  })
);

/**
 * POST /job-boards/post/:jobId - Post a job to multiple boards at once
 */
export const PostToMultipleBoardsSchema = t.Object({
  boards: t.Array(
    t.Object({
      provider: JobBoardProviderSchema,
      integrationId: t.Optional(UuidSchema),
      applicationUrl: t.Optional(t.String({ format: "uri", maxLength: 2048 })),
      expiresAt: t.Optional(t.String({ format: "date-time", description: "When the posting should expire" })),
    }),
    { minItems: 1, description: "List of boards to post to" }
  ),
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

/**
 * Job board integration response (config values are redacted by the service layer)
 */
export const JobBoardIntegrationResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  provider: t.String({ description: "Job board provider name" }),
  config: t.Record(t.String(), t.Unknown(), {
    description: "Provider configuration (values redacted in API responses)",
  }),
  enabled: t.Boolean(),
  display_name: t.Union([t.String(), t.Null()]),
  created_by: t.Union([UuidSchema, t.Null()]),
  updated_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

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

/**
 * Multi-board posting result
 */
export const MultiPostResponseSchema = t.Object({
  results: t.Array(
    t.Object({
      provider: t.String(),
      success: t.Boolean(),
      posting: t.Optional(JobBoardPostingResponseSchema),
      error: t.Optional(t.String()),
    })
  ),
  successCount: t.Number(),
  failureCount: t.Number(),
});

export const PostingListResponseSchema = t.Object({
  postings: t.Array(JobBoardPostingResponseSchema),
  count: t.Number(),
  items: t.Array(JobBoardPostingResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});
