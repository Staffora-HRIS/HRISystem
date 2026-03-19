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


// =============================================================================
// Team Training Schemas (TODO-207)
// =============================================================================

/**
 * Query params for GET /manager/team-training
 */
export const TeamTrainingQuerySchema = t.Object({
  filter: t.Optional(
    t.Union([
      t.Literal("all"),
      t.Literal("overdue"),
      t.Literal("in_progress"),
    ])
  ),
});
export type TeamTrainingQuery = Static<typeof TeamTrainingQuerySchema>;

/**
 * Enrollment item within a team member's training record
 */
export const TeamTrainingEnrollmentSchema = t.Object({
  enrollmentId: t.String({ format: "uuid" }),
  courseId: t.String({ format: "uuid" }),
  courseTitle: t.String(),
  status: t.String(),
  dueDate: t.Union([t.String(), t.Null()]),
  progress: t.Number(),
  isOverdue: t.Boolean(),
  isMandatory: t.Boolean(),
});
export type TeamTrainingEnrollment = Static<typeof TeamTrainingEnrollmentSchema>;

/**
 * Per-employee training summary within the team overview
 */
export const TeamTrainingMemberSchema = t.Object({
  employeeId: t.String({ format: "uuid" }),
  employeeName: t.String(),
  employeeNumber: t.String(),
  photoUrl: t.Union([t.String(), t.Null()]),
  completedCourses: t.Number(),
  inProgressCourses: t.Number(),
  overdueMandatoryTraining: t.Number(),
  totalHours: t.Number(),
  completionRate: t.Number(),
});
export type TeamTrainingMember = Static<typeof TeamTrainingMemberSchema>;

/**
 * Response for GET /manager/team-training
 */
export const TeamTrainingOverviewResponseSchema = t.Object({
  members: t.Array(TeamTrainingMemberSchema),
  summary: t.Object({
    totalMembers: t.Number(),
    totalCompleted: t.Number(),
    totalInProgress: t.Number(),
    totalOverdue: t.Number(),
    teamCompletionRate: t.Number(),
    totalTrainingHours: t.Number(),
  }),
});
export type TeamTrainingOverviewResponse = Static<typeof TeamTrainingOverviewResponseSchema>;

/**
 * Response for GET /manager/team-training/:employeeId
 */
export const TeamTrainingDetailResponseSchema = t.Object({
  employeeId: t.String({ format: "uuid" }),
  employeeName: t.String(),
  employeeNumber: t.String(),
  photoUrl: t.Union([t.String(), t.Null()]),
  completedCourses: t.Number(),
  inProgressCourses: t.Number(),
  notStartedCourses: t.Number(),
  overdueMandatoryTraining: t.Number(),
  totalHours: t.Number(),
  completionRate: t.Number(),
  enrollments: t.Array(TeamTrainingEnrollmentSchema),
});
export type TeamTrainingDetailResponse = Static<typeof TeamTrainingDetailResponseSchema>;
