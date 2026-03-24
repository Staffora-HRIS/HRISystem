-- Migration: 0219_fix_missing_columns_and_views
-- Description: Add missing columns to report_definitions, create dashboard
--              materialized views, and add get_user_display_name function.

-- =============================================================================
-- 1. Add missing columns to report_definitions
-- =============================================================================

ALTER TABLE app.report_definitions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS chart_type text,
  ADD COLUMN IF NOT EXISTS schedule_cron text,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_with jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS required_permission text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS run_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_execution_ms numeric;

-- =============================================================================
-- 2. Create dashboard materialized views
-- =============================================================================

-- Employee stats MV
CREATE MATERIALIZED VIEW IF NOT EXISTS app.mv_dashboard_employee_stats AS
SELECT
  e.tenant_id,
  count(*)::int AS total_employees,
  count(*) FILTER (WHERE e.status = 'active')::int AS active_employees,
  count(*) FILTER (WHERE e.status = 'pending')::int AS pending_employees,
  count(*) FILTER (WHERE e.status = 'terminated')::int AS terminated_employees,
  count(*) FILTER (WHERE e.status = 'on_leave')::int AS on_leave_employees,
  count(*) FILTER (WHERE e.hire_date >= CURRENT_DATE - interval '30 days')::int AS new_hires_30d,
  now() AS refreshed_at
FROM app.employees e
GROUP BY e.tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_employee_stats_tenant
  ON app.mv_dashboard_employee_stats (tenant_id);

-- Leave stats MV
CREATE MATERIALIZED VIEW IF NOT EXISTS app.mv_dashboard_leave_stats AS
SELECT
  lr.tenant_id,
  count(*) FILTER (WHERE lr.status = 'pending')::int AS pending_requests,
  count(*) FILTER (WHERE lr.status = 'approved' AND lr.start_date > CURRENT_DATE)::int AS approved_upcoming,
  count(*) FILTER (WHERE lr.status = 'approved' AND lr.start_date <= CURRENT_DATE AND lr.end_date >= CURRENT_DATE)::int AS currently_on_leave,
  now() AS refreshed_at
FROM app.leave_requests lr
GROUP BY lr.tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_leave_stats_tenant
  ON app.mv_dashboard_leave_stats (tenant_id);

-- Case stats MV
CREATE MATERIALIZED VIEW IF NOT EXISTS app.mv_dashboard_case_stats AS
SELECT
  c.tenant_id,
  count(*) FILTER (WHERE c.status = 'open')::int AS open_cases,
  count(*) FILTER (WHERE c.status = 'pending')::int AS pending_cases,
  count(*) FILTER (WHERE c.sla_status = 'breached')::int AS sla_breached_cases,
  now() AS refreshed_at
FROM app.cases c
GROUP BY c.tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_case_stats_tenant
  ON app.mv_dashboard_case_stats (tenant_id);

-- Onboarding stats MV
CREATE MATERIALIZED VIEW IF NOT EXISTS app.mv_dashboard_onboarding_stats AS
SELECT
  oi.tenant_id,
  count(*) FILTER (WHERE oi.status = 'in_progress')::int AS in_progress,
  COALESCE(avg(oi.progress_percent) FILTER (WHERE oi.status = 'in_progress'), 0)::int AS avg_progress_pct,
  now() AS refreshed_at
FROM app.onboarding_instances oi
GROUP BY oi.tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_onboarding_stats_tenant
  ON app.mv_dashboard_onboarding_stats (tenant_id);

-- =============================================================================
-- 3. Create get_user_display_name function
-- =============================================================================

CREATE OR REPLACE FUNCTION app.get_user_display_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(u.name, u.email, 'Unknown')
  FROM app."user" u
  WHERE u.id = p_user_id::text
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION app.get_user_display_name(uuid) TO hris_app;

-- =============================================================================
-- 4. Refresh function for dashboard MVs
-- =============================================================================

CREATE OR REPLACE FUNCTION app.refresh_dashboard_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY app.mv_dashboard_employee_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY app.mv_dashboard_leave_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY app.mv_dashboard_case_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY app.mv_dashboard_onboarding_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION app.refresh_dashboard_stats() TO hris_app;
