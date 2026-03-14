/**
 * Dashboard Module - TypeBox Schemas
 *
 * Defines validation schemas for Dashboard API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Admin dashboard statistics response
 */
export const AdminStatsResponseSchema = t.Object({
  totalEmployees: t.Number(),
  activeEmployees: t.Number(),
  departments: t.Number(),
  openPositions: t.Number(),
  pendingWorkflows: t.Number(),
  pendingApprovals: t.Number(),
});

export type AdminStatsResponse = Static<typeof AdminStatsResponseSchema>;

/**
 * Single recent activity entry
 */
export const RecentActivityItemSchema = t.Object({
  id: t.String(),
  action: t.String(),
  resourceType: t.String(),
  resourceId: t.Union([t.String(), t.Null()]),
  userId: t.Union([t.String(), t.Null()]),
  createdAt: t.Union([t.String(), t.Date()]),
  metadata: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
});

export type RecentActivityItem = Static<typeof RecentActivityItemSchema>;

/**
 * Recent activity response (array of entries)
 */
export const RecentActivityResponseSchema = t.Array(RecentActivityItemSchema);

export type RecentActivityResponse = Static<typeof RecentActivityResponseSchema>;
