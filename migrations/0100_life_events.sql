-- Migration: 0100_life_events
-- Created: 2026-01-16
-- Description: Create life events and open enrollment tables

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Life events table
CREATE TABLE IF NOT EXISTS app.life_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Event details
    event_type app.life_event_type NOT NULL,
    event_date date NOT NULL,
    description text,

    -- Documentation
    documentation_required boolean DEFAULT true,
    documentation jsonb DEFAULT '[]', -- array of document references

    -- Enrollment window
    enrollment_window_start date NOT NULL,
    enrollment_window_end date NOT NULL,

    -- Status
    status app.life_event_status NOT NULL DEFAULT 'pending',
    rejection_reason text,

    -- Review
    reviewed_by uuid REFERENCES app.users(id),
    reviewed_at timestamptz,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT valid_enrollment_window CHECK (enrollment_window_end >= enrollment_window_start)
);

-- Open enrollment periods
CREATE TABLE IF NOT EXISTS app.open_enrollment_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Period details
    name varchar(100) NOT NULL,
    description text,

    -- Dates
    start_date date NOT NULL,
    end_date date NOT NULL,
    coverage_effective_date date NOT NULL,

    -- Plan year
    plan_year_start date NOT NULL,
    plan_year_end date NOT NULL,

    -- Status
    is_active boolean DEFAULT false,

    -- Eligible plans for this OE period
    eligible_plan_ids uuid[] DEFAULT '{}',

    -- Notifications
    reminder_sent_at timestamptz,
    final_reminder_sent_at timestamptz,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT valid_period CHECK (end_date >= start_date),
    CONSTRAINT valid_plan_year CHECK (plan_year_end >= plan_year_start)
);

-- Open enrollment elections
CREATE TABLE IF NOT EXISTS app.open_enrollment_elections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
    enrollment_period_id uuid NOT NULL REFERENCES app.open_enrollment_periods(id),

    -- Election status
    status varchar(50) NOT NULL DEFAULT 'not_started', -- not_started, in_progress, submitted, confirmed
    submitted_at timestamptz,
    confirmed_at timestamptz,

    -- Elections (array of plan selections)
    elections jsonb NOT NULL DEFAULT '[]',
    -- Format: [{plan_id, coverage_level, action: 'enroll'|'waive'|'continue', dependents: []}]

    -- Acknowledgements
    acknowledgements jsonb DEFAULT '{}',
    -- Format: {tobacco_use: true/false, terms_accepted: true, hipaa_acknowledged: true}

    -- Notes
    employee_notes text,
    hr_notes text,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_employee_period UNIQUE (employee_id, enrollment_period_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_life_events_employee
    ON app.life_events(employee_id, status);

CREATE INDEX IF NOT EXISTS idx_life_events_pending
    ON app.life_events(tenant_id, status, created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_life_events_window
    ON app.life_events(enrollment_window_end)
    WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_open_enrollment_periods_active
    ON app.open_enrollment_periods(tenant_id, is_active, start_date);

CREATE INDEX IF NOT EXISTS idx_open_enrollment_elections_employee
    ON app.open_enrollment_elections(employee_id, status);

CREATE INDEX IF NOT EXISTS idx_open_enrollment_elections_period
    ON app.open_enrollment_elections(enrollment_period_id, status);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.life_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.open_enrollment_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.open_enrollment_elections ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.life_events
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.open_enrollment_periods
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.open_enrollment_elections
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trg_life_events_updated_at
    BEFORE UPDATE ON app.life_events
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_open_enrollment_periods_updated_at
    BEFORE UPDATE ON app.open_enrollment_periods
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_open_enrollment_elections_updated_at
    BEFORE UPDATE ON app.open_enrollment_elections
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Calculate enrollment window automatically
CREATE OR REPLACE FUNCTION app.set_life_event_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Default 30-day window from event date
    IF NEW.enrollment_window_start IS NULL THEN
        NEW.enrollment_window_start := NEW.event_date;
    END IF;
    IF NEW.enrollment_window_end IS NULL THEN
        NEW.enrollment_window_end := NEW.event_date + interval '30 days';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_life_events_set_window
    BEFORE INSERT ON app.life_events
    FOR EACH ROW
    EXECUTE FUNCTION app.set_life_event_window();

-- =============================================================================
-- Functions
-- =============================================================================

-- Get pending life events for review
CREATE OR REPLACE FUNCTION app.get_pending_life_events(
    p_tenant_id uuid
)
RETURNS TABLE (
    id uuid,
    employee_id uuid,
    employee_name text,
    event_type app.life_event_type,
    event_date date,
    enrollment_window_end date,
    days_remaining integer,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        le.id,
        le.employee_id,
        app.get_employee_display_name(le.employee_id) as employee_name,
        le.event_type,
        le.event_date,
        le.enrollment_window_end,
        EXTRACT(DAY FROM le.enrollment_window_end - CURRENT_DATE)::integer as days_remaining,
        le.created_at
    FROM app.life_events le
    WHERE le.tenant_id = p_tenant_id
      AND le.status = 'pending'
    ORDER BY le.created_at;
END;
$$;

-- Get current open enrollment period
CREATE OR REPLACE FUNCTION app.get_current_open_enrollment(
    p_tenant_id uuid,
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    id uuid,
    name varchar,
    start_date date,
    end_date date,
    coverage_effective_date date,
    days_remaining integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        oep.id,
        oep.name,
        oep.start_date,
        oep.end_date,
        oep.coverage_effective_date,
        EXTRACT(DAY FROM oep.end_date - p_as_of_date)::integer as days_remaining
    FROM app.open_enrollment_periods oep
    WHERE oep.tenant_id = p_tenant_id
      AND oep.is_active = true
      AND oep.start_date <= p_as_of_date
      AND oep.end_date >= p_as_of_date
    LIMIT 1;
END;
$$;

-- Get open enrollment completion statistics
CREATE OR REPLACE FUNCTION app.get_open_enrollment_stats(
    p_enrollment_period_id uuid
)
RETURNS TABLE (
    total_eligible integer,
    not_started integer,
    in_progress integer,
    submitted integer,
    confirmed integer,
    completion_rate decimal
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_tenant_id uuid;
BEGIN
    -- Get tenant from enrollment period
    SELECT tenant_id INTO v_tenant_id
    FROM app.open_enrollment_periods
    WHERE id = p_enrollment_period_id;

    RETURN QUERY
    WITH eligible_employees AS (
        SELECT e.id
        FROM app.employees e
        WHERE e.tenant_id = v_tenant_id
          AND e.status IN ('active', 'on_leave')
    ),
    election_stats AS (
        SELECT
            oee.status,
            COUNT(*) as count
        FROM app.open_enrollment_elections oee
        WHERE oee.enrollment_period_id = p_enrollment_period_id
        GROUP BY oee.status
    )
    SELECT
        (SELECT COUNT(*)::integer FROM eligible_employees) as total_eligible,
        COALESCE((SELECT count::integer FROM election_stats WHERE status = 'not_started'), 0) as not_started,
        COALESCE((SELECT count::integer FROM election_stats WHERE status = 'in_progress'), 0) as in_progress,
        COALESCE((SELECT count::integer FROM election_stats WHERE status = 'submitted'), 0) as submitted,
        COALESCE((SELECT count::integer FROM election_stats WHERE status = 'confirmed'), 0) as confirmed,
        CASE
            WHEN (SELECT COUNT(*) FROM eligible_employees) = 0 THEN 0
            ELSE (
                COALESCE((SELECT count FROM election_stats WHERE status IN ('submitted', 'confirmed')), 0)::decimal
                / (SELECT COUNT(*) FROM eligible_employees)::decimal * 100
            )
        END as completion_rate;
END;
$$;

-- Check if employee has active life event window
CREATE OR REPLACE FUNCTION app.has_active_life_event_window(
    p_employee_id uuid,
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM app.life_events le
        WHERE le.employee_id = p_employee_id
          AND le.status = 'approved'
          AND le.enrollment_window_start <= p_as_of_date
          AND le.enrollment_window_end >= p_as_of_date
    );
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.life_events IS 'Qualifying life events that allow benefit changes outside open enrollment';
COMMENT ON TABLE app.open_enrollment_periods IS 'Annual open enrollment windows';
COMMENT ON TABLE app.open_enrollment_elections IS 'Employee elections during open enrollment';

COMMENT ON COLUMN app.life_events.documentation IS 'Array of document references proving the life event';
COMMENT ON COLUMN app.open_enrollment_elections.elections IS 'JSON array of plan elections made by employee';
COMMENT ON COLUMN app.open_enrollment_elections.acknowledgements IS 'Required acknowledgements (tobacco, terms, HIPAA)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.has_active_life_event_window(uuid, date);
-- DROP FUNCTION IF EXISTS app.get_open_enrollment_stats(uuid);
-- DROP FUNCTION IF EXISTS app.get_current_open_enrollment(uuid, date);
-- DROP FUNCTION IF EXISTS app.get_pending_life_events(uuid);
-- DROP TRIGGER IF EXISTS trg_life_events_set_window ON app.life_events;
-- DROP FUNCTION IF EXISTS app.set_life_event_window();
-- DROP TRIGGER IF EXISTS trg_open_enrollment_elections_updated_at ON app.open_enrollment_elections;
-- DROP TRIGGER IF EXISTS trg_open_enrollment_periods_updated_at ON app.open_enrollment_periods;
-- DROP TRIGGER IF EXISTS trg_life_events_updated_at ON app.life_events;
-- DROP POLICY IF EXISTS tenant_isolation ON app.open_enrollment_elections;
-- DROP POLICY IF EXISTS tenant_isolation ON app.open_enrollment_periods;
-- DROP POLICY IF EXISTS tenant_isolation ON app.life_events;
-- DROP TABLE IF EXISTS app.open_enrollment_elections;
-- DROP TABLE IF EXISTS app.open_enrollment_periods;
-- DROP TABLE IF EXISTS app.life_events;
