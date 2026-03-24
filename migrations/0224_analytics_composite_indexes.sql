-- Migration: 0224_analytics_composite_indexes
-- Created: 2026-03-21
-- Description: Add composite indexes on analytics tables for efficient aggregation
--              queries. These indexes target query patterns used by the analytics
--              worker (staleness check, cleanup), report listing, and dashboard
--              lookups that are not covered by existing indexes.
--
-- Existing coverage (already indexed in 0079/0084/0106/0172/0191):
--   analytics_aggregates: (tenant_id, metric_type, granularity, period_start DESC)
--   analytics_aggregates: (tenant_id, metric_type, period_start)
--   analytics_aggregates: (period_start, period_end)
--   analytics_aggregates: GIN(dimensions)
--   analytics_snapshots:  (tenant_id, metric_type, as_of_date DESC)
--   analytics_snapshots:  (tenant_id, metric_type, as_of_date DESC) INCLUDE(value, unit)
--   analytics_snapshots:  (as_of_date DESC)
--   analytics_snapshots:  GIN(dimensions)
--   analytics_headcount:  (tenant_id, snapshot_date DESC)
--   analytics_headcount:  (tenant_id, snapshot_date DESC, org_unit_id)
--   analytics_headcount:  (tenant_id, org_unit_id, snapshot_date DESC) partial
--   analytics_turnover:   (tenant_id, period_start, period_type)
--   analytics_turnover:   (tenant_id, period_type, period_start, period_end)
--   analytics_turnover:   (tenant_id, org_unit_id, period_start DESC) partial
--   report_definitions:   (tenant_id, status)
--   report_definitions:   (created_by)
--   report_definitions:   (is_scheduled, next_scheduled_run) partial
--   report_definitions:   (is_system) partial
--   report_executions:    (report_id, executed_at DESC)
--   report_executions:    (executed_by, executed_at DESC)
--   report_executions:    (tenant_id, started_at DESC)
--   report_executions:    (tenant_id, status, started_at DESC) partial
--   analytics_dashboards: (tenant_id, user_id)
--   analytics_dashboards: (tenant_id, is_shared) partial
--   analytics_widgets:    (dashboard_id)
--   analytics_widgets:    (tenant_id)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- ---------------------------------------------------------------------------
-- analytics_aggregates: staleness check covering index
-- The isRecentlyComputed() function in analytics-worker.ts filters by
-- (tenant_id, metric_type, granularity, period_start, calculated_at).
-- The existing idx_analytics_aggregates_tenant_metric covers the first
-- four columns but sorts period_start DESC and does not include
-- calculated_at. The planner must fetch heap pages to evaluate the
-- calculated_at predicate. This covering index (ASC sort, matching the
-- equality predicates) with INCLUDE(calculated_at) enables an
-- index-only scan for this frequently-executed hot path.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_aggregates_staleness_check
    ON app.analytics_aggregates (tenant_id, metric_type, granularity, period_start)
    INCLUDE (calculated_at);

-- ---------------------------------------------------------------------------
-- analytics_aggregates: cleanup pattern
-- cleanup_old_analytics() deletes rows WHERE granularity != 'year'
-- AND created_at < threshold. No existing index covers this pattern.
-- A partial composite on (created_at) excluding 'year' rows allows the
-- planner to efficiently find and delete expired non-yearly aggregates.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_aggregates_cleanup
    ON app.analytics_aggregates (created_at)
    WHERE granularity != 'year';

-- ---------------------------------------------------------------------------
-- report_definitions: user report listing
-- The reports repository lists reports with:
--   WHERE (created_by = ? OR is_public = true)
-- The existing idx_rd_created_by covers (created_by) alone, but not
-- (tenant_id, created_by, is_public). Adding tenant_id as leading
-- column lets the planner combine the RLS tenant filter with the
-- ownership/public check in a single index scan.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_report_definitions_owner_public
    ON app.report_definitions (tenant_id, created_by, is_public);

-- ---------------------------------------------------------------------------
-- analytics_dashboards: default dashboard lookup
-- Dashboard queries often fetch the default dashboard for a tenant
-- (WHERE tenant_id = ? AND is_default = true). The existing indexes
-- cover (tenant_id, user_id) and (tenant_id, is_shared), but not
-- is_default. A tiny partial index speeds up this lookup.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_dashboards_default
    ON app.analytics_dashboards (tenant_id)
    WHERE is_default = true;

-- ---------------------------------------------------------------------------
-- analytics_widgets: tenant + dashboard composite
-- After migration 0183 added tenant_id to analytics_widgets, RLS
-- filters by tenant_id on every query. The existing indexes cover
-- (dashboard_id) and (tenant_id) separately, but not the composite.
-- This index lets the planner satisfy both the RLS filter and the
-- dashboard lookup in a single index scan.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_widgets_tenant_dashboard
    ON app.analytics_widgets (tenant_id, dashboard_id);

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON INDEX app.idx_analytics_aggregates_staleness_check IS
    'Covering index for isRecentlyComputed() staleness checks (INCLUDEs calculated_at)';

COMMENT ON INDEX app.idx_analytics_aggregates_cleanup IS
    'Partial index for cleanup_old_analytics() — finds expired non-yearly aggregates by created_at';

COMMENT ON INDEX app.idx_report_definitions_owner_public IS
    'Composite index for user report listing filtered by owner or public visibility';

COMMENT ON INDEX app.idx_analytics_dashboards_default IS
    'Partial index for finding the default dashboard per tenant';

COMMENT ON INDEX app.idx_analytics_widgets_tenant_dashboard IS
    'Composite index for RLS-filtered widget lookups by dashboard';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_analytics_widgets_tenant_dashboard;
-- DROP INDEX IF EXISTS app.idx_analytics_dashboards_default;
-- DROP INDEX IF EXISTS app.idx_report_definitions_owner_public;
-- DROP INDEX IF EXISTS app.idx_analytics_aggregates_cleanup;
-- DROP INDEX IF EXISTS app.idx_analytics_aggregates_staleness_check;
