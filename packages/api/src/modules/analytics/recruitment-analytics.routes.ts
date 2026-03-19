/**
 * Recruitment Analytics Routes
 *
 * Detailed recruitment analytics endpoints:
 * - GET /analytics/recruitment/time-to-fill
 * - GET /analytics/recruitment/cost-per-hire
 * - GET /analytics/recruitment/source-effectiveness
 * - GET /analytics/recruitment/pipeline
 * - GET /analytics/recruitment/summary (enhanced)
 *
 * TODO-159: Recruitment analytics (time-to-fill, cost-per-hire)
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

// =============================================================================
// TypeBox Schemas
// =============================================================================

const RecruitmentAnalyticsFiltersSchema = t.Object({
  start_date: t.Optional(t.String({ format: "date", description: "Start of date range (default: 90 days ago)" })),
  end_date: t.Optional(t.String({ format: "date", description: "End of date range (default: today)" })),
  department_id: t.Optional(t.String({ format: "uuid", description: "Filter by department (org_unit_id)" })),
});

const TimeToFillByDepartmentSchema = t.Object({
  department_id: t.Union([t.String(), t.Null()]),
  department_name: t.String(),
  average_days: t.Number(),
  median_days: t.Number(),
  total_filled: t.Number(),
  min_days: t.Union([t.Number(), t.Null()]),
  max_days: t.Union([t.Number(), t.Null()]),
});

const TimeToFillResponseSchema = t.Object({
  average_days_to_fill: t.Number(),
  median_days_to_fill: t.Number(),
  min_days_to_fill: t.Union([t.Number(), t.Null()]),
  max_days_to_fill: t.Union([t.Number(), t.Null()]),
  total_filled: t.Number(),
  by_department: t.Array(TimeToFillByDepartmentSchema),
  period: t.Object({ start_date: t.String(), end_date: t.String() }),
});

const CostPerHireResponseSchema = t.Object({
  total_costs: t.Number(),
  total_hires: t.Number(),
  cost_per_hire: t.Number(),
  currency: t.String(),
  by_department: t.Array(t.Object({
    department_id: t.Union([t.String(), t.Null()]),
    department_name: t.String(),
    total_costs: t.Number(),
    total_hires: t.Number(),
    cost_per_hire: t.Number(),
  })),
  by_category: t.Array(t.Object({
    category: t.String(),
    total_amount: t.Number(),
    percentage: t.Number(),
  })),
  period: t.Object({ start_date: t.String(), end_date: t.String() }),
});

const SourceEffectivenessResponseSchema = t.Object({
  items: t.Array(t.Object({
    source: t.String(),
    total_candidates: t.Number(),
    hired_count: t.Number(),
    rejected_count: t.Number(),
    in_pipeline_count: t.Number(),
    withdrawn_count: t.Number(),
    conversion_rate: t.Number(),
    avg_days_to_hire: t.Union([t.Number(), t.Null()]),
  })),
  total_candidates: t.Number(),
  total_hired: t.Number(),
  overall_conversion_rate: t.Number(),
  period: t.Object({ start_date: t.String(), end_date: t.String() }),
});

const PipelineAnalyticsResponseSchema = t.Object({
  stages: t.Array(t.Object({
    stage: t.String(),
    count: t.Number(),
    entered_count: t.Number(),
    progressed_count: t.Number(),
    conversion_rate: t.Number(),
    avg_days_in_stage: t.Union([t.Number(), t.Null()]),
  })),
  overall_hire_rate: t.Number(),
  total_in_pipeline: t.Number(),
  period: t.Object({ start_date: t.String(), end_date: t.String() }),
});

const RecruitmentAnalyticsSummarySchema = t.Object({
  open_requisitions: t.Number(),
  total_openings: t.Number(),
  total_filled: t.Number(),
  total_candidates: t.Number(),
  total_hires: t.Number(),
  average_time_to_fill_days: t.Number(),
  average_cost_per_hire: t.Number(),
  overall_conversion_rate: t.Number(),
  top_source: t.Union([t.String(), t.Null()]),
  pipeline_bottleneck: t.Union([t.String(), t.Null()]),
  currency: t.String(),
  period: t.Object({ start_date: t.String(), end_date: t.String() }),
});

// =============================================================================
// Filter Types
// =============================================================================

interface RecruitmentAnalyticsFilters {
  start_date: string;
  end_date: string;
  department_id?: string;
}

// =============================================================================
// Error Codes
// =============================================================================

const RECRUITMENT_ANALYTICS_ERROR_CODES: Record<string, number> = {
  INVALID_DATE_RANGE: 400,
};

// =============================================================================
// Helper: Normalise date range
// =============================================================================

function normaliseDateRange(query: {
  start_date?: string;
  end_date?: string;
  department_id?: string;
}): RecruitmentAnalyticsFilters {
  const today = new Date().toISOString().split("T")[0]!;
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0]!;
  const startDate = query.start_date || ninetyDaysAgo;
  const endDate = query.end_date || today;
  if (new Date(startDate) > new Date(endDate)) {
    throw Object.assign(new Error("start_date must be before or equal to end_date"), {
      code: "INVALID_DATE_RANGE",
    });
  }
  return { start_date: startDate, end_date: endDate, department_id: query.department_id };
}

// =============================================================================
// Helper: Compute median from sorted array
// =============================================================================

function computeMedian(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 0) {
    return Math.round(((sorted[n / 2 - 1] + sorted[n / 2]) / 2) * 10) / 10;
  }
  return sorted[Math.floor(n / 2)];
}

// =============================================================================
// Repository Functions (using postgres.js tagged templates)
// =============================================================================

async function queryTimeToFill(
  db: DatabaseClient,
  ctx: TenantContext,
  filters: RecruitmentAnalyticsFilters
) {
  return db.withTransaction(ctx, async (tx) => {
    return tx<any[]>`
      WITH filled_reqs AS (
        SELECT
          r.id AS requisition_id,
          r.org_unit_id::text AS department_id,
          COALESCE(ou.name, 'Unassigned') AS department_name,
          r.created_at AS opened_at,
          (
            SELECT MIN(cse.created_at)
            FROM app.candidate_stage_events cse
            JOIN app.candidates c ON c.id = cse.candidate_id
            WHERE c.requisition_id = r.id
              AND cse.to_stage = 'hired'
          ) AS filled_at
        FROM app.requisitions r
        LEFT JOIN app.org_units ou ON ou.id = r.org_unit_id
        WHERE r.tenant_id = ${ctx.tenantId}::uuid
          AND r.status = 'filled'
          AND r.created_at >= ${filters.start_date}::date
          AND r.created_at <= (${filters.end_date}::date + interval '1 day')
          ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
      )
      SELECT
        department_id,
        department_name,
        CASE
          WHEN filled_at IS NOT NULL AND opened_at IS NOT NULL
          THEN EXTRACT(DAY FROM filled_at - opened_at)::int
          ELSE NULL
        END AS days_to_fill
      FROM filled_reqs
      WHERE filled_at IS NOT NULL
      ORDER BY days_to_fill ASC NULLS LAST
    `;
  });
}

async function queryCostPerHire(
  db: DatabaseClient,
  ctx: TenantContext,
  filters: RecruitmentAnalyticsFilters
) {
  const currency = "GBP";
  const [costRows, hireRows, categoryRows, deptCostRows, deptHireRows] = await Promise.all([
    db.withTransaction(ctx, async (tx) => tx<any[]>`
      SELECT COALESCE(SUM(rc.amount), 0)::numeric AS total_costs
      FROM app.recruitment_costs rc
      JOIN app.requisitions r ON r.id = rc.requisition_id
      WHERE rc.tenant_id = ${ctx.tenantId}::uuid
        AND rc.currency = ${currency}
        AND rc.incurred_date >= ${filters.start_date}::date
        AND rc.incurred_date <= ${filters.end_date}::date
        ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
    `),
    db.withTransaction(ctx, async (tx) => tx<any[]>`
      SELECT COUNT(DISTINCT c.id)::int AS total_hires
      FROM app.candidates c
      JOIN app.requisitions r ON r.id = c.requisition_id
      WHERE c.tenant_id = ${ctx.tenantId}::uuid
        AND c.current_stage = 'hired'
        AND c.updated_at >= ${filters.start_date}::date
        AND c.updated_at <= (${filters.end_date}::date + interval '1 day')
        ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
    `),
    db.withTransaction(ctx, async (tx) => tx<any[]>`
      SELECT rc.category, SUM(rc.amount)::numeric AS total_amount
      FROM app.recruitment_costs rc
      JOIN app.requisitions r ON r.id = rc.requisition_id
      WHERE rc.tenant_id = ${ctx.tenantId}::uuid
        AND rc.currency = ${currency}
        AND rc.incurred_date >= ${filters.start_date}::date
        AND rc.incurred_date <= ${filters.end_date}::date
        ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
      GROUP BY rc.category ORDER BY total_amount DESC
    `),
    db.withTransaction(ctx, async (tx) => tx<any[]>`
      SELECT r.org_unit_id::text AS department_id, COALESCE(ou.name, 'Unassigned') AS department_name,
        SUM(rc.amount)::numeric AS total_costs
      FROM app.recruitment_costs rc
      JOIN app.requisitions r ON r.id = rc.requisition_id
      LEFT JOIN app.org_units ou ON ou.id = r.org_unit_id
      WHERE rc.tenant_id = ${ctx.tenantId}::uuid AND rc.currency = ${currency}
        AND rc.incurred_date >= ${filters.start_date}::date
        AND rc.incurred_date <= ${filters.end_date}::date
        ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
      GROUP BY r.org_unit_id, ou.name ORDER BY total_costs DESC
    `),
    db.withTransaction(ctx, async (tx) => tx<any[]>`
      SELECT r.org_unit_id::text AS department_id, COALESCE(ou.name, 'Unassigned') AS department_name,
        COUNT(DISTINCT c.id)::int AS total_hires
      FROM app.candidates c
      JOIN app.requisitions r ON r.id = c.requisition_id
      LEFT JOIN app.org_units ou ON ou.id = r.org_unit_id
      WHERE c.tenant_id = ${ctx.tenantId}::uuid AND c.current_stage = 'hired'
        AND c.updated_at >= ${filters.start_date}::date
        AND c.updated_at <= (${filters.end_date}::date + interval '1 day')
        ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
      GROUP BY r.org_unit_id, ou.name ORDER BY total_hires DESC
    `),
  ]);
  return { costRows, hireRows, categoryRows, deptCostRows, deptHireRows, currency };
}

async function querySourceEffectiveness(
  db: DatabaseClient,
  ctx: TenantContext,
  filters: RecruitmentAnalyticsFilters
) {
  return db.withTransaction(ctx, async (tx) => {
    return tx<any[]>`
      SELECT
        c.source,
        COUNT(*)::int AS total_candidates,
        COUNT(*) FILTER (WHERE c.current_stage = 'hired')::int AS hired_count,
        COUNT(*) FILTER (WHERE c.current_stage = 'rejected')::int AS rejected_count,
        COUNT(*) FILTER (WHERE c.current_stage NOT IN ('hired', 'rejected', 'withdrawn'))::int AS in_pipeline_count,
        COUNT(*) FILTER (WHERE c.current_stage = 'withdrawn')::int AS withdrawn_count,
        ROUND(
          COUNT(*) FILTER (WHERE c.current_stage = 'hired')::numeric /
          NULLIF(COUNT(*)::numeric, 0) * 100, 2
        ) AS conversion_rate,
        ROUND(AVG(
          CASE WHEN c.current_stage = 'hired'
            THEN EXTRACT(DAY FROM c.updated_at - c.created_at)
            ELSE NULL
          END
        ), 1) AS avg_days_to_hire
      FROM app.candidates c
      JOIN app.requisitions r ON r.id = c.requisition_id
      WHERE c.tenant_id = ${ctx.tenantId}::uuid
        AND c.created_at >= ${filters.start_date}::date
        AND c.created_at <= (${filters.end_date}::date + interval '1 day')
        ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
      GROUP BY c.source
      ORDER BY total_candidates DESC
    `;
  });
}

async function queryPipelineSnapshot(
  db: DatabaseClient,
  ctx: TenantContext,
  filters: RecruitmentAnalyticsFilters
) {
  return db.withTransaction(ctx, async (tx) => {
    return tx<any[]>`
      SELECT c.current_stage AS stage, COUNT(*)::int AS count
      FROM app.candidates c
      JOIN app.requisitions r ON r.id = c.requisition_id
      WHERE c.tenant_id = ${ctx.tenantId}::uuid
        AND c.current_stage NOT IN ('hired', 'rejected', 'withdrawn')
        ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
      GROUP BY c.current_stage
      ORDER BY CASE c.current_stage
        WHEN 'applied' THEN 1 WHEN 'screening' THEN 2
        WHEN 'interview' THEN 3 WHEN 'offer' THEN 4
      END
    `;
  });
}

async function queryPipelineTransitions(
  db: DatabaseClient,
  ctx: TenantContext,
  filters: RecruitmentAnalyticsFilters
) {
  return db.withTransaction(ctx, async (tx) => {
    return tx<any[]>`
      WITH stage_entries AS (
        SELECT cse.to_stage AS stage, COUNT(DISTINCT cse.candidate_id)::int AS entered_count
        FROM app.candidate_stage_events cse
        JOIN app.candidates c ON c.id = cse.candidate_id
        JOIN app.requisitions r ON r.id = c.requisition_id
        WHERE cse.tenant_id = ${ctx.tenantId}::uuid
          AND cse.created_at >= ${filters.start_date}::date
          AND cse.created_at <= (${filters.end_date}::date + interval '1 day')
          ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
        GROUP BY cse.to_stage
      ),
      stage_exits AS (
        SELECT cse.from_stage AS stage, COUNT(DISTINCT cse.candidate_id)::int AS progressed_count
        FROM app.candidate_stage_events cse
        JOIN app.candidates c ON c.id = cse.candidate_id
        JOIN app.requisitions r ON r.id = c.requisition_id
        WHERE cse.tenant_id = ${ctx.tenantId}::uuid
          AND cse.created_at >= ${filters.start_date}::date
          AND cse.created_at <= (${filters.end_date}::date + interval '1 day')
          AND cse.from_stage IS NOT NULL
          AND cse.to_stage NOT IN ('rejected', 'withdrawn')
          ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
        GROUP BY cse.from_stage
      ),
      stage_durations AS (
        SELECT cse.from_stage AS stage,
          ROUND(AVG(EXTRACT(EPOCH FROM (cse.created_at - prev.created_at)) / 86400), 1) AS avg_days_in_stage
        FROM app.candidate_stage_events cse
        JOIN app.candidates c ON c.id = cse.candidate_id
        JOIN app.requisitions r ON r.id = c.requisition_id
        LEFT JOIN LATERAL (
          SELECT cse2.created_at FROM app.candidate_stage_events cse2
          WHERE cse2.candidate_id = cse.candidate_id AND cse2.to_stage = cse.from_stage
          ORDER BY cse2.created_at DESC LIMIT 1
        ) prev ON true
        WHERE cse.tenant_id = ${ctx.tenantId}::uuid
          AND cse.created_at >= ${filters.start_date}::date
          AND cse.created_at <= (${filters.end_date}::date + interval '1 day')
          AND cse.from_stage IS NOT NULL AND prev.created_at IS NOT NULL
          ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
        GROUP BY cse.from_stage
      ),
      all_stages AS (
        SELECT unnest(ARRAY['applied','screening','interview','offer','hired']) AS stage
      )
      SELECT a.stage,
        COALESCE(se.entered_count, 0) AS entered_count,
        COALESCE(sx.progressed_count, 0) AS progressed_count,
        CASE WHEN COALESCE(se.entered_count, 0) > 0
          THEN ROUND(COALESCE(sx.progressed_count, 0)::numeric / se.entered_count * 100, 2)
          ELSE 0 END AS conversion_rate,
        sd.avg_days_in_stage
      FROM all_stages a
      LEFT JOIN stage_entries se ON se.stage::text = a.stage
      LEFT JOIN stage_exits sx ON sx.stage::text = a.stage
      LEFT JOIN stage_durations sd ON sd.stage::text = a.stage
      ORDER BY CASE a.stage
        WHEN 'applied' THEN 1 WHEN 'screening' THEN 2
        WHEN 'interview' THEN 3 WHEN 'offer' THEN 4 WHEN 'hired' THEN 5
      END
    `;
  });
}

async function querySummaryMetrics(
  db: DatabaseClient,
  ctx: TenantContext,
  filters: RecruitmentAnalyticsFilters
) {
  return db.withTransaction(ctx, async (tx) => {
    return tx<any[]>`
      WITH req_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE r.status = 'open')::int AS open_requisitions,
          COALESCE(SUM(r.openings) FILTER (WHERE r.status = 'open'), 0)::int AS total_openings,
          COALESCE(SUM(r.filled) FILTER (WHERE r.status = 'filled'), 0)::int AS total_filled_count
        FROM app.requisitions r
        WHERE r.tenant_id = ${ctx.tenantId}::uuid
          ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
      ),
      cand_stats AS (
        SELECT COUNT(*)::int AS total_candidates,
          COUNT(*) FILTER (WHERE c.current_stage = 'hired')::int AS total_hires
        FROM app.candidates c
        JOIN app.requisitions r ON r.id = c.requisition_id
        WHERE c.tenant_id = ${ctx.tenantId}::uuid
          AND c.created_at >= ${filters.start_date}::date
          AND c.created_at <= (${filters.end_date}::date + interval '1 day')
          ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
      ),
      fill_time AS (
        SELECT ROUND(AVG(EXTRACT(DAY FROM r.updated_at - r.created_at)), 1) AS avg_ttf
        FROM app.requisitions r
        WHERE r.tenant_id = ${ctx.tenantId}::uuid AND r.status = 'filled'
          AND r.created_at >= ${filters.start_date}::date
          AND r.created_at <= (${filters.end_date}::date + interval '1 day')
          ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
      ),
      cost_stats AS (
        SELECT COALESCE(SUM(rc.amount), 0)::numeric AS total_costs
        FROM app.recruitment_costs rc
        JOIN app.requisitions r ON r.id = rc.requisition_id
        WHERE rc.tenant_id = ${ctx.tenantId}::uuid AND rc.currency = 'GBP'
          AND rc.incurred_date >= ${filters.start_date}::date
          AND rc.incurred_date <= ${filters.end_date}::date
          ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
      ),
      top_src AS (
        SELECT c.source FROM app.candidates c
        JOIN app.requisitions r ON r.id = c.requisition_id
        WHERE c.tenant_id = ${ctx.tenantId}::uuid AND c.current_stage = 'hired'
          AND c.created_at >= ${filters.start_date}::date
          AND c.created_at <= (${filters.end_date}::date + interval '1 day')
          ${filters.department_id ? tx`AND r.org_unit_id = ${filters.department_id}::uuid` : tx``}
        GROUP BY c.source ORDER BY COUNT(*) DESC LIMIT 1
      )
      SELECT rs.open_requisitions, rs.total_openings,
        rs.total_filled_count AS total_filled,
        cs.total_candidates, cs.total_hires,
        COALESCE(ft.avg_ttf, 0) AS avg_time_to_fill_days,
        cst.total_costs, (SELECT source FROM top_src) AS top_source
      FROM req_stats rs, cand_stats cs, fill_time ft, cost_stats cst
    `;
  });
}

// =============================================================================
// Value extractors (handle camelCase / snake_case from postgres.js transform)
// =============================================================================

function n(row: any, snake: string, camel: string): number {
  return Number(row[snake] ?? row[camel]) || 0;
}

function s(row: any, snake: string, camel: string): string | null {
  return row[snake] ?? row[camel] ?? null;
}

// =============================================================================
// Routes
// =============================================================================

export const recruitmentAnalyticsRoutes = new Elysia({
  prefix: "/analytics/recruitment",
  name: "recruitment-analytics-routes",
})
  .derive((ctx) => {
    const { db } = ctx as any;
    return { raDb: db as DatabaseClient };
  })

  // -------------------------------------------------------------------------
  // GET /analytics/recruitment/time-to-fill
  // -------------------------------------------------------------------------
  .get(
    "/time-to-fill",
    async (ctx) => {
      const { raDb, query, tenant, error } = ctx as any;
      const tenantCtx: TenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const filters = normaliseDateRange(query);
        const rows = await queryTimeToFill(raDb, tenantCtx, filters);

        const allDays = rows
          .map((r: any) => n(r, "days_to_fill", "daysToFill"))
          .filter((d: number) => d > 0);
        const sorted = [...allDays].sort((a: number, b: number) => a - b);
        const total = sorted.length;
        const avg = total > 0 ? Math.round((sorted.reduce((s: number, v: number) => s + v, 0) / total) * 10) / 10 : 0;

        // By department
        const deptMap = new Map<string, { id: string | null; name: string; days: number[] }>();
        for (const r of rows) {
          const deptId = s(r, "department_id", "departmentId");
          const deptName = s(r, "department_name", "departmentName") || "Unassigned";
          const days = n(r, "days_to_fill", "daysToFill");
          if (days <= 0) continue;
          const key = deptId || "__unassigned__";
          if (!deptMap.has(key)) deptMap.set(key, { id: deptId, name: deptName, days: [] });
          deptMap.get(key)!.days.push(days);
        }

        const byDepartment = Array.from(deptMap.values()).map((dept) => {
          const ds = [...dept.days].sort((a, b) => a - b);
          return {
            department_id: dept.id,
            department_name: dept.name,
            average_days: ds.length > 0 ? Math.round((ds.reduce((ss, v) => ss + v, 0) / ds.length) * 10) / 10 : 0,
            median_days: computeMedian(ds),
            total_filled: ds.length,
            min_days: ds.length > 0 ? ds[0] : null,
            max_days: ds.length > 0 ? ds[ds.length - 1] : null,
          };
        }).sort((a, b) => b.total_filled - a.total_filled);

        return {
          average_days_to_fill: avg,
          median_days_to_fill: computeMedian(sorted),
          min_days_to_fill: sorted.length > 0 ? sorted[0] : null,
          max_days_to_fill: sorted.length > 0 ? sorted[sorted.length - 1] : null,
          total_filled: total,
          by_department: byDepartment,
          period: { start_date: filters.start_date, end_date: filters.end_date },
        };
      } catch (err: any) {
        if (err.code === "INVALID_DATE_RANGE") {
          return error(400, { error: { code: "INVALID_DATE_RANGE", message: err.message } });
        }
        return error(500, { error: { code: "INTERNAL_ERROR", message: err.message } });
      }
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Partial(RecruitmentAnalyticsFiltersSchema),
      response: { 200: TimeToFillResponseSchema, 400: ErrorResponseSchema, 500: ErrorResponseSchema },
      detail: {
        tags: ["Analytics - Recruitment"],
        summary: "Time-to-fill analytics",
        description: "Average time from job posting to offer acceptance, broken down by department. Default date range is last 90 days.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // -------------------------------------------------------------------------
  // GET /analytics/recruitment/cost-per-hire
  // -------------------------------------------------------------------------
  .get(
    "/cost-per-hire",
    async (ctx) => {
      const { raDb, query, tenant, error } = ctx as any;
      const tenantCtx: TenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const filters = normaliseDateRange(query);
        const { costRows, hireRows, categoryRows, deptCostRows, deptHireRows, currency } =
          await queryCostPerHire(raDb, tenantCtx, filters);

        const totalCosts = n(costRows[0], "total_costs", "totalCosts");
        const totalHires = n(hireRows[0], "total_hires", "totalHires");
        const costPerHire = totalHires > 0 ? Math.round((totalCosts / totalHires) * 100) / 100 : 0;

        const byCategory = categoryRows.map((r: any) => {
          const amount = n(r, "total_amount", "totalAmount");
          return {
            category: r.category,
            total_amount: amount,
            percentage: totalCosts > 0 ? Math.round((amount / totalCosts) * 1000) / 10 : 0,
          };
        });

        const deptData = new Map<string, { department_id: string | null; department_name: string; total_costs: number; total_hires: number }>();
        for (const r of deptCostRows) {
          const id = s(r, "department_id", "departmentId");
          const name = s(r, "department_name", "departmentName") || "Unassigned";
          const key = id || "__u__";
          deptData.set(key, { department_id: id, department_name: name, total_costs: n(r, "total_costs", "totalCosts"), total_hires: 0 });
        }
        for (const r of deptHireRows) {
          const id = s(r, "department_id", "departmentId");
          const name = s(r, "department_name", "departmentName") || "Unassigned";
          const key = id || "__u__";
          if (!deptData.has(key)) deptData.set(key, { department_id: id, department_name: name, total_costs: 0, total_hires: 0 });
          deptData.get(key)!.total_hires = n(r, "total_hires", "totalHires");
        }

        const byDepartment = Array.from(deptData.values()).map((d) => ({
          ...d,
          cost_per_hire: d.total_hires > 0 ? Math.round((d.total_costs / d.total_hires) * 100) / 100 : 0,
        })).sort((a, b) => b.total_costs - a.total_costs);

        return {
          total_costs: totalCosts,
          total_hires: totalHires,
          cost_per_hire: costPerHire,
          currency,
          by_department: byDepartment,
          by_category: byCategory,
          period: { start_date: filters.start_date, end_date: filters.end_date },
        };
      } catch (err: any) {
        if (err.code === "INVALID_DATE_RANGE") {
          return error(400, { error: { code: "INVALID_DATE_RANGE", message: err.message } });
        }
        return error(500, { error: { code: "INTERNAL_ERROR", message: err.message } });
      }
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Partial(RecruitmentAnalyticsFiltersSchema),
      response: { 200: CostPerHireResponseSchema, 400: ErrorResponseSchema, 500: ErrorResponseSchema },
      detail: {
        tags: ["Analytics - Recruitment"],
        summary: "Cost-per-hire analytics",
        description: "Total recruitment costs divided by number of hires, broken down by department and cost category. Currency is GBP. Default date range is last 90 days.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // -------------------------------------------------------------------------
  // GET /analytics/recruitment/source-effectiveness
  // -------------------------------------------------------------------------
  .get(
    "/source-effectiveness",
    async (ctx) => {
      const { raDb, query, tenant, error } = ctx as any;
      const tenantCtx: TenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const filters = normaliseDateRange(query);
        const rows = await querySourceEffectiveness(raDb, tenantCtx, filters);

        const items = rows.map((r: any) => ({
          source: r.source,
          total_candidates: n(r, "total_candidates", "totalCandidates"),
          hired_count: n(r, "hired_count", "hiredCount"),
          rejected_count: n(r, "rejected_count", "rejectedCount"),
          in_pipeline_count: n(r, "in_pipeline_count", "inPipelineCount"),
          withdrawn_count: n(r, "withdrawn_count", "withdrawnCount"),
          conversion_rate: n(r, "conversion_rate", "conversionRate"),
          avg_days_to_hire: r.avg_days_to_hire != null ? Number(r.avg_days_to_hire) :
            r.avgDaysToHire != null ? Number(r.avgDaysToHire) : null,
        }));

        const totalCandidates = items.reduce((ss: number, i: any) => ss + i.total_candidates, 0);
        const totalHired = items.reduce((ss: number, i: any) => ss + i.hired_count, 0);

        return {
          items,
          total_candidates: totalCandidates,
          total_hired: totalHired,
          overall_conversion_rate: totalCandidates > 0
            ? Math.round((totalHired / totalCandidates) * 10000) / 100
            : 0,
          period: { start_date: filters.start_date, end_date: filters.end_date },
        };
      } catch (err: any) {
        if (err.code === "INVALID_DATE_RANGE") {
          return error(400, { error: { code: "INVALID_DATE_RANGE", message: err.message } });
        }
        return error(500, { error: { code: "INTERNAL_ERROR", message: err.message } });
      }
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Partial(RecruitmentAnalyticsFiltersSchema),
      response: { 200: SourceEffectivenessResponseSchema, 400: ErrorResponseSchema, 500: ErrorResponseSchema },
      detail: {
        tags: ["Analytics - Recruitment"],
        summary: "Source effectiveness analytics",
        description: "Applications and hires broken down by candidate source (referral, job board, agency, direct, etc.) with conversion rates and average time-to-hire per source. Default date range is last 90 days.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // -------------------------------------------------------------------------
  // GET /analytics/recruitment/pipeline
  // -------------------------------------------------------------------------
  .get(
    "/pipeline",
    async (ctx) => {
      const { raDb, query, tenant, error } = ctx as any;
      const tenantCtx: TenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const filters = normaliseDateRange(query);
        const [snapshotRows, transitionRows] = await Promise.all([
          queryPipelineSnapshot(raDb, tenantCtx, filters),
          queryPipelineTransitions(raDb, tenantCtx, filters),
        ]);

        const snapshotMap = new Map(
          snapshotRows.map((r: any) => [r.stage, Number(r.count) || 0])
        );

        const stages = transitionRows.map((r: any) => ({
          stage: r.stage,
          count: snapshotMap.get(r.stage) || 0,
          entered_count: n(r, "entered_count", "enteredCount"),
          progressed_count: n(r, "progressed_count", "progressedCount"),
          conversion_rate: n(r, "conversion_rate", "conversionRate"),
          avg_days_in_stage: r.avg_days_in_stage != null ? Number(r.avg_days_in_stage) :
            r.avgDaysInStage != null ? Number(r.avgDaysInStage) : null,
        }));

        const appliedCount = stages.find((ss: any) => ss.stage === "applied")?.entered_count || 0;
        const hiredCount = stages.find((ss: any) => ss.stage === "hired")?.entered_count || 0;
        const totalInPipeline = snapshotRows.reduce((ss: number, r: any) => ss + (Number(r.count) || 0), 0);

        return {
          stages,
          overall_hire_rate: appliedCount > 0
            ? Math.round((hiredCount / appliedCount) * 10000) / 100
            : 0,
          total_in_pipeline: totalInPipeline,
          period: { start_date: filters.start_date, end_date: filters.end_date },
        };
      } catch (err: any) {
        if (err.code === "INVALID_DATE_RANGE") {
          return error(400, { error: { code: "INVALID_DATE_RANGE", message: err.message } });
        }
        return error(500, { error: { code: "INTERNAL_ERROR", message: err.message } });
      }
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Partial(RecruitmentAnalyticsFiltersSchema),
      response: { 200: PipelineAnalyticsResponseSchema, 400: ErrorResponseSchema, 500: ErrorResponseSchema },
      detail: {
        tags: ["Analytics - Recruitment"],
        summary: "Pipeline analytics",
        description: "Candidates at each stage of the recruitment pipeline with conversion rates between stages and average time in each stage. Default date range is last 90 days.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // -------------------------------------------------------------------------
  // GET /analytics/recruitment/summary
  // -------------------------------------------------------------------------
  .get(
    "/summary",
    async (ctx) => {
      const { raDb, query, tenant, error } = ctx as any;
      const tenantCtx: TenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const filters = normaliseDateRange(query);
        const [summaryRows, transitionRows] = await Promise.all([
          querySummaryMetrics(raDb, tenantCtx, filters),
          queryPipelineTransitions(raDb, tenantCtx, filters),
        ]);

        const r = summaryRows[0] || {};
        const totalHires = n(r, "total_hires", "totalHires");
        const totalCandidates = n(r, "total_candidates", "totalCandidates");
        const totalCosts = n(r, "total_costs", "totalCosts");

        // Find pipeline bottleneck
        const stageData = transitionRows.map((tr: any) => ({
          stage: tr.stage,
          entered_count: n(tr, "entered_count", "enteredCount"),
          conversion_rate: n(tr, "conversion_rate", "conversionRate"),
        }));
        const activeStages = stageData.filter((ss: any) => ss.stage !== "hired" && ss.entered_count > 0);
        let bottleneck: string | null = null;
        if (activeStages.length > 0) {
          const lowest = activeStages.reduce((min: any, ss: any) =>
            ss.conversion_rate < min.conversion_rate ? ss : min
          );
          bottleneck = lowest.stage;
        }

        return {
          open_requisitions: n(r, "open_requisitions", "openRequisitions"),
          total_openings: n(r, "total_openings", "totalOpenings"),
          total_filled: n(r, "total_filled", "totalFilled"),
          total_candidates: totalCandidates,
          total_hires: totalHires,
          average_time_to_fill_days: n(r, "avg_time_to_fill_days", "avgTimeToFillDays"),
          average_cost_per_hire: totalHires > 0 ? Math.round((totalCosts / totalHires) * 100) / 100 : 0,
          overall_conversion_rate: totalCandidates > 0
            ? Math.round((totalHires / totalCandidates) * 10000) / 100
            : 0,
          top_source: s(r, "top_source", "topSource"),
          pipeline_bottleneck: bottleneck,
          currency: "GBP",
          period: { start_date: filters.start_date, end_date: filters.end_date },
        };
      } catch (err: any) {
        if (err.code === "INVALID_DATE_RANGE") {
          return error(400, { error: { code: "INVALID_DATE_RANGE", message: err.message } });
        }
        return error(500, { error: { code: "INTERNAL_ERROR", message: err.message } });
      }
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      query: t.Partial(RecruitmentAnalyticsFiltersSchema),
      response: { 200: RecruitmentAnalyticsSummarySchema, 400: ErrorResponseSchema, 500: ErrorResponseSchema },
      detail: {
        tags: ["Analytics - Recruitment"],
        summary: "Recruitment analytics summary",
        description: "Key recruitment metrics overview including time-to-fill, cost-per-hire, conversion rates, top source, and pipeline bottleneck. Default date range is last 90 days.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type RecruitmentAnalyticsRoutes = typeof recruitmentAnalyticsRoutes;
