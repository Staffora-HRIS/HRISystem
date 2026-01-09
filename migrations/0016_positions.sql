-- Migration: 0016_positions
-- Created: 2026-01-07
-- Description: Create the positions table for job positions
--              Positions define roles within org units with salary grades and headcount
--              Supports hierarchical reporting structure via reports_to_position_id

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Positions Table
-- -----------------------------------------------------------------------------
-- Represents job positions within the organization
-- Positions are templates that employees are assigned to
-- Multiple employees can be assigned to the same position (based on headcount)
CREATE TABLE IF NOT EXISTS app.positions (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this position
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Unique code within tenant (e.g., 'SWE-SR', 'MGR-ENG', 'HR-GEN')
    code varchar(50) NOT NULL,

    -- Job title (e.g., 'Senior Software Engineer', 'Engineering Manager')
    title varchar(255) NOT NULL,

    -- Detailed job description
    description text,

    -- Org unit this position belongs to
    org_unit_id uuid REFERENCES app.org_units(id) ON DELETE SET NULL,

    -- Job grade/level for compensation bands (e.g., 'L5', 'IC3', 'M2')
    job_grade varchar(20),

    -- Salary range for this position
    min_salary numeric(15, 2),
    max_salary numeric(15, 2),

    -- Currency for salary (ISO 4217)
    currency varchar(3) NOT NULL DEFAULT 'USD',

    -- Whether this is a management position (has direct reports)
    is_manager boolean NOT NULL DEFAULT false,

    -- How many people can be assigned to this position
    headcount integer NOT NULL DEFAULT 1,

    -- Reporting relationship (which position this reports to)
    -- Different from employee-to-employee reporting in reporting_lines
    reports_to_position_id uuid REFERENCES app.positions(id) ON DELETE SET NULL,

    -- Whether this position is currently open for assignment
    is_active boolean NOT NULL DEFAULT true,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Code must be unique within tenant
    CONSTRAINT positions_code_unique UNIQUE (tenant_id, code),

    -- Code format: alphanumeric with hyphens, uppercase preferred
    CONSTRAINT positions_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]*$'),

    -- Salary range validation
    CONSTRAINT positions_salary_range CHECK (
        min_salary IS NULL OR max_salary IS NULL OR min_salary <= max_salary
    ),

    -- Salary must be positive
    CONSTRAINT positions_salary_positive CHECK (
        (min_salary IS NULL OR min_salary >= 0) AND
        (max_salary IS NULL OR max_salary >= 0)
    ),

    -- Currency format (ISO 4217)
    CONSTRAINT positions_currency_format CHECK (currency ~ '^[A-Z]{3}$'),

    -- Headcount must be positive
    CONSTRAINT positions_headcount_positive CHECK (headcount > 0),

    -- Cannot report to self
    CONSTRAINT positions_no_self_report CHECK (reports_to_position_id != id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + code
CREATE INDEX IF NOT EXISTS idx_positions_tenant_code
    ON app.positions(tenant_id, code);

-- Org unit lookups (find positions in an org unit)
CREATE INDEX IF NOT EXISTS idx_positions_tenant_org_unit
    ON app.positions(tenant_id, org_unit_id);

-- Reporting structure (find positions reporting to a manager)
CREATE INDEX IF NOT EXISTS idx_positions_reports_to
    ON app.positions(reports_to_position_id)
    WHERE reports_to_position_id IS NOT NULL;

-- Active positions (common filter)
CREATE INDEX IF NOT EXISTS idx_positions_tenant_active
    ON app.positions(tenant_id, is_active)
    WHERE is_active = true;

-- Manager positions
CREATE INDEX IF NOT EXISTS idx_positions_tenant_manager
    ON app.positions(tenant_id, is_manager)
    WHERE is_manager = true;

-- Job grade lookups (for compensation analysis)
CREATE INDEX IF NOT EXISTS idx_positions_tenant_grade
    ON app.positions(tenant_id, job_grade)
    WHERE job_grade IS NOT NULL;

-- Title search
CREATE INDEX IF NOT EXISTS idx_positions_tenant_title
    ON app.positions(tenant_id, title);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.positions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see positions for their current tenant
CREATE POLICY tenant_isolation ON app.positions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.positions
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_positions_updated_at
    BEFORE UPDATE ON app.positions
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to prevent circular references in position reporting structure
CREATE OR REPLACE FUNCTION app.prevent_position_report_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_id uuid;
    v_visited uuid[] := ARRAY[]::uuid[];
BEGIN
    IF NEW.reports_to_position_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Walk up the reporting tree to detect cycles
    v_current_id := NEW.reports_to_position_id;

    WHILE v_current_id IS NOT NULL LOOP
        -- Check if we've seen this ID before (cycle detected)
        IF v_current_id = ANY(v_visited) OR v_current_id = NEW.id THEN
            RAISE EXCEPTION 'Circular reference detected in position reporting structure. Cannot set reports_to_position_id to % for position %',
                NEW.reports_to_position_id, NEW.id;
        END IF;

        v_visited := array_append(v_visited, v_current_id);

        -- Move to parent position
        SELECT reports_to_position_id INTO v_current_id
        FROM app.positions
        WHERE id = v_current_id;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_position_report_cycle
    BEFORE INSERT OR UPDATE OF reports_to_position_id ON app.positions
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_position_report_cycle();

-- Function to get positions reporting to a manager position
CREATE OR REPLACE FUNCTION app.get_reporting_positions(
    p_position_id uuid
)
RETURNS TABLE (
    id uuid,
    code varchar(50),
    title varchar(255),
    job_grade varchar(20),
    is_manager boolean,
    headcount integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.code, p.title, p.job_grade, p.is_manager, p.headcount
    FROM app.positions p
    WHERE p.reports_to_position_id = p_position_id
      AND p.is_active = true
    ORDER BY p.title;
END;
$$;

-- Function to get position hierarchy (all positions under a manager, recursively)
CREATE OR REPLACE FUNCTION app.get_position_hierarchy(
    p_position_id uuid
)
RETURNS TABLE (
    id uuid,
    code varchar(50),
    title varchar(255),
    reports_to_position_id uuid,
    level integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE hierarchy AS (
        -- Base case: the position itself
        SELECT p.id, p.code, p.title, p.reports_to_position_id, 0 AS level
        FROM app.positions p
        WHERE p.id = p_position_id
          AND p.is_active = true

        UNION ALL

        -- Recursive case: positions reporting to current level
        SELECT p.id, p.code, p.title, p.reports_to_position_id, h.level + 1
        FROM app.positions p
        INNER JOIN hierarchy h ON p.reports_to_position_id = h.id
        WHERE p.is_active = true
    )
    SELECT h.id, h.code, h.title, h.reports_to_position_id, h.level
    FROM hierarchy h
    ORDER BY h.level, h.title;
END;
$$;

-- =============================================================================
-- Add Foreign Key from org_units to positions (manager_position_id)
-- =============================================================================

-- Now that positions exists, add the FK constraint to org_units
ALTER TABLE app.org_units
    ADD CONSTRAINT org_units_manager_position_fk
    FOREIGN KEY (manager_position_id)
    REFERENCES app.positions(id)
    ON DELETE SET NULL;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.positions IS 'Job positions with salary grades, headcount, and reporting structure';
COMMENT ON COLUMN app.positions.id IS 'Primary UUID identifier for the position';
COMMENT ON COLUMN app.positions.tenant_id IS 'Tenant that owns this position';
COMMENT ON COLUMN app.positions.code IS 'Unique alphanumeric code within tenant';
COMMENT ON COLUMN app.positions.title IS 'Job title for the position';
COMMENT ON COLUMN app.positions.description IS 'Detailed job description';
COMMENT ON COLUMN app.positions.org_unit_id IS 'Org unit this position belongs to';
COMMENT ON COLUMN app.positions.job_grade IS 'Job grade/level for compensation bands (e.g., L5, IC3)';
COMMENT ON COLUMN app.positions.min_salary IS 'Minimum salary for this position';
COMMENT ON COLUMN app.positions.max_salary IS 'Maximum salary for this position';
COMMENT ON COLUMN app.positions.currency IS 'Currency for salary (ISO 4217, e.g., USD)';
COMMENT ON COLUMN app.positions.is_manager IS 'Whether this is a management position';
COMMENT ON COLUMN app.positions.headcount IS 'Maximum number of employees for this position';
COMMENT ON COLUMN app.positions.reports_to_position_id IS 'Position this reports to (org chart structure)';
COMMENT ON COLUMN app.positions.is_active IS 'Whether position is currently active';
COMMENT ON FUNCTION app.prevent_position_report_cycle IS 'Trigger function to prevent circular reporting references';
COMMENT ON FUNCTION app.get_reporting_positions IS 'Returns positions directly reporting to a manager position';
COMMENT ON FUNCTION app.get_position_hierarchy IS 'Returns full hierarchy of positions under a manager';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- ALTER TABLE app.org_units DROP CONSTRAINT IF EXISTS org_units_manager_position_fk;
-- DROP FUNCTION IF EXISTS app.get_position_hierarchy(uuid);
-- DROP FUNCTION IF EXISTS app.get_reporting_positions(uuid);
-- DROP TRIGGER IF EXISTS prevent_position_report_cycle ON app.positions;
-- DROP FUNCTION IF EXISTS app.prevent_position_report_cycle();
-- DROP TRIGGER IF EXISTS update_positions_updated_at ON app.positions;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.positions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.positions;
-- DROP INDEX IF EXISTS app.idx_positions_tenant_title;
-- DROP INDEX IF EXISTS app.idx_positions_tenant_grade;
-- DROP INDEX IF EXISTS app.idx_positions_tenant_manager;
-- DROP INDEX IF EXISTS app.idx_positions_tenant_active;
-- DROP INDEX IF EXISTS app.idx_positions_reports_to;
-- DROP INDEX IF EXISTS app.idx_positions_tenant_org_unit;
-- DROP INDEX IF EXISTS app.idx_positions_tenant_code;
-- DROP TABLE IF EXISTS app.positions;
