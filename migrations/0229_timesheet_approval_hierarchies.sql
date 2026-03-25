-- Migration: 0229_timesheet_approval_hierarchies
-- Created: 2026-03-25
-- Description: Create timesheet_approval_hierarchies table for configurable
--              multi-level approval chains per department. When a timesheet is
--              submitted the hierarchy is resolved to create approval chain entries.
--
-- Depends on: 0002_tenants, 0014_org_units

-- =============================================================================
-- UP Migration
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.timesheet_approval_hierarchies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Department this hierarchy applies to (NULL = tenant-wide default)
    department_id uuid REFERENCES app.org_units(id) ON DELETE CASCADE,

    -- Display name
    name varchar(255) NOT NULL,
    description text,

    -- Ordered approval levels as JSONB array
    -- [{ "level": 1, "role": "Team Lead", "approverId": "<uuid>" }, ...]
    approval_levels jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Whether this hierarchy is active
    is_active boolean NOT NULL DEFAULT true,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- One hierarchy per department per tenant (NULL department = default)
    CONSTRAINT timesheet_approval_hierarchies_unique
        UNIQUE NULLS NOT DISTINCT (tenant_id, department_id),

    -- Must have at least one approval level
    CONSTRAINT timesheet_approval_hierarchies_levels_nonempty
        CHECK (jsonb_array_length(approval_levels) > 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tah_tenant
    ON app.timesheet_approval_hierarchies(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tah_department
    ON app.timesheet_approval_hierarchies(tenant_id, department_id);

-- RLS
ALTER TABLE app.timesheet_approval_hierarchies ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.timesheet_approval_hierarchies
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.timesheet_approval_hierarchies
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Updated at trigger
CREATE TRIGGER update_tah_updated_at
    BEFORE UPDATE ON app.timesheet_approval_hierarchies
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

COMMENT ON TABLE app.timesheet_approval_hierarchies IS 'Configurable multi-level approval chains for timesheet approval per department';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_tah_updated_at ON app.timesheet_approval_hierarchies;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.timesheet_approval_hierarchies;
-- DROP POLICY IF EXISTS tenant_isolation ON app.timesheet_approval_hierarchies;
-- DROP TABLE IF EXISTS app.timesheet_approval_hierarchies;
