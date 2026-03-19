/**
 * Sickness Analytics Module - TypeBox Schemas
 *
 * Defines validation schemas for sickness absence trend analysis endpoints.
 * Covers: trends over time, breakdown by reason, department analysis with
 * Bradford Factor, seasonal patterns, and summary metrics.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Filter Schemas
// =============================================================================

/**
 * Common filter parameters shared across all sickness analytics endpoints.
 * All filters are optional; defaults are applied in the service layer.
 */
export const SicknessAnalyticsFiltersSchema = t.Object({
  department_id: t.Optional(
    t.String({
      format: "uuid",
      description: "Filter by department (org_unit_id)",
    })
  ),
  start_date: t.Optional(
    t.String({
      format: "date",
      description: "Start of date range (default: 12 months ago)",
    })
  ),
  end_date: t.Optional(
    t.String({
      format: "date",
      description: "End of date range (default: today)",
    })
  ),
  employee_group: t.Optional(
    t.String({
      description:
        "Employee group filter: 'full_time', 'part_time', 'contract', or omit for all",
    })
  ),
});

export type SicknessAnalyticsFilters = Static<
  typeof SicknessAnalyticsFiltersSchema
>;

// =============================================================================
// Response Schemas - Trends (Monthly)
// =============================================================================

/**
 * A single monthly data point in the sickness trend series.
 */
export const SicknessTrendPointSchema = t.Object({
  month: t.String({ description: "Month label (YYYY-MM)" }),
  total_days_lost: t.Number({
    description: "Total sickness days lost in this month",
  }),
  total_spells: t.Number({
    description: "Number of separate sickness absence spells",
  }),
  unique_employees: t.Number({
    description: "Number of unique employees absent due to sickness",
  }),
  absence_rate: t.Number({
    description:
      "Sickness absence rate as percentage of available working days",
  }),
});

export type SicknessTrendPoint = Static<typeof SicknessTrendPointSchema>;

export const SicknessTrendsResponseSchema = t.Object({
  items: t.Array(SicknessTrendPointSchema),
  period: t.Object({
    start_date: t.String(),
    end_date: t.String(),
  }),
  total_days_lost: t.Number({
    description: "Total sickness days lost across the full period",
  }),
  total_spells: t.Number({
    description: "Total number of sickness spells across the full period",
  }),
});

export type SicknessTrendsResponse = Static<
  typeof SicknessTrendsResponseSchema
>;

// =============================================================================
// Response Schemas - By Reason
// =============================================================================

/**
 * Sickness absence breakdown by reported reason.
 */
export const SicknessByReasonItemSchema = t.Object({
  reason: t.String({
    description: "Absence reason as reported by the employee",
  }),
  total_days: t.Number({ description: "Total sickness days for this reason" }),
  total_spells: t.Number({
    description: "Number of separate absence spells for this reason",
  }),
  unique_employees: t.Number({
    description: "Number of unique employees citing this reason",
  }),
  percentage_of_days: t.Number({
    description: "Percentage of total sickness days attributed to this reason",
  }),
  avg_spell_duration: t.Number({
    description: "Average duration of an absence spell for this reason (days)",
  }),
});

export type SicknessByReasonItem = Static<typeof SicknessByReasonItemSchema>;

export const SicknessByReasonResponseSchema = t.Object({
  items: t.Array(SicknessByReasonItemSchema),
  total_sickness_days: t.Number(),
  total_sickness_spells: t.Number(),
  period: t.Object({
    start_date: t.String(),
    end_date: t.String(),
  }),
});

export type SicknessByReasonResponse = Static<
  typeof SicknessByReasonResponseSchema
>;

// =============================================================================
// Response Schemas - By Department
// =============================================================================

/**
 * Department-level sickness metrics including Bradford Factor aggregate.
 */
export const SicknessByDepartmentItemSchema = t.Object({
  department_id: t.String(),
  department_name: t.String(),
  headcount: t.Number({ description: "Active headcount in this department" }),
  total_days_lost: t.Number({
    description: "Total sickness days lost in this department",
  }),
  total_spells: t.Number({ description: "Total sickness spells" }),
  unique_employees: t.Number({
    description: "Number of employees with at least one sickness absence",
  }),
  absence_rate: t.Number({
    description:
      "Sickness absence rate as percentage of available working days",
  }),
  avg_days_per_employee: t.Number({
    description: "Average sickness days per employee",
  }),
  avg_bradford_factor: t.Number({
    description: "Average Bradford Factor score for employees in department",
  }),
  bradford_high_count: t.Number({
    description:
      "Number of employees with Bradford Factor at high or serious level",
  }),
});

export type SicknessByDepartmentItem = Static<
  typeof SicknessByDepartmentItemSchema
>;

export const SicknessByDepartmentResponseSchema = t.Object({
  items: t.Array(SicknessByDepartmentItemSchema),
  period: t.Object({
    start_date: t.String(),
    end_date: t.String(),
  }),
});

export type SicknessByDepartmentResponse = Static<
  typeof SicknessByDepartmentResponseSchema
>;

// =============================================================================
// Response Schemas - Seasonal Patterns
// =============================================================================

/**
 * Monthly average sickness data across multiple years to reveal seasonal patterns.
 */
export const SicknessSeasonalPointSchema = t.Object({
  month_of_year: t.Number({
    description: "Month number (1-12)",
    minimum: 1,
    maximum: 12,
  }),
  month_name: t.String({ description: "Month name (January, February, ...)" }),
  avg_days_lost: t.Number({
    description: "Average sickness days lost for this month across years",
  }),
  avg_spells: t.Number({
    description: "Average number of sickness spells for this month",
  }),
  avg_absence_rate: t.Number({
    description: "Average absence rate for this month across years",
  }),
  years_of_data: t.Number({
    description: "Number of years of data included in the average",
  }),
});

export type SicknessSeasonalPoint = Static<typeof SicknessSeasonalPointSchema>;

export const SicknessSeasonalResponseSchema = t.Object({
  items: t.Array(SicknessSeasonalPointSchema),
  peak_month: t.String({
    description: "Month name with the highest average sickness absence",
  }),
  lowest_month: t.String({
    description: "Month name with the lowest average sickness absence",
  }),
  years_analysed: t.Number({
    description: "Number of distinct years included in the analysis",
  }),
});

export type SicknessSeasonalResponse = Static<
  typeof SicknessSeasonalResponseSchema
>;

// =============================================================================
// Response Schemas - Summary
// =============================================================================

/**
 * Key sickness absence metrics and KPIs.
 */
export const SicknessSummaryResponseSchema = t.Object({
  total_sickness_days: t.Number({
    description: "Total sickness days lost in the period",
  }),
  total_sickness_spells: t.Number({
    description: "Total number of separate sickness absence spells",
  }),
  unique_employees_absent: t.Number({
    description: "Number of employees with at least one sickness absence",
  }),
  total_active_employees: t.Number({
    description: "Total active employees (denominator for rates)",
  }),
  absence_rate: t.Number({
    description: "Overall sickness absence rate (percentage of working days)",
  }),
  avg_days_per_employee: t.Number({
    description: "Average sickness days per employee (all employees)",
  }),
  avg_days_per_spell: t.Number({
    description: "Average duration of a sickness spell (days)",
  }),
  avg_spells_per_absent_employee: t.Number({
    description: "Average spells per employee who was absent",
  }),
  frequency_rate: t.Number({
    description:
      "Sickness spell frequency rate (spells per 100 employees per month)",
  }),
  estimated_cost: t.Number({
    description:
      "Estimated cost of sickness absence (days x average daily salary)",
  }),
  estimated_cost_currency: t.String({ description: "Currency code (GBP)" }),
  short_term_days: t.Number({
    description: "Days lost to short-term absence (1-7 days)",
  }),
  long_term_days: t.Number({
    description: "Days lost to long-term absence (>7 days)",
  }),
  short_term_percentage: t.Number({
    description: "Percentage of sickness days from short-term absences",
  }),
  long_term_percentage: t.Number({
    description: "Percentage of sickness days from long-term absences",
  }),
  period: t.Object({
    start_date: t.String(),
    end_date: t.String(),
  }),
});

export type SicknessSummaryResponse = Static<
  typeof SicknessSummaryResponseSchema
>;
