/* eslint-disable no-redeclare */
/**
 * Manager Schemas
 *
 * TypeBox schemas for manager portal, team, and approval endpoints.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Manager Team Schemas
// =============================================================================

/**
 * Team member summary
 */
export const TeamMemberSummarySchema = t.Object({
  id: t.String({ format: "uuid" }),
  employeeNumber: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  preferredName: t.Union([t.String(), t.Null()]),
  photoUrl: t.Union([t.String(), t.Null()]),
  jobTitle: t.Union([t.String(), t.Null()]),
  department: t.Union([t.String(), t.Null()]),
  status: t.String(),
  email: t.Union([t.String(), t.Null()]),
  hireDate: t.String(),
  depth: t.Number(), // 1 = direct, 2+ = indirect
});
export type TeamMemberSummary = Static<typeof TeamMemberSummarySchema>;

/**
 * Team overview
 */
export const TeamOverviewSchema = t.Object({
  directReportsCount: t.Number(),
  totalSubordinatesCount: t.Number(),
  pendingApprovalsCount: t.Number(),
  teamOnLeaveCount: t.Number(),
});
export type TeamOverview = Static<typeof TeamOverviewSchema>;

// =============================================================================
// Approval Schemas
// =============================================================================

/**
 * Pending approval types
 */
export const ApprovalTypeSchema = t.Union([
  t.Literal("leave_request"),
  t.Literal("timesheet"),
  t.Literal("expense"),
  t.Literal("training"),
  t.Literal("document"),
]);
export type ApprovalType = Static<typeof ApprovalTypeSchema>;

/**
 * Pending approval item
 */
export const PendingApprovalSchema = t.Object({
  id: t.String({ format: "uuid" }),
  type: ApprovalTypeSchema,
  employeeId: t.String({ format: "uuid" }),
  employeeName: t.String(),
  employeeNumber: t.String(),
  summary: t.String(),
  submittedAt: t.String(),
  dueDate: t.Union([t.String(), t.Null()]),
  priority: t.Union([t.Literal("high"), t.Literal("medium"), t.Literal("low")]),
  metadata: t.Optional(t.Record(t.String(), t.Unknown())),
});
export type PendingApproval = Static<typeof PendingApprovalSchema>;

/**
 * Approval action
 */
export const ApprovalActionSchema = t.Object({
  action: t.Union([t.Literal("approve"), t.Literal("reject")]),
  comment: t.Optional(t.String()),
});
export type ApprovalAction = Static<typeof ApprovalActionSchema>;
