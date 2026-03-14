/**
 * Analytics Module - TypeBox Schemas
 *
 * Defines validation schemas for analytics and reporting operations.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Date Range Schema
// =============================================================================

export const DateRangeSchema = t.Object({
  start_date: t.String({ format: "date" }),
  end_date: t.String({ format: "date" }),
});

export const PeriodSchema = t.Union([
  t.Literal("day"),
  t.Literal("week"),
  t.Literal("month"),
  t.Literal("quarter"),
  t.Literal("year"),
]);

// =============================================================================
// Filter Schemas
// =============================================================================

export const HeadcountFiltersSchema = t.Object({
  org_unit_id: t.Optional(t.String({ format: "uuid" })),
  as_of_date: t.Optional(t.String({ format: "date" })),
});

export const TurnoverFiltersSchema = t.Object({
  org_unit_id: t.Optional(t.String({ format: "uuid" })),
  start_date: t.String({ format: "date" }),
  end_date: t.String({ format: "date" }),
});

export const AttendanceFiltersSchema = t.Object({
  org_unit_id: t.Optional(t.String({ format: "uuid" })),
  employee_id: t.Optional(t.String({ format: "uuid" })),
  start_date: t.String({ format: "date" }),
  end_date: t.String({ format: "date" }),
});

export const LeaveFiltersSchema = t.Object({
  org_unit_id: t.Optional(t.String({ format: "uuid" })),
  leave_type_id: t.Optional(t.String({ format: "uuid" })),
  start_date: t.String({ format: "date" }),
  end_date: t.String({ format: "date" }),
});

export const RecruitmentFiltersSchema = t.Object({
  org_unit_id: t.Optional(t.String({ format: "uuid" })),
  start_date: t.Optional(t.String({ format: "date" })),
  end_date: t.Optional(t.String({ format: "date" })),
});

// =============================================================================
// Response Schemas - Headcount
// =============================================================================

export const HeadcountSummarySchema = t.Object({
  total_employees: t.Number(),
  active_employees: t.Number(),
  on_leave_employees: t.Number(),
  pending_employees: t.Number(),
  terminated_employees: t.Number(),
  as_of_date: t.String(),
});

export const HeadcountByDepartmentSchema = t.Object({
  org_unit_id: t.String(),
  org_unit_name: t.String(),
  headcount: t.Number(),
  percentage: t.Number(),
});

export const HeadcountTrendSchema = t.Object({
  period: t.String(),
  headcount: t.Number(),
  new_hires: t.Number(),
  terminations: t.Number(),
  net_change: t.Number(),
});

// =============================================================================
// Response Schemas - Turnover
// =============================================================================

export const TurnoverSummarySchema = t.Object({
  total_terminations: t.Number(),
  voluntary_terminations: t.Number(),
  involuntary_terminations: t.Number(),
  turnover_rate: t.Number(),
  avg_tenure_months: t.Number(),
  period: t.Object({
    start_date: t.String(),
    end_date: t.String(),
  }),
});

export const TurnoverByDepartmentSchema = t.Object({
  org_unit_id: t.String(),
  org_unit_name: t.String(),
  terminations: t.Number(),
  turnover_rate: t.Number(),
});

export const TurnoverByReasonSchema = t.Object({
  reason: t.String(),
  count: t.Number(),
  percentage: t.Number(),
});

export const TurnoverTrendSchema = t.Object({
  period: t.String(),
  terminations: t.Number(),
  turnover_rate: t.Number(),
});

// =============================================================================
// Response Schemas - Attendance
// =============================================================================

export const AttendanceSummarySchema = t.Object({
  total_work_days: t.Number(),
  total_present_days: t.Number(),
  total_absent_days: t.Number(),
  attendance_rate: t.Number(),
  avg_hours_worked: t.Number(),
  overtime_hours: t.Number(),
  period: t.Object({
    start_date: t.String(),
    end_date: t.String(),
  }),
});

export const AttendanceByDaySchema = t.Object({
  date: t.String(),
  present_count: t.Number(),
  absent_count: t.Number(),
  late_count: t.Number(),
  attendance_rate: t.Number(),
});

export const AttendanceByDepartmentSchema = t.Object({
  org_unit_id: t.String(),
  org_unit_name: t.String(),
  attendance_rate: t.Number(),
  avg_late_minutes: t.Number(),
});

// =============================================================================
// Response Schemas - Leave
// =============================================================================

export const LeaveSummarySchema = t.Object({
  total_requests: t.Number(),
  approved_requests: t.Number(),
  pending_requests: t.Number(),
  rejected_requests: t.Number(),
  total_days_taken: t.Number(),
  avg_days_per_request: t.Number(),
  period: t.Object({
    start_date: t.String(),
    end_date: t.String(),
  }),
});

export const LeaveByTypeSchema = t.Object({
  leave_type_id: t.String(),
  leave_type_name: t.String(),
  requests_count: t.Number(),
  days_taken: t.Number(),
  percentage: t.Number(),
});

export const LeaveBalanceSummarySchema = t.Object({
  leave_type_id: t.String(),
  leave_type_name: t.String(),
  total_entitled: t.Number(),
  total_taken: t.Number(),
  total_remaining: t.Number(),
  utilization_rate: t.Number(),
});

// =============================================================================
// Response Schemas - Recruitment
// =============================================================================

export const RecruitmentSummarySchema = t.Object({
  open_requisitions: t.Number(),
  total_applications: t.Number(),
  applications_in_review: t.Number(),
  interviews_scheduled: t.Number(),
  offers_extended: t.Number(),
  offers_accepted: t.Number(),
  avg_time_to_hire_days: t.Number(),
  avg_time_to_fill_days: t.Number(),
});

export const RecruitmentPipelineSchema = t.Object({
  stage: t.String(),
  count: t.Number(),
  percentage: t.Number(),
  avg_days_in_stage: t.Number(),
});

export const RecruitmentBySourceSchema = t.Object({
  source: t.String(),
  applications: t.Number(),
  hired: t.Number(),
  conversion_rate: t.Number(),
});

// =============================================================================
// Filter Schemas - Diversity
// =============================================================================

export const DiversityFiltersSchema = t.Object({
  org_unit_id: t.Optional(t.String({ format: "uuid" })),
  as_of_date: t.Optional(t.String({ format: "date" })),
});

// =============================================================================
// Response Schemas - Diversity
// =============================================================================

export const DiversityByGenderSchema = t.Object({
  gender: t.String(),
  count: t.Number(),
  percentage: t.Number(),
});

export const DiversityByAgeBandSchema = t.Object({
  age_band: t.String(),
  count: t.Number(),
  percentage: t.Number(),
});

export const DiversityByNationalitySchema = t.Object({
  nationality: t.String(),
  count: t.Number(),
  percentage: t.Number(),
});

export const DiversityByDepartmentSchema = t.Object({
  org_unit_id: t.String(),
  org_unit_name: t.String(),
  total: t.Number(),
  gender_breakdown: t.Array(t.Object({
    gender: t.String(),
    count: t.Number(),
    percentage: t.Number(),
  })),
});

export const DiversityDashboardSchema = t.Object({
  total_employees: t.Number(),
  by_gender: t.Array(DiversityByGenderSchema),
  by_age_band: t.Array(DiversityByAgeBandSchema),
  by_nationality: t.Array(DiversityByNationalitySchema),
  by_department: t.Array(DiversityByDepartmentSchema),
  as_of_date: t.String(),
});

// =============================================================================
// Filter Schemas - Compensation
// =============================================================================

export const CompensationFiltersSchema = t.Object({
  org_unit_id: t.Optional(t.String({ format: "uuid" })),
  currency: t.Optional(t.String()),
});

// =============================================================================
// Response Schemas - Compensation
// =============================================================================

export const CompensationSummarySchema = t.Object({
  total_employees: t.Number(),
  avg_salary: t.Number(),
  median_salary: t.Number(),
  min_salary: t.Number(),
  max_salary: t.Number(),
  total_payroll: t.Number(),
  currency: t.String(),
});

export const CompensationByBandSchema = t.Object({
  band: t.String(),
  count: t.Number(),
  percentage: t.Number(),
  avg_salary: t.Number(),
});

export const CompensationByDepartmentSchema = t.Object({
  org_unit_id: t.String(),
  org_unit_name: t.String(),
  headcount: t.Number(),
  avg_salary: t.Number(),
  min_salary: t.Number(),
  max_salary: t.Number(),
  total_payroll: t.Number(),
});

export const CompensationChangeSchema = t.Object({
  change_reason: t.String(),
  count: t.Number(),
  avg_change_percentage: t.Number(),
});

export const CompensationDashboardSchema = t.Object({
  summary: CompensationSummarySchema,
  by_band: t.Array(CompensationByBandSchema),
  by_department: t.Array(CompensationByDepartmentSchema),
  recent_changes: t.Array(CompensationChangeSchema),
});

// =============================================================================
// Response Schemas - Dashboard
// =============================================================================

export const ExecutiveDashboardSchema = t.Object({
  headcount: HeadcountSummarySchema,
  turnover: t.Object({
    rate: t.Number(),
    trend: t.Union([t.Literal("up"), t.Literal("down"), t.Literal("stable")]),
    change_percentage: t.Number(),
  }),
  attendance: t.Object({
    rate: t.Number(),
    trend: t.Union([t.Literal("up"), t.Literal("down"), t.Literal("stable")]),
  }),
  leave: t.Object({
    pending_requests: t.Number(),
    avg_utilization: t.Number(),
  }),
  recruitment: t.Object({
    open_positions: t.Number(),
    avg_time_to_fill: t.Number(),
  }),
});

export const ManagerDashboardSchema = t.Object({
  team_headcount: t.Number(),
  pending_approvals: t.Number(),
  team_attendance_rate: t.Number(),
  team_on_leave_today: t.Number(),
  upcoming_reviews: t.Number(),
  overdue_timesheets: t.Number(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type DateRange = Static<typeof DateRangeSchema>;
export type Period = Static<typeof PeriodSchema>;
export type HeadcountFilters = Static<typeof HeadcountFiltersSchema>;
export type TurnoverFilters = Static<typeof TurnoverFiltersSchema>;
export type AttendanceFilters = Static<typeof AttendanceFiltersSchema>;
export type LeaveFilters = Static<typeof LeaveFiltersSchema>;
export type RecruitmentFilters = Static<typeof RecruitmentFiltersSchema>;

export type HeadcountSummary = Static<typeof HeadcountSummarySchema>;
export type HeadcountByDepartment = Static<typeof HeadcountByDepartmentSchema>;
export type HeadcountTrend = Static<typeof HeadcountTrendSchema>;

export type TurnoverSummary = Static<typeof TurnoverSummarySchema>;
export type TurnoverByDepartment = Static<typeof TurnoverByDepartmentSchema>;
export type TurnoverByReason = Static<typeof TurnoverByReasonSchema>;
export type TurnoverTrend = Static<typeof TurnoverTrendSchema>;

export type AttendanceSummary = Static<typeof AttendanceSummarySchema>;
export type AttendanceByDay = Static<typeof AttendanceByDaySchema>;
export type AttendanceByDepartment = Static<typeof AttendanceByDepartmentSchema>;

export type LeaveSummary = Static<typeof LeaveSummarySchema>;
export type LeaveByType = Static<typeof LeaveByTypeSchema>;
export type LeaveBalanceSummary = Static<typeof LeaveBalanceSummarySchema>;

export type RecruitmentSummary = Static<typeof RecruitmentSummarySchema>;
export type RecruitmentPipeline = Static<typeof RecruitmentPipelineSchema>;
export type RecruitmentBySource = Static<typeof RecruitmentBySourceSchema>;

export type ExecutiveDashboard = Static<typeof ExecutiveDashboardSchema>;
export type ManagerDashboard = Static<typeof ManagerDashboardSchema>;

export type DiversityFilters = Static<typeof DiversityFiltersSchema>;
export type DiversityByGender = Static<typeof DiversityByGenderSchema>;
export type DiversityByAgeBand = Static<typeof DiversityByAgeBandSchema>;
export type DiversityByNationality = Static<typeof DiversityByNationalitySchema>;
export type DiversityByDepartment = Static<typeof DiversityByDepartmentSchema>;
export type DiversityDashboard = Static<typeof DiversityDashboardSchema>;

export type CompensationFilters = Static<typeof CompensationFiltersSchema>;
export type CompensationSummary = Static<typeof CompensationSummarySchema>;
export type CompensationByBand = Static<typeof CompensationByBandSchema>;
export type CompensationByDepartment = Static<typeof CompensationByDepartmentSchema>;
export type CompensationChange = Static<typeof CompensationChangeSchema>;
export type CompensationDashboard = Static<typeof CompensationDashboardSchema>;
