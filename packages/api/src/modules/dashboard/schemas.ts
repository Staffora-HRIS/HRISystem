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
 * Extended dashboard statistics response (from materialized views)
 */
export const ExtendedStatsResponseSchema = t.Object({
  totalEmployees: t.Number(),
  activeEmployees: t.Number(),
  pendingEmployees: t.Number(),
  terminatedEmployees: t.Number(),
  onLeaveEmployees: t.Number(),
  newHires30d: t.Number(),
  departments: t.Number(),
  openPositions: t.Number(),
  pendingWorkflows: t.Number(),
  pendingApprovals: t.Number(),
  pendingLeaveRequests: t.Number(),
  approvedUpcomingLeave: t.Number(),
  currentlyOnLeave: t.Number(),
  openCases: t.Number(),
  pendingCases: t.Number(),
  slaBreachedCases: t.Number(),
  activeOnboardings: t.Number(),
  avgOnboardingProgress: t.Number(),
  refreshedAt: t.Union([t.String(), t.Null()]),
});

export type ExtendedStatsResponse = Static<typeof ExtendedStatsResponseSchema>;

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
