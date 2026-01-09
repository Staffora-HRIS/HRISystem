-- Migration: 0079_analytics
-- Created: 2026-01-07
-- Description: Create tables for analytics system used by analytics worker
--              Stores aggregated metrics, snapshots, and dashboards

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Metric type enum
DO $$ BEGIN
    CREATE TYPE app.metric_type AS ENUM (
        'headcount',
        'turnover',
        'time_attendance',
        'leave_utilization',
        'overtime',
        'absence_rate',
        'tenure',
        'compensation',
        'custom'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Time granularity enum
DO $$ BEGIN
    CREATE TYPE app.time_granularity AS ENUM (
        'hour',
        'day',
        'week',
        'month',
        'quarter',
        'year'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Analytics Aggregates - Pre-computed metrics over time periods
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.analytics_aggregates (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant context
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Metric identification
    metric_type app.metric_type NOT NULL,
    granularity app.time_granularity NOT NULL,

    -- Time period
    period_start timestamptz NOT NULL,
    period_end timestamptz NOT NULL,

    -- Dimension values (org_unit, department, etc.)
    dimensions jsonb NOT NULL DEFAULT '{}',

    -- Aggregate values
    value numeric(20, 4) NOT NULL,
    count integer NOT NULL DEFAULT 0,
    sum numeric(20, 4) NOT NULL DEFAULT 0,
    min numeric(20, 4),
    max numeric(20, 4),
    avg numeric(20, 4),

    -- Additional metadata
    metadata jsonb NOT NULL DEFAULT '{}',

    -- Calculation tracking
    calculated_at timestamptz NOT NULL DEFAULT now(),

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Unique constraint for upsert
    CONSTRAINT unique_aggregate UNIQUE (tenant_id, metric_type, granularity, period_start, dimensions)
);

-- =============================================================================
-- Analytics Snapshots - Point-in-time metric values
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.analytics_snapshots (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant context
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Metric identification
    metric_type app.metric_type NOT NULL,

    -- Point in time
    as_of_date date NOT NULL,

    -- Dimension values
    dimensions jsonb NOT NULL DEFAULT '{}',

    -- Metric value
    value numeric(20, 4) NOT NULL,
    unit varchar(50) NOT NULL,

    -- Calculation tracking
    calculated_at timestamptz NOT NULL DEFAULT now(),

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Unique constraint for upsert
    CONSTRAINT unique_snapshot UNIQUE (tenant_id, metric_type, as_of_date, dimensions)
);

-- =============================================================================
-- Analytics Dashboards - User-defined dashboard configurations
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.analytics_dashboards (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant context
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Owner
    user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Dashboard details
    name varchar(255) NOT NULL,
    description text,

    -- Dashboard configuration
    config jsonb NOT NULL DEFAULT '{}',

    -- Sharing
    is_shared boolean NOT NULL DEFAULT false,
    is_default boolean NOT NULL DEFAULT false,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Analytics Dashboard Widgets
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.analytics_widgets (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Dashboard reference
    dashboard_id uuid NOT NULL REFERENCES app.analytics_dashboards(id) ON DELETE CASCADE,

    -- Widget details
    title varchar(255) NOT NULL,
    widget_type varchar(50) NOT NULL, -- 'chart', 'table', 'kpi', 'gauge'

    -- Widget configuration
    config jsonb NOT NULL DEFAULT '{}',

    -- Layout position
    position_x integer NOT NULL DEFAULT 0,
    position_y integer NOT NULL DEFAULT 0,
    width integer NOT NULL DEFAULT 4,
    height integer NOT NULL DEFAULT 3,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Analytics aggregates indexes
CREATE INDEX IF NOT EXISTS idx_analytics_aggregates_tenant_metric
    ON app.analytics_aggregates(tenant_id, metric_type, granularity, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_aggregates_period
    ON app.analytics_aggregates(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_analytics_aggregates_dimensions
    ON app.analytics_aggregates USING gin(dimensions);

-- Analytics snapshots indexes
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_tenant_metric
    ON app.analytics_snapshots(tenant_id, metric_type, as_of_date DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_date
    ON app.analytics_snapshots(as_of_date DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_dimensions
    ON app.analytics_snapshots USING gin(dimensions);

-- Dashboard indexes
CREATE INDEX IF NOT EXISTS idx_analytics_dashboards_tenant_user
    ON app.analytics_dashboards(tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_analytics_dashboards_shared
    ON app.analytics_dashboards(tenant_id, is_shared)
    WHERE is_shared = true;

-- Widget indexes
CREATE INDEX IF NOT EXISTS idx_analytics_widgets_dashboard
    ON app.analytics_widgets(dashboard_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.analytics_aggregates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.analytics_aggregates
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

ALTER TABLE app.analytics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.analytics_snapshots
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

ALTER TABLE app.analytics_dashboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.analytics_dashboards
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

ALTER TABLE app.analytics_widgets ENABLE ROW LEVEL SECURITY;

-- Widgets inherit access from dashboard
CREATE POLICY dashboard_access ON app.analytics_widgets
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM app.analytics_dashboards d
            WHERE d.id = dashboard_id
              AND d.tenant_id = current_setting('app.current_tenant', true)::uuid
        )
        OR app.is_system_context()
    );

-- =============================================================================
-- Functions
-- =============================================================================

-- Get latest metric value
CREATE OR REPLACE FUNCTION app.get_latest_metric(
    p_tenant_id uuid,
    p_metric_type app.metric_type,
    p_dimensions jsonb DEFAULT '{}'
)
RETURNS TABLE (
    value numeric,
    unit varchar,
    as_of_date date,
    calculated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.value,
        s.unit,
        s.as_of_date,
        s.calculated_at
    FROM app.analytics_snapshots s
    WHERE s.tenant_id = p_tenant_id
      AND s.metric_type = p_metric_type
      AND s.dimensions @> p_dimensions
    ORDER BY s.as_of_date DESC
    LIMIT 1;
END;
$$;

-- Get metric trend over time
CREATE OR REPLACE FUNCTION app.get_metric_trend(
    p_tenant_id uuid,
    p_metric_type app.metric_type,
    p_granularity app.time_granularity,
    p_from_date timestamptz,
    p_to_date timestamptz,
    p_dimensions jsonb DEFAULT '{}'
)
RETURNS TABLE (
    period_start timestamptz,
    period_end timestamptz,
    value numeric,
    count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.period_start,
        a.period_end,
        a.value,
        a.count
    FROM app.analytics_aggregates a
    WHERE a.tenant_id = p_tenant_id
      AND a.metric_type = p_metric_type
      AND a.granularity = p_granularity
      AND a.period_start >= p_from_date
      AND a.period_end <= p_to_date
      AND a.dimensions @> p_dimensions
    ORDER BY a.period_start;
END;
$$;

-- Get dashboard with widgets
CREATE OR REPLACE FUNCTION app.get_dashboard_with_widgets(p_dashboard_id uuid)
RETURNS TABLE (
    dashboard_id uuid,
    dashboard_name varchar,
    dashboard_config jsonb,
    widgets jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id as dashboard_id,
        d.name as dashboard_name,
        d.config as dashboard_config,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', w.id,
                    'title', w.title,
                    'widgetType', w.widget_type,
                    'config', w.config,
                    'position', jsonb_build_object(
                        'x', w.position_x,
                        'y', w.position_y,
                        'width', w.width,
                        'height', w.height
                    )
                ) ORDER BY w.position_y, w.position_x
            ) FILTER (WHERE w.id IS NOT NULL),
            '[]'
        ) as widgets
    FROM app.analytics_dashboards d
    LEFT JOIN app.analytics_widgets w ON w.dashboard_id = d.id
    WHERE d.id = p_dashboard_id
    GROUP BY d.id, d.name, d.config;
END;
$$;

-- Calculate period-over-period change
CREATE OR REPLACE FUNCTION app.get_metric_change(
    p_tenant_id uuid,
    p_metric_type app.metric_type,
    p_current_date date,
    p_comparison_date date,
    p_dimensions jsonb DEFAULT '{}'
)
RETURNS TABLE (
    current_value numeric,
    previous_value numeric,
    absolute_change numeric,
    percentage_change numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current numeric;
    v_previous numeric;
BEGIN
    -- Get current value
    SELECT s.value INTO v_current
    FROM app.analytics_snapshots s
    WHERE s.tenant_id = p_tenant_id
      AND s.metric_type = p_metric_type
      AND s.as_of_date = p_current_date
      AND s.dimensions @> p_dimensions
    LIMIT 1;

    -- Get previous value
    SELECT s.value INTO v_previous
    FROM app.analytics_snapshots s
    WHERE s.tenant_id = p_tenant_id
      AND s.metric_type = p_metric_type
      AND s.as_of_date = p_comparison_date
      AND s.dimensions @> p_dimensions
    LIMIT 1;

    RETURN QUERY
    SELECT
        COALESCE(v_current, 0) as current_value,
        COALESCE(v_previous, 0) as previous_value,
        COALESCE(v_current, 0) - COALESCE(v_previous, 0) as absolute_change,
        CASE
            WHEN COALESCE(v_previous, 0) = 0 THEN NULL
            ELSE ((COALESCE(v_current, 0) - v_previous) / v_previous * 100)
        END as percentage_change;
END;
$$;

-- Cleanup old analytics data
CREATE OR REPLACE FUNCTION app.cleanup_old_analytics(
    p_aggregates_retention_days integer DEFAULT 365,
    p_snapshots_retention_days integer DEFAULT 90
)
RETURNS TABLE (
    deleted_aggregates integer,
    deleted_snapshots integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_deleted_aggregates integer;
    v_deleted_snapshots integer;
BEGIN
    PERFORM app.enable_system_context();

    -- Delete old aggregates (keep yearly forever)
    DELETE FROM app.analytics_aggregates
    WHERE granularity != 'year'
      AND created_at < now() - (p_aggregates_retention_days || ' days')::interval;

    GET DIAGNOSTICS v_deleted_aggregates = ROW_COUNT;

    -- Delete old snapshots
    DELETE FROM app.analytics_snapshots
    WHERE as_of_date < CURRENT_DATE - p_snapshots_retention_days;

    GET DIAGNOSTICS v_deleted_snapshots = ROW_COUNT;

    PERFORM app.disable_system_context();

    RETURN QUERY SELECT v_deleted_aggregates, v_deleted_snapshots;
END;
$$;

-- =============================================================================
-- Triggers
-- =============================================================================

-- Update updated_at timestamp for aggregates
CREATE TRIGGER trg_analytics_aggregates_updated_at
    BEFORE UPDATE ON app.analytics_aggregates
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Update updated_at timestamp for dashboards
CREATE TRIGGER trg_analytics_dashboards_updated_at
    BEFORE UPDATE ON app.analytics_dashboards
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Update updated_at timestamp for widgets
CREATE TRIGGER trg_analytics_widgets_updated_at
    BEFORE UPDATE ON app.analytics_widgets
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.analytics_aggregates IS 'Pre-computed metrics aggregated over time periods';
COMMENT ON TABLE app.analytics_snapshots IS 'Point-in-time metric values for trending';
COMMENT ON TABLE app.analytics_dashboards IS 'User-defined analytics dashboards';
COMMENT ON TABLE app.analytics_widgets IS 'Widgets displayed on analytics dashboards';

COMMENT ON COLUMN app.analytics_aggregates.dimensions IS 'Dimension values like org_unit_id, department, etc.';
COMMENT ON COLUMN app.analytics_aggregates.value IS 'Primary aggregate value (can be count, sum, avg, etc.)';
COMMENT ON COLUMN app.analytics_aggregates.granularity IS 'Time granularity: hour, day, week, month, quarter, year';

COMMENT ON COLUMN app.analytics_snapshots.as_of_date IS 'Date for which this metric value applies';
COMMENT ON COLUMN app.analytics_snapshots.unit IS 'Unit of measurement: percent, employees, hours, etc.';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_analytics_widgets_updated_at ON app.analytics_widgets;
-- DROP TRIGGER IF EXISTS trg_analytics_dashboards_updated_at ON app.analytics_dashboards;
-- DROP TRIGGER IF EXISTS trg_analytics_aggregates_updated_at ON app.analytics_aggregates;
-- DROP FUNCTION IF EXISTS app.cleanup_old_analytics(integer, integer);
-- DROP FUNCTION IF EXISTS app.get_metric_change(uuid, app.metric_type, date, date, jsonb);
-- DROP FUNCTION IF EXISTS app.get_dashboard_with_widgets(uuid);
-- DROP FUNCTION IF EXISTS app.get_metric_trend(uuid, app.metric_type, app.time_granularity, timestamptz, timestamptz, jsonb);
-- DROP FUNCTION IF EXISTS app.get_latest_metric(uuid, app.metric_type, jsonb);
-- DROP POLICY IF EXISTS dashboard_access ON app.analytics_widgets;
-- DROP POLICY IF EXISTS tenant_isolation ON app.analytics_dashboards;
-- DROP POLICY IF EXISTS tenant_isolation ON app.analytics_snapshots;
-- DROP POLICY IF EXISTS tenant_isolation ON app.analytics_aggregates;
-- DROP TABLE IF EXISTS app.analytics_widgets;
-- DROP TABLE IF EXISTS app.analytics_dashboards;
-- DROP TABLE IF EXISTS app.analytics_snapshots;
-- DROP TABLE IF EXISTS app.analytics_aggregates;
-- DROP TYPE IF EXISTS app.time_granularity;
-- DROP TYPE IF EXISTS app.metric_type;
