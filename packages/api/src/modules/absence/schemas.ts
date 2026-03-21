/**
 * Absence Management Module Schemas
 */

import { t, type Static } from "elysia";

// Enums
export const LeaveRequestStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("pending"),
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("cancelled"),
]);
export type LeaveRequestStatus = Static<typeof LeaveRequestStatusSchema>;

export const AccrualFrequencySchema = t.Union([
  t.Literal("monthly"),
  t.Literal("quarterly"),
  t.Literal("annually"),
  t.Literal("hire_anniversary"),
]);
export type AccrualFrequency = Static<typeof AccrualFrequencySchema>;

// Common
export const UuidSchema = t.String({ format: "uuid" });
export const DateSchema = t.String({ format: "date" });

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

// Leave Type Category
export const LeaveTypeCategorySchema = t.Union([
  t.Literal("annual"),
  t.Literal("sick"),
  t.Literal("personal"),
  t.Literal("parental"),
  t.Literal("bereavement"),
  t.Literal("jury_duty"),
  t.Literal("military"),
  t.Literal("unpaid"),
  t.Literal("other"),
]);
export type LeaveTypeCategory = Static<typeof LeaveTypeCategorySchema>;

// Leave Type Schemas
export const CreateLeaveTypeSchema = t.Object({
  code: t.String({ minLength: 1, maxLength: 20 }),
  name: t.String({ minLength: 1, maxLength: 100 }),
  category: t.Optional(LeaveTypeCategorySchema),
  description: t.Optional(t.String({ maxLength: 500 })),
  isPaid: t.Optional(t.Boolean({ default: true })),
  requiresApproval: t.Optional(t.Boolean({ default: true })),
  requiresAttachment: t.Optional(t.Boolean({ default: false })),
  maxConsecutiveDays: t.Optional(t.Number({ minimum: 1, maximum: 365 })),
  minNoticeDays: t.Optional(t.Number({ minimum: 0, maximum: 365, default: 0 })),
  color: t.Optional(t.String({ pattern: "^#[0-9A-Fa-f]{6}$" })),
});
export type CreateLeaveType = Static<typeof CreateLeaveTypeSchema>;

export const LeaveTypeResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  code: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  isPaid: t.Boolean(),
  requiresApproval: t.Boolean(),
  requiresAttachment: t.Boolean(),
  maxConsecutiveDays: t.Nullable(t.Number()),
  minNoticeDays: t.Number(),
  color: t.Nullable(t.String()),
  isActive: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.String(),
});
export type LeaveTypeResponse = Static<typeof LeaveTypeResponseSchema>;

// Leave Policy Schemas
export const CreateLeavePolicySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String({ maxLength: 500 })),
  leaveTypeId: UuidSchema,
  annualAllowance: t.Number({ minimum: 0, maximum: 365 }),
  maxCarryover: t.Optional(t.Number({ minimum: 0, maximum: 365, default: 0 })),
  accrualFrequency: t.Optional(AccrualFrequencySchema),
  effectiveFrom: DateSchema,
  effectiveTo: t.Optional(DateSchema),
  eligibleAfterMonths: t.Optional(t.Number({ minimum: 0, maximum: 24, default: 0 })),
  appliesTo: t.Optional(t.Object({
    orgUnitIds: t.Optional(t.Array(UuidSchema)),
    contractTypes: t.Optional(t.Array(t.String())),
    countries: t.Optional(t.Array(t.String())),
  })),
  daysPerWeek: t.Optional(t.Number({ minimum: 0.5, maximum: 7 })),
});
export type CreateLeavePolicy = Static<typeof CreateLeavePolicySchema>;

export const UpdateLeavePolicySchema = t.Partial(t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String({ maxLength: 500 })),
  leaveTypeId: UuidSchema,
  annualAllowance: t.Number({ minimum: 0, maximum: 365 }),
  maxCarryover: t.Number({ minimum: 0, maximum: 365 }),
  accrualFrequency: AccrualFrequencySchema,
  effectiveFrom: DateSchema,
  effectiveTo: t.Optional(DateSchema),
  eligibleAfterMonths: t.Number({ minimum: 0, maximum: 24 }),
  appliesTo: t.Object({
    orgUnitIds: t.Optional(t.Array(UuidSchema)),
    contractTypes: t.Optional(t.Array(t.String())),
    countries: t.Optional(t.Array(t.String())),
  }),
  daysPerWeek: t.Number({ minimum: 0.5, maximum: 7 }),
}));
export type UpdateLeavePolicy = Static<typeof UpdateLeavePolicySchema>;

export const LeavePolicyResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  name: t.String(),
  description: t.Nullable(t.String()),
  leaveTypeId: UuidSchema,
  annualAllowance: t.Number(),
  maxCarryover: t.Number(),
  accrualFrequency: t.Nullable(t.String()),
  effectiveFrom: t.String(),
  effectiveTo: t.Nullable(t.String()),
  eligibleAfterMonths: t.Number(),
  appliesTo: t.Nullable(t.Unknown()),
  isActive: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.String(),
});
export type LeavePolicyResponse = Static<typeof LeavePolicyResponseSchema>;

// Leave Request Schemas
export const CreateLeaveRequestSchema = t.Object({
  employeeId: UuidSchema,
  leaveTypeId: UuidSchema,
  startDate: DateSchema,
  endDate: DateSchema,
  startHalfDay: t.Optional(t.Boolean({ default: false })),
  endHalfDay: t.Optional(t.Boolean({ default: false })),
  reason: t.Optional(t.String({ maxLength: 1000 })),
  contactInfo: t.Optional(t.String({ maxLength: 200 })),
});
export type CreateLeaveRequest = Static<typeof CreateLeaveRequestSchema>;

export const LeaveRequestResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  employeeId: UuidSchema,
  leaveTypeId: UuidSchema,
  startDate: t.String(),
  endDate: t.String(),
  startHalfDay: t.Boolean(),
  endHalfDay: t.Boolean(),
  totalDays: t.Number(),
  reason: t.Nullable(t.String()),
  contactInfo: t.Nullable(t.String()),
  status: LeaveRequestStatusSchema,
  submittedAt: t.Nullable(t.String()),
  approvedAt: t.Nullable(t.String()),
  approvedById: t.Nullable(UuidSchema),
  rejectionReason: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String(),
});
export type LeaveRequestResponse = Static<typeof LeaveRequestResponseSchema>;

export const LeaveRequestFiltersSchema = t.Object({
  employeeId: t.Optional(UuidSchema),
  leaveTypeId: t.Optional(UuidSchema),
  status: t.Optional(LeaveRequestStatusSchema),
  from: t.Optional(DateSchema),
  to: t.Optional(DateSchema),
  ...PaginationQuerySchema.properties,
});
export type LeaveRequestFilters = Static<typeof LeaveRequestFiltersSchema>;

// Leave Balance Schemas
export const LeaveBalanceResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  employeeId: UuidSchema,
  leaveTypeId: UuidSchema,
  leaveTypeName: t.String(),
  year: t.Number(),
  entitled: t.Number(),
  used: t.Number(),
  pending: t.Number(),
  available: t.Number(),
  carryover: t.Number(),
  updatedAt: t.String(),
});
export type LeaveBalanceResponse = Static<typeof LeaveBalanceResponseSchema>;

// Approval Schemas
export const LeaveApprovalSchema = t.Object({
  action: t.Union([t.Literal("approve"), t.Literal("reject")]),
  comments: t.Optional(t.String({ maxLength: 500 })),
});
export type LeaveApproval = Static<typeof LeaveApprovalSchema>;

// Params
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});
export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.String({ minLength: 1 }),
});
export type IdempotencyHeader = Static<typeof IdempotencyHeaderSchema>;
