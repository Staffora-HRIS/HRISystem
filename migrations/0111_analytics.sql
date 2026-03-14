-- Migration: 0111_analytics
-- Created: 2026-01-16
-- Description: Analytics and reporting infrastructure

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Report definitions
CREATE TABLE IF NOT EXISTS app.report_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Report identification
    name varchar(100) NOT NULL,
    code varchar(50),
    description text,
    category varchar(50), -- headcount, turnover, compensation, attendance, performance

    -- Report type
    report_type varchar(20) NOT NULL DEFAULT 'standard', -- standard, custom, scheduled

    -- Query definition
    base_query text, -- For standard reports
    query_builder jsonb, -- For custom report builder
    parameters jsonb DEFAULT '{}', -- Parameter definitions

    -- Display settings
    columns jsonb DEFAULT '[]',
    default_filters jsonb DEFAULT '{}',
    default_sort jsonb DEFAULT '{}',
    chart_config jsonb,

    -- Access control
    required_permissions text[] DEFAULT '{}',
    is_public boolean DEFAULT false,

    -- Status
    is_active boolean NOT NULL DEFAULT true,

    -- Audit
    created_by uuid REFERENCES app.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Saved reports (user-configured versions of report definitions)
CREATE TABLE IF NOT EXISTS app.saved_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app.users(id),
    report_definition_id uuid REFERENCES app.report_definitions(id),

    -- Report configuration
    name varchar(100) NOT NULL,
    filters jsonb DEFAULT '{}',
    columns jsonb,
    sort_config jsonb,
    chart_config jsonb,

    -- Sharing
    is_shared boolean DEFAULT false,
    shared_with jsonb DEFAULT '[]', -- Array of user/role IDs

    -- Favorite
    is_favorite boolean DEFAULT false,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Scheduled reports
CREATE TABLE IF NOT EXISTS app.scheduled_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    saved_report_id uuid NOT NULL REFERENCES app.saved_reports(id) ON DELETE CASCADE,

    -- Schedule
    schedule_type varchar(20) NOT NULL, -- daily, weekly, monthly
    schedule_config jsonb NOT NULL, -- {day_of_week: 1, time: "08:00"} or {day_of_month: 1}
    timezone varchar(50) DEFAULT 'UTC',

    -- Delivery
    delivery_method varchar(20) NOT NULL DEFAULT 'email', -- email, sftp, s3
    delivery_config jsonb NOT NULL, -- {recipients: [], format: 'xlsx'}

    -- Status
    is_active boolean DEFAULT true,
    last_run_at timestamptz,
    last_run_status varchar(20),
    next_run_at timestamptz,

    -- Audit
    created_by uuid REFERENCES app.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Report execution history
CREATE TABLE IF NOT EXISTS app.report_executions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    report_id uuid, -- Either report_definition_id or saved_report_id
    scheduled_report_id uuid REFERENCES app.scheduled_reports(id),

    -- Execution details
    executed_by uuid REFERENCES app.users(id),
    parameters jsonb,
    filters jsonb,

    -- Results
    status varchar(20) NOT NULL, -- pending, running, completed, failed
    row_count integer,
    execution_time_ms integer,
    output_format varchar(20), -- json, csv, xlsx, pdf
    output_path text, -- S3 path if exported

    -- Error handling
    error_message text,
    error_details jsonb,

    -- Audit
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

-- Analytics aggregates (pre-computed for dashboards)
CREATE TABLE IF NOT EXISTS app.analytics_headcount (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Dimensions
    snapshot_date date NOT NULL,
    org_unit_id uuid REFERENCES app.org_units(id),
    department varchar(100),
    location varchar(100),

    -- Metrics
    total_headcount integer NOT NULL DEFAULT 0,
    active_headcount integer NOT NULL DEFAULT 0,
    on_leave_headcount integer NOT NULL DEFAULT 0,
    new_hires integer NOT NULL DEFAULT 0,
    terminations integer NOT NULL DEFAULT 0,
    transfers_in integer NOT NULL DEFAULT 0,
    transfers_out integer NOT NULL DEFAULT 0,

    -- FTE
    total_fte decimal(10,2) DEFAULT 0,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_headcount_snapshot UNIQUE (tenant_id, snapshot_date, org_unit_id)
);

-- Analytics turnover
CREATE TABLE IF NOT EXISTS app.analytics_turnover (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Dimensions
    period_start date NOT NULL,
    period_end date NOT NULL,
    period_type varchar(20) NOT NULL, -- month, quarter, year
    org_unit_id uuid REFERENCES app.org_units(id),

    -- Metrics
    starting_headcount integer NOT NULL DEFAULT 0,
    ending_headcount integer NOT NULL DEFAULT 0,
    avg_headcount decimal(10,2) DEFAULT 0,

    -- Turnover breakdown
    voluntary_terminations integer NOT NULL DEFAULT 0,
    involuntary_terminations integer NOT NULL DEFAULT 0,
    total_terminations integer NOT NULL DEFAULT 0,

    -- Rates
    turnover_rate decimal(5,2),
    voluntary_turnover_rate decimal(5,2),
    retention_rate decimal(5,2),

    -- By tenure
    turnover_0_1_year integer DEFAULT 0,
    turnover_1_3_years integer DEFAULT 0,
    turnover_3_plus_years integer DEFAULT 0,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_turnover_period UNIQUE (tenant_id, period_start, period_end, org_unit_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_report_definitions_tenant
    ON app.report_definitions(tenant_id, is_active, category);

CREATE INDEX IF NOT EXISTS idx_saved_reports_user
    ON app.saved_reports(user_id, is_favorite);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run
    ON app.scheduled_reports(next_run_at, is_active)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_report_executions_tenant
    ON app.report_executions(tenant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_headcount_date
    ON app.analytics_headcount(tenant_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_turnover_period
    ON app.analytics_turnover(tenant_id, period_start, period_type);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.report_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.saved_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.report_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.analytics_headcount ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.analytics_turnover ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.report_definitions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.saved_reports
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.scheduled_reports
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.report_executions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.analytics_headcount
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.analytics_turnover
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trg_report_definitions_updated_at
    BEFORE UPDATE ON app.report_definitions
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_saved_reports_updated_at
    BEFORE UPDATE ON app.saved_reports
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_scheduled_reports_updated_at
    BEFORE UPDATE ON app.scheduled_reports
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Calculate headcount snapshot
CREATE OR REPLACE FUNCTION app.calculate_headcount_snapshot(
    p_tenant_id uuid,
    p_snapshot_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Delete existing snapshot for this date
    DELETE FROM app.analytics_headcount
    WHERE tenant_id = p_tenant_id AND snapshot_date = p_snapshot_date;

    -- Insert new snapshot
    INSERT INTO app.analytics_headcount (
        tenant_id, snapshot_date, org_unit_id,
        total_headcount, active_headcount, on_leave_headcount,
        new_hires, terminations, total_fte
    )
    SELECT
        p_tenant_id,
        p_snapshot_date,
        pa.org_unit_id,
        COUNT(*) as total_headcount,
        COUNT(*) FILTER (WHERE e.status = 'active') as active_headcount,
        COUNT(*) FILTER (WHERE e.status = 'on_leave') as on_leave_headcount,
        COUNT(*) FILTER (WHERE e.hire_date = p_snapshot_date) as new_hires,
        COUNT(*) FILTER (WHERE e.termination_date = p_snapshot_date) as terminations,
        COALESCE(SUM(ec.fte), 0) as total_fte
    FROM app.employees e
    INNER JOIN app.position_assignments pa ON pa.employee_id = e.id
        AND pa.is_primary = true
        AND pa.effective_from <= p_snapshot_date
        AND (pa.effective_to IS NULL OR pa.effective_to > p_snapshot_date)
    LEFT JOIN app.employment_contracts ec ON ec.employee_id = e.id
        AND ec.effective_from <= p_snapshot_date
        AND (ec.effective_to IS NULL OR ec.effective_to > p_snapshot_date)
    WHERE e.tenant_id = p_tenant_id
      AND e.hire_date <= p_snapshot_date
      AND (e.termination_date IS NULL OR e.termination_date >= p_snapshot_date)
    GROUP BY pa.org_unit_id;
END;
$$;

-- Calculate turnover for a period
CREATE OR REPLACE FUNCTION app.calculate_turnover(
    p_tenant_id uuid,
    p_period_start date,
    p_period_end date,
    p_period_type varchar DEFAULT 'month'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_starting_headcount integer;
    v_ending_headcount integer;
BEGIN
    -- Get starting headcount
    SELECT COALESCE(SUM(total_headcount), 0) INTO v_starting_headcount
    FROM app.analytics_headcount
    WHERE tenant_id = p_tenant_id
      AND snapshot_date = p_period_start;

    -- Get ending headcount
    SELECT COALESCE(SUM(total_headcount), 0) INTO v_ending_headcount
    FROM app.analytics_headcount
    WHERE tenant_id = p_tenant_id
      AND snapshot_date = p_period_end;

    -- Delete existing record
    DELETE FROM app.analytics_turnover
    WHERE tenant_id = p_tenant_id
      AND period_start = p_period_start
      AND period_end = p_period_end;

    -- Insert turnover data
    INSERT INTO app.analytics_turnover (
        tenant_id, period_start, period_end, period_type,
        starting_headcount, ending_headcount, avg_headcount,
        voluntary_terminations, involuntary_terminations, total_terminations,
        turnover_rate, voluntary_turnover_rate, retention_rate
    )
    SELECT
        p_tenant_id,
        p_period_start,
        p_period_end,
        p_period_type,
        v_starting_headcount,
        v_ending_headcount,
        (v_starting_headcount + v_ending_headcount)::decimal / 2,
        COUNT(*) FILTER (WHERE e.termination_reason IN ('resignation', 'retirement')),
        COUNT(*) FILTER (WHERE e.termination_reason NOT IN ('resignation', 'retirement') AND e.termination_reason IS NOT NULL),
        COUNT(*),
        CASE WHEN (v_starting_headcount + v_ending_headcount) > 0
            THEN (COUNT(*)::decimal / ((v_starting_headcount + v_ending_headcount)::decimal / 2)) * 100
            ELSE 0
        END,
        CASE WHEN (v_starting_headcount + v_ending_headcount) > 0
            THEN (COUNT(*) FILTER (WHERE e.termination_reason IN ('resignation', 'retirement'))::decimal
                  / ((v_starting_headcount + v_ending_headcount)::decimal / 2)) * 100
            ELSE 0
        END,
        CASE WHEN v_starting_headcount > 0
            THEN (1 - (COUNT(*)::decimal / v_starting_headcount::decimal)) * 100
            ELSE 100
        END
    FROM app.employees e
    WHERE e.tenant_id = p_tenant_id
      AND e.termination_date BETWEEN p_period_start AND p_period_end;
END;
$$;

-- Get headcount trend
CREATE OR REPLACE FUNCTION app.get_headcount_trend(
    p_tenant_id uuid,
    p_start_date date,
    p_end_date date,
    p_org_unit_id uuid DEFAULT NULL
)
RETURNS TABLE (
    snapshot_date date,
    total_headcount integer,
    active_headcount integer,
    total_fte decimal
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ah.snapshot_date,
        SUM(ah.total_headcount)::integer as total_headcount,
        SUM(ah.active_headcount)::integer as active_headcount,
        SUM(ah.total_fte) as total_fte
    FROM app.analytics_headcount ah
    WHERE ah.tenant_id = p_tenant_id
      AND ah.snapshot_date BETWEEN p_start_date AND p_end_date
      AND (p_org_unit_id IS NULL OR ah.org_unit_id = p_org_unit_id)
    GROUP BY ah.snapshot_date
    ORDER BY ah.snapshot_date;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.report_definitions IS 'Report templates and definitions';
COMMENT ON TABLE app.saved_reports IS 'User-saved report configurations';
COMMENT ON TABLE app.scheduled_reports IS 'Scheduled report delivery';
COMMENT ON TABLE app.report_executions IS 'Report execution history';
COMMENT ON TABLE app.analytics_headcount IS 'Pre-computed headcount snapshots';
COMMENT ON TABLE app.analytics_turnover IS 'Pre-computed turnover metrics';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_headcount_trend(uuid, date, date, uuid);
-- DROP FUNCTION IF EXISTS app.calculate_turnover(uuid, date, date, varchar);
-- DROP FUNCTION IF EXISTS app.calculate_headcount_snapshot(uuid, date);
-- DROP TRIGGER IF EXISTS trg_scheduled_reports_updated_at ON app.scheduled_reports;
-- DROP TRIGGER IF EXISTS trg_saved_reports_updated_at ON app.saved_reports;
-- DROP TRIGGER IF EXISTS trg_report_definitions_updated_at ON app.report_definitions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.analytics_turnover;
-- DROP POLICY IF EXISTS tenant_isolation ON app.analytics_headcount;
-- DROP POLICY IF EXISTS tenant_isolation ON app.report_executions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.scheduled_reports;
-- DROP POLICY IF EXISTS tenant_isolation ON app.saved_reports;
-- DROP POLICY IF EXISTS tenant_isolation ON app.report_definitions;
-- DROP TABLE IF EXISTS app.analytics_turnover;
-- DROP TABLE IF EXISTS app.analytics_headcount;
-- DROP TABLE IF EXISTS app.report_executions;
-- DROP TABLE IF EXISTS app.scheduled_reports;
-- DROP TABLE IF EXISTS app.saved_reports;
-- DROP TABLE IF EXISTS app.report_definitions;
