/**
 * Time & Attendance Module Schemas
 *
 * TypeBox schemas for request/response validation in time tracking operations.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const TimeEventTypeSchema = t.Union([
  t.Literal("clock_in"),
  t.Literal("clock_out"),
  t.Literal("break_start"),
  t.Literal("break_end"),
]);
export type TimeEventType = Static<typeof TimeEventTypeSchema>;

export const TimesheetStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("submitted"),
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("paid"),
]);
export type TimesheetStatus = Static<typeof TimesheetStatusSchema>;

export const ShiftStatusSchema = t.Union([
  t.Literal("scheduled"),
  t.Literal("in_progress"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);
export type ShiftStatus = Static<typeof ShiftStatusSchema>;

export const SwapRequestStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("cancelled"),
]);
export type SwapRequestStatus = Static<typeof SwapRequestStatusSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });
export const DateSchema = t.String({ format: "date" });
export const DateTimeSchema = t.String({ format: "date-time" });

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Time Event Schemas
// =============================================================================

export const CreateTimeEventSchema = t.Object({
  employeeId: UuidSchema,
  eventType: TimeEventTypeSchema,
  eventTime: DateTimeSchema,
  deviceId: t.Optional(UuidSchema),
  latitude: t.Optional(t.Number({ minimum: -90, maximum: 90 })),
  longitude: t.Optional(t.Number({ minimum: -180, maximum: 180 })),
  isManual: t.Optional(t.Boolean({ default: false })),
  manualReason: t.Optional(t.String({ maxLength: 500 })),
});
export type CreateTimeEvent = Static<typeof CreateTimeEventSchema>;

export const TimeEventResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  employeeId: UuidSchema,
  eventType: TimeEventTypeSchema,
  eventTime: t.String(),
  deviceId: t.Nullable(UuidSchema),
  latitude: t.Nullable(t.Number()),
  longitude: t.Nullable(t.Number()),
  isManual: t.Boolean(),
  sessionId: t.Nullable(UuidSchema),
  createdAt: t.String(),
});
export type TimeEventResponse = Static<typeof TimeEventResponseSchema>;

export const TimeEventFiltersSchema = t.Object({
  employeeId: t.Optional(UuidSchema),
  eventType: t.Optional(TimeEventTypeSchema),
  from: t.Optional(DateTimeSchema),
  to: t.Optional(DateTimeSchema),
  deviceId: t.Optional(UuidSchema),
  ...PaginationQuerySchema.properties,
});
export type TimeEventFilters = Static<typeof TimeEventFiltersSchema>;

// =============================================================================
// Schedule Schemas
// =============================================================================

export const CreateScheduleSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String({ maxLength: 500 })),
  startDate: DateSchema,
  endDate: DateSchema,
  orgUnitId: t.Optional(UuidSchema),
  isTemplate: t.Optional(t.Boolean({ default: false })),
});
export type CreateSchedule = Static<typeof CreateScheduleSchema>;

export const UpdateScheduleSchema = t.Partial(CreateScheduleSchema);
export type UpdateSchedule = Static<typeof UpdateScheduleSchema>;

export const ScheduleResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  name: t.String(),
  description: t.Nullable(t.String()),
  startDate: t.String(),
  endDate: t.String(),
  orgUnitId: t.Nullable(UuidSchema),
  isTemplate: t.Boolean(),
  status: t.String(),
  createdAt: t.String(),
  updatedAt: t.String(),
});
export type ScheduleResponse = Static<typeof ScheduleResponseSchema>;

// =============================================================================
// Shift Schemas
// =============================================================================

export const CreateShiftSchema = t.Object({
  scheduleId: UuidSchema,
  name: t.String({ minLength: 1, maxLength: 100 }),
  startTime: t.String({ pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$" }),
  endTime: t.String({ pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$" }),
  breakMinutes: t.Optional(t.Number({ minimum: 0, maximum: 480, default: 0 })),
  isOvernight: t.Optional(t.Boolean({ default: false })),
  color: t.Optional(t.String({ pattern: "^#[0-9A-Fa-f]{6}$" })),
});
export type CreateShift = Static<typeof CreateShiftSchema>;

export const UpdateShiftSchema = t.Partial(
  t.Omit(CreateShiftSchema, ["scheduleId"])
);
export type UpdateShift = Static<typeof UpdateShiftSchema>;

export const ShiftResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  scheduleId: UuidSchema,
  name: t.String(),
  startTime: t.String(),
  endTime: t.String(),
  breakMinutes: t.Number(),
  isOvernight: t.Boolean(),
  color: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String(),
});
export type ShiftResponse = Static<typeof ShiftResponseSchema>;

// =============================================================================
// Shift Swap Request Schemas
// =============================================================================

export const CreateSwapRequestSchema = t.Object({
  sourceShiftId: UuidSchema,
  targetEmployeeId: UuidSchema,
  targetShiftId: t.Optional(UuidSchema),
  reason: t.Optional(t.String({ maxLength: 500 })),
});
export type CreateSwapRequest = Static<typeof CreateSwapRequestSchema>;

export const SwapRequestResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  sourceShiftId: UuidSchema,
  requestingEmployeeId: UuidSchema,
  targetEmployeeId: UuidSchema,
  targetShiftId: t.Nullable(UuidSchema),
  status: SwapRequestStatusSchema,
  reason: t.Nullable(t.String()),
  approvedById: t.Nullable(UuidSchema),
  approvedAt: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String(),
});
export type SwapRequestResponse = Static<typeof SwapRequestResponseSchema>;

// =============================================================================
// Timesheet Schemas
// =============================================================================

export const CreateTimesheetSchema = t.Object({
  employeeId: UuidSchema,
  periodStart: DateSchema,
  periodEnd: DateSchema,
});
export type CreateTimesheet = Static<typeof CreateTimesheetSchema>;

export const TimesheetLineSchema = t.Object({
  date: DateSchema,
  regularHours: t.Number({ minimum: 0, maximum: 24 }),
  overtimeHours: t.Optional(t.Number({ minimum: 0, maximum: 24, default: 0 })),
  breakMinutes: t.Optional(t.Number({ minimum: 0, maximum: 480, default: 0 })),
  projectId: t.Optional(UuidSchema),
  taskCode: t.Optional(t.String({ maxLength: 50 })),
  notes: t.Optional(t.String({ maxLength: 500 })),
});
export type TimesheetLine = Static<typeof TimesheetLineSchema>;

export const UpdateTimesheetSchema = t.Object({
  lines: t.Array(TimesheetLineSchema),
});
export type UpdateTimesheet = Static<typeof UpdateTimesheetSchema>;

export const TimesheetResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  employeeId: UuidSchema,
  periodStart: t.String(),
  periodEnd: t.String(),
  status: TimesheetStatusSchema,
  totalRegularHours: t.Number(),
  totalOvertimeHours: t.Number(),
  submittedAt: t.Nullable(t.String()),
  approvedAt: t.Nullable(t.String()),
  approvedById: t.Nullable(UuidSchema),
  createdAt: t.String(),
  updatedAt: t.String(),
  lines: t.Optional(
    t.Array(
      t.Object({
        id: UuidSchema,
        date: t.String(),
        regularHours: t.Number(),
        overtimeHours: t.Number(),
        breakMinutes: t.Number(),
        projectId: t.Nullable(UuidSchema),
        taskCode: t.Nullable(t.String()),
        notes: t.Nullable(t.String()),
      })
    )
  ),
});
export type TimesheetResponse = Static<typeof TimesheetResponseSchema>;

export const TimesheetFiltersSchema = t.Object({
  employeeId: t.Optional(UuidSchema),
  status: t.Optional(TimesheetStatusSchema),
  periodStart: t.Optional(DateSchema),
  periodEnd: t.Optional(DateSchema),
  ...PaginationQuerySchema.properties,
});
export type TimesheetFilters = Static<typeof TimesheetFiltersSchema>;

// =============================================================================
// Approval Schemas
// =============================================================================

export const TimesheetApprovalSchema = t.Object({
  action: t.Union([t.Literal("approve"), t.Literal("reject")]),
  comments: t.Optional(t.String({ maxLength: 500 })),
});
export type TimesheetApproval = Static<typeof TimesheetApprovalSchema>;

// =============================================================================
// Approval Chain Schemas
// =============================================================================

export const ApprovalChainStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("active"),
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("skipped"),
]);
export type ApprovalChainStatus = Static<typeof ApprovalChainStatusSchema>;

export const SubmitTimesheetWithChainSchema = t.Object({
  approverIds: t.Array(UuidSchema, { minItems: 1, maxItems: 10 }),
});
export type SubmitTimesheetWithChain = Static<typeof SubmitTimesheetWithChainSchema>;

export const ApprovalChainDecisionSchema = t.Object({
  action: t.Union([t.Literal("approve"), t.Literal("reject")]),
  comments: t.Optional(t.String({ maxLength: 500 })),
});
export type ApprovalChainDecision = Static<typeof ApprovalChainDecisionSchema>;

export const ApprovalChainEntryResponseSchema = t.Object({
  id: UuidSchema,
  timesheetId: UuidSchema,
  level: t.Number(),
  approverId: UuidSchema,
  approverName: t.Nullable(t.String()),
  status: ApprovalChainStatusSchema,
  decidedAt: t.Nullable(t.String()),
  comments: t.Nullable(t.String()),
  createdAt: t.String(),
});
export type ApprovalChainEntryResponse = Static<typeof ApprovalChainEntryResponseSchema>;

export const ApprovalChainResponseSchema = t.Object({
  timesheetId: UuidSchema,
  totalLevels: t.Number(),
  currentLevel: t.Nullable(t.Number()),
  overallStatus: t.String(),
  entries: t.Array(ApprovalChainEntryResponseSchema),
});
export type ApprovalChainResponse = Static<typeof ApprovalChainResponseSchema>;

export const PendingApprovalsFiltersSchema = t.Object({
  ...PaginationQuerySchema.properties,
});
export type PendingApprovalsFilters = Static<typeof PendingApprovalsFiltersSchema>;

// =============================================================================
// Approval Hierarchy Schemas (Configurable per-department chain templates)
// =============================================================================

export const ApprovalLevelSchema = t.Object({
  level: t.Number({ minimum: 1, maximum: 10 }),
  role: t.String({ minLength: 1, maxLength: 100 }),
  approverId: t.Optional(t.Nullable(UuidSchema)),
});
export type ApprovalLevel = Static<typeof ApprovalLevelSchema>;

export const CreateApprovalHierarchySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 150 }),
  description: t.Optional(t.String({ maxLength: 500 })),
  departmentId: t.Optional(t.Nullable(UuidSchema)),
  approvalLevels: t.Array(ApprovalLevelSchema, { minItems: 1, maxItems: 10 }),
  isActive: t.Optional(t.Boolean({ default: true })),
});
export type CreateApprovalHierarchy = Static<typeof CreateApprovalHierarchySchema>;

export const UpdateApprovalHierarchySchema = t.Partial(CreateApprovalHierarchySchema);
export type UpdateApprovalHierarchy = Static<typeof UpdateApprovalHierarchySchema>;

export const ApprovalHierarchyResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  departmentId: t.Nullable(UuidSchema),
  name: t.String(),
  description: t.Nullable(t.String()),
  isActive: t.Boolean(),
  approvalLevels: t.Array(ApprovalLevelSchema),
  createdAt: t.String(),
  updatedAt: t.String(),
});
export type ApprovalHierarchyResponse = Static<typeof ApprovalHierarchyResponseSchema>;

export const ApprovalHierarchyFiltersSchema = t.Object({
  departmentId: t.Optional(UuidSchema),
  isActive: t.Optional(t.Boolean()),
  ...PaginationQuerySchema.properties,
});
export type ApprovalHierarchyFilters = Static<typeof ApprovalHierarchyFiltersSchema>;

export const SubmitForApprovalSchema = t.Object({
  approverIds: t.Optional(t.Array(UuidSchema, { minItems: 1, maxItems: 10 })),
});
export type SubmitForApproval = Static<typeof SubmitForApprovalSchema>;

export const ApproveTimesheetSchema = t.Object({
  comments: t.Optional(t.String({ maxLength: 500 })),
});
export type ApproveTimesheet = Static<typeof ApproveTimesheetSchema>;

export const RejectTimesheetSchema = t.Object({
  comments: t.Optional(t.String({ maxLength: 500 })),
  reason: t.Optional(t.String({ maxLength: 1000 })),
});
export type RejectTimesheet = Static<typeof RejectTimesheetSchema>;

// =============================================================================
// Params Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.String({ minLength: 1 }),
});
export type IdempotencyHeader = Static<typeof IdempotencyHeaderSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});
export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
