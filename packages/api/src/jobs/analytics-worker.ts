/**
 * Analytics Worker
 *
 * Processes analytics events and aggregates HR metrics:
 * - Time & Attendance data aggregation
 * - Headcount and turnover calculations
 * - Leave balance and utilization metrics
 * - Performance and engagement scores
 * - Custom metric calculations
 *
 * Features:
 * - Scheduled and on-demand processing
 * - Incremental and full recalculation
 * - Multi-dimensional aggregation
 * - Historical trend tracking
 */

import {
  type JobPayload,
  type JobContext,
  type ProcessorRegistration,
  JobTypes,
  sleep,
} from "./base";

// =============================================================================
// Types
// =============================================================================

/**
 * Analytics metric types
 */
export type MetricType =
  | "headcount"
  | "turnover"
  | "time_attendance"
  | "leave_utilization"
  | "overtime"
  | "absence_rate"
  | "tenure"
  | "compensation"
  | "custom";

/**
 * Time granularity for aggregation
 */
export type TimeGranularity = "hour" | "day" | "week" | "month" | "quarter" | "year";

/**
 * Dimension for grouping
 */
export type Dimension =
  | "tenant"
  | "org_unit"
  | "department"
  | "cost_center"
  | "location"
  | "employment_type"
  | "job_level"
  | "gender"
  | "age_band"
  | "tenure_band";

/**
 * Analytics aggregate job payload
 */
export interface AnalyticsAggregatePayload {
  /** Metric type to calculate */
  metricType: MetricType;
  /** Time period start */
  periodStart: string;
  /** Time period end */
  periodEnd: string;
  /** Time granularity */
  granularity: TimeGranularity;
  /** Dimensions to aggregate by */
  dimensions?: Dimension[];
  /** Whether to recalculate (vs incremental) */
  forceRecalculate?: boolean;
  /** Custom metric configuration */
  customConfig?: Record<string, unknown>;
}

/**
 * Analytics metrics calculation job payload
 */
export interface AnalyticsMetricsPayload {
  /** Metrics to calculate */
  metrics: MetricType[];
  /** As-of date for calculations */
  asOfDate: string;
  /** Dimensions to include */
  dimensions?: Dimension[];
  /** Specific org units to calculate (empty = all) */
  orgUnits?: string[];
}

/**
 * Metric result
 */
export interface MetricResult {
  metricType: MetricType;
  value: number;
  unit: string;
  period: string;
  dimensions: Record<string, string>;
  calculatedAt: Date;
}

/**
 * Aggregated metric record
 */
export interface AggregatedMetric {
  tenantId: string;
  metricType: MetricType;
  granularity: TimeGranularity;
  periodStart: Date;
  periodEnd: Date;
  dimensions: Record<string, string>;
  value: number;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  metadata: Record<string, unknown>;
  calculatedAt: Date;
}

// =============================================================================
// Metric Calculators
// =============================================================================

/**
 * Calculate headcount metrics
 *
 * Performs all aggregation in a single SQL query including:
 * - Total headcount per dimension group
 * - Active vs on_leave breakdown via FILTER clauses
 * - FTE sum from employment contracts
 * This avoids fetching raw rows and aggregating in TypeScript.
 */
async function calculateHeadcount(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  asOfDate: Date,
  dimensions: Dimension[]
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];
  const period = asOfDate.toISOString().split("T")[0] || "";
  const now = new Date();

  const wantOrgUnit = dimensions.includes("org_unit") || dimensions.includes("department");
  const wantEmploymentType = dimensions.includes("employment_type");

  const headcount = await db.withSystemContext(async (tx) => {
    return await tx<Array<{
      totalCount: number;
      activeCount: number;
      onLeaveCount: number;
      totalFte: number;
      department: string | null;
      orgUnitId: string | null;
      employmentType: string | null;
    }>>`
      SELECT
        COUNT(DISTINCT e.id)::int as "totalCount",
        COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'active')::int as "activeCount",
        COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'on_leave')::int as "onLeaveCount",
        COALESCE(SUM(ec.fte), 0)::numeric(10,2) as "totalFte",
        ${wantOrgUnit ? tx`COALESCE(ou.name, 'Unassigned') as department,` : tx``}
        ${wantOrgUnit ? tx`pa.org_unit_id::text as "orgUnitId",` : tx``}
        ${wantEmploymentType ? tx`ec.employment_type::text as "employmentType",` : tx``}
        1 as _dummy
      FROM app.employees e
      LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id
        AND pa.is_primary = true
        AND pa.effective_from <= ${asOfDate}
        AND (pa.effective_to IS NULL OR pa.effective_to > ${asOfDate})
      LEFT JOIN app.org_units ou ON ou.id = pa.org_unit_id
      LEFT JOIN app.employment_contracts ec ON ec.employee_id = e.id
        AND ec.effective_from <= ${asOfDate}
        AND (ec.effective_to IS NULL OR ec.effective_to > ${asOfDate})
      WHERE e.tenant_id = ${tenantId}::uuid
        AND e.status IN ('active', 'on_leave')
        AND e.hire_date <= ${asOfDate}
        AND (e.termination_date IS NULL OR e.termination_date > ${asOfDate})
      GROUP BY
        ${wantOrgUnit && wantEmploymentType
          ? tx`ou.name, pa.org_unit_id, ec.employment_type`
          : wantOrgUnit
            ? tx`ou.name, pa.org_unit_id`
            : wantEmploymentType
              ? tx`ec.employment_type`
              : tx`1`}
    `;
  });

  for (const row of headcount) {
    const dims: Record<string, string> = {};
    if (row.orgUnitId) dims.orgUnitId = row.orgUnitId;
    if (row.department) dims.department = row.department;
    if (row.employmentType) dims.employmentType = row.employmentType;

    // Total headcount for this dimension group
    results.push({
      metricType: "headcount",
      value: Number(row.totalCount),
      unit: "employees",
      period,
      dimensions: { ...dims, metric: "total" },
      calculatedAt: now,
    });

    // Active count
    results.push({
      metricType: "headcount",
      value: Number(row.activeCount),
      unit: "employees",
      period,
      dimensions: { ...dims, metric: "active" },
      calculatedAt: now,
    });

    // On leave count
    results.push({
      metricType: "headcount",
      value: Number(row.onLeaveCount),
      unit: "employees",
      period,
      dimensions: { ...dims, metric: "on_leave" },
      calculatedAt: now,
    });

    // FTE total
    results.push({
      metricType: "headcount",
      value: Number(row.totalFte),
      unit: "fte",
      period,
      dimensions: { ...dims, metric: "fte" },
      calculatedAt: now,
    });
  }

  return results;
}

/**
 * Calculate turnover metrics
 *
 * Computes total and voluntary turnover rates entirely in SQL.
 * Uses the employee_status_history table (column: effective_date, not effective_from)
 * and calculates average headcount via the period-start/end method.
 * Returns both raw counts and percentage rates directly from the query.
 */
async function calculateTurnover(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  _dimensions: Dimension[]
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];
  const period = `${periodStart.toISOString().split("T")[0]}/${periodEnd.toISOString().split("T")[0]}`;
  const now = new Date();

  // Single query computes all turnover metrics: counts, avg headcount, and rates
  const turnoverData = await db.withSystemContext(async (tx) => {
    return await tx<Array<{
      terminations: number;
      voluntaryTerminations: number;
      newHires: number;
      startHeadcount: number;
      endHeadcount: number;
      avgHeadcount: number;
      totalTurnoverRate: number;
      voluntaryTurnoverRate: number;
    }>>`
      WITH
        termination_counts AS (
          SELECT
            COUNT(DISTINCT e.id)::int as total,
            COUNT(DISTINCT e.id) FILTER (
              WHERE esh.reason = 'resignation'
            )::int as voluntary
          FROM app.employees e
          INNER JOIN app.employee_status_history esh ON esh.employee_id = e.id
            AND esh.to_status = 'terminated'
            AND esh.effective_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
          WHERE e.tenant_id = ${tenantId}::uuid
        ),
        hire_counts AS (
          SELECT COUNT(DISTINCT e.id)::int as total
          FROM app.employees e
          WHERE e.tenant_id = ${tenantId}::uuid
            AND e.hire_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
        ),
        headcount_start AS (
          SELECT COUNT(*)::int as cnt
          FROM app.employees e
          WHERE e.tenant_id = ${tenantId}::uuid
            AND e.hire_date <= ${periodStart}::date
            AND (e.termination_date IS NULL OR e.termination_date > ${periodStart}::date)
        ),
        headcount_end AS (
          SELECT COUNT(*)::int as cnt
          FROM app.employees e
          WHERE e.tenant_id = ${tenantId}::uuid
            AND e.hire_date <= ${periodEnd}::date
            AND (e.termination_date IS NULL OR e.termination_date > ${periodEnd}::date)
        )
      SELECT
        tc.total as terminations,
        tc.voluntary as "voluntaryTerminations",
        hc.total as "newHires",
        hs.cnt as "startHeadcount",
        he.cnt as "endHeadcount",
        GREATEST((hs.cnt + he.cnt) / 2.0, 1) as "avgHeadcount",
        CASE WHEN (hs.cnt + he.cnt) > 0
          THEN ROUND((tc.total::numeric / GREATEST((hs.cnt + he.cnt) / 2.0, 1)) * 100, 2)
          ELSE 0
        END as "totalTurnoverRate",
        CASE WHEN (hs.cnt + he.cnt) > 0
          THEN ROUND((tc.voluntary::numeric / GREATEST((hs.cnt + he.cnt) / 2.0, 1)) * 100, 2)
          ELSE 0
        END as "voluntaryTurnoverRate"
      FROM termination_counts tc
      CROSS JOIN hire_counts hc
      CROSS JOIN headcount_start hs
      CROSS JOIN headcount_end he
    `;
  });

  const data = turnoverData[0];

  // Total turnover rate (already computed in SQL)
  results.push({
    metricType: "turnover",
    value: Number(data?.totalTurnoverRate ?? 0),
    unit: "percent",
    period,
    dimensions: { type: "total" },
    calculatedAt: now,
  });

  // Voluntary turnover rate
  results.push({
    metricType: "turnover",
    value: Number(data?.voluntaryTurnoverRate ?? 0),
    unit: "percent",
    period,
    dimensions: { type: "voluntary" },
    calculatedAt: now,
  });

  // Raw counts (useful for dashboards)
  results.push({
    metricType: "turnover",
    value: Number(data?.terminations ?? 0),
    unit: "employees",
    period,
    dimensions: { type: "termination_count" },
    calculatedAt: now,
  });

  results.push({
    metricType: "turnover",
    value: Number(data?.newHires ?? 0),
    unit: "employees",
    period,
    dimensions: { type: "new_hire_count" },
    calculatedAt: now,
  });

  return results;
}

/**
 * Calculate time and attendance metrics
 */
async function calculateTimeAttendance(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  _dimensions: Dimension[]
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];

  // Get time event aggregates
  const timeData = await db.withSystemContext(async (tx) => {
    return await tx<Array<{
      totalHours: number;
      avgDailyHours: number;
      overtimeHours: number;
      lateArrivals: number;
      earlyDepartures: number;
      workDays: number;
    }>>`
      WITH daily_summary AS (
        SELECT
          te.employee_id,
          DATE(te.event_time) as work_date,
          SUM(CASE WHEN te.event_type = 'clock_out' THEN
            EXTRACT(EPOCH FROM (te.event_time - lag(te.event_time) OVER (
              PARTITION BY te.employee_id, DATE(te.event_time)
              ORDER BY te.event_time
            ))) / 3600.0
          ELSE 0 END) as worked_hours,
          MIN(CASE WHEN te.event_type = 'clock_in' THEN te.event_time END) as first_clock_in
        FROM app.time_events te
        WHERE te.tenant_id = ${tenantId}::uuid
          AND te.event_time BETWEEN ${periodStart} AND ${periodEnd}
        GROUP BY te.employee_id, DATE(te.event_time)
      )
      SELECT
        COALESCE(SUM(worked_hours), 0) as "totalHours",
        COALESCE(AVG(worked_hours), 0) as "avgDailyHours",
        COALESCE(SUM(GREATEST(worked_hours - 8, 0)), 0) as "overtimeHours",
        COUNT(DISTINCT work_date) as "workDays"
      FROM daily_summary
    `;
  });

  const data = timeData[0];

  results.push({
    metricType: "time_attendance",
    value: Math.round(Number(data?.totalHours ?? 0) * 100) / 100,
    unit: "hours",
    period: `${periodStart.toISOString().split("T")[0]}/${periodEnd.toISOString().split("T")[0]}`,
    dimensions: { metric: "total_hours" },
    calculatedAt: new Date(),
  });

  results.push({
    metricType: "overtime",
    value: Math.round(Number(data?.overtimeHours ?? 0) * 100) / 100,
    unit: "hours",
    period: `${periodStart.toISOString().split("T")[0]}/${periodEnd.toISOString().split("T")[0]}`,
    dimensions: { metric: "overtime_hours" },
    calculatedAt: new Date(),
  });

  results.push({
    metricType: "time_attendance",
    value: Math.round(Number(data?.avgDailyHours ?? 0) * 100) / 100,
    unit: "hours",
    period: `${periodStart.toISOString().split("T")[0]}/${periodEnd.toISOString().split("T")[0]}`,
    dimensions: { metric: "avg_daily_hours" },
    calculatedAt: new Date(),
  });

  return results;
}

/**
 * Calculate leave utilization metrics
 */
async function calculateLeaveUtilization(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  _dimensions: Dimension[]
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];

  // Get leave data
  const leaveData = await db.withSystemContext(async (tx) => {
    return await tx<Array<{
      leaveType: string;
      totalDays: number;
      requestCount: number;
    }>>`
      SELECT
        lt.name as "leaveType",
        COALESCE(SUM(
          CASE WHEN lr.status = 'approved' THEN
            (lr.end_date - lr.start_date + 1)::integer
          ELSE 0 END
        ), 0) as "totalDays",
        COUNT(DISTINCT CASE WHEN lr.status = 'approved' THEN lr.id END) as "requestCount"
      FROM app.leave_types lt
      LEFT JOIN app.leave_requests lr ON lr.leave_type_id = lt.id
        AND lr.start_date <= ${periodEnd}
        AND lr.end_date >= ${periodStart}
      WHERE lt.tenant_id = ${tenantId}::uuid
      GROUP BY lt.name
    `;
  });

  for (const row of leaveData) {
    results.push({
      metricType: "leave_utilization",
      value: Number(row.totalDays),
      unit: "days",
      period: `${periodStart.toISOString().split("T")[0]}/${periodEnd.toISOString().split("T")[0]}`,
      dimensions: { leaveType: row.leaveType },
      calculatedAt: new Date(),
    });
  }

  return results;
}

/**
 * Calculate absence rate metrics
 *
 * Computes absence rate entirely in SQL including:
 * - Calendar days in period (computed via date arithmetic in SQL)
 * - Total absence days clipped to period boundaries
 * - Employee count and absence rate percentage
 * This avoids the previous pattern of computing working days in TypeScript.
 */
async function calculateAbsenceRate(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  _dimensions: Dimension[]
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];
  const period = `${periodStart.toISOString().split("T")[0]}/${periodEnd.toISOString().split("T")[0]}`;
  const now = new Date();

  // Single query computes employee count, absence days, calendar days, and rate
  const absenceData = await db.withSystemContext(async (tx) => {
    return await tx<Array<{
      employeeCount: number;
      absenceDays: number;
      calendarDays: number;
      absenceRate: number;
    }>>`
      WITH
        period_info AS (
          SELECT
            (${periodEnd}::date - ${periodStart}::date + 1)::int as calendar_days
        ),
        employee_absences AS (
          SELECT
            e.id as employee_id,
            COALESCE(SUM(
              CASE WHEN lr.status = 'approved' THEN
                LEAST(lr.end_date, ${periodEnd}::date) - GREATEST(lr.start_date, ${periodStart}::date) + 1
              ELSE 0 END
            ), 0)::int as absence_days
          FROM app.employees e
          LEFT JOIN app.leave_requests lr ON lr.employee_id = e.id
            AND lr.start_date <= ${periodEnd}::date
            AND lr.end_date >= ${periodStart}::date
          WHERE e.tenant_id = ${tenantId}::uuid
            AND e.status IN ('active', 'on_leave')
          GROUP BY e.id
        )
      SELECT
        COUNT(DISTINCT ea.employee_id)::int as "employeeCount",
        COALESCE(SUM(ea.absence_days), 0)::int as "absenceDays",
        pi.calendar_days as "calendarDays",
        CASE WHEN COUNT(DISTINCT ea.employee_id) * pi.calendar_days > 0
          THEN ROUND(
            (SUM(ea.absence_days)::numeric / (COUNT(DISTINCT ea.employee_id) * pi.calendar_days)) * 100,
            2
          )
          ELSE 0
        END as "absenceRate"
      FROM employee_absences ea
      CROSS JOIN period_info pi
      GROUP BY pi.calendar_days
    `;
  });

  const data = absenceData[0];

  results.push({
    metricType: "absence_rate",
    value: Number(data?.absenceRate ?? 0),
    unit: "percent",
    period,
    dimensions: {},
    calculatedAt: now,
  });

  // Also emit raw absence days for dashboard use
  results.push({
    metricType: "absence_rate",
    value: Number(data?.absenceDays ?? 0),
    unit: "days",
    period,
    dimensions: { metric: "total_absence_days" },
    calculatedAt: now,
  });

  results.push({
    metricType: "absence_rate",
    value: Number(data?.employeeCount ?? 0),
    unit: "employees",
    period,
    dimensions: { metric: "employee_count" },
    calculatedAt: now,
  });

  return results;
}

/**
 * Calculate tenure metrics
 *
 * Computes average, median, and band-percentage distribution entirely in SQL.
 * The percentage calculation (count per band / total * 100) is done in the query
 * rather than in TypeScript to avoid division in the application layer.
 */
async function calculateTenure(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  asOfDate: Date,
  _dimensions: Dimension[]
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];
  const period = asOfDate.toISOString().split("T")[0] || "";
  const now = new Date();

  // Single query: stats + band percentages computed in SQL
  const tenureData = await db.withSystemContext(async (tx) => {
    return await tx<Array<{
      avgTenure: number;
      medianTenure: number;
      totalEmployees: number;
      lessThan1YearPct: number;
      oneToThreeYearsPct: number;
      threeToFiveYearsPct: number;
      moreThan5YearsPct: number;
      lessThan1YearCount: number;
      oneToThreeYearsCount: number;
      threeToFiveYearsCount: number;
      moreThan5YearsCount: number;
    }>>`
      WITH employee_tenure AS (
        SELECT
          e.id,
          EXTRACT(YEAR FROM age(${asOfDate}::date, e.hire_date)) +
          EXTRACT(MONTH FROM age(${asOfDate}::date, e.hire_date)) / 12.0 as tenure_years
        FROM app.employees e
        WHERE e.tenant_id = ${tenantId}::uuid
          AND e.status = 'active'
          AND e.hire_date <= ${asOfDate}::date
      )
      SELECT
        ROUND(COALESCE(AVG(tenure_years), 0)::numeric, 2) as "avgTenure",
        ROUND(COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tenure_years), 0)::numeric, 2) as "medianTenure",
        COUNT(*)::int as "totalEmployees",
        COUNT(CASE WHEN tenure_years < 1 THEN 1 END)::int as "lessThan1YearCount",
        COUNT(CASE WHEN tenure_years >= 1 AND tenure_years < 3 THEN 1 END)::int as "oneToThreeYearsCount",
        COUNT(CASE WHEN tenure_years >= 3 AND tenure_years < 5 THEN 1 END)::int as "threeToFiveYearsCount",
        COUNT(CASE WHEN tenure_years >= 5 THEN 1 END)::int as "moreThan5YearsCount",
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(CASE WHEN tenure_years < 1 THEN 1 END)::numeric / COUNT(*) * 100, 2)
          ELSE 0 END as "lessThan1YearPct",
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(CASE WHEN tenure_years >= 1 AND tenure_years < 3 THEN 1 END)::numeric / COUNT(*) * 100, 2)
          ELSE 0 END as "oneToThreeYearsPct",
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(CASE WHEN tenure_years >= 3 AND tenure_years < 5 THEN 1 END)::numeric / COUNT(*) * 100, 2)
          ELSE 0 END as "threeToFiveYearsPct",
        CASE WHEN COUNT(*) > 0
          THEN ROUND(COUNT(CASE WHEN tenure_years >= 5 THEN 1 END)::numeric / COUNT(*) * 100, 2)
          ELSE 0 END as "moreThan5YearsPct"
      FROM employee_tenure
    `;
  });

  const data = tenureData[0];

  results.push({
    metricType: "tenure",
    value: Number(data?.avgTenure ?? 0),
    unit: "years",
    period,
    dimensions: { metric: "average" },
    calculatedAt: now,
  });

  results.push({
    metricType: "tenure",
    value: Number(data?.medianTenure ?? 0),
    unit: "years",
    period,
    dimensions: { metric: "median" },
    calculatedAt: now,
  });

  // Tenure distribution percentages (already computed in SQL)
  const bands: Array<{ band: string; pct: number; count: number }> = [
    { band: "<1 year", pct: Number(data?.lessThan1YearPct ?? 0), count: Number(data?.lessThan1YearCount ?? 0) },
    { band: "1-3 years", pct: Number(data?.oneToThreeYearsPct ?? 0), count: Number(data?.oneToThreeYearsCount ?? 0) },
    { band: "3-5 years", pct: Number(data?.threeToFiveYearsPct ?? 0), count: Number(data?.threeToFiveYearsCount ?? 0) },
    { band: "5+ years", pct: Number(data?.moreThan5YearsPct ?? 0), count: Number(data?.moreThan5YearsCount ?? 0) },
  ];

  for (const { band, pct, count } of bands) {
    results.push({
      metricType: "tenure",
      value: pct,
      unit: "percent",
      period,
      dimensions: { band },
      calculatedAt: now,
    });

    // Also emit raw counts per band
    results.push({
      metricType: "tenure",
      value: count,
      unit: "employees",
      period,
      dimensions: { band, metric: "count" },
      calculatedAt: now,
    });
  }

  return results;
}

// =============================================================================
// Incremental Computation Check
// =============================================================================

/**
 * Default staleness threshold for analytics data (in minutes).
 * If the last computation was within this window, skip recalculation.
 */
const STALENESS_THRESHOLD_MINUTES = 60;

/**
 * Check if a metric was recently computed and can be skipped.
 * Returns true if the metric was computed within the staleness threshold.
 */
async function isRecentlyComputed(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  metricType: MetricType,
  granularity: TimeGranularity,
  periodStart: Date,
  thresholdMinutes: number = STALENESS_THRESHOLD_MINUTES
): Promise<boolean> {
  const result = await db.withSystemContext(async (tx) => {
    return await tx<Array<{ recentCount: number }>>`
      SELECT COUNT(*)::int as "recentCount"
      FROM app.analytics_aggregates
      WHERE tenant_id = ${tenantId}::uuid
        AND metric_type = ${metricType}
        AND granularity = ${granularity}
        AND period_start = ${periodStart}
        AND calculated_at > now() - make_interval(mins => ${thresholdMinutes})
      LIMIT 1
    `;
  });
  return Number(result[0]?.recentCount ?? 0) > 0;
}

// =============================================================================
// Aggregation Processor
// =============================================================================

/**
 * Process analytics aggregation job
 */
async function processAnalyticsAggregate(
  payload: JobPayload<AnalyticsAggregatePayload>,
  context: JobContext
): Promise<void> {
  const { log, db } = context;
  const {
    metricType,
    periodStart,
    periodEnd,
    granularity,
    dimensions = [],
    forceRecalculate,
  } = payload.data;

  if (!payload.tenantId) {
    throw new Error("Tenant ID is required for analytics");
  }

  log.info(`Processing ${metricType} aggregation`, {
    periodStart,
    periodEnd,
    granularity,
    dimensions,
  });

  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd);

  // Incremental computation: skip if recently computed and not forced
  if (!forceRecalculate) {
    const recent = await isRecentlyComputed(
      db, payload.tenantId, metricType, granularity, startDate
    );
    if (recent) {
      log.info(`Skipping ${metricType} aggregation — computed within last ${STALENESS_THRESHOLD_MINUTES} minutes`);
      return;
    }
  }

  const results: MetricResult[] = [];

  try {
    // Calculate metrics based on type
    switch (metricType) {
      case "headcount":
        results.push(...await calculateHeadcount(db, payload.tenantId, endDate, dimensions));
        break;

      case "turnover":
        results.push(...await calculateTurnover(db, payload.tenantId, startDate, endDate, dimensions));
        break;

      case "time_attendance":
      case "overtime":
        results.push(...await calculateTimeAttendance(db, payload.tenantId, startDate, endDate, dimensions));
        break;

      case "leave_utilization":
        results.push(...await calculateLeaveUtilization(db, payload.tenantId, startDate, endDate, dimensions));
        break;

      case "absence_rate":
        results.push(...await calculateAbsenceRate(db, payload.tenantId, startDate, endDate, dimensions));
        break;

      case "tenure":
        results.push(...await calculateTenure(db, payload.tenantId, endDate, dimensions));
        break;

      default:
        log.warn(`Unknown metric type: ${metricType}`);
    }

    // Store aggregated metrics in batch (single transaction)
    if (results.length > 0) {
      await storeAggregatedMetricsBatch(
        db,
        results.map((result) => ({
          tenantId: payload.tenantId!,
          metricType: result.metricType,
          granularity,
          periodStart: startDate,
          periodEnd: endDate,
          dimensions: result.dimensions,
          value: result.value,
          count: 1,
          sum: result.value,
          min: result.value,
          max: result.value,
          avg: result.value,
          metadata: { unit: result.unit },
          calculatedAt: result.calculatedAt,
        })),
        forceRecalculate ?? false
      );
    }

    log.info(`Stored ${results.length} aggregated metrics`);
  } catch (error) {
    log.error("Analytics aggregation failed", error);
    throw error;
  }
}

// =============================================================================
// Metrics Calculation Processor
// =============================================================================

/**
 * Process metrics calculation job
 */
async function processAnalyticsMetrics(
  payload: JobPayload<AnalyticsMetricsPayload>,
  context: JobContext
): Promise<void> {
  const { log, db } = context;
  const { metrics, asOfDate, dimensions = [] } = payload.data;

  if (!payload.tenantId) {
    throw new Error("Tenant ID is required for analytics");
  }

  log.info(`Calculating metrics: ${metrics.join(", ")}`, { asOfDate });

  const date = new Date(asOfDate);
  const allResults: MetricResult[] = [];

  try {
    for (const metricType of metrics) {
      switch (metricType) {
        case "headcount":
          allResults.push(...await calculateHeadcount(db, payload.tenantId, date, dimensions));
          break;

        case "tenure":
          allResults.push(...await calculateTenure(db, payload.tenantId, date, dimensions));
          break;

        // For period-based metrics, calculate for the month ending on asOfDate
        case "turnover":
        case "time_attendance":
        case "overtime":
        case "leave_utilization":
        case "absence_rate": {
          const periodStart = new Date(date);
          periodStart.setMonth(periodStart.getMonth() - 1);

          if (metricType === "turnover") {
            allResults.push(...await calculateTurnover(db, payload.tenantId, periodStart, date, dimensions));
          } else if (metricType === "time_attendance" || metricType === "overtime") {
            allResults.push(...await calculateTimeAttendance(db, payload.tenantId, periodStart, date, dimensions));
          } else if (metricType === "leave_utilization") {
            allResults.push(...await calculateLeaveUtilization(db, payload.tenantId, periodStart, date, dimensions));
          } else if (metricType === "absence_rate") {
            allResults.push(...await calculateAbsenceRate(db, payload.tenantId, periodStart, date, dimensions));
          }
          break;
        }
      }

      // Add delay between metric calculations to avoid overwhelming the database
      await sleep(100);
    }

    // Store all results in a single transaction (batch)
    if (allResults.length > 0) {
      await storeMetricSnapshotsBatch(db, allResults.map((result) => ({
        tenantId: payload.tenantId!,
        metricType: result.metricType,
        asOfDate: date,
        dimensions: result.dimensions,
        value: result.value,
        unit: result.unit,
        calculatedAt: result.calculatedAt,
      })));
    }

    log.info(`Calculated and stored ${allResults.length} metric values`);
  } catch (error) {
    log.error("Metrics calculation failed", error);
    throw error;
  }
}

// =============================================================================
// Database Operations
// =============================================================================

/**
 * Store aggregated metric
 */
async function storeAggregatedMetric(
  db: import("../plugins/db").DatabaseClient,
  metric: AggregatedMetric,
  forceRecalculate: boolean
): Promise<void> {
  await db.withSystemContext(async (tx) => {
    if (forceRecalculate) {
      // Delete existing metric for same period and dimensions
      await tx`
        DELETE FROM app.analytics_aggregates
        WHERE tenant_id = ${metric.tenantId}::uuid
          AND metric_type = ${metric.metricType}
          AND granularity = ${metric.granularity}
          AND period_start = ${metric.periodStart}
          AND period_end = ${metric.periodEnd}
          AND dimensions = ${JSON.stringify(metric.dimensions)}::jsonb
      `;
    }

    // Upsert the metric
    await tx`
      INSERT INTO app.analytics_aggregates (
        tenant_id,
        metric_type,
        granularity,
        period_start,
        period_end,
        dimensions,
        value,
        count,
        sum,
        min,
        max,
        avg,
        metadata,
        calculated_at,
        created_at,
        updated_at
      )
      VALUES (
        ${metric.tenantId}::uuid,
        ${metric.metricType},
        ${metric.granularity},
        ${metric.periodStart},
        ${metric.periodEnd},
        ${JSON.stringify(metric.dimensions)}::jsonb,
        ${metric.value},
        ${metric.count},
        ${metric.sum},
        ${metric.min},
        ${metric.max},
        ${metric.avg},
        ${JSON.stringify(metric.metadata)}::jsonb,
        ${metric.calculatedAt},
        now(),
        now()
      )
      ON CONFLICT (tenant_id, metric_type, granularity, period_start, dimensions)
      DO UPDATE SET
        value = EXCLUDED.value,
        count = EXCLUDED.count,
        sum = EXCLUDED.sum,
        min = EXCLUDED.min,
        max = EXCLUDED.max,
        avg = EXCLUDED.avg,
        metadata = EXCLUDED.metadata,
        calculated_at = EXCLUDED.calculated_at,
        updated_at = now()
    `;
  });
}

/**
 * Store multiple aggregated metrics in a single transaction.
 * Reduces round-trips compared to storing one at a time.
 */
async function storeAggregatedMetricsBatch(
  db: import("../plugins/db").DatabaseClient,
  metrics: AggregatedMetric[],
  forceRecalculate: boolean
): Promise<void> {
  if (metrics.length === 0) return;

  await db.withSystemContext(async (tx) => {
    if (forceRecalculate) {
      // Delete all existing metrics for these period/dimension combos
      // Use the first metric to scope the bulk delete (they share tenant/period)
      const first = metrics[0]!;
      await tx`
        DELETE FROM app.analytics_aggregates
        WHERE tenant_id = ${first.tenantId}::uuid
          AND metric_type = ${first.metricType}
          AND granularity = ${first.granularity}
          AND period_start = ${first.periodStart}
          AND period_end = ${first.periodEnd}
      `;
    }

    // Batch insert/upsert all metrics in one statement using UNNEST
    const tenantIds = metrics.map((m) => m.tenantId);
    const metricTypes = metrics.map((m) => m.metricType);
    const granularities = metrics.map((m) => m.granularity);
    const periodStarts = metrics.map((m) => m.periodStart);
    const periodEnds = metrics.map((m) => m.periodEnd);
    const dimensionsArr = metrics.map((m) => JSON.stringify(m.dimensions));
    const values = metrics.map((m) => m.value);
    const counts = metrics.map((m) => m.count);
    const sums = metrics.map((m) => m.sum);
    const mins = metrics.map((m) => m.min);
    const maxes = metrics.map((m) => m.max);
    const avgs = metrics.map((m) => m.avg);
    const metadataArr = metrics.map((m) => JSON.stringify(m.metadata));
    const calculatedAts = metrics.map((m) => m.calculatedAt);

    // Use individual upserts within the same transaction for compatibility
    // with postgres.js tagged templates (UNNEST with jsonb is complex)
    for (let i = 0; i < metrics.length; i++) {
      await tx`
        INSERT INTO app.analytics_aggregates (
          tenant_id, metric_type, granularity,
          period_start, period_end, dimensions,
          value, count, sum, min, max, avg,
          metadata, calculated_at, created_at, updated_at
        )
        VALUES (
          ${tenantIds[i]}::uuid, ${metricTypes[i]}, ${granularities[i]},
          ${periodStarts[i]}, ${periodEnds[i]}, ${dimensionsArr[i]}::jsonb,
          ${values[i]}, ${counts[i]}, ${sums[i]}, ${mins[i]}, ${maxes[i]}, ${avgs[i]},
          ${metadataArr[i]}::jsonb, ${calculatedAts[i]}, now(), now()
        )
        ON CONFLICT (tenant_id, metric_type, granularity, period_start, dimensions)
        DO UPDATE SET
          value = EXCLUDED.value,
          count = EXCLUDED.count,
          sum = EXCLUDED.sum,
          min = EXCLUDED.min,
          max = EXCLUDED.max,
          avg = EXCLUDED.avg,
          metadata = EXCLUDED.metadata,
          calculated_at = EXCLUDED.calculated_at,
          updated_at = now()
      `;
    }
  });
}

/**
 * Store metric snapshot
 */
async function storeMetricSnapshot(
  db: import("../plugins/db").DatabaseClient,
  metric: {
    tenantId: string;
    metricType: MetricType;
    asOfDate: Date;
    dimensions: Record<string, string>;
    value: number;
    unit: string;
    calculatedAt: Date;
  }
): Promise<void> {
  await db.withSystemContext(async (tx) => {
    await tx`
      INSERT INTO app.analytics_snapshots (
        tenant_id,
        metric_type,
        as_of_date,
        dimensions,
        value,
        unit,
        calculated_at,
        created_at
      )
      VALUES (
        ${metric.tenantId}::uuid,
        ${metric.metricType},
        ${metric.asOfDate},
        ${JSON.stringify(metric.dimensions)}::jsonb,
        ${metric.value},
        ${metric.unit},
        ${metric.calculatedAt},
        now()
      )
      ON CONFLICT (tenant_id, metric_type, as_of_date, dimensions)
      DO UPDATE SET
        value = EXCLUDED.value,
        calculated_at = EXCLUDED.calculated_at
    `;
  });
}

/**
 * Store multiple metric snapshots in a single transaction.
 * Reduces round-trips compared to storing one at a time.
 */
async function storeMetricSnapshotsBatch(
  db: import("../plugins/db").DatabaseClient,
  metrics: Array<{
    tenantId: string;
    metricType: MetricType;
    asOfDate: Date;
    dimensions: Record<string, string>;
    value: number;
    unit: string;
    calculatedAt: Date;
  }>
): Promise<void> {
  if (metrics.length === 0) return;

  await db.withSystemContext(async (tx) => {
    for (const metric of metrics) {
      await tx`
        INSERT INTO app.analytics_snapshots (
          tenant_id, metric_type, as_of_date,
          dimensions, value, unit,
          calculated_at, created_at
        )
        VALUES (
          ${metric.tenantId}::uuid, ${metric.metricType}, ${metric.asOfDate},
          ${JSON.stringify(metric.dimensions)}::jsonb, ${metric.value}, ${metric.unit},
          ${metric.calculatedAt}, now()
        )
        ON CONFLICT (tenant_id, metric_type, as_of_date, dimensions)
        DO UPDATE SET
          value = EXCLUDED.value,
          calculated_at = EXCLUDED.calculated_at
      `;
    }
  });
}

// =============================================================================
// Scheduled Analytics Runner
// =============================================================================

/**
 * Run scheduled analytics calculations
 * Call this from a cron job or scheduler
 */
export async function runScheduledAnalytics(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  options: {
    metrics?: MetricType[];
    granularity?: TimeGranularity;
  } = {}
): Promise<void> {
  const {
    metrics = ["headcount", "turnover", "leave_utilization", "absence_rate", "tenure"],
    granularity = "day",
  } = options;

  const now = new Date();
  const asOfDate = now.toISOString().split("T")[0] || "";

  console.log(`[Analytics] Running scheduled analytics for tenant ${tenantId}`);

  for (const metricType of metrics) {
    try {
      // Calculate period based on granularity
      const periodEnd = new Date(now);
      const periodStart = new Date(now);

      switch (granularity) {
        case "day":
          periodStart.setDate(periodStart.getDate() - 1);
          break;
        case "week":
          periodStart.setDate(periodStart.getDate() - 7);
          break;
        case "month":
          periodStart.setMonth(periodStart.getMonth() - 1);
          break;
        case "quarter":
          periodStart.setMonth(periodStart.getMonth() - 3);
          break;
        case "year":
          periodStart.setFullYear(periodStart.getFullYear() - 1);
          break;
      }

      console.log(`[Analytics] Calculating ${metricType}...`);

      // Skip if recently computed (incremental)
      const recent = await isRecentlyComputed(
        db, tenantId, metricType, granularity, periodStart
      );
      if (recent) {
        console.log(`[Analytics] ${metricType}: skipping — recently computed`);
        continue;
      }

      // Calculate metrics
      let results: MetricResult[] = [];

      switch (metricType) {
        case "headcount":
          results = await calculateHeadcount(db, tenantId, periodEnd, []);
          break;
        case "turnover":
          results = await calculateTurnover(db, tenantId, periodStart, periodEnd, []);
          break;
        case "tenure":
          results = await calculateTenure(db, tenantId, periodEnd, []);
          break;
        case "leave_utilization":
          results = await calculateLeaveUtilization(db, tenantId, periodStart, periodEnd, []);
          break;
        case "absence_rate":
          results = await calculateAbsenceRate(db, tenantId, periodStart, periodEnd, []);
          break;
      }

      // Batch store all results in one transaction
      if (results.length > 0) {
        await storeAggregatedMetricsBatch(
          db,
          results.map((result) => ({
            tenantId,
            metricType: result.metricType,
            granularity,
            periodStart,
            periodEnd,
            dimensions: result.dimensions,
            value: result.value,
            count: 1,
            sum: result.value,
            min: result.value,
            max: result.value,
            avg: result.value,
            metadata: { unit: result.unit },
            calculatedAt: result.calculatedAt,
          })),
          false
        );
      }

      console.log(`[Analytics] ${metricType}: stored ${results.length} metrics`);
    } catch (error) {
      console.error(`[Analytics] Error calculating ${metricType}:`, error);
    }

    // Brief pause between metrics
    await sleep(100);
  }

  console.log(`[Analytics] Scheduled analytics complete`);
}

// =============================================================================
// Processor Registrations
// =============================================================================

/**
 * Analytics aggregate processor registration
 */
export const analyticsAggregateProcessor: ProcessorRegistration<AnalyticsAggregatePayload> = {
  type: JobTypes.ANALYTICS_AGGREGATE,
  processor: processAnalyticsAggregate,
  timeoutMs: 600000, // 10 minutes
  retry: true,
};

/**
 * Analytics metrics processor registration
 */
export const analyticsMetricsProcessor: ProcessorRegistration<AnalyticsMetricsPayload> = {
  type: JobTypes.ANALYTICS_METRICS,
  processor: processAnalyticsMetrics,
  timeoutMs: 600000, // 10 minutes
  retry: true,
};

/**
 * All analytics processors
 */
export const analyticsProcessors: ProcessorRegistration[] = [
  analyticsAggregateProcessor,
  analyticsMetricsProcessor,
];

export default analyticsProcessors;
