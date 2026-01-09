/**
 * Absence Management Types
 *
 * Type definitions for leave types, policies, balances,
 * requests, and accrual rules.
 */

import type {
  UUID,
  DateString,
  TimestampString,
  TenantScopedEntity,
  EffectiveDated,
} from "./common";

// =============================================================================
// Leave Type Types
// =============================================================================

/** Leave category */
export type LeaveCategory =
  | "vacation"
  | "sick"
  | "personal"
  | "parental"
  | "bereavement"
  | "jury_duty"
  | "military"
  | "sabbatical"
  | "unpaid"
  | "comp_time"
  | "floating_holiday"
  | "other";

/** Leave unit */
export type LeaveUnit = "days" | "hours";

/**
 * Leave type definition.
 */
export interface LeaveType extends TenantScopedEntity {
  /** Leave type code */
  code: string;
  /** Leave type name */
  name: string;
  /** Description */
  description?: string;
  /** Leave category */
  category: LeaveCategory;
  /** Unit of measurement */
  unit: LeaveUnit;
  /** Whether this leave type is paid */
  isPaid: boolean;
  /** Whether to track balance */
  trackBalance: boolean;
  /** Whether negative balance is allowed */
  allowNegativeBalance: boolean;
  /** Maximum negative balance allowed */
  maxNegativeBalance?: number;
  /** Whether accrual applies */
  accrualEnabled: boolean;
  /** Whether carryover is allowed */
  carryoverEnabled: boolean;
  /** Maximum carryover amount */
  maxCarryover?: number;
  /** Carryover expiration days */
  carryoverExpirationDays?: number;
  /** Minimum increment (e.g., 0.5 for half days) */
  minIncrement: number;
  /** Maximum consecutive days */
  maxConsecutiveDays?: number;
  /** Minimum advance notice days */
  minAdvanceNoticeDays?: number;
  /** Whether documentation is required */
  documentationRequired: boolean;
  /** Documentation threshold (require docs after X days) */
  documentationThresholdDays?: number;
  /** Display color */
  color?: string;
  /** Display order */
  sortOrder: number;
  /** Whether type is active */
  isActive: boolean;
  /** Applicable to employment types */
  applicableEmploymentTypes?: string[];
  /** Country code (if country-specific) */
  countryCode?: string;
}

// =============================================================================
// Leave Policy Types
// =============================================================================

/** Accrual frequency */
export type AccrualFrequency =
  | "daily"
  | "weekly"
  | "bi_weekly"
  | "semi_monthly"
  | "monthly"
  | "quarterly"
  | "annually"
  | "on_hire_date";

/** Accrual basis */
export type AccrualBasis =
  | "calendar_year"
  | "fiscal_year"
  | "hire_anniversary"
  | "continuous";

/**
 * Leave policy defining entitlement rules.
 */
export interface LeavePolicy extends TenantScopedEntity, EffectiveDated {
  /** Policy name */
  name: string;
  /** Description */
  description?: string;
  /** Leave type ID */
  leaveTypeId: UUID;
  /** Policy priority (for overlapping policies) */
  priority: number;
  /** Whether policy is active */
  isActive: boolean;
  /** Eligibility criteria */
  eligibility: {
    /** Minimum tenure in days */
    minTenureDays?: number;
    /** Employment types */
    employmentTypes?: string[];
    /** Location IDs */
    locationIds?: UUID[];
    /** Org unit IDs */
    orgUnitIds?: UUID[];
    /** Job grades */
    jobGrades?: string[];
    /** Country codes */
    countryCodes?: string[];
  };
  /** Entitlement configuration */
  entitlement: {
    /** Base annual entitlement */
    baseAmount: number;
    /** Whether to prorate for new hires */
    prorateOnHire: boolean;
    /** Whether to prorate on termination */
    prorateOnTermination: boolean;
    /** Proration method */
    prorationMethod?: "calendar_days" | "working_days" | "months";
    /** Maximum balance cap */
    maxBalance?: number;
  };
  /** Accrual rules */
  accrualRules: LeaveAccrualRule[];
  /** Waiting period configuration */
  waitingPeriod?: {
    /** Days before leave can be used */
    days: number;
    /** Days before accrual starts */
    accrualStartDays?: number;
  };
  /** Blackout periods */
  blackoutPeriods?: Array<{
    name: string;
    startDate: DateString;
    endDate: DateString;
    recurring: boolean;
  }>;
}

/**
 * Leave accrual rule.
 */
export interface LeaveAccrualRule {
  /** Rule ID */
  id: UUID;
  /** Minimum tenure in months for this tier */
  minTenureMonths: number;
  /** Maximum tenure in months for this tier */
  maxTenureMonths?: number;
  /** Accrual rate (amount per period) */
  accrualRate: number;
  /** Accrual frequency */
  accrualFrequency: AccrualFrequency;
  /** Accrual basis */
  accrualBasis: AccrualBasis;
  /** Maximum annual accrual */
  maxAnnualAccrual?: number;
  /** Whether to accrue during probation */
  accruesDuringProbation: boolean;
  /** Whether to accrue during leave */
  accruesDuringLeave: boolean;
}

// =============================================================================
// Leave Balance Types
// =============================================================================

/** Ledger entry type */
export type LeaveBalanceLedgerEntryType =
  | "accrual"
  | "used"
  | "adjustment"
  | "carryover"
  | "forfeited"
  | "expired"
  | "payout"
  | "transfer_in"
  | "transfer_out"
  | "correction";

/**
 * Leave balance for an employee/leave type combination.
 */
export interface LeaveBalance extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Leave type ID */
  leaveTypeId: UUID;
  /** Policy ID */
  policyId: UUID;
  /** Current available balance */
  currentBalance: number;
  /** Pending requests balance */
  pendingBalance: number;
  /** Year-to-date used */
  ytdUsed: number;
  /** Year-to-date accrued */
  ytdAccrued: number;
  /** Carryover from previous year */
  carryoverBalance: number;
  /** Carryover expiration date */
  carryoverExpiresAt?: DateString;
  /** Balance year */
  balanceYear: number;
  /** Last accrual date */
  lastAccrualDate?: DateString;
  /** Last calculation timestamp */
  lastCalculatedAt: TimestampString;
}

/**
 * Leave balance ledger entry for audit trail.
 */
export interface LeaveBalanceLedgerEntry extends TenantScopedEntity {
  /** Balance ID */
  balanceId: UUID;
  /** Entry type */
  entryType: LeaveBalanceLedgerEntryType;
  /** Amount (positive or negative) */
  amount: number;
  /** Running balance after this entry */
  runningBalance: number;
  /** Entry date */
  entryDate: DateString;
  /** Related request ID (if applicable) */
  leaveRequestId?: UUID;
  /** Description/notes */
  description?: string;
  /** Created by user ID */
  createdBy: UUID;
  /** Reference number */
  referenceNumber?: string;
}

// =============================================================================
// Leave Request Types
// =============================================================================

/** Leave request status */
export type LeaveRequestStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "withdrawn";

/** Leave duration type */
export type LeaveDurationType =
  | "full_day"
  | "half_day_am"
  | "half_day_pm"
  | "hours";

/**
 * Leave request.
 */
export interface LeaveRequest extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Leave type ID */
  leaveTypeId: UUID;
  /** Request status */
  status: LeaveRequestStatus;
  /** Start date */
  startDate: DateString;
  /** End date */
  endDate: DateString;
  /** Duration type */
  durationType: LeaveDurationType;
  /** Start time (for partial day) */
  startTime?: string;
  /** End time (for partial day) */
  endTime?: string;
  /** Total days/hours requested */
  totalAmount: number;
  /** Unit of measurement */
  unit: LeaveUnit;
  /** Reason for leave */
  reason?: string;
  /** Employee comments */
  comments?: string;
  /** Contact information during leave */
  contactInfo?: string;
  /** Handover notes */
  handoverNotes?: string;
  /** Covering employee ID */
  coveringEmployeeId?: UUID;
  /** Whether documentation is attached */
  hasDocumentation: boolean;
  /** Documentation URLs */
  documentUrls?: string[];
  /** Submitted timestamp */
  submittedAt?: TimestampString;
  /** Cancellation reason */
  cancellationReason?: string;
  /** Cancelled timestamp */
  cancelledAt?: TimestampString;
  /** Current approval step */
  currentApprovalStep: number;
  /** Total approval steps */
  totalApprovalSteps: number;
  /** Workflow instance ID (if using workflow) */
  workflowInstanceId?: UUID;
}

/** Leave approval action */
export type LeaveApprovalAction = "approve" | "reject" | "escalate" | "delegate";

/**
 * Leave request approval record.
 */
export interface LeaveApproval extends TenantScopedEntity {
  /** Leave request ID */
  leaveRequestId: UUID;
  /** Approver user ID */
  approverId: UUID;
  /** Approval step number */
  stepNumber: number;
  /** Approval action */
  action: LeaveApprovalAction;
  /** Action timestamp */
  actionAt: TimestampString;
  /** Comments */
  comments?: string;
  /** Delegated to user ID */
  delegatedToId?: UUID;
  /** Escalated to user ID */
  escalatedToId?: UUID;
  /** Due date for approval */
  dueDate?: DateString;
}

// =============================================================================
// Public Holiday Types
// =============================================================================

/** Holiday type */
export type HolidayType = "public" | "company" | "floating" | "religious";

/**
 * Public or company holiday.
 */
export interface PublicHoliday extends TenantScopedEntity {
  /** Holiday name */
  name: string;
  /** Holiday date */
  date: DateString;
  /** Holiday type */
  type: HolidayType;
  /** Whether it's a full day or partial */
  isFullDay: boolean;
  /** Hours if partial day */
  hours?: number;
  /** Country code */
  countryCode: string;
  /** State/region code (if applicable) */
  regionCode?: string;
  /** Whether holiday is recurring annually */
  isRecurring: boolean;
  /** Applicable location IDs (empty = all) */
  locationIds?: UUID[];
  /** Description */
  description?: string;
  /** Whether it's observed on a different date */
  observedDate?: DateString;
}

// =============================================================================
// Leave Calendar Types
// =============================================================================

/**
 * Leave calendar entry for visualization.
 */
export interface LeaveCalendarEntry {
  /** Entry ID */
  id: UUID;
  /** Employee ID */
  employeeId: UUID;
  /** Employee name */
  employeeName: string;
  /** Leave type ID */
  leaveTypeId: UUID;
  /** Leave type name */
  leaveTypeName: string;
  /** Leave type color */
  color: string;
  /** Start date */
  startDate: DateString;
  /** End date */
  endDate: DateString;
  /** Status */
  status: LeaveRequestStatus;
  /** Is all day */
  isAllDay: boolean;
}

// =============================================================================
// Leave Entitlement Types
// =============================================================================

/**
 * Annual leave entitlement summary for an employee.
 */
export interface LeaveEntitlementSummary {
  /** Employee ID */
  employeeId: UUID;
  /** Year */
  year: number;
  /** Entitlements by leave type */
  entitlements: Array<{
    leaveTypeId: UUID;
    leaveTypeName: string;
    unit: LeaveUnit;
    annualEntitlement: number;
    carryover: number;
    adjustments: number;
    used: number;
    pending: number;
    available: number;
    scheduledForfeiture?: number;
    forfeitureDate?: DateString;
  }>;
}
