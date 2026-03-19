/**
 * Manager Module - Shared Types
 *
 * Common types used across manager sub-services.
 */

// =============================================================================
// Context
// =============================================================================

export interface TenantContext {
  tenantId: string;
  userId: string;
}

// =============================================================================
// Absence Types
// =============================================================================

export interface TeamAbsenceEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: string;
  leaveColor: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  status: string;
}

export interface TeamAbsenceEntryRow {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type: string;
  leave_color: string | null;
  start_date: string;
  end_date: string;
  duration_days: number;
  status: string;
}

// =============================================================================
// Custom Errors
// =============================================================================

export class ManagerAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagerAccessError";
  }
}
