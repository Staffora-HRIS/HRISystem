-- Migration: 0174_performance_indexes
-- Created: 2026-03-14
-- Description: Add missing database indexes for common query patterns identified
--              in the performance audit. Targets hot paths in org views, leave
--              management, performance cycles, recruitment pipeline, and outbox
--              processing.
--
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction, and our
--       migration runner wraps each file in sql.begin(). We therefore use
--       regular CREATE INDEX IF NOT EXISTS, which is safe for most tables
--       at current data volumes. For very large production tables, consider
--       applying these indexes manually with CONCURRENTLY during a
--       maintenance window before running the migration.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Org unit hierarchy navigation
-- -----------------------------------------------------------------------------
-- Serves queries that navigate the tree by parent_id and need only active units.
-- The existing idx_org_units_tenant_parent covers (tenant_id, parent_id) but
-- does not include is_active, forcing a filter step. This index lets the planner
-- seek directly on (parent_id, is_active) while RLS handles tenant isolation.
CREATE INDEX IF NOT EXISTS idx_org_units_parent_active
    ON app.org_units(parent_id, is_active);

-- -----------------------------------------------------------------------------
-- 2. Position assignments by org unit + effective_to (department member lists)
-- -----------------------------------------------------------------------------
-- The existing idx_position_assignments_org_unit covers (tenant_id, org_unit_id)
-- with a partial WHERE effective_to IS NULL. This complementary index supports
-- queries that need historical assignments (org_unit_id, effective_to) for
-- headcount trend reports and assignment history.
CREATE INDEX IF NOT EXISTS idx_position_assignments_org_unit_effective
    ON app.position_assignments(org_unit_id, effective_to);

-- -----------------------------------------------------------------------------
-- 3. Leave requests by employee sorted by creation date (recent requests)
-- -----------------------------------------------------------------------------
-- Common pattern: "show my recent leave requests". The existing
-- idx_leave_requests_employee covers (tenant_id, employee_id, status) which
-- is optimal for status-filtered queries but not for recency-sorted lists.
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_created
    ON app.leave_requests(employee_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Performance cycles by tenant sorted by end_date DESC (cycle history)
-- -----------------------------------------------------------------------------
-- Common pattern: "show cycle history sorted by most recent". The existing
-- idx_performance_cycles_tenant_dates covers (tenant_id, start_date, end_date)
-- which is optimal for range queries but not for sorting by end_date DESC.
CREATE INDEX IF NOT EXISTS idx_performance_cycles_tenant_end_date
    ON app.performance_cycles(tenant_id, end_date DESC);

-- -----------------------------------------------------------------------------
-- 5. Reviews by cycle and employee (review lookups within a cycle)
-- -----------------------------------------------------------------------------
-- Common pattern: "get all reviews for employee X in cycle Y". The existing
-- idx_reviews_tenant_employee_cycle covers (tenant_id, employee_id, cycle_id)
-- which works for "all cycles for an employee". This index leads with cycle_id
-- for the inverse lookup pattern: "all employees reviewed in this cycle".
CREATE INDEX IF NOT EXISTS idx_reviews_cycle_employee
    ON app.reviews(cycle_id, employee_id);

-- -----------------------------------------------------------------------------
-- 6. Candidates by requisition sorted by creation date (pipeline views)
-- -----------------------------------------------------------------------------
-- Common pattern: "show candidates for this requisition, newest first". The
-- existing idx_candidates_tenant_requisition covers (tenant_id, requisition_id)
-- but does not include created_at for sorting. This index supports the pipeline
-- view query directly.
CREATE INDEX IF NOT EXISTS idx_candidates_requisition_created
    ON app.candidates(requisition_id, created_at DESC);

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_candidates_requisition_created;
-- DROP INDEX IF EXISTS app.idx_reviews_cycle_employee;
-- DROP INDEX IF EXISTS app.idx_performance_cycles_tenant_end_date;
-- DROP INDEX IF EXISTS app.idx_leave_requests_employee_created;
-- DROP INDEX IF EXISTS app.idx_position_assignments_org_unit_effective;
-- DROP INDEX IF EXISTS app.idx_org_units_parent_active;
