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
 */
async function calculateHeadcount(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  asOfDate: Date,
  dimensions: Dimension[]
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];

  // Get active employee count
  const headcount = await db.withSystemContext(async (tx) => {
    return await tx<Array<{ count: number; orgUnitId?: string; department?: string }>>`
      SELECT
        COUNT(DISTINCT e.id) as count,
        ${dimensions.includes("org_unit") ? tx`pa.org_unit_id as "orgUnitId",` : tx``}
        ${dimensions.includes("department") ? tx`ou.name as department,` : tx``}
        ${dimensions.includes("employment_type") ? tx`ec.employment_type as "employmentType",` : tx``}
        1 as dummy
      FROM app.employees e
      JOIN app.position_assignments pa ON pa.employee_id = e.id
        AND pa.is_primary = true
        AND pa.effective_from <= ${asOfDate}
        AND (pa.effective_to IS NULL OR pa.effective_to > ${asOfDate})
      LEFT JOIN app.org_units ou ON ou.id = pa.org_unit_id
      LEFT JOIN app.employment_contracts ec ON ec.employee_id = e.id
        AND ec.effective_from <= ${asOfDate}
        AND (ec.effective_to IS NULL OR ec.effective_to > ${asOfDate})
      WHERE e.tenant_id = ${tenantId}::uuid
        AND e.status = 'active'
        AND e.hire_date <= ${asOfDate}
        AND (e.termination_date IS NULL OR e.termination_date > ${asOfDate})
      GROUP BY ${dimensions.length > 0 ? tx`pa.org_unit_id, ou.name, ec.employment_type` : tx`1`}
    `;
  });

  for (const row of headcount) {
    results.push({
      metricType: "headcount",
      value: Number(row.count),
      unit: "employees",
      period: asOfDate.toISOString().split("T")[0] || "",
      dimensions: {
        ...(row.orgUnitId && { orgUnitId: row.orgUnitId }),
        ...(row.department && { department: row.department }),
      },
      calculatedAt: new Date(),
    });
  }

  return results;
}

/**
 * Calculate turnover metrics
 */
async function calculateTurnover(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  _dimensions: Dimension[]
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];

  // Get terminations in period
  const turnoverData = await db.withSystemContext(async (tx) => {
    return await tx<Array<{
      terminations: number;
      avgHeadcount: number;
      voluntaryTerminations: number;
    }>>`
      WITH period_employees AS (
        SELECT
          e.id,
          e.hire_date,
          e.termination_date,
          esh.status,
          esh.reason
        FROM app.employees e
        LEFT JOIN app.employee_status_history esh ON esh.employee_id = e.id
          AND esh.effective_from = (
            SELECT MAX(effective_from)
            FROM app.employee_status_history
            WHERE employee_id = e.id
              AND effective_from <= ${periodEnd}
          )
        WHERE e.tenant_id = ${tenantId}::uuid
      )
      SELECT
        COUNT(DISTINCT CASE WHEN termination_date BETWEEN ${periodStart} AND ${periodEnd} THEN id END) as terminations,
        COUNT(DISTINCT CASE WHEN reason = 'resignation' AND termination_date BETWEEN ${periodStart} AND ${periodEnd} THEN id END) as "voluntaryTerminations",
        (
          COUNT(DISTINCT CASE WHEN hire_date <= ${periodStart} AND (termination_date IS NULL OR termination_date > ${periodStart}) THEN id END) +
          COUNT(DISTINCT CASE WHEN hire_date <= ${periodEnd} AND (termination_date IS NULL OR termination_date > ${periodEnd}) THEN id END)
        ) / 2.0 as "avgHeadcount"
      FROM period_employees
    `;
  });

  const data = turnoverData[0];
  const terminations = Number(data?.terminations ?? 0);
  const avgHeadcount = Number(data?.avgHeadcount ?? 1);
  const voluntaryTerminations = Number(data?.voluntaryTerminations ?? 0);

  // Total turnover rate
  const turnoverRate = avgHeadcount > 0 ? (terminations / avgHeadcount) * 100 : 0;
  results.push({
    metricType: "turnover",
    value: Math.round(turnoverRate * 100) / 100,
    unit: "percent",
    period: `${periodStart.toISOString().split("T")[0]}/${periodEnd.toISOString().split("T")[0]}`,
    dimensions: { type: "total" },
    calculatedAt: new Date(),
  });

  // Voluntary turnover rate
  const voluntaryRate = avgHeadcount > 0 ? (voluntaryTerminations / avgHeadcount) * 100 : 0;
  results.push({
    metricType: "turnover",
    value: Math.round(voluntaryRate * 100) / 100,
    unit: "percent",
    period: `${periodStart.toISOString().split("T")[0]}/${periodEnd.toISOString().split("T")[0]}`,
    dimensions: { type: "voluntary" },
    calculatedAt: new Date(),
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
 */
async function calculateAbsenceRate(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  _dimensions: Dimension[]
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];

  // Calculate total working days in period
  const workingDays = Math.ceil(
    (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Get absence data
  const absenceData = await db.withSystemContext(async (tx) => {
    return await tx<Array<{
      employeeCount: number;
      absenceDays: number;
    }>>`
      WITH employee_absences AS (
        SELECT
          e.id as employee_id,
          COALESCE(SUM(
            CASE WHEN lr.status = 'approved' THEN
              LEAST(lr.end_date, ${periodEnd}::date) - GREATEST(lr.start_date, ${periodStart}::date) + 1
            ELSE 0 END
          ), 0) as absence_days
        FROM app.employees e
        LEFT JOIN app.leave_requests lr ON lr.employee_id = e.id
          AND lr.start_date <= ${periodEnd}
          AND lr.end_date >= ${periodStart}
        WHERE e.tenant_id = ${tenantId}::uuid
          AND e.status = 'active'
        GROUP BY e.id
      )
      SELECT
        COUNT(DISTINCT employee_id) as "employeeCount",
        COALESCE(SUM(absence_days), 0) as "absenceDays"
      FROM employee_absences
    `;
  });

  const data = absenceData[0];
  const employeeCount = Number(data?.employeeCount ?? 1);
  const absenceDays = Number(data?.absenceDays ?? 0);
  const totalWorkingDays = employeeCount * workingDays;
  const absenceRate = totalWorkingDays > 0 ? (absenceDays / totalWorkingDays) * 100 : 0;

  results.push({
    metricType: "absence_rate",
    value: Math.round(absenceRate * 100) / 100,
    unit: "percent",
    period: `${periodStart.toISOString().split("T")[0]}/${periodEnd.toISOString().split("T")[0]}`,
    dimensions: {},
    calculatedAt: new Date(),
  });

  return results;
}

/**
 * Calculate tenure metrics
 */
async function calculateTenure(
  db: import("../plugins/db").DatabaseClient,
  tenantId: string,
  asOfDate: Date,
  _dimensions: Dimension[]
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];

  // Get tenure distribution
  const tenureData = await db.withSystemContext(async (tx) => {
    return await tx<Array<{
      avgTenure: number;
      medianTenure: number;
      lessThan1Year: number;
      oneToThreeYears: number;
      threeToFiveYears: number;
      moreThan5Years: number;
      totalEmployees: number;
    }>>`
      WITH employee_tenure AS (
        SELECT
          e.id,
          EXTRACT(YEAR FROM age(${asOfDate}, e.hire_date)) +
          EXTRACT(MONTH FROM age(${asOfDate}, e.hire_date)) / 12.0 as tenure_years
        FROM app.employees e
        WHERE e.tenant_id = ${tenantId}::uuid
          AND e.status = 'active'
          AND e.hire_date <= ${asOfDate}
      )
      SELECT
        COALESCE(AVG(tenure_years), 0) as "avgTenure",
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tenure_years), 0) as "medianTenure",
        COUNT(CASE WHEN tenure_years < 1 THEN 1 END) as "lessThan1Year",
        COUNT(CASE WHEN tenure_years >= 1 AND tenure_years < 3 THEN 1 END) as "oneToThreeYears",
        COUNT(CASE WHEN tenure_years >= 3 AND tenure_years < 5 THEN 1 END) as "threeToFiveYears",
        COUNT(CASE WHEN tenure_years >= 5 THEN 1 END) as "moreThan5Years",
        COUNT(*) as "totalEmployees"
      FROM employee_tenure
    `;
  });

  const data = tenureData[0];

  results.push({
    metricType: "tenure",
    value: Math.round(Number(data?.avgTenure ?? 0) * 100) / 100,
    unit: "years",
    period: asOfDate.toISOString().split("T")[0] || "",
    dimensions: { metric: "average" },
    calculatedAt: new Date(),
  });

  results.push({
    metricType: "tenure",
    value: Math.round(Number(data?.medianTenure ?? 0) * 100) / 100,
    unit: "years",
    period: asOfDate.toISOString().split("T")[0] || "",
    dimensions: { metric: "median" },
    calculatedAt: new Date(),
  });

  // Tenure distribution
  const total = Number(data?.totalEmployees ?? 1);
  const bands = [
    { band: "<1 year", count: Number(data?.lessThan1Year ?? 0) },
    { band: "1-3 years", count: Number(data?.oneToThreeYears ?? 0) },
    { band: "3-5 years", count: Number(data?.threeToFiveYears ?? 0) },
    { band: "5+ years", count: Number(data?.moreThan5Years ?? 0) },
  ];

  for (const { band, count } of bands) {
    results.push({
      metricType: "tenure",
      value: Math.round((count / total) * 10000) / 100,
      unit: "percent",
      period: asOfDate.toISOString().split("T")[0] || "",
      dimensions: { band },
      calculatedAt: new Date(),
    });
  }

  return results;
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

    // Store aggregated metrics
    for (const result of results) {
      await storeAggregatedMetric(db, {
        tenantId: payload.tenantId,
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
      }, forceRecalculate ?? false);
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

    // Store all results
    for (const result of allResults) {
      await storeMetricSnapshot(db, {
        tenantId: payload.tenantId,
        metricType: result.metricType,
        asOfDate: date,
        dimensions: result.dimensions,
        value: result.value,
        unit: result.unit,
        calculatedAt: result.calculatedAt,
      });
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

      // Calculate and store metrics
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

      for (const result of results) {
        await storeAggregatedMetric(db, {
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
        }, false);
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
