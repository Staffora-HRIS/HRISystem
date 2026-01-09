-- Migration: 0057_requisitions
-- Created: 2026-01-07
-- Description: Create the requisitions table for job requisitions
--              Requisitions represent open positions that need to be filled
--              Tracks openings, filled count, approval workflow, and hiring manager

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Job Requisitions Table
-- -----------------------------------------------------------------------------
-- Represents job requisitions (open positions) in the recruitment process
-- Links to positions, org units, and workflow for approval
CREATE TABLE IF NOT EXISTS app.requisitions (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this requisition
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Unique requisition code within tenant (e.g., 'REQ-2026-001')
    code varchar(50) NOT NULL,

    -- Job title for this requisition (may differ slightly from position title)
    title varchar(255) NOT NULL,

    -- Link to position being recruited for
    position_id uuid REFERENCES app.positions(id) ON DELETE SET NULL,

    -- Org unit where the position will be placed
    org_unit_id uuid REFERENCES app.org_units(id) ON DELETE SET NULL,

    -- Hiring manager responsible for this requisition
    hiring_manager_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,

    -- Current requisition status
    status app.requisition_status NOT NULL DEFAULT 'draft',

    -- Number of openings to fill
    openings integer NOT NULL DEFAULT 1,

    -- Number of openings already filled
    filled integer NOT NULL DEFAULT 0,

    -- Priority level (1=highest, 5=lowest)
    priority integer NOT NULL DEFAULT 3,

    -- Detailed job description
    job_description text,

    -- Requirements as structured JSON
    -- Structure: {
    --   "experience_years": 5,
    --   "education": "Bachelor's degree",
    --   "skills": ["Python", "SQL", "AWS"],
    --   "certifications": ["AWS Certified"],
    --   "nice_to_have": ["Kubernetes", "Terraform"]
    -- }
    requirements jsonb DEFAULT '{}',

    -- Target start date for the hire
    target_start_date date,

    -- Deadline for filling the position
    deadline date,

    -- Link to approval workflow instance
    workflow_instance_id uuid REFERENCES app.workflow_instances(id) ON DELETE SET NULL,

    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Code must be unique within tenant
    CONSTRAINT requisitions_code_unique UNIQUE (tenant_id, code),

    -- Code format: alphanumeric with hyphens
    CONSTRAINT requisitions_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]*$'),

    -- Openings must be positive
    CONSTRAINT requisitions_openings_positive CHECK (openings > 0),

    -- Filled cannot exceed openings
    CONSTRAINT requisitions_filled_range CHECK (filled >= 0 AND filled <= openings),

    -- Priority range (1-5)
    CONSTRAINT requisitions_priority_range CHECK (priority >= 1 AND priority <= 5),

    -- Target start date should be in the future or recent past
    CONSTRAINT requisitions_target_date_reasonable CHECK (
        target_start_date IS NULL OR target_start_date >= created_at::date - interval '30 days'
    ),

    -- Deadline should be before target start date (if both specified)
    CONSTRAINT requisitions_deadline_before_target CHECK (
        deadline IS NULL OR target_start_date IS NULL OR deadline <= target_start_date
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + code
CREATE INDEX IF NOT EXISTS idx_requisitions_tenant_code
    ON app.requisitions(tenant_id, code);

-- Status filtering (common query)
CREATE INDEX IF NOT EXISTS idx_requisitions_tenant_status
    ON app.requisitions(tenant_id, status);

-- Open requisitions (very common filter)
CREATE INDEX IF NOT EXISTS idx_requisitions_tenant_open
    ON app.requisitions(tenant_id)
    WHERE status = 'open';

-- Hiring manager lookup (my requisitions)
CREATE INDEX IF NOT EXISTS idx_requisitions_tenant_hiring_manager
    ON app.requisitions(tenant_id, hiring_manager_id)
    WHERE hiring_manager_id IS NOT NULL;

-- Position lookup
CREATE INDEX IF NOT EXISTS idx_requisitions_tenant_position
    ON app.requisitions(tenant_id, position_id)
    WHERE position_id IS NOT NULL;

-- Org unit lookup
CREATE INDEX IF NOT EXISTS idx_requisitions_tenant_org_unit
    ON app.requisitions(tenant_id, org_unit_id)
    WHERE org_unit_id IS NOT NULL;

-- Priority + deadline (urgent requisitions)
CREATE INDEX IF NOT EXISTS idx_requisitions_tenant_priority_deadline
    ON app.requisitions(tenant_id, priority, deadline)
    WHERE status = 'open';

-- Workflow instance lookup
CREATE INDEX IF NOT EXISTS idx_requisitions_workflow_instance
    ON app.requisitions(workflow_instance_id)
    WHERE workflow_instance_id IS NOT NULL;

-- Created by (creator's requisitions)
CREATE INDEX IF NOT EXISTS idx_requisitions_tenant_created_by
    ON app.requisitions(tenant_id, created_by)
    WHERE created_by IS NOT NULL;

-- GIN index for requirements search
CREATE INDEX IF NOT EXISTS idx_requisitions_requirements
    ON app.requisitions USING gin(requirements);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.requisitions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see requisitions for their current tenant
CREATE POLICY tenant_isolation ON app.requisitions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.requisitions
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_requisitions_updated_at
    BEFORE UPDATE ON app.requisitions
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- State Machine Validation
-- =============================================================================

-- Function to validate requisition status transitions
CREATE OR REPLACE FUNCTION app.validate_requisition_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- If status hasn't changed, allow the update
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Validate transition based on current (old) status
    CASE OLD.status
        WHEN 'draft' THEN
            -- draft can transition to open or cancelled
            IF NEW.status NOT IN ('open', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: draft can only transition to open or cancelled, not %', NEW.status;
            END IF;

        WHEN 'open' THEN
            -- open can transition to on_hold, filled, or cancelled
            IF NEW.status NOT IN ('on_hold', 'filled', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: open can only transition to on_hold, filled, or cancelled, not %', NEW.status;
            END IF;

        WHEN 'on_hold' THEN
            -- on_hold can transition to open or cancelled
            IF NEW.status NOT IN ('open', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: on_hold can only transition to open or cancelled, not %', NEW.status;
            END IF;

        WHEN 'filled' THEN
            -- filled is a terminal state (can reopen if someone leaves before start)
            IF NEW.status NOT IN ('open') THEN
                RAISE EXCEPTION 'Invalid status transition: filled can only transition to open, not %', NEW.status;
            END IF;

        WHEN 'cancelled' THEN
            -- cancelled is a terminal state
            RAISE EXCEPTION 'Invalid status transition: cancelled is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_requisition_status_transition
    BEFORE UPDATE OF status ON app.requisitions
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_requisition_status_transition();

-- Function to auto-update status to filled when all openings are filled
CREATE OR REPLACE FUNCTION app.check_requisition_filled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- If filled count equals openings and status is open, transition to filled
    IF NEW.filled = NEW.openings AND NEW.status = 'open' THEN
        NEW.status := 'filled';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER check_requisition_filled
    BEFORE UPDATE OF filled ON app.requisitions
    FOR EACH ROW
    EXECUTE FUNCTION app.check_requisition_filled();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to generate next requisition code for tenant
CREATE OR REPLACE FUNCTION app.generate_requisition_code(
    p_tenant_id uuid,
    p_prefix varchar(10) DEFAULT 'REQ'
)
RETURNS varchar(50)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_year text;
    v_max_num integer;
    v_next_num integer;
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE)::text;

    -- Find the highest numeric suffix for the current year
    SELECT COALESCE(MAX(
        CASE
            WHEN code ~ ('^' || p_prefix || '-' || v_year || '-[0-9]+$')
            THEN CAST(SUBSTRING(code FROM '[0-9]+$') AS integer)
            ELSE 0
        END
    ), 0) INTO v_max_num
    FROM app.requisitions
    WHERE tenant_id = p_tenant_id;

    v_next_num := v_max_num + 1;

    RETURN p_prefix || '-' || v_year || '-' || LPAD(v_next_num::text, 4, '0');
END;
$$;

-- Function to get open requisitions for a tenant
CREATE OR REPLACE FUNCTION app.get_open_requisitions(
    p_tenant_id uuid,
    p_org_unit_id uuid DEFAULT NULL,
    p_hiring_manager_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    code varchar(50),
    title varchar(255),
    position_id uuid,
    org_unit_id uuid,
    hiring_manager_id uuid,
    status app.requisition_status,
    openings integer,
    filled integer,
    priority integer,
    target_start_date date,
    deadline date,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.code,
        r.title,
        r.position_id,
        r.org_unit_id,
        r.hiring_manager_id,
        r.status,
        r.openings,
        r.filled,
        r.priority,
        r.target_start_date,
        r.deadline,
        r.created_at
    FROM app.requisitions r
    WHERE r.tenant_id = p_tenant_id
      AND r.status = 'open'
      AND (p_org_unit_id IS NULL OR r.org_unit_id = p_org_unit_id)
      AND (p_hiring_manager_id IS NULL OR r.hiring_manager_id = p_hiring_manager_id)
    ORDER BY r.priority ASC, r.deadline ASC NULLS LAST, r.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get requisition statistics
CREATE OR REPLACE FUNCTION app.get_requisition_stats(
    p_tenant_id uuid,
    p_from_date date DEFAULT now()::date - interval '90 days',
    p_to_date date DEFAULT now()::date
)
RETURNS TABLE (
    total_requisitions bigint,
    open_count bigint,
    on_hold_count bigint,
    filled_count bigint,
    cancelled_count bigint,
    total_openings bigint,
    total_filled bigint,
    avg_time_to_fill_days numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::bigint AS total_requisitions,
        COUNT(*) FILTER (WHERE r.status = 'open')::bigint AS open_count,
        COUNT(*) FILTER (WHERE r.status = 'on_hold')::bigint AS on_hold_count,
        COUNT(*) FILTER (WHERE r.status = 'filled')::bigint AS filled_count,
        COUNT(*) FILTER (WHERE r.status = 'cancelled')::bigint AS cancelled_count,
        COALESCE(SUM(r.openings), 0)::bigint AS total_openings,
        COALESCE(SUM(r.filled), 0)::bigint AS total_filled,
        ROUND(AVG(
            EXTRACT(EPOCH FROM (r.updated_at - r.created_at)) / 86400
        ) FILTER (WHERE r.status = 'filled'), 1) AS avg_time_to_fill_days
    FROM app.requisitions r
    WHERE r.tenant_id = p_tenant_id
      AND r.created_at::date >= p_from_date
      AND r.created_at::date <= p_to_date;
END;
$$;

-- Function to increment filled count
CREATE OR REPLACE FUNCTION app.increment_requisition_filled(
    p_requisition_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_filled integer;
    v_openings integer;
BEGIN
    SELECT filled, openings INTO v_current_filled, v_openings
    FROM app.requisitions
    WHERE id = p_requisition_id;

    IF v_current_filled IS NULL THEN
        RAISE EXCEPTION 'Requisition not found: %', p_requisition_id;
    END IF;

    IF v_current_filled >= v_openings THEN
        RAISE EXCEPTION 'Cannot increment filled count: already at maximum (% of %)', v_current_filled, v_openings;
    END IF;

    UPDATE app.requisitions
    SET filled = filled + 1
    WHERE id = p_requisition_id;

    RETURN true;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.requisitions IS 'Job requisitions representing open positions to be filled through recruitment';
COMMENT ON COLUMN app.requisitions.id IS 'Primary UUID identifier for the requisition';
COMMENT ON COLUMN app.requisitions.tenant_id IS 'Tenant that owns this requisition';
COMMENT ON COLUMN app.requisitions.code IS 'Unique requisition code within tenant (e.g., REQ-2026-001)';
COMMENT ON COLUMN app.requisitions.title IS 'Job title for this requisition';
COMMENT ON COLUMN app.requisitions.position_id IS 'Link to position template being recruited for';
COMMENT ON COLUMN app.requisitions.org_unit_id IS 'Org unit where the position will be placed';
COMMENT ON COLUMN app.requisitions.hiring_manager_id IS 'Employee responsible for hiring decisions';
COMMENT ON COLUMN app.requisitions.status IS 'Current requisition status (draft, open, on_hold, filled, cancelled)';
COMMENT ON COLUMN app.requisitions.openings IS 'Number of positions to fill';
COMMENT ON COLUMN app.requisitions.filled IS 'Number of positions already filled';
COMMENT ON COLUMN app.requisitions.priority IS 'Priority level (1=highest, 5=lowest)';
COMMENT ON COLUMN app.requisitions.job_description IS 'Detailed job description';
COMMENT ON COLUMN app.requisitions.requirements IS 'Structured requirements (skills, experience, education)';
COMMENT ON COLUMN app.requisitions.target_start_date IS 'Target start date for new hire';
COMMENT ON COLUMN app.requisitions.deadline IS 'Deadline for filling the position';
COMMENT ON COLUMN app.requisitions.workflow_instance_id IS 'Link to approval workflow instance';
COMMENT ON FUNCTION app.validate_requisition_status_transition IS 'Enforces valid requisition status transitions';
COMMENT ON FUNCTION app.check_requisition_filled IS 'Auto-transitions to filled status when all openings filled';
COMMENT ON FUNCTION app.generate_requisition_code IS 'Generates next sequential requisition code for a tenant';
COMMENT ON FUNCTION app.get_open_requisitions IS 'Returns open requisitions with optional filters';
COMMENT ON FUNCTION app.get_requisition_stats IS 'Returns requisition statistics for a tenant';
COMMENT ON FUNCTION app.increment_requisition_filled IS 'Safely increments the filled count for a requisition';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.increment_requisition_filled(uuid);
-- DROP FUNCTION IF EXISTS app.get_requisition_stats(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.get_open_requisitions(uuid, uuid, uuid, integer, integer);
-- DROP FUNCTION IF EXISTS app.generate_requisition_code(uuid, varchar);
-- DROP TRIGGER IF EXISTS check_requisition_filled ON app.requisitions;
-- DROP FUNCTION IF EXISTS app.check_requisition_filled();
-- DROP TRIGGER IF EXISTS validate_requisition_status_transition ON app.requisitions;
-- DROP FUNCTION IF EXISTS app.validate_requisition_status_transition();
-- DROP TRIGGER IF EXISTS update_requisitions_updated_at ON app.requisitions;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.requisitions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.requisitions;
-- DROP INDEX IF EXISTS app.idx_requisitions_requirements;
-- DROP INDEX IF EXISTS app.idx_requisitions_tenant_created_by;
-- DROP INDEX IF EXISTS app.idx_requisitions_workflow_instance;
-- DROP INDEX IF EXISTS app.idx_requisitions_tenant_priority_deadline;
-- DROP INDEX IF EXISTS app.idx_requisitions_tenant_org_unit;
-- DROP INDEX IF EXISTS app.idx_requisitions_tenant_position;
-- DROP INDEX IF EXISTS app.idx_requisitions_tenant_hiring_manager;
-- DROP INDEX IF EXISTS app.idx_requisitions_tenant_open;
-- DROP INDEX IF EXISTS app.idx_requisitions_tenant_status;
-- DROP INDEX IF EXISTS app.idx_requisitions_tenant_code;
-- DROP TABLE IF EXISTS app.requisitions;
