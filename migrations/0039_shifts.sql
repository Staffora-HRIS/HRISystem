-- Migration: 0039_shifts
-- Created: 2026-01-07
-- Description: Create the shifts table for shift definitions
--              Shifts define work periods within a schedule
--              Supports overnight shifts and configurable breaks

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shifts Table
-- -----------------------------------------------------------------------------
-- Shift definitions within a schedule
-- Each shift has a start time, end time, and break duration
-- Shifts can be overnight (end time < start time, crossing midnight)
CREATE TABLE IF NOT EXISTS app.shifts (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this shift
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Parent schedule
    schedule_id uuid NOT NULL REFERENCES app.schedules(id) ON DELETE CASCADE,

    -- Shift name/label (e.g., "Morning", "Day Shift", "Night Watch")
    name varchar(100) NOT NULL,

    -- Shift time range (time only, date comes from assignment)
    start_time time NOT NULL,
    end_time time NOT NULL,

    -- Standard break duration in minutes
    -- Actual breaks may vary; this is the expected/planned duration
    break_minutes integer NOT NULL DEFAULT 0,

    -- Whether shift crosses midnight (end_time < start_time)
    -- e.g., 22:00 - 06:00 is overnight
    is_overnight boolean NOT NULL DEFAULT false,

    -- UI color for display in schedule views (hex format: #RRGGBB)
    color varchar(7),

    -- Minimum/maximum staffing levels (optional, for coverage planning)
    min_staff integer,
    max_staff integer,

    -- Additional shift metadata (e.g., skill requirements, notes)
    metadata jsonb NOT NULL DEFAULT '{}',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Break duration must be reasonable (0 to 480 minutes = 8 hours)
    CONSTRAINT shifts_break_range CHECK (
        break_minutes >= 0 AND break_minutes <= 480
    ),

    -- Color format validation (#RRGGBB)
    CONSTRAINT shifts_color_format CHECK (
        color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'
    ),

    -- Min/max staff must be positive
    CONSTRAINT shifts_min_staff_positive CHECK (
        min_staff IS NULL OR min_staff >= 0
    ),

    CONSTRAINT shifts_max_staff_positive CHECK (
        max_staff IS NULL OR max_staff >= 1
    ),

    -- Max staff must be >= min staff
    CONSTRAINT shifts_staff_range CHECK (
        min_staff IS NULL OR max_staff IS NULL OR max_staff >= min_staff
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + schedule
CREATE INDEX IF NOT EXISTS idx_shifts_tenant_schedule
    ON app.shifts(tenant_id, schedule_id);

-- Schedule shifts lookup
CREATE INDEX IF NOT EXISTS idx_shifts_schedule
    ON app.shifts(schedule_id);

-- Time-based queries (find shifts starting/ending at certain times)
CREATE INDEX IF NOT EXISTS idx_shifts_schedule_times
    ON app.shifts(schedule_id, start_time, end_time);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.shifts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see shifts for their current tenant
CREATE POLICY tenant_isolation ON app.shifts
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.shifts
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_shifts_updated_at
    BEFORE UPDATE ON app.shifts
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Trigger to auto-detect overnight shifts
CREATE OR REPLACE FUNCTION app.detect_overnight_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Auto-set is_overnight based on time comparison
    -- If end_time <= start_time, it's overnight
    NEW.is_overnight := (NEW.end_time <= NEW.start_time);
    RETURN NEW;
END;
$$;

CREATE TRIGGER detect_overnight_shift
    BEFORE INSERT OR UPDATE OF start_time, end_time ON app.shifts
    FOR EACH ROW
    EXECUTE FUNCTION app.detect_overnight_shift();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to calculate shift duration in hours
CREATE OR REPLACE FUNCTION app.calculate_shift_duration_hours(
    p_start_time time,
    p_end_time time,
    p_is_overnight boolean DEFAULT false
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_duration interval;
BEGIN
    IF p_is_overnight OR p_end_time <= p_start_time THEN
        -- Overnight: add 24 hours to end time for calculation
        v_duration := (p_end_time + interval '24 hours') - p_start_time;
    ELSE
        v_duration := p_end_time - p_start_time;
    END IF;

    RETURN ROUND(EXTRACT(EPOCH FROM v_duration) / 3600, 2);
END;
$$;

COMMENT ON FUNCTION app.calculate_shift_duration_hours IS 'Calculates shift duration in hours, accounting for overnight shifts';

-- Function to calculate net shift hours (minus break)
CREATE OR REPLACE FUNCTION app.calculate_net_shift_hours(
    p_start_time time,
    p_end_time time,
    p_break_minutes integer,
    p_is_overnight boolean DEFAULT false
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_gross_hours numeric;
BEGIN
    v_gross_hours := app.calculate_shift_duration_hours(p_start_time, p_end_time, p_is_overnight);
    RETURN GREATEST(0, v_gross_hours - (COALESCE(p_break_minutes, 0) / 60.0));
END;
$$;

COMMENT ON FUNCTION app.calculate_net_shift_hours IS 'Calculates net shift hours after subtracting break time';

-- Function to get shifts for a schedule
CREATE OR REPLACE FUNCTION app.get_schedule_shifts(
    p_schedule_id uuid
)
RETURNS TABLE (
    id uuid,
    name varchar(100),
    start_time time,
    end_time time,
    break_minutes integer,
    is_overnight boolean,
    color varchar(7),
    duration_hours numeric,
    net_hours numeric
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
        s.start_time,
        s.end_time,
        s.break_minutes,
        s.is_overnight,
        s.color,
        app.calculate_shift_duration_hours(s.start_time, s.end_time, s.is_overnight),
        app.calculate_net_shift_hours(s.start_time, s.end_time, s.break_minutes, s.is_overnight)
    FROM app.shifts s
    WHERE s.schedule_id = p_schedule_id
    ORDER BY s.start_time, s.name;
END;
$$;

COMMENT ON FUNCTION app.get_schedule_shifts IS 'Returns all shifts for a schedule with calculated durations';

-- Function to check if a time falls within a shift
CREATE OR REPLACE FUNCTION app.is_time_in_shift(
    p_shift_id uuid,
    p_check_time time
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_shift RECORD;
BEGIN
    SELECT start_time, end_time, is_overnight
    INTO v_shift
    FROM app.shifts
    WHERE id = p_shift_id;

    IF v_shift IS NULL THEN
        RETURN false;
    END IF;

    IF v_shift.is_overnight THEN
        -- Overnight shift: time is in shift if >= start OR < end
        RETURN p_check_time >= v_shift.start_time OR p_check_time < v_shift.end_time;
    ELSE
        -- Normal shift: time is in shift if >= start AND < end
        RETURN p_check_time >= v_shift.start_time AND p_check_time < v_shift.end_time;
    END IF;
END;
$$;

COMMENT ON FUNCTION app.is_time_in_shift IS 'Checks if a given time falls within a shift period';

-- Function to get shift details by ID
CREATE OR REPLACE FUNCTION app.get_shift_details(
    p_shift_id uuid
)
RETURNS TABLE (
    id uuid,
    schedule_id uuid,
    schedule_name varchar(255),
    name varchar(100),
    start_time time,
    end_time time,
    break_minutes integer,
    is_overnight boolean,
    duration_hours numeric,
    net_hours numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.schedule_id,
        sch.name AS schedule_name,
        s.name,
        s.start_time,
        s.end_time,
        s.break_minutes,
        s.is_overnight,
        app.calculate_shift_duration_hours(s.start_time, s.end_time, s.is_overnight),
        app.calculate_net_shift_hours(s.start_time, s.end_time, s.break_minutes, s.is_overnight)
    FROM app.shifts s
    JOIN app.schedules sch ON s.schedule_id = sch.id
    WHERE s.id = p_shift_id;
END;
$$;

COMMENT ON FUNCTION app.get_shift_details IS 'Returns detailed information about a shift including calculated durations';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.shifts IS 'Shift definitions within schedules. Defines work periods with start/end times and break duration.';
COMMENT ON COLUMN app.shifts.id IS 'Primary UUID identifier for the shift';
COMMENT ON COLUMN app.shifts.tenant_id IS 'Tenant that owns this shift';
COMMENT ON COLUMN app.shifts.schedule_id IS 'Parent schedule this shift belongs to';
COMMENT ON COLUMN app.shifts.name IS 'Shift name/label';
COMMENT ON COLUMN app.shifts.start_time IS 'Shift start time';
COMMENT ON COLUMN app.shifts.end_time IS 'Shift end time';
COMMENT ON COLUMN app.shifts.break_minutes IS 'Standard break duration in minutes';
COMMENT ON COLUMN app.shifts.is_overnight IS 'Whether shift crosses midnight';
COMMENT ON COLUMN app.shifts.color IS 'UI display color in hex format (#RRGGBB)';
COMMENT ON COLUMN app.shifts.min_staff IS 'Minimum staffing level';
COMMENT ON COLUMN app.shifts.max_staff IS 'Maximum staffing level';
COMMENT ON COLUMN app.shifts.metadata IS 'Additional shift metadata';
COMMENT ON FUNCTION app.detect_overnight_shift IS 'Trigger function to auto-detect overnight shifts';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_shift_details(uuid);
-- DROP FUNCTION IF EXISTS app.is_time_in_shift(uuid, time);
-- DROP FUNCTION IF EXISTS app.get_schedule_shifts(uuid);
-- DROP FUNCTION IF EXISTS app.calculate_net_shift_hours(time, time, integer, boolean);
-- DROP FUNCTION IF EXISTS app.calculate_shift_duration_hours(time, time, boolean);
-- DROP TRIGGER IF EXISTS detect_overnight_shift ON app.shifts;
-- DROP FUNCTION IF EXISTS app.detect_overnight_shift();
-- DROP TRIGGER IF EXISTS update_shifts_updated_at ON app.shifts;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.shifts;
-- DROP POLICY IF EXISTS tenant_isolation ON app.shifts;
-- DROP INDEX IF EXISTS app.idx_shifts_schedule_times;
-- DROP INDEX IF EXISTS app.idx_shifts_schedule;
-- DROP INDEX IF EXISTS app.idx_shifts_tenant_schedule;
-- DROP TABLE IF EXISTS app.shifts;
