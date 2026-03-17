-- Migration: 0191_analytics_composite_indexes
-- Created: 2026-03-17
-- Description: Add composite indexes on analytics tables for common query patterns.
--              The analytics_aggregates and analytics_snapshots tables are queried
--              frequently by (tenant_id, metric_type, period_start) and similar
--              patterns. While some indexes exist, the analytics_headcount and
--              analytics_turnover tables (from 0106_analytics.sql) lack optimal
--              composite indexes for dashboard and trending queries.
--
--              Also adds missing composite indexes on analytics_aggregates for
--              the specific (tenant_id, metric_type, period_start) pattern used
--              by the analytics worker's upsert operations.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- ---------------------------------------------------------------------------
-- analytics_aggregates: composite for upsert and range queries
-- The existing idx_analytics_aggregates_tenant_metric already covers
-- (tenant_id, metric_type, granularity, period_start DESC). Adding a
-- focused index without granularity for broader metric_type + period queries.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_aggregates_tenant_type_period
    ON app.analytics_aggregates (tenant_id, metric_type, period_start);

-- ---------------------------------------------------------------------------
-- analytics_snapshots: composite for metric queries by date range
-- The existing idx_analytics_snapshots_tenant_metric covers
-- (tenant_id, metric_type, as_of_date DESC). Adding a covering index
-- that also includes the value for index-only scans on trend queries.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_tenant_type_date_value
    ON app.analytics_snapshots (tenant_id, metric_type, as_of_date DESC)
    INCLUDE (value, unit);

-- ---------------------------------------------------------------------------
-- analytics_headcount: composite for org_unit trend queries
-- The existing idx_analytics_headcount_date covers (tenant_id, snapshot_date).
-- Adding org_unit_id to support filtered trend queries by department.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_headcount_tenant_date_org
    ON app.analytics_headcount (tenant_id, snapshot_date DESC, org_unit_id);

-- ---------------------------------------------------------------------------
-- analytics_headcount: composite for period range + org_unit lookups
-- Used by get_headcount_trend() and dashboard widgets.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_headcount_org_date
    ON app.analytics_headcount (tenant_id, org_unit_id, snapshot_date DESC)
    WHERE org_unit_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- analytics_turnover: composite for period_type trend queries
-- The existing idx_analytics_turnover_period covers (tenant_id, period_start, period_type).
-- Adding period_end and org_unit for filtered range queries.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_turnover_tenant_type_period
    ON app.analytics_turnover (tenant_id, period_type, period_start, period_end);

-- ---------------------------------------------------------------------------
-- analytics_turnover: composite for org_unit filtered queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_turnover_tenant_org_period
    ON app.analytics_turnover (tenant_id, org_unit_id, period_start DESC)
    WHERE org_unit_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- report_executions: composite for status monitoring queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_report_executions_status
    ON app.report_executions (tenant_id, status, started_at DESC)
    WHERE status IN ('pending', 'running');

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON INDEX app.idx_analytics_aggregates_tenant_type_period IS
    'Composite index for analytics worker upsert and metric_type+period range queries';

COMMENT ON INDEX app.idx_analytics_snapshots_tenant_type_date_value IS
    'Covering index for trend queries (avoids heap lookup for value and unit)';

COMMENT ON INDEX app.idx_analytics_headcount_tenant_date_org IS
    'Composite index for headcount trend queries with optional org_unit filter';

COMMENT ON INDEX app.idx_analytics_headcount_org_date IS
    'Composite index for department-specific headcount queries';

COMMENT ON INDEX app.idx_analytics_turnover_tenant_type_period IS
    'Composite index for turnover range queries by period_type';

COMMENT ON INDEX app.idx_analytics_turnover_tenant_org_period IS
    'Composite index for department-specific turnover queries';

COMMENT ON INDEX app.idx_report_executions_status IS
    'Partial index for monitoring active/pending report executions';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_report_executions_status;
-- DROP INDEX IF EXISTS app.idx_analytics_turnover_tenant_org_period;
-- DROP INDEX IF EXISTS app.idx_analytics_turnover_tenant_type_period;
-- DROP INDEX IF EXISTS app.idx_analytics_headcount_org_date;
-- DROP INDEX IF EXISTS app.idx_analytics_headcount_tenant_date_org;
-- DROP INDEX IF EXISTS app.idx_analytics_snapshots_tenant_type_date_value;
-- DROP INDEX IF EXISTS app.idx_analytics_aggregates_tenant_type_period;
