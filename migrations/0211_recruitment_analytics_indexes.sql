-- Migration: 0211_recruitment_analytics_indexes
-- Created: 2026-03-19
-- Description: Composite indexes to optimize recruitment analytics queries
--              (time-to-fill, cost-per-hire, source effectiveness, pipeline analytics)
--              Supports TODO-159: Recruitment analytics

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Indexes for time-to-fill analytics
-- Query pattern: filled requisitions within date range, joined to candidate_stage_events
-- for hire date, grouped by org_unit_id (department)
-- -----------------------------------------------------------------------------

-- Requisitions filtered by status + date range + org_unit for analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_requisitions_analytics_filled
    ON app.requisitions(tenant_id, status, created_at DESC)
    WHERE status = 'filled';

-- Candidate stage events: find 'hired' transitions quickly
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cse_hired_by_candidate
    ON app.candidate_stage_events(candidate_id, created_at ASC)
    WHERE to_stage = 'hired';

-- -----------------------------------------------------------------------------
-- Indexes for cost-per-hire analytics
-- Query pattern: recruitment_costs joined to requisitions, grouped by
-- org_unit, category, within date range
-- -----------------------------------------------------------------------------

-- Recruitment costs: date range + currency filtering with requisition join
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recruitment_costs_analytics
    ON app.recruitment_costs(tenant_id, currency, incurred_date DESC);

-- -----------------------------------------------------------------------------
-- Indexes for source effectiveness analytics
-- Query pattern: candidates grouped by source, filtered by date range and
-- optionally by requisition's org_unit_id
-- -----------------------------------------------------------------------------

-- Candidates by source for aggregation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candidates_source_analytics
    ON app.candidates(tenant_id, source, current_stage, created_at DESC);

-- Candidates hired: for counting hires in date ranges
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candidates_hired_updated
    ON app.candidates(tenant_id, updated_at DESC)
    WHERE current_stage = 'hired';

-- -----------------------------------------------------------------------------
-- Indexes for pipeline analytics
-- Query pattern: candidate_stage_events for transition analysis
-- (entries per stage, exits per stage, duration calculations)
-- -----------------------------------------------------------------------------

-- Stage events: for counting entries to each stage in date range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cse_to_stage_date
    ON app.candidate_stage_events(tenant_id, to_stage, created_at DESC);

-- Stage events: for counting forward exits from each stage
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cse_from_stage_date
    ON app.candidate_stage_events(tenant_id, from_stage, created_at DESC)
    WHERE from_stage IS NOT NULL;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON INDEX app.idx_requisitions_analytics_filled IS 'Optimises time-to-fill analytics: find filled requisitions by tenant and date';
COMMENT ON INDEX app.idx_cse_hired_by_candidate IS 'Optimises finding hire date per candidate for time-to-fill calculation';
COMMENT ON INDEX app.idx_recruitment_costs_analytics IS 'Optimises cost-per-hire aggregation by date range and currency';
COMMENT ON INDEX app.idx_candidates_source_analytics IS 'Optimises source effectiveness grouping by source and stage';
COMMENT ON INDEX app.idx_candidates_hired_updated IS 'Optimises counting hires within date ranges for cost-per-hire';
COMMENT ON INDEX app.idx_cse_to_stage_date IS 'Optimises pipeline entry counts per stage';
COMMENT ON INDEX app.idx_cse_from_stage_date IS 'Optimises pipeline exit/progression counts per stage';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_cse_from_stage_date;
-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_cse_to_stage_date;
-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_candidates_hired_updated;
-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_candidates_source_analytics;
-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_recruitment_costs_analytics;
-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_cse_hired_by_candidate;
-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_requisitions_analytics_filled;
