/**
 * Time & Attendance Types
 *
 * Type definitions for time tracking, clock events, schedules,
 * shifts, and timesheet management.
 */

import type {
  UUID,
  DateString,
  TimestampString,
  TenantScopedEntity,
  Money,
} from "./common";

// =============================================================================
// Time Event Types
// =============================================================================

/** Time event type */
export type TimeEventType =
  | "clock_in"
  | "clock_out"
  | "break_start"
  | "break_end"
  | "meal_start"
  | "meal_end"
  | "transfer";

/** Time event source */
export type TimeEventSource =
  | "device"
  | "web"
  | "mobile"
  | "manager"
  | "system"
  | "import";

/** Time event status */
export type TimeEventStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "disputed"
  | "auto_approved";

/**
 * Time device (physical or virtual clock).
 */
export interface TimeDevice extends TenantScopedEntity {
  /** Device identifier */
  deviceId: string;
  /** Device name */
  name: string;
  /** Device type */
  type: "physical" | "virtual" | "mobile" | "kiosk";
  /** Location ID */
  locationId?: UUID;
  /** IP address (for IP-based validation) */
  ipAddress?: string;
  /** Device status */
  status: "active" | "inactive" | "maintenance";
  /** Last heartbeat timestamp */
  lastHeartbeat?: TimestampString;
  /** Device configuration */
  config?: {
    requirePhoto?: boolean;
    requirePin?: boolean;
    requireBiometric?: boolean;
    allowManualEntry?: boolean;
    gpsRequired?: boolean;
  };
}

/**
 * Individual time event (clock in/out, break, etc.).
 */
export interface TimeEvent extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Event type */
  eventType: TimeEventType;
  /** Event timestamp */
  timestamp: TimestampString;
  /** Event source */
  source: TimeEventSource;
  /** Device ID (if from device) */
  deviceId?: UUID;
  /** Location ID */
  locationId?: UUID;
  /** GPS coordinates */
  coordinates?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  /** IP address */
  ipAddress?: string;
  /** Event status */
  status: TimeEventStatus;
  /** Original timestamp (if edited) */
  originalTimestamp?: TimestampString;
  /** Edited by user ID */
  editedBy?: UUID;
  /** Edit reason */
  editReason?: string;
  /** Photo URL (if captured) */
  photoUrl?: string;
  /** Notes */
  notes?: string;
  /** Related timesheet line ID */
  timesheetLineId?: UUID;
}

// =============================================================================
// Schedule Types
// =============================================================================

/** Schedule status */
export type ScheduleStatus = "draft" | "published" | "archived";

/**
 * Work schedule definition.
 */
export interface Schedule extends TenantScopedEntity {
  /** Schedule name */
  name: string;
  /** Description */
  description?: string;
  /** Schedule status */
  status: ScheduleStatus;
  /** Start date of schedule period */
  startDate: DateString;
  /** End date of schedule period */
  endDate: DateString;
  /** Org unit ID (if department-level schedule) */
  orgUnitId?: UUID;
  /** Location ID */
  locationId?: UUID;
  /** Created by user ID */
  createdBy: UUID;
  /** Published at timestamp */
  publishedAt?: TimestampString;
  /** Published by user ID */
  publishedBy?: UUID;
  /** Whether to notify employees on publish */
  notifyOnPublish: boolean;
  /** Template ID (if created from template) */
  templateId?: UUID;
}

/** Day of week */
export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/**
 * Shift definition.
 */
export interface Shift extends TenantScopedEntity {
  /** Shift code */
  code: string;
  /** Shift name */
  name: string;
  /** Description */
  description?: string;
  /** Shift start time (HH:mm) */
  startTime: string;
  /** Shift end time (HH:mm) */
  endTime: string;
  /** Whether shift spans midnight */
  spansMidnight: boolean;
  /** Total scheduled hours */
  scheduledHours: number;
  /** Paid break minutes */
  paidBreakMinutes: number;
  /** Unpaid break minutes */
  unpaidBreakMinutes: number;
  /** Color code for UI */
  color?: string;
  /** Whether shift is active */
  isActive: boolean;
  /** Shift premium/differential */
  premium?: {
    type: "percentage" | "fixed";
    value: number;
  };
  /** Applicable days */
  applicableDays?: DayOfWeek[];
}

/** Shift assignment status */
export type ShiftAssignmentStatus =
  | "scheduled"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "missed"
  | "cancelled";

/**
 * Shift assignment linking employee to shift.
 */
export interface ShiftAssignment extends TenantScopedEntity {
  /** Schedule ID */
  scheduleId: UUID;
  /** Shift ID */
  shiftId: UUID;
  /** Employee ID */
  employeeId: UUID;
  /** Assignment date */
  date: DateString;
  /** Assignment status */
  status: ShiftAssignmentStatus;
  /** Override start time */
  startTimeOverride?: string;
  /** Override end time */
  endTimeOverride?: string;
  /** Location ID */
  locationId?: UUID;
  /** Position ID (if specific position) */
  positionId?: UUID;
  /** Notes */
  notes?: string;
  /** Assigned by user ID */
  assignedBy: UUID;
  /** Whether employee confirmed */
  confirmedAt?: TimestampString;
  /** Swap request ID (if swapped) */
  swapRequestId?: UUID;
}

// =============================================================================
// Timesheet Types
// =============================================================================

/** Timesheet status */
export type TimesheetStatus =
  | "draft"
  | "submitted"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "paid";

/** Time entry type */
export type TimeEntryType =
  | "regular"
  | "overtime"
  | "double_time"
  | "holiday"
  | "pto"
  | "sick"
  | "unpaid"
  | "on_call"
  | "training"
  | "travel";

/**
 * Timesheet representing a pay period for an employee.
 */
export interface Timesheet extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Pay period start date */
  periodStartDate: DateString;
  /** Pay period end date */
  periodEndDate: DateString;
  /** Timesheet status */
  status: TimesheetStatus;
  /** Total regular hours */
  totalRegularHours: number;
  /** Total overtime hours */
  totalOvertimeHours: number;
  /** Total double time hours */
  totalDoubleTimeHours: number;
  /** Total PTO hours */
  totalPtoHours: number;
  /** Total hours */
  totalHours: number;
  /** Submitted at timestamp */
  submittedAt?: TimestampString;
  /** Last approved/rejected at timestamp */
  processedAt?: TimestampString;
  /** Processed by user ID */
  processedBy?: UUID;
  /** Rejection reason */
  rejectionReason?: string;
  /** Employee notes */
  employeeNotes?: string;
  /** Manager notes */
  managerNotes?: string;
  /** Locked for editing */
  isLocked: boolean;
  /** Version for optimistic locking */
  version: number;
}

/**
 * Individual timesheet line (daily entry).
 */
export interface TimesheetLine extends TenantScopedEntity {
  /** Timesheet ID */
  timesheetId: UUID;
  /** Entry date */
  date: DateString;
  /** Entry type */
  entryType: TimeEntryType;
  /** Clock in time */
  clockIn?: TimestampString;
  /** Clock out time */
  clockOut?: TimestampString;
  /** Total hours for this entry */
  hours: number;
  /** Break minutes */
  breakMinutes: number;
  /** Cost center ID */
  costCenterId?: UUID;
  /** Project/task code */
  projectCode?: string;
  /** Activity code */
  activityCode?: string;
  /** Hourly rate (if applicable) */
  hourlyRate?: Money;
  /** Total amount */
  amount?: Money;
  /** Notes */
  notes?: string;
  /** Whether entry was auto-generated */
  isAutoGenerated: boolean;
  /** Related time events */
  timeEventIds?: UUID[];
}

/** Timesheet approval action */
export type TimesheetApprovalAction = "approve" | "reject" | "return";

/**
 * Timesheet approval record.
 */
export interface TimesheetApproval extends TenantScopedEntity {
  /** Timesheet ID */
  timesheetId: UUID;
  /** Approver user ID */
  approverId: UUID;
  /** Approval action */
  action: TimesheetApprovalAction;
  /** Action timestamp */
  actionAt: TimestampString;
  /** Approval level (for multi-level approval) */
  approvalLevel: number;
  /** Comments */
  comments?: string;
  /** Whether this is the final approval */
  isFinal: boolean;
}

// =============================================================================
// Schedule Template Types
// =============================================================================

/**
 * Schedule template for recurring schedules.
 */
export interface ScheduleTemplate extends TenantScopedEntity {
  /** Template name */
  name: string;
  /** Description */
  description?: string;
  /** Rotation length in weeks */
  rotationWeeks: number;
  /** Default shifts for each day */
  defaultShifts: Array<{
    week: number;
    dayOfWeek: DayOfWeek;
    shiftId: UUID;
  }>;
  /** Whether template is active */
  isActive: boolean;
}

// =============================================================================
// Overtime Types
// =============================================================================

/** Overtime rule type */
export type OvertimeRuleType =
  | "daily"
  | "weekly"
  | "consecutive_days"
  | "holiday";

/**
 * Overtime rule configuration.
 */
export interface OvertimeRule extends TenantScopedEntity {
  /** Rule name */
  name: string;
  /** Rule type */
  type: OvertimeRuleType;
  /** Threshold hours */
  thresholdHours: number;
  /** Multiplier (e.g., 1.5 for time and a half) */
  multiplier: number;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Whether rule is active */
  isActive: boolean;
  /** Applicable to exempt employees */
  appliesToExempt: boolean;
  /** Location IDs (empty = all) */
  locationIds?: UUID[];
  /** Employee type filter */
  employmentTypes?: string[];
}

// =============================================================================
// Shift Swap Types
// =============================================================================

/** Shift swap request status */
export type ShiftSwapStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "completed";

/**
 * Shift swap request between employees.
 */
export interface ShiftSwapRequest extends TenantScopedEntity {
  /** Requesting employee's assignment */
  requestingAssignmentId: UUID;
  /** Target employee's assignment */
  targetAssignmentId: UUID;
  /** Requesting employee ID */
  requestingEmployeeId: UUID;
  /** Target employee ID */
  targetEmployeeId: UUID;
  /** Request status */
  status: ShiftSwapStatus;
  /** Request reason */
  reason?: string;
  /** Target employee accepted */
  targetAcceptedAt?: TimestampString;
  /** Manager approval */
  managerApprovedAt?: TimestampString;
  /** Manager user ID */
  managerId?: UUID;
  /** Rejection reason */
  rejectionReason?: string;
}
