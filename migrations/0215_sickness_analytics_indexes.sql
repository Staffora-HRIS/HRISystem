-- Migration: 0215_sickness_analytics_indexes
-- Created: 2026-03-19
-- Description: Add composite indexes to support sickness absence trend analytics
--              queries (TODO-263). These indexes cover the common filter+aggregation
--              patterns: by month, by reason, by department, and by category.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Sickness requests by category and date range (for trend, seasonal, summary queries)
-- Covers: WHERE category = 'sick' AND status IN (...) AND start_date BETWEEN ...
CREATE INDEX IF NOT EXISTS idx_leave_requests_sickness_trends
    ON app.leave_requests (tenant_id, leave_type_id, status, start_date)
    WHERE status = 'approved';

-- Leave type category lookup for sickness filtering
-- Covers: JOIN leave_types WHERE category = 'sick'
CREATE INDEX IF NOT EXISTS idx_leave_types_category_sick
    ON app.leave_types (tenant_id, id)
    WHERE category = 'sick' AND is_active = true;

-- Position assignments for department aggregation (active assignments only)
-- Covers: JOIN position_assignments ... WHERE effective_to IS NULL AND is_primary = true
CREATE INDEX IF NOT EXISTS idx_position_assignments_active_primary
    ON app.position_assignments (employee_id, position_id)
    WHERE effective_to IS NULL AND is_primary = true;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_position_assignments_active_primary;
-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_leave_types_category_sick;
-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_leave_requests_sickness_trends;
