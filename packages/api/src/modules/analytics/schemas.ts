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

export const DiversityByEthnicitySchema = t.Object({
  ethnicity: t.String(),
  count: t.Number(),
  percentage: t.Number(),
});

export const DiversityByDisabilitySchema = t.Object({
  disability_status: t.String(),
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

export const DiversityTrendPointSchema = t.Object({
  period: t.String(),
  characteristic: t.String(),
  value: t.String(),
  hires: t.Number(),
  leavers: t.Number(),
});

export const DiversityCompletionSchema = t.Object({
  total_employees: t.Number(),
  total_submissions: t.Number(),
  completion_rate: t.Number(),
});

export const GenderPayGapSummarySchema = t.Object({
  mean_gap_percentage: t.Union([t.Number(), t.Null()]),
  median_gap_percentage: t.Union([t.Number(), t.Null()]),
  male_count: t.Number(),
  female_count: t.Number(),
});

export const DiversityDashboardSchema = t.Object({
  total_employees: t.Number(),
  by_gender: t.Array(DiversityByGenderSchema),
  by_age_band: t.Array(DiversityByAgeBandSchema),
  by_nationality: t.Array(DiversityByNationalitySchema),
  by_ethnicity: t.Array(DiversityByEthnicitySchema),
  by_disability: t.Array(DiversityByDisabilitySchema),
  by_department: t.Array(DiversityByDepartmentSchema),
  hiring_trends: t.Array(DiversityTrendPointSchema),
  leaving_trends: t.Array(DiversityTrendPointSchema),
  diversity_completion: DiversityCompletionSchema,
  gender_pay_gap_summary: GenderPayGapSummarySchema,
  minimum_threshold: t.Number(),
  as_of_date: t.String(),
});

// =============================================================================
// Filter Schemas - Compensation
// =============================================================================

export const CompensationFiltersSchema = t.Object({
  org_unit_id: t.Optional(t.String({ format: "uuid" })),
  job_grade: t.Optional(t.String()),
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
  p25_salary: t.Number(),
  p75_salary: t.Number(),
  p90_salary: t.Number(),
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
  median_salary: t.Number(),
  min_salary: t.Number(),
  max_salary: t.Number(),
  total_payroll: t.Number(),
});

export const CompensationChangeSchema = t.Object({
  change_reason: t.String(),
  count: t.Number(),
  avg_change_percentage: t.Number(),
});

// =============================================================================
// Response Schemas - Compa-Ratio
// =============================================================================

export const CompaRatioByGradeSchema = t.Object({
  job_grade: t.String(),
  headcount: t.Number(),
  range_min: t.Number(),
  range_max: t.Number(),
  range_midpoint: t.Number(),
  avg_salary: t.Number(),
  avg_compa_ratio: t.Number(),
  below_range_count: t.Number(),
  within_range_count: t.Number(),
  above_range_count: t.Number(),
});

export const CompaRatioSummarySchema = t.Object({
  overall_avg_compa_ratio: t.Number(),
  total_employees_with_range: t.Number(),
  total_below_range: t.Number(),
  total_within_range: t.Number(),
  total_above_range: t.Number(),
  by_grade: t.Array(CompaRatioByGradeSchema),
});

// =============================================================================
// Response Schemas - Pay Equity
// =============================================================================

export const PayEquityByLevelSchema = t.Object({
  job_grade: t.String(),
  male_count: t.Number(),
  female_count: t.Number(),
  male_avg_salary: t.Number(),
  female_avg_salary: t.Number(),
  pay_gap_percentage: t.Union([t.Number(), t.Null()]),
  male_median_salary: t.Number(),
  female_median_salary: t.Number(),
  median_pay_gap_percentage: t.Union([t.Number(), t.Null()]),
});

export const PayEquitySummarySchema = t.Object({
  total_male: t.Number(),
  total_female: t.Number(),
  overall_male_avg_salary: t.Number(),
  overall_female_avg_salary: t.Number(),
  overall_mean_pay_gap_percentage: t.Union([t.Number(), t.Null()]),
  overall_median_pay_gap_percentage: t.Union([t.Number(), t.Null()]),
  by_level: t.Array(PayEquityByLevelSchema),
});

// =============================================================================
// Full Compensation Analytics Dashboard
// =============================================================================

export const CompensationDashboardSchema = t.Object({
  summary: CompensationSummarySchema,
  by_band: t.Array(CompensationByBandSchema),
  by_department: t.Array(CompensationByDepartmentSchema),
  recent_changes: t.Array(CompensationChangeSchema),
  compa_ratio: CompaRatioSummarySchema,
  pay_equity: PayEquitySummarySchema,
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
export type DiversityByEthnicity = Static<typeof DiversityByEthnicitySchema>;
export type DiversityByDisability = Static<typeof DiversityByDisabilitySchema>;
export type DiversityByDepartment = Static<typeof DiversityByDepartmentSchema>;
export type DiversityTrendPoint = Static<typeof DiversityTrendPointSchema>;
export type DiversityCompletion = Static<typeof DiversityCompletionSchema>;
export type GenderPayGapSummary = Static<typeof GenderPayGapSummarySchema>;
export type DiversityDashboard = Static<typeof DiversityDashboardSchema>;

export type CompensationFilters = Static<typeof CompensationFiltersSchema>;
export type CompensationSummary = Static<typeof CompensationSummarySchema>;
export type CompensationByBand = Static<typeof CompensationByBandSchema>;
export type CompensationByDepartment = Static<typeof CompensationByDepartmentSchema>;
export type CompensationChange = Static<typeof CompensationChangeSchema>;
export type CompensationDashboard = Static<typeof CompensationDashboardSchema>;
export type CompaRatioByGrade = Static<typeof CompaRatioByGradeSchema>;
export type CompaRatioSummary = Static<typeof CompaRatioSummarySchema>;
export type PayEquityByLevel = Static<typeof PayEquityByLevelSchema>;
export type PayEquitySummary = Static<typeof PayEquitySummarySchema>;

// =============================================================================
// Filter Schemas - Workforce Planning
// =============================================================================

export const WorkforcePlanningFiltersSchema = t.Object({
  horizon: t.Optional(
    t.String({
      description:
        "Planning horizon expressed as Nm or Ny, e.g. 12m, 24m, 3y. Defaults to 12m.",
      pattern: "^\\d+(m|y)$",
    })
  ),
  org_unit_id: t.Optional(t.String({ format: "uuid" })),
});

// =============================================================================
// Response Schemas - Workforce Planning: Headcount Projection
// =============================================================================

export const HeadcountProjectionPointSchema = t.Object({
  period: t.String({ description: "ISO date string for beginning of period (YYYY-MM-DD)" }),
  projected_headcount: t.Number({ description: "Projected total headcount at this point" }),
  projected_hires: t.Number({ description: "Projected new hires in this period" }),
  projected_terminations: t.Number({ description: "Projected terminations in this period" }),
  net_change: t.Number({ description: "Net change in headcount for this period" }),
});

export const HeadcountProjectionSchema = t.Object({
  current_headcount: t.Number(),
  monthly_growth_rate: t.Number({ description: "Observed monthly growth rate as a decimal (e.g. 0.02 = 2%)" }),
  observation_months: t.Number({ description: "Number of months of historical data used" }),
  projections: t.Array(HeadcountProjectionPointSchema),
});

// =============================================================================
// Response Schemas - Workforce Planning: Retirement Projection
// =============================================================================

export const RetirementRiskBandSchema = t.Object({
  years_to_retirement: t.String({ description: "Band label, e.g. '0-2 years', '3-5 years'" }),
  employee_count: t.Number(),
  percentage: t.Number({ description: "Percentage of active workforce" }),
  departments: t.Array(
    t.Object({
      org_unit_id: t.String(),
      org_unit_name: t.String(),
      count: t.Number(),
    })
  ),
});

export const RetirementProjectionSchema = t.Object({
  total_active_employees: t.Number(),
  employees_with_dob: t.Number({ description: "Employees who have a date of birth on file" }),
  state_pension_age_note: t.String({
    description: "Explanation of UK state pension age used (66-68)",
  }),
  risk_bands: t.Array(RetirementRiskBandSchema),
});

// =============================================================================
// Response Schemas - Workforce Planning: Attrition Forecast
// =============================================================================

export const AttritionHistoryPointSchema = t.Object({
  period: t.String({ description: "Period label (YYYY-MM)" }),
  terminations: t.Number(),
  avg_headcount: t.Number(),
  turnover_rate: t.Number({ description: "Annualised turnover rate for this month" }),
});

export const AttritionForecastPointSchema = t.Object({
  period: t.String({ description: "Projected period (YYYY-MM)" }),
  projected_turnover_rate: t.Number({ description: "Projected annualised turnover rate" }),
  projected_terminations: t.Number({ description: "Projected terminations in this period" }),
});

export const AttritionForecastSchema = t.Object({
  trailing_12m_turnover_rate: t.Number({ description: "Trailing 12-month annualised turnover rate" }),
  avg_monthly_terminations: t.Number(),
  observation_months: t.Number(),
  history: t.Array(AttritionHistoryPointSchema),
  forecast: t.Array(AttritionForecastPointSchema),
});

// =============================================================================
// Response Schemas - Workforce Planning: Skills Gap Analysis
// =============================================================================

export const SkillGapItemSchema = t.Object({
  competency_id: t.String(),
  competency_name: t.String(),
  competency_category: t.String(),
  employees_assessed: t.Number({ description: "Number of employees assessed on this competency" }),
  employees_required: t.Number({ description: "Number of positions requiring this competency" }),
  avg_current_level: t.Number({ description: "Average current proficiency across assessed employees" }),
  avg_required_level: t.Number({ description: "Average required proficiency across positions" }),
  avg_gap: t.Number({ description: "Average gap (required - current). Positive means deficiency." }),
  employees_below_required: t.Number({ description: "Number of employees below required level" }),
  coverage_rate: t.Number({
    description: "Percentage of required positions that have at least one employee meeting the requirement",
  }),
});

export const SkillsGapAnalysisSchema = t.Object({
  total_competencies_analysed: t.Number(),
  total_employees_with_assessments: t.Number(),
  gaps: t.Array(SkillGapItemSchema),
});

// =============================================================================
// Full Workforce Planning Dashboard
// =============================================================================

export const WorkforcePlanningDashboardSchema = t.Object({
  headcount_projection: HeadcountProjectionSchema,
  retirement_projection: RetirementProjectionSchema,
  attrition_forecast: AttritionForecastSchema,
  skills_gap_analysis: SkillsGapAnalysisSchema,
  generated_at: t.String({ description: "ISO timestamp when this report was generated" }),
  horizon_months: t.Number({ description: "Planning horizon in months" }),
});

// =============================================================================
// Type Exports - Workforce Planning
// =============================================================================

export type WorkforcePlanningFilters = Static<typeof WorkforcePlanningFiltersSchema>;
export type HeadcountProjectionPoint = Static<typeof HeadcountProjectionPointSchema>;
export type HeadcountProjection = Static<typeof HeadcountProjectionSchema>;
export type RetirementRiskBand = Static<typeof RetirementRiskBandSchema>;
export type RetirementProjection = Static<typeof RetirementProjectionSchema>;
export type AttritionHistoryPoint = Static<typeof AttritionHistoryPointSchema>;
export type AttritionForecastPoint = Static<typeof AttritionForecastPointSchema>;
export type AttritionForecast = Static<typeof AttritionForecastSchema>;
export type SkillGapItem = Static<typeof SkillGapItemSchema>;
export type SkillsGapAnalysis = Static<typeof SkillsGapAnalysisSchema>;
export type WorkforcePlanningDashboard = Static<typeof WorkforcePlanningDashboardSchema>;
