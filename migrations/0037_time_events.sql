-- Migration: 0037_time_events
-- Created: 2026-01-07
-- Description: Create the time_events table for individual clock events
--              This is a high-volume table partitioned by event_time (monthly)
--              Stores every clock in/out, break start/end for all employees

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Time Events Table (Partitioned)
-- -----------------------------------------------------------------------------
-- Stores individual time clock events (clock in/out, break start/end)
-- Partitioned by RANGE on event_time for efficient querying of recent data
-- and easy archival of old partitions
--
-- IMPORTANT: Event sequence per work session must follow:
--   clock_in -> (break_start -> break_end)* -> clock_out
-- This is enforced at the application/service layer, not database level
CREATE TABLE IF NOT EXISTS app.time_events (
    -- Primary identifier
    id uuid NOT NULL DEFAULT gen_random_uuid(),

    -- Tenant where this event occurred
    tenant_id uuid NOT NULL,

    -- Employee who clocked this event
    employee_id uuid NOT NULL,

    -- Device used to record this event (NULL for legacy/imported data)
    device_id uuid,

    -- Type of event (clock_in, clock_out, break_start, break_end, etc.)
    event_type app.time_event_type NOT NULL,

    -- When the event actually occurred (employee's claimed time)
    event_time timestamptz NOT NULL,

    -- When the event was recorded in the system
    -- May differ from event_time for manual entries or corrections
    recorded_time timestamptz NOT NULL DEFAULT now(),

    -- Geographic coordinates when event was recorded (for geo-fence validation)
    latitude numeric(10, 7),
    longitude numeric(10, 7),

    -- Client IP address for audit trail
    ip_address varchar(45),

    -- Client user agent for audit trail
    user_agent text,

    -- Whether this was a manual entry (vs real-time clock)
    -- Manual entries require reason and may require approval
    is_manual boolean NOT NULL DEFAULT false,

    -- Reason for manual entry (required when is_manual = true)
    manual_reason text,

    -- Approval tracking for manual entries
    approved_by uuid,
    approved_at timestamptz,

    -- Session tracking - links related events (clock_in/out, breaks)
    -- Generated on clock_in, propagated to subsequent events
    session_id uuid,

    -- Standard timestamp (no updated_at - events are immutable)
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Primary key must include partition key for proper partitioning
    PRIMARY KEY (id, event_time),

    -- Constraints
    -- Manual entries require a reason
    CONSTRAINT time_events_manual_reason CHECK (
        (NOT is_manual) OR (manual_reason IS NOT NULL AND manual_reason != '')
    ),

    -- Approval info consistency
    CONSTRAINT time_events_approval_consistency CHECK (
        (approved_by IS NULL AND approved_at IS NULL) OR
        (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),

    -- Geographic coordinates must be provided together
    CONSTRAINT time_events_coordinates CHECK (
        (latitude IS NULL AND longitude IS NULL) OR
        (latitude IS NOT NULL AND longitude IS NOT NULL)
    ),

    -- Latitude must be valid (-90 to 90)
    CONSTRAINT time_events_latitude_range CHECK (
        latitude IS NULL OR (latitude >= -90 AND latitude <= 90)
    ),

    -- Longitude must be valid (-180 to 180)
    CONSTRAINT time_events_longitude_range CHECK (
        longitude IS NULL OR (longitude >= -180 AND longitude <= 180)
    )
) PARTITION BY RANGE (event_time);

-- =============================================================================
-- Create Partitions
-- =============================================================================

-- Function to create monthly partitions for time_events
CREATE OR REPLACE FUNCTION app.create_time_events_partition(
    p_year integer,
    p_month integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_partition_name text;
    v_start_date date;
    v_end_date date;
BEGIN
    -- Generate partition name: time_events_YYYYMM
    v_partition_name := format('time_events_%s%s',
        p_year::text,
        lpad(p_month::text, 2, '0')
    );

    -- Calculate date range
    v_start_date := make_date(p_year, p_month, 1);
    v_end_date := v_start_date + interval '1 month';

    -- Create the partition
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS app.%I PARTITION OF app.time_events
         FOR VALUES FROM (%L) TO (%L)',
        v_partition_name,
        v_start_date,
        v_end_date
    );

    RETURN v_partition_name;
END;
$$;

COMMENT ON FUNCTION app.create_time_events_partition IS 'Creates a monthly partition for time_events table';

-- Create partitions for current month and next 3 months
DO $$
DECLARE
    v_current_date date := CURRENT_DATE;
    v_year integer;
    v_month integer;
    i integer;
BEGIN
    FOR i IN 0..3 LOOP
        v_year := EXTRACT(YEAR FROM (v_current_date + (i || ' months')::interval));
        v_month := EXTRACT(MONTH FROM (v_current_date + (i || ' months')::interval));
        PERFORM app.create_time_events_partition(v_year, v_month);
    END LOOP;
END;
$$;

-- =============================================================================
-- Indexes (created on parent, inherited by partitions)
-- =============================================================================

-- Primary lookup: tenant + employee + event_time (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_time_events_tenant_employee_time
    ON app.time_events(tenant_id, employee_id, event_time DESC);

-- Event type filtering
CREATE INDEX IF NOT EXISTS idx_time_events_tenant_type_time
    ON app.time_events(tenant_id, event_type, event_time DESC);

-- Device tracking
CREATE INDEX IF NOT EXISTS idx_time_events_device
    ON app.time_events(device_id, event_time DESC)
    WHERE device_id IS NOT NULL;

-- Manual entries requiring approval
CREATE INDEX IF NOT EXISTS idx_time_events_pending_approval
    ON app.time_events(tenant_id, employee_id, event_time)
    WHERE is_manual = true AND approved_by IS NULL;

-- Session tracking (find all events in a work session)
CREATE INDEX IF NOT EXISTS idx_time_events_session
    ON app.time_events(session_id, event_time)
    WHERE session_id IS NOT NULL;

-- Recent events for dashboard (today's events)
CREATE INDEX IF NOT EXISTS idx_time_events_recent
    ON app.time_events(tenant_id, event_time DESC)
    WHERE event_time IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.time_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see events for their current tenant
CREATE POLICY tenant_isolation ON app.time_events
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.time_events
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get the last event for an employee
-- Used for validating event sequence (monotonicity)
CREATE OR REPLACE FUNCTION app.get_last_time_event(
    p_employee_id uuid,
    p_before_time timestamptz DEFAULT now()
)
RETURNS TABLE (
    id uuid,
    event_type app.time_event_type,
    event_time timestamptz,
    session_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT te.id, te.event_type, te.event_time, te.session_id
    FROM app.time_events te
    WHERE te.employee_id = p_employee_id
      AND te.event_time < p_before_time
    ORDER BY te.event_time DESC
    LIMIT 1;
END;
$$;

COMMENT ON FUNCTION app.get_last_time_event IS 'Returns the most recent time event for an employee before a given time';

-- Function to validate event sequence (enforces monotonicity)
-- Returns true if the proposed event type is valid given the last event
CREATE OR REPLACE FUNCTION app.validate_time_event_sequence(
    p_employee_id uuid,
    p_proposed_type app.time_event_type,
    p_proposed_time timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_last_event RECORD;
    v_last_type app.time_event_type;
BEGIN
    -- Get last event for this employee
    SELECT event_type, event_time, session_id
    INTO v_last_event
    FROM app.time_events
    WHERE employee_id = p_employee_id
      AND event_time < p_proposed_time
    ORDER BY event_time DESC
    LIMIT 1;

    -- If no previous events, only clock_in is valid
    IF v_last_event IS NULL THEN
        RETURN p_proposed_type = 'clock_in';
    END IF;

    v_last_type := v_last_event.event_type;

    -- Validate based on last event type
    -- State machine:
    --   clock_in -> break_start, clock_out
    --   break_start -> break_end
    --   break_end -> break_start, clock_out
    --   clock_out -> clock_in (new session)
    CASE v_last_type
        WHEN 'clock_in' THEN
            RETURN p_proposed_type IN ('break_start', 'clock_out');
        WHEN 'break_start' THEN
            RETURN p_proposed_type = 'break_end';
        WHEN 'break_end' THEN
            RETURN p_proposed_type IN ('break_start', 'clock_out');
        WHEN 'clock_out' THEN
            RETURN p_proposed_type = 'clock_in';
        WHEN 'shift_start' THEN
            RETURN p_proposed_type IN ('clock_in', 'shift_end');
        WHEN 'shift_end' THEN
            RETURN p_proposed_type IN ('clock_in', 'shift_start');
        ELSE
            RETURN false;
    END CASE;
END;
$$;

COMMENT ON FUNCTION app.validate_time_event_sequence IS 'Validates that a proposed time event follows the correct sequence (monotonicity)';

-- Function to get employee events for a date range
CREATE OR REPLACE FUNCTION app.get_employee_time_events(
    p_employee_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    id uuid,
    event_type app.time_event_type,
    event_time timestamptz,
    device_id uuid,
    is_manual boolean,
    approved_by uuid,
    session_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        te.id,
        te.event_type,
        te.event_time,
        te.device_id,
        te.is_manual,
        te.approved_by,
        te.session_id
    FROM app.time_events te
    WHERE te.employee_id = p_employee_id
      AND te.event_time >= p_start_date::timestamptz
      AND te.event_time < (p_end_date + interval '1 day')::timestamptz
    ORDER BY te.event_time;
END;
$$;

COMMENT ON FUNCTION app.get_employee_time_events IS 'Returns all time events for an employee within a date range';

-- Function to calculate hours worked from events in a date range
CREATE OR REPLACE FUNCTION app.calculate_hours_worked(
    p_employee_id uuid,
    p_date date
)
RETURNS TABLE (
    work_hours numeric,
    break_minutes integer,
    net_hours numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_events RECORD;
    v_clock_in timestamptz;
    v_clock_out timestamptz;
    v_break_start timestamptz;
    v_total_work_seconds numeric := 0;
    v_total_break_seconds numeric := 0;
BEGIN
    -- Process events for the day
    FOR v_events IN
        SELECT te.event_type, te.event_time
        FROM app.time_events te
        WHERE te.employee_id = p_employee_id
          AND te.event_time >= p_date::timestamptz
          AND te.event_time < (p_date + interval '1 day')::timestamptz
        ORDER BY te.event_time
    LOOP
        CASE v_events.event_type
            WHEN 'clock_in' THEN
                v_clock_in := v_events.event_time;
            WHEN 'clock_out' THEN
                IF v_clock_in IS NOT NULL THEN
                    v_total_work_seconds := v_total_work_seconds +
                        EXTRACT(EPOCH FROM (v_events.event_time - v_clock_in));
                    v_clock_in := NULL;
                END IF;
            WHEN 'break_start' THEN
                v_break_start := v_events.event_time;
            WHEN 'break_end' THEN
                IF v_break_start IS NOT NULL THEN
                    v_total_break_seconds := v_total_break_seconds +
                        EXTRACT(EPOCH FROM (v_events.event_time - v_break_start));
                    v_break_start := NULL;
                END IF;
            ELSE
                -- Ignore shift_start/shift_end for hour calculations
                NULL;
        END CASE;
    END LOOP;

    -- Convert to hours/minutes
    work_hours := ROUND(v_total_work_seconds / 3600, 2);
    break_minutes := ROUND(v_total_break_seconds / 60)::integer;
    net_hours := ROUND((v_total_work_seconds - v_total_break_seconds) / 3600, 2);

    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION app.calculate_hours_worked IS 'Calculates work hours, break minutes, and net hours for an employee on a specific date';

-- Function to ensure partition exists (call before inserting)
CREATE OR REPLACE FUNCTION app.ensure_time_events_partition()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_date date := CURRENT_DATE;
    v_year integer;
    v_month integer;
BEGIN
    -- Ensure current month partition exists
    v_year := EXTRACT(YEAR FROM v_current_date);
    v_month := EXTRACT(MONTH FROM v_current_date);
    PERFORM app.create_time_events_partition(v_year, v_month);

    -- Ensure next month partition exists
    v_year := EXTRACT(YEAR FROM (v_current_date + interval '1 month'));
    v_month := EXTRACT(MONTH FROM (v_current_date + interval '1 month'));
    PERFORM app.create_time_events_partition(v_year, v_month);
END;
$$;

COMMENT ON FUNCTION app.ensure_time_events_partition IS 'Ensures current and next month partitions exist for time_events';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.time_events IS 'Individual time clock events partitioned by month. Stores clock in/out and break events.';
COMMENT ON COLUMN app.time_events.id IS 'Primary UUID identifier for the event';
COMMENT ON COLUMN app.time_events.tenant_id IS 'Tenant where this event occurred';
COMMENT ON COLUMN app.time_events.employee_id IS 'Employee who recorded this event';
COMMENT ON COLUMN app.time_events.device_id IS 'Device used to record this event';
COMMENT ON COLUMN app.time_events.event_type IS 'Type of event (clock_in, clock_out, break_start, break_end)';
COMMENT ON COLUMN app.time_events.event_time IS 'When the event actually occurred';
COMMENT ON COLUMN app.time_events.recorded_time IS 'When the event was recorded in the system';
COMMENT ON COLUMN app.time_events.latitude IS 'Latitude coordinate when event was recorded';
COMMENT ON COLUMN app.time_events.longitude IS 'Longitude coordinate when event was recorded';
COMMENT ON COLUMN app.time_events.ip_address IS 'Client IP address for audit';
COMMENT ON COLUMN app.time_events.user_agent IS 'Client user agent for audit';
COMMENT ON COLUMN app.time_events.is_manual IS 'Whether this was a manual entry vs real-time clock';
COMMENT ON COLUMN app.time_events.manual_reason IS 'Reason for manual entry';
COMMENT ON COLUMN app.time_events.approved_by IS 'User who approved manual entry';
COMMENT ON COLUMN app.time_events.approved_at IS 'When manual entry was approved';
COMMENT ON COLUMN app.time_events.session_id IS 'Links related events in a work session';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.ensure_time_events_partition();
-- DROP FUNCTION IF EXISTS app.calculate_hours_worked(uuid, date);
-- DROP FUNCTION IF EXISTS app.get_employee_time_events(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.validate_time_event_sequence(uuid, app.time_event_type, timestamptz);
-- DROP FUNCTION IF EXISTS app.get_last_time_event(uuid, timestamptz);
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.time_events;
-- DROP POLICY IF EXISTS tenant_isolation ON app.time_events;
-- DROP INDEX IF EXISTS app.idx_time_events_recent;
-- DROP INDEX IF EXISTS app.idx_time_events_session;
-- DROP INDEX IF EXISTS app.idx_time_events_pending_approval;
-- DROP INDEX IF EXISTS app.idx_time_events_device;
-- DROP INDEX IF EXISTS app.idx_time_events_tenant_type_time;
-- DROP INDEX IF EXISTS app.idx_time_events_tenant_employee_time;
-- DROP TABLE IF EXISTS app.time_events CASCADE;
-- DROP FUNCTION IF EXISTS app.create_time_events_partition(integer, integer);
