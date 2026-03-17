/**
 * Announcements Module - TypeBox Schemas
 *
 * Defines validation schemas for all Announcement API endpoints.
 * Table: announcements
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Enums
// =============================================================================

export const AnnouncementPrioritySchema = t.Union([
  t.Literal("info"),
  t.Literal("important"),
  t.Literal("urgent"),
]);

export type AnnouncementPriority = Static<typeof AnnouncementPrioritySchema>;

// =============================================================================
// Announcement Schemas
// =============================================================================

/**
 * Announcement response
 */
export const AnnouncementResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  title: t.String(),
  content: t.String(),
  priority: AnnouncementPrioritySchema,
  published_at: t.Union([t.String(), t.Null()]),
  expires_at: t.Union([t.String(), t.Null()]),
  author_id: UuidSchema,
  author_name: t.Optional(t.Union([t.String(), t.Null()])),
  target_departments: t.Array(t.String()),
  target_roles: t.Array(t.String()),
  created_at: t.String(),
  updated_at: t.String(),
});

export type AnnouncementResponse = Static<typeof AnnouncementResponseSchema>;

/**
 * Create announcement request
 */
export const CreateAnnouncementSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 500 }),
  content: t.String({ minLength: 1 }),
  priority: t.Optional(AnnouncementPrioritySchema),
  published_at: t.Optional(t.Union([t.String(), t.Null()])),
  expires_at: t.Optional(t.Union([t.String(), t.Null()])),
  target_departments: t.Optional(t.Array(t.String())),
  target_roles: t.Optional(t.Array(t.String())),
});

export type CreateAnnouncement = Static<typeof CreateAnnouncementSchema>;

/**
 * Update announcement request
 */
export const UpdateAnnouncementSchema = t.Object({
  title: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
  content: t.Optional(t.String({ minLength: 1 })),
  priority: t.Optional(AnnouncementPrioritySchema),
  published_at: t.Optional(t.Union([t.String(), t.Null()])),
  expires_at: t.Optional(t.Union([t.String(), t.Null()])),
  target_departments: t.Optional(t.Array(t.String())),
  target_roles: t.Optional(t.Array(t.String())),
});

export type UpdateAnnouncement = Static<typeof UpdateAnnouncementSchema>;

/**
 * Announcement list filters (admin)
 */
export const AnnouncementFiltersSchema = t.Object({
  priority: t.Optional(AnnouncementPrioritySchema),
  search: t.Optional(t.String({ minLength: 1 })),
  published: t.Optional(t.Boolean()),
});

export type AnnouncementFilters = Static<typeof AnnouncementFiltersSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type IdempotencyHeader = Static<typeof IdempotencyHeaderSchema>;
