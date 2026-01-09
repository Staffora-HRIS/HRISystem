-- Migration: 0038_schedules
-- Created: 2026-01-07
-- Description: Create the schedules table for work schedules
--              Schedules define time periods with assigned shifts
--              Scoped to org units for department/team scheduling

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schedules Table
-- -----------------------------------------------------------------------------
-- Work schedules define a scheduling period (e.g., "Week of Jan 13-19")
-- Each schedule contains shift definitions and employee assignments
-- Schedules go through draft -> published -> archived lifecycle
CREATE TABLE IF NOT EXISTS app.schedules (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this schedule
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Schedule name (e.g., "Engineering Week 3", "January 2026 - Customer Support")
    name varchar(255) NOT NULL,

    -- Optional description
    description text,

    -- Organizational scope - which org unit(s) this schedule covers
    -- NULL means company-wide schedule
    org_unit_id uuid REFERENCES app.org_units(id) ON DELETE SET NULL,

    -- Schedule period
    start_date date NOT NULL,
    end_date date NOT NULL,

    -- Current status in lifecycle
    status app.schedule_status NOT NULL DEFAULT 'draft',

    -- Publishing tracking
    published_at timestamptz,
    published_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Standard timestamps and audit
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- End date must be on or after start date
    CONSTRAINT schedules_date_range CHECK (end_date >= start_date),

    -- Schedule period should be reasonable (max 1 year)
    CONSTRAINT schedules_period_limit CHECK (
        end_date <= start_date + interval '1 year'
    ),

    -- Published schedules must have publishing info
    CONSTRAINT schedules_published_info CHECK (
        status != 'published' OR (published_at IS NOT NULL AND published_by IS NOT NULL)
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + date range (find schedules for a period)
CREATE INDEX IF NOT EXISTS idx_schedules_tenant_dates
    ON app.schedules(tenant_id, start_date, end_date);

-- Status filtering (find published schedules)
CREATE INDEX IF NOT EXISTS idx_schedules_tenant_status
    ON app.schedules(tenant_id, status);

-- Published schedules (common query)
CREATE INDEX IF NOT EXISTS idx_schedules_tenant_published
    ON app.schedules(tenant_id, start_date, end_date)
    WHERE status = 'published';

-- Org unit scope lookup
CREATE INDEX IF NOT EXISTS idx_schedules_org_unit
    ON app.schedules(org_unit_id)
    WHERE org_unit_id IS NOT NULL;

-- Find overlapping schedules
CREATE INDEX IF NOT EXISTS idx_schedules_overlap
    ON app.schedules(tenant_id, org_unit_id, start_date, end_date)
    WHERE status IN ('draft', 'published');

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.schedules ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see schedules for their current tenant
CREATE POLICY tenant_isolation ON app.schedules
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.schedules
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_schedules_updated_at
    BEFORE UPDATE ON app.schedules
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- State Machine Validation
-- =============================================================================

-- Function to validate schedule status transitions
-- State machine:
--   draft -> published (schedule made visible)
--   published -> archived (schedule period ended)
--   draft -> archived (never published, deprecated)
CREATE OR REPLACE FUNCTION app.validate_schedule_status_transition()
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
            -- draft can transition to published or archived
            IF NEW.status NOT IN ('published', 'archived') THEN
                RAISE EXCEPTION 'Invalid status transition: draft can only transition to published or archived, not %', NEW.status;
            END IF;

        WHEN 'published' THEN
            -- published can only transition to archived
            IF NEW.status != 'archived' THEN
                RAISE EXCEPTION 'Invalid status transition: published can only transition to archived, not %', NEW.status;
            END IF;

        WHEN 'archived' THEN
            -- archived is a terminal state
            RAISE EXCEPTION 'Invalid status transition: archived is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    -- Set published info when publishing
    IF NEW.status = 'published' AND OLD.status = 'draft' THEN
        NEW.published_at := now();
        -- published_by should be set by the application
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_schedule_status_transition
    BEFORE UPDATE OF status ON app.schedules
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_schedule_status_transition();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to check for overlapping schedules
CREATE OR REPLACE FUNCTION app.check_schedule_overlap(
    p_tenant_id uuid,
    p_org_unit_id uuid,
    p_start_date date,
    p_end_date date,
    p_exclude_schedule_id uuid DEFAULT NULL
)
RETURNS TABLE (
    overlapping_id uuid,
    overlapping_name varchar(255),
    overlap_start date,
    overlap_end date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.name,
        GREATEST(s.start_date, p_start_date),
        LEAST(s.end_date, p_end_date)
    FROM app.schedules s
    WHERE s.tenant_id = p_tenant_id
      AND s.status IN ('draft', 'published')
      AND (s.id != p_exclude_schedule_id OR p_exclude_schedule_id IS NULL)
      AND (
          (p_org_unit_id IS NULL AND s.org_unit_id IS NULL) OR
          (s.org_unit_id = p_org_unit_id)
      )
      AND s.start_date <= p_end_date
      AND s.end_date >= p_start_date;
END;
$$;

COMMENT ON FUNCTION app.check_schedule_overlap IS 'Checks for overlapping schedules in the same org unit';

-- Function to get active schedule for an org unit on a date
CREATE OR REPLACE FUNCTION app.get_active_schedule(
    p_org_unit_id uuid,
    p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    start_date date,
    end_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.name, s.start_date, s.end_date
    FROM app.schedules s
    WHERE s.status = 'published'
      AND (
          (p_org_unit_id IS NULL AND s.org_unit_id IS NULL) OR
          (s.org_unit_id = p_org_unit_id)
      )
      AND s.start_date <= p_date
      AND s.end_date >= p_date
    ORDER BY s.start_date DESC
    LIMIT 1;
END;
$$;

COMMENT ON FUNCTION app.get_active_schedule IS 'Returns the active published schedule for an org unit on a given date';

-- Function to get schedules in a date range
CREATE OR REPLACE FUNCTION app.get_schedules_in_range(
    p_start_date date,
    p_end_date date,
    p_status app.schedule_status DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    org_unit_id uuid,
    start_date date,
    end_date date,
    status app.schedule_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.name, s.org_unit_id, s.start_date, s.end_date, s.status
    FROM app.schedules s
    WHERE s.start_date <= p_end_date
      AND s.end_date >= p_start_date
      AND (p_status IS NULL OR s.status = p_status)
    ORDER BY s.start_date, s.name;
END;
$$;

COMMENT ON FUNCTION app.get_schedules_in_range IS 'Returns schedules that overlap with a date range';

-- Function to publish a schedule
CREATE OR REPLACE FUNCTION app.publish_schedule(
    p_schedule_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_schedule RECORD;
BEGIN
    -- Get schedule
    SELECT * INTO v_schedule
    FROM app.schedules
    WHERE id = p_schedule_id;

    IF v_schedule IS NULL THEN
        RAISE EXCEPTION 'Schedule not found: %', p_schedule_id;
    END IF;

    IF v_schedule.status != 'draft' THEN
        RAISE EXCEPTION 'Only draft schedules can be published. Current status: %', v_schedule.status;
    END IF;

    -- Update to published
    UPDATE app.schedules
    SET status = 'published',
        published_at = now(),
        published_by = p_user_id
    WHERE id = p_schedule_id;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION app.publish_schedule IS 'Publishes a draft schedule, making it visible to employees';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.schedules IS 'Work schedules defining time periods with assigned shifts. Scoped to org units.';
COMMENT ON COLUMN app.schedules.id IS 'Primary UUID identifier for the schedule';
COMMENT ON COLUMN app.schedules.tenant_id IS 'Tenant that owns this schedule';
COMMENT ON COLUMN app.schedules.name IS 'Schedule name';
COMMENT ON COLUMN app.schedules.description IS 'Optional description';
COMMENT ON COLUMN app.schedules.org_unit_id IS 'Organizational unit scope (NULL = company-wide)';
COMMENT ON COLUMN app.schedules.start_date IS 'Schedule period start date';
COMMENT ON COLUMN app.schedules.end_date IS 'Schedule period end date';
COMMENT ON COLUMN app.schedules.status IS 'Schedule lifecycle status (draft, published, archived)';
COMMENT ON COLUMN app.schedules.published_at IS 'When the schedule was published';
COMMENT ON COLUMN app.schedules.published_by IS 'User who published the schedule';
COMMENT ON COLUMN app.schedules.created_by IS 'User who created the schedule';
COMMENT ON FUNCTION app.validate_schedule_status_transition IS 'Trigger function enforcing valid schedule status transitions';
COMMENT ON FUNCTION app.publish_schedule IS 'Publishes a draft schedule';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.publish_schedule(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_schedules_in_range(date, date, app.schedule_status);
-- DROP FUNCTION IF EXISTS app.get_active_schedule(uuid, date);
-- DROP FUNCTION IF EXISTS app.check_schedule_overlap(uuid, uuid, date, date, uuid);
-- DROP TRIGGER IF EXISTS validate_schedule_status_transition ON app.schedules;
-- DROP FUNCTION IF EXISTS app.validate_schedule_status_transition();
-- DROP TRIGGER IF EXISTS update_schedules_updated_at ON app.schedules;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.schedules;
-- DROP POLICY IF EXISTS tenant_isolation ON app.schedules;
-- DROP INDEX IF EXISTS app.idx_schedules_overlap;
-- DROP INDEX IF EXISTS app.idx_schedules_org_unit;
-- DROP INDEX IF EXISTS app.idx_schedules_tenant_published;
-- DROP INDEX IF EXISTS app.idx_schedules_tenant_status;
-- DROP INDEX IF EXISTS app.idx_schedules_tenant_dates;
-- DROP TABLE IF EXISTS app.schedules;
