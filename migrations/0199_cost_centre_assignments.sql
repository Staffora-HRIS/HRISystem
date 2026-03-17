-- Migration: 0199_cost_centre_assignments
-- Created: 2026-03-17
-- Description: Create cost_centre_assignments table for effective-dated cost centre
--              tracking. Supports employees, departments, and positions with
--              percentage-based allocation and overlap prevention.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- =============================================================================
-- Entity Type Enum
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cost_centre_entity_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.cost_centre_entity_type AS ENUM ('employee', 'department', 'position');
  END IF;
END
$$;

-- =============================================================================
-- Cost Centre Assignments Table
-- =============================================================================
-- Tracks effective-dated cost centre assignments for employees, departments,
-- and positions. Supports percentage-based allocation (e.g., 60% Engineering,
-- 40% Marketing) and enforces no overlapping assignments per entity+cost_centre
-- combination within the same date range.

CREATE TABLE IF NOT EXISTS app.cost_centre_assignments (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this assignment
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Entity type: employee, department, or position
    entity_type app.cost_centre_entity_type NOT NULL,

    -- Entity ID (polymorphic FK — points to employees, org_units, or positions)
    entity_id uuid NOT NULL,

    -- Cost centre being assigned
    cost_centre_id uuid NOT NULL REFERENCES app.cost_centers(id) ON DELETE RESTRICT,

    -- Allocation percentage (default 100). Multiple assignments for the same
    -- entity in the same period should sum to 100, but we enforce that at the
    -- application layer (not DB) because partial allocations during transitions
    -- are valid temporarily.
    percentage numeric(5,2) NOT NULL DEFAULT 100
        CONSTRAINT cost_centre_assignments_percentage_range
            CHECK (percentage > 0 AND percentage <= 100),

    -- Effective dating: NULL effective_to means "current"
    effective_from date NOT NULL,
    effective_to date DEFAULT NULL,

    -- Who created this assignment
    created_by uuid,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- effective_to must be after effective_from when set
    CONSTRAINT cost_centre_assignments_date_order
        CHECK (effective_to IS NULL OR effective_to > effective_from),

    -- Prevent exact duplicate assignments (same entity, same cost centre, same start date)
    CONSTRAINT cost_centre_assignments_no_duplicate
        UNIQUE (tenant_id, entity_type, entity_id, cost_centre_id, effective_from)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: current assignments for an entity
CREATE INDEX IF NOT EXISTS idx_cca_entity_current
    ON app.cost_centre_assignments(tenant_id, entity_type, entity_id)
    WHERE effective_to IS NULL;

-- Lookup by entity with date range (for history queries)
CREATE INDEX IF NOT EXISTS idx_cca_entity_dates
    ON app.cost_centre_assignments(tenant_id, entity_type, entity_id, effective_from, effective_to);

-- Lookup by cost centre (find all entities assigned to a cost centre)
CREATE INDEX IF NOT EXISTS idx_cca_cost_centre
    ON app.cost_centre_assignments(tenant_id, cost_centre_id)
    WHERE effective_to IS NULL;

-- Lookup for overlap checking within a transaction
CREATE INDEX IF NOT EXISTS idx_cca_overlap_check
    ON app.cost_centre_assignments(tenant_id, entity_type, entity_id, cost_centre_id, effective_from, effective_to);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.cost_centre_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see assignments for their current tenant
CREATE POLICY tenant_isolation ON app.cost_centre_assignments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.cost_centre_assignments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_cost_centre_assignments_updated_at
    BEFORE UPDATE ON app.cost_centre_assignments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Exclusion Constraint for Overlap Prevention
-- =============================================================================
-- We need the btree_gist extension for combining uuid equality with daterange
-- overlap in an exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping date ranges for the same entity + cost centre combination.
-- This is a database-level safety net; the application also validates overlaps
-- before insert to provide actionable error messages.
ALTER TABLE app.cost_centre_assignments
    ADD CONSTRAINT cost_centre_assignments_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        entity_type WITH =,
        entity_id WITH =,
        cost_centre_id WITH =,
        daterange(effective_from, effective_to, '[)') WITH &&
    );

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.cost_centre_assignments IS 'Effective-dated cost centre assignments for employees, departments, and positions with percentage-based allocation';
COMMENT ON COLUMN app.cost_centre_assignments.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.cost_centre_assignments.tenant_id IS 'Tenant that owns this assignment';
COMMENT ON COLUMN app.cost_centre_assignments.entity_type IS 'Type of entity: employee, department, or position';
COMMENT ON COLUMN app.cost_centre_assignments.entity_id IS 'UUID of the assigned entity (employee, org_unit, or position)';
COMMENT ON COLUMN app.cost_centre_assignments.cost_centre_id IS 'UUID of the assigned cost centre';
COMMENT ON COLUMN app.cost_centre_assignments.percentage IS 'Allocation percentage (0-100, default 100)';
COMMENT ON COLUMN app.cost_centre_assignments.effective_from IS 'Start date of this assignment';
COMMENT ON COLUMN app.cost_centre_assignments.effective_to IS 'End date of this assignment (NULL = current/open-ended)';
COMMENT ON COLUMN app.cost_centre_assignments.created_by IS 'User who created this assignment';
COMMENT ON TYPE app.cost_centre_entity_type IS 'Entity types that can be assigned to cost centres';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- ALTER TABLE app.cost_centre_assignments DROP CONSTRAINT IF EXISTS cost_centre_assignments_no_overlap;
-- DROP TRIGGER IF EXISTS update_cost_centre_assignments_updated_at ON app.cost_centre_assignments;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.cost_centre_assignments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.cost_centre_assignments;
-- DROP INDEX IF EXISTS app.idx_cca_overlap_check;
-- DROP INDEX IF EXISTS app.idx_cca_cost_centre;
-- DROP INDEX IF EXISTS app.idx_cca_entity_dates;
-- DROP INDEX IF EXISTS app.idx_cca_entity_current;
-- DROP TABLE IF EXISTS app.cost_centre_assignments;
-- DROP TYPE IF EXISTS app.cost_centre_entity_type;
