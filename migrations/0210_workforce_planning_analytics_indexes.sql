-- Migration: 0210_workforce_planning_analytics_indexes
-- Created: 2026-03-19
-- Description: Add composite indexes to optimize workforce planning analytics queries
--              Supports headcount-trends, turnover-rate, retirement-projection,
--              tenure-distribution, vacancy-rate, and summary endpoints (TODO-198)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Optimize headcount trend queries (hires/terminations by month)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_hire_date_status
  ON app.employees (tenant_id, hire_date)
  WHERE status != 'terminated';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_termination_date_status
  ON app.employees (tenant_id, termination_date)
  WHERE status = 'terminated' AND termination_date IS NOT NULL;

-- Optimize turnover by reason queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_termination_reason
  ON app.employees (tenant_id, termination_reason)
  WHERE status = 'terminated';

-- Optimize retirement projection (employee_personal date_of_birth lookups)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employee_personal_dob_active
  ON app.employee_personal (tenant_id, employee_id, date_of_birth)
  WHERE effective_to IS NULL AND date_of_birth IS NOT NULL;

-- Optimize vacancy rate (position headcount budget aggregation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_positions_org_unit_headcount
  ON app.positions (tenant_id, org_unit_id, headcount)
  WHERE is_active = true;

-- Optimize filled position counts (active primary assignments)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_position_assignments_primary_active
  ON app.position_assignments (tenant_id, position_id, employee_id)
  WHERE effective_to IS NULL AND is_primary = true;

-- Optimize open requisitions aggregation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_requisitions_open_org_unit
  ON app.requisitions (tenant_id, org_unit_id, openings, filled)
  WHERE status = 'open';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_requisitions_open_org_unit;
-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_position_assignments_primary_active;
-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_positions_org_unit_headcount;
-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_employee_personal_dob_active;
-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_employees_termination_reason;
-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_employees_termination_date_status;
-- DROP INDEX CONCURRENTLY IF EXISTS app.idx_employees_hire_date_status;
