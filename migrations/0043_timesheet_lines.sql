-- Migration: 0043_timesheet_lines
-- Created: 2026-01-07
-- Description: Create the timesheet_lines table for daily timesheet entries
--              Each line represents one day's work within a timesheet period
--              Links to time events and can track leave/holiday status

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Timesheet Lines Table
-- -----------------------------------------------------------------------------
-- Daily entries within a timesheet
-- One row per work date within the timesheet period
-- Links scheduled times, actual times, and calculated hours
CREATE TABLE IF NOT EXISTS app.timesheet_lines (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this line
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Parent timesheet
    timesheet_id uuid NOT NULL REFERENCES app.timesheets(id) ON DELETE CASCADE,

    -- The work date this line represents
    work_date date NOT NULL,

    -- Scheduled times (from shift assignment, if applicable)
    scheduled_start time,
    scheduled_end time,

    -- Actual times (from time events or manual entry)
    actual_start timestamptz,
    actual_end timestamptz,

    -- Calculated/entered hours
    regular_hours numeric(4, 2) NOT NULL DEFAULT 0,
    overtime_hours numeric(4, 2) NOT NULL DEFAULT 0,
    break_minutes integer NOT NULL DEFAULT 0,

    -- Special day flags
    is_holiday boolean NOT NULL DEFAULT false,
    is_leave boolean NOT NULL DEFAULT false,

    -- Reference to leave request (if is_leave = true)
    -- Will add FK constraint when leave module exists
    leave_request_id uuid,

    -- Reference to holiday record (if is_holiday = true)
    -- Will add FK constraint when calendar module exists
    holiday_id uuid,

    -- Notes or comments for this day
    notes text,

    -- Adjustment tracking (for corrections after initial entry)
    is_adjusted boolean NOT NULL DEFAULT false,
    adjustment_reason text,
    adjusted_at timestamptz,
    adjusted_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- One line per date per timesheet
    CONSTRAINT timesheet_lines_unique UNIQUE (timesheet_id, work_date),

    -- Hours must be non-negative
    CONSTRAINT timesheet_lines_hours_positive CHECK (
        regular_hours >= 0 AND
        overtime_hours >= 0 AND
        break_minutes >= 0
    ),

    -- Hours must be reasonable (max 24 hours/day)
    CONSTRAINT timesheet_lines_hours_max CHECK (
        regular_hours <= 24 AND
        overtime_hours <= 24 AND
        (regular_hours + overtime_hours) <= 24
    ),

    -- Break must be reasonable (max 480 minutes = 8 hours)
    CONSTRAINT timesheet_lines_break_max CHECK (
        break_minutes <= 480
    ),

    -- Actual end must be after actual start
    CONSTRAINT timesheet_lines_actual_times CHECK (
        actual_start IS NULL OR actual_end IS NULL OR
        actual_end > actual_start
    ),

    -- Leave request required when is_leave = true
    CONSTRAINT timesheet_lines_leave_request CHECK (
        NOT is_leave OR leave_request_id IS NOT NULL
    ),

    -- Adjustment info required when is_adjusted = true
    CONSTRAINT timesheet_lines_adjustment_info CHECK (
        NOT is_adjusted OR (adjustment_reason IS NOT NULL AND adjusted_at IS NOT NULL)
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: timesheet + date
CREATE INDEX IF NOT EXISTS idx_timesheet_lines_timesheet_date
    ON app.timesheet_lines(timesheet_id, work_date);

-- Tenant-based queries
CREATE INDEX IF NOT EXISTS idx_timesheet_lines_tenant
    ON app.timesheet_lines(tenant_id, work_date);

-- Date range queries across timesheets
CREATE INDEX IF NOT EXISTS idx_timesheet_lines_date
    ON app.timesheet_lines(work_date);

-- Leave days lookup
CREATE INDEX IF NOT EXISTS idx_timesheet_lines_leave
    ON app.timesheet_lines(timesheet_id)
    WHERE is_leave = true;

-- Holiday days lookup
CREATE INDEX IF NOT EXISTS idx_timesheet_lines_holiday
    ON app.timesheet_lines(timesheet_id)
    WHERE is_holiday = true;

-- Adjusted entries
CREATE INDEX IF NOT EXISTS idx_timesheet_lines_adjusted
    ON app.timesheet_lines(timesheet_id)
    WHERE is_adjusted = true;

-- Leave request reference
CREATE INDEX IF NOT EXISTS idx_timesheet_lines_leave_request
    ON app.timesheet_lines(leave_request_id)
    WHERE leave_request_id IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.timesheet_lines ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see lines for their current tenant
CREATE POLICY tenant_isolation ON app.timesheet_lines
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.timesheet_lines
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_timesheet_lines_updated_at
    BEFORE UPDATE ON app.timesheet_lines
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Prevent modification of approved/locked timesheet lines
CREATE OR REPLACE FUNCTION app.check_timesheet_line_modifiable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_status app.timesheet_status;
BEGIN
    -- Get parent timesheet status
    SELECT status INTO v_status
    FROM app.timesheets
    WHERE id = COALESCE(NEW.timesheet_id, OLD.timesheet_id);

    IF v_status IN ('approved', 'locked') THEN
        RAISE EXCEPTION 'Cannot modify lines of % timesheet', v_status;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER check_timesheet_line_modifiable
    BEFORE INSERT OR UPDATE OR DELETE ON app.timesheet_lines
    FOR EACH ROW
    EXECUTE FUNCTION app.check_timesheet_line_modifiable();

-- Auto-update timesheet totals when lines change
CREATE OR REPLACE FUNCTION app.update_timesheet_totals_on_line_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_timesheet_id uuid;
BEGIN
    -- Get the affected timesheet ID
    v_timesheet_id := COALESCE(NEW.timesheet_id, OLD.timesheet_id);

    -- Recalculate totals
    UPDATE app.timesheets
    SET total_regular_hours = (
            SELECT COALESCE(SUM(regular_hours), 0)
            FROM app.timesheet_lines
            WHERE timesheet_id = v_timesheet_id
        ),
        total_overtime_hours = (
            SELECT COALESCE(SUM(overtime_hours), 0)
            FROM app.timesheet_lines
            WHERE timesheet_id = v_timesheet_id
        ),
        total_break_minutes = (
            SELECT COALESCE(SUM(break_minutes), 0)
            FROM app.timesheet_lines
            WHERE timesheet_id = v_timesheet_id
        )
    WHERE id = v_timesheet_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER update_timesheet_totals_on_line_change
    AFTER INSERT OR UPDATE OR DELETE ON app.timesheet_lines
    FOR EACH ROW
    EXECUTE FUNCTION app.update_timesheet_totals_on_line_change();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to populate timesheet lines from time events
CREATE OR REPLACE FUNCTION app.populate_timesheet_lines_from_events(
    p_timesheet_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_timesheet RECORD;
    v_current_date date;
    v_hours RECORD;
    v_count integer := 0;
BEGIN
    -- Get timesheet details
    SELECT * INTO v_timesheet
    FROM app.timesheets
    WHERE id = p_timesheet_id;

    IF v_timesheet IS NULL THEN
        RAISE EXCEPTION 'Timesheet not found: %', p_timesheet_id;
    END IF;

    IF v_timesheet.status IN ('approved', 'locked') THEN
        RAISE EXCEPTION 'Cannot populate lines for % timesheet', v_timesheet.status;
    END IF;

    -- Iterate through each day in the period
    v_current_date := v_timesheet.period_start;
    WHILE v_current_date <= v_timesheet.period_end LOOP
        -- Calculate hours for this day
        SELECT * INTO v_hours
        FROM app.calculate_hours_worked(v_timesheet.employee_id, v_current_date);

        -- Insert or update line for this day
        INSERT INTO app.timesheet_lines (
            tenant_id,
            timesheet_id,
            work_date,
            regular_hours,
            break_minutes
        )
        VALUES (
            v_timesheet.tenant_id,
            p_timesheet_id,
            v_current_date,
            COALESCE(v_hours.net_hours, 0),
            COALESCE(v_hours.break_minutes, 0)
        )
        ON CONFLICT (timesheet_id, work_date)
        DO UPDATE SET
            regular_hours = COALESCE(v_hours.net_hours, 0),
            break_minutes = COALESCE(v_hours.break_minutes, 0);

        v_count := v_count + 1;
        v_current_date := v_current_date + interval '1 day';
    END LOOP;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION app.populate_timesheet_lines_from_events IS 'Creates timesheet lines from time events for each day in the period';

-- Function to get timesheet lines with details
CREATE OR REPLACE FUNCTION app.get_timesheet_lines(
    p_timesheet_id uuid
)
RETURNS TABLE (
    id uuid,
    work_date date,
    day_of_week text,
    scheduled_start time,
    scheduled_end time,
    actual_start timestamptz,
    actual_end timestamptz,
    regular_hours numeric,
    overtime_hours numeric,
    break_minutes integer,
    is_holiday boolean,
    is_leave boolean,
    is_adjusted boolean,
    notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        tl.id,
        tl.work_date,
        to_char(tl.work_date, 'Day') AS day_of_week,
        tl.scheduled_start,
        tl.scheduled_end,
        tl.actual_start,
        tl.actual_end,
        tl.regular_hours,
        tl.overtime_hours,
        tl.break_minutes,
        tl.is_holiday,
        tl.is_leave,
        tl.is_adjusted,
        tl.notes
    FROM app.timesheet_lines tl
    WHERE tl.timesheet_id = p_timesheet_id
    ORDER BY tl.work_date;
END;
$$;

COMMENT ON FUNCTION app.get_timesheet_lines IS 'Returns all lines for a timesheet with day of week';

-- Function to update a timesheet line
CREATE OR REPLACE FUNCTION app.update_timesheet_line(
    p_line_id uuid,
    p_regular_hours numeric,
    p_overtime_hours numeric DEFAULT 0,
    p_break_minutes integer DEFAULT 0,
    p_notes text DEFAULT NULL,
    p_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_line RECORD;
    v_timesheet RECORD;
BEGIN
    -- Get line and timesheet
    SELECT tl.*, t.status AS timesheet_status
    INTO v_line
    FROM app.timesheet_lines tl
    JOIN app.timesheets t ON tl.timesheet_id = t.id
    WHERE tl.id = p_line_id;

    IF v_line IS NULL THEN
        RAISE EXCEPTION 'Timesheet line not found: %', p_line_id;
    END IF;

    -- Check if original values differ (for adjustment tracking)
    IF v_line.regular_hours != p_regular_hours OR
       v_line.overtime_hours != p_overtime_hours OR
       v_line.break_minutes != p_break_minutes THEN
        -- Mark as adjusted
        UPDATE app.timesheet_lines
        SET regular_hours = p_regular_hours,
            overtime_hours = p_overtime_hours,
            break_minutes = p_break_minutes,
            notes = COALESCE(p_notes, notes),
            is_adjusted = true,
            adjustment_reason = COALESCE(p_notes, 'Manual adjustment'),
            adjusted_at = now(),
            adjusted_by = p_user_id
        WHERE id = p_line_id;
    ELSE
        -- Just update notes
        UPDATE app.timesheet_lines
        SET notes = COALESCE(p_notes, notes)
        WHERE id = p_line_id;
    END IF;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION app.update_timesheet_line IS 'Updates a timesheet line with adjustment tracking';

-- Function to mark a day as leave
CREATE OR REPLACE FUNCTION app.mark_timesheet_line_leave(
    p_line_id uuid,
    p_leave_request_id uuid,
    p_hours numeric DEFAULT 8
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.timesheet_lines
    SET is_leave = true,
        leave_request_id = p_leave_request_id,
        regular_hours = p_hours,
        overtime_hours = 0,
        actual_start = NULL,
        actual_end = NULL,
        notes = 'Leave day'
    WHERE id = p_line_id;

    RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION app.mark_timesheet_line_leave IS 'Marks a timesheet line as a leave day';

-- Function to mark a day as holiday
CREATE OR REPLACE FUNCTION app.mark_timesheet_line_holiday(
    p_line_id uuid,
    p_holiday_id uuid DEFAULT NULL,
    p_hours numeric DEFAULT 8
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.timesheet_lines
    SET is_holiday = true,
        holiday_id = p_holiday_id,
        regular_hours = p_hours,
        overtime_hours = 0,
        actual_start = NULL,
        actual_end = NULL,
        notes = 'Holiday'
    WHERE id = p_line_id;

    RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION app.mark_timesheet_line_holiday IS 'Marks a timesheet line as a holiday';

-- Function to get daily hours summary for a period
CREATE OR REPLACE FUNCTION app.get_daily_hours_summary(
    p_employee_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    work_date date,
    regular_hours numeric,
    overtime_hours numeric,
    break_minutes integer,
    is_holiday boolean,
    is_leave boolean,
    timesheet_status app.timesheet_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        tl.work_date,
        tl.regular_hours,
        tl.overtime_hours,
        tl.break_minutes,
        tl.is_holiday,
        tl.is_leave,
        t.status AS timesheet_status
    FROM app.timesheet_lines tl
    JOIN app.timesheets t ON tl.timesheet_id = t.id
    WHERE t.employee_id = p_employee_id
      AND tl.work_date >= p_start_date
      AND tl.work_date <= p_end_date
    ORDER BY tl.work_date;
END;
$$;

COMMENT ON FUNCTION app.get_daily_hours_summary IS 'Returns daily hours summary for an employee over a date range';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.timesheet_lines IS 'Daily entries within a timesheet. One row per work date with hours and special day flags.';
COMMENT ON COLUMN app.timesheet_lines.id IS 'Primary UUID identifier for the line';
COMMENT ON COLUMN app.timesheet_lines.tenant_id IS 'Tenant that owns this line';
COMMENT ON COLUMN app.timesheet_lines.timesheet_id IS 'Parent timesheet';
COMMENT ON COLUMN app.timesheet_lines.work_date IS 'The date this line represents';
COMMENT ON COLUMN app.timesheet_lines.scheduled_start IS 'Scheduled shift start time';
COMMENT ON COLUMN app.timesheet_lines.scheduled_end IS 'Scheduled shift end time';
COMMENT ON COLUMN app.timesheet_lines.actual_start IS 'Actual clock-in time';
COMMENT ON COLUMN app.timesheet_lines.actual_end IS 'Actual clock-out time';
COMMENT ON COLUMN app.timesheet_lines.regular_hours IS 'Regular hours worked';
COMMENT ON COLUMN app.timesheet_lines.overtime_hours IS 'Overtime hours worked';
COMMENT ON COLUMN app.timesheet_lines.break_minutes IS 'Total break minutes';
COMMENT ON COLUMN app.timesheet_lines.is_holiday IS 'Whether this is a holiday';
COMMENT ON COLUMN app.timesheet_lines.is_leave IS 'Whether this is a leave day';
COMMENT ON COLUMN app.timesheet_lines.leave_request_id IS 'Reference to leave request';
COMMENT ON COLUMN app.timesheet_lines.holiday_id IS 'Reference to holiday record';
COMMENT ON COLUMN app.timesheet_lines.notes IS 'Notes or comments';
COMMENT ON COLUMN app.timesheet_lines.is_adjusted IS 'Whether line was manually adjusted';
COMMENT ON COLUMN app.timesheet_lines.adjustment_reason IS 'Reason for adjustment';
COMMENT ON COLUMN app.timesheet_lines.adjusted_at IS 'When adjustment was made';
COMMENT ON COLUMN app.timesheet_lines.adjusted_by IS 'Who made the adjustment';
COMMENT ON FUNCTION app.check_timesheet_line_modifiable IS 'Trigger function preventing modification of approved/locked timesheet lines';
COMMENT ON FUNCTION app.update_timesheet_totals_on_line_change IS 'Trigger function to auto-update timesheet totals when lines change';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_daily_hours_summary(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.mark_timesheet_line_holiday(uuid, uuid, numeric);
-- DROP FUNCTION IF EXISTS app.mark_timesheet_line_leave(uuid, uuid, numeric);
-- DROP FUNCTION IF EXISTS app.update_timesheet_line(uuid, numeric, numeric, integer, text, uuid);
-- DROP FUNCTION IF EXISTS app.get_timesheet_lines(uuid);
-- DROP FUNCTION IF EXISTS app.populate_timesheet_lines_from_events(uuid);
-- DROP TRIGGER IF EXISTS update_timesheet_totals_on_line_change ON app.timesheet_lines;
-- DROP FUNCTION IF EXISTS app.update_timesheet_totals_on_line_change();
-- DROP TRIGGER IF EXISTS check_timesheet_line_modifiable ON app.timesheet_lines;
-- DROP FUNCTION IF EXISTS app.check_timesheet_line_modifiable();
-- DROP TRIGGER IF EXISTS update_timesheet_lines_updated_at ON app.timesheet_lines;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.timesheet_lines;
-- DROP POLICY IF EXISTS tenant_isolation ON app.timesheet_lines;
-- DROP INDEX IF EXISTS app.idx_timesheet_lines_leave_request;
-- DROP INDEX IF EXISTS app.idx_timesheet_lines_adjusted;
-- DROP INDEX IF EXISTS app.idx_timesheet_lines_holiday;
-- DROP INDEX IF EXISTS app.idx_timesheet_lines_leave;
-- DROP INDEX IF EXISTS app.idx_timesheet_lines_date;
-- DROP INDEX IF EXISTS app.idx_timesheet_lines_tenant;
-- DROP INDEX IF EXISTS app.idx_timesheet_lines_timesheet_date;
-- DROP TABLE IF EXISTS app.timesheet_lines;
