-- Migration: 0040_shift_assignments
-- Created: 2026-01-07
-- Description: Create the shift_assignments table for assigning shifts to employees
--              Links employees to specific shifts on specific dates
--              Tracks actual vs scheduled times

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shift Assignments Table
-- -----------------------------------------------------------------------------
-- Associates employees with shifts on specific dates
-- Each record is one employee's assignment to one shift on one date
-- Tracks both scheduled times (from shift) and actual times (from time events)
CREATE TABLE IF NOT EXISTS app.shift_assignments (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this assignment
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The shift being assigned
    shift_id uuid NOT NULL REFERENCES app.shifts(id) ON DELETE CASCADE,

    -- The employee assigned to this shift
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- The specific date for this assignment
    assignment_date date NOT NULL,

    -- Actual times (populated from time events or manually)
    -- NULL until employee clocks in/out
    actual_start_time timestamptz,
    actual_end_time timestamptz,

    -- Whether this assignment is visible to the employee
    -- Published when schedule is published
    is_published boolean NOT NULL DEFAULT false,

    -- Attendance status tracking
    -- NULL = not yet evaluated
    -- 'present' = employee worked the shift
    -- 'absent' = employee did not show up
    -- 'partial' = employee worked partial shift
    -- 'excused' = absence was excused (leave, etc.)
    attendance_status varchar(20),

    -- Notes from manager or system
    notes text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- One employee can only be assigned to one shift per date per shift
    CONSTRAINT shift_assignments_unique UNIQUE (tenant_id, employee_id, assignment_date, shift_id),

    -- Actual end must be after actual start
    CONSTRAINT shift_assignments_actual_times CHECK (
        actual_start_time IS NULL OR actual_end_time IS NULL OR
        actual_end_time > actual_start_time
    ),

    -- Valid attendance status values
    CONSTRAINT shift_assignments_attendance_status CHECK (
        attendance_status IS NULL OR
        attendance_status IN ('present', 'absent', 'partial', 'excused')
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + employee + date (find employee's assignments)
CREATE INDEX IF NOT EXISTS idx_shift_assignments_tenant_employee_date
    ON app.shift_assignments(tenant_id, employee_id, assignment_date);

-- Shift lookup (find all employees assigned to a shift)
CREATE INDEX IF NOT EXISTS idx_shift_assignments_shift
    ON app.shift_assignments(shift_id, assignment_date);

-- Date-based queries (find all assignments on a date)
CREATE INDEX IF NOT EXISTS idx_shift_assignments_tenant_date
    ON app.shift_assignments(tenant_id, assignment_date);

-- Published assignments (what employees see)
CREATE INDEX IF NOT EXISTS idx_shift_assignments_published
    ON app.shift_assignments(tenant_id, employee_id, assignment_date)
    WHERE is_published = true;

-- Attendance tracking (find unexcused absences, etc.)
CREATE INDEX IF NOT EXISTS idx_shift_assignments_attendance
    ON app.shift_assignments(tenant_id, assignment_date, attendance_status)
    WHERE attendance_status IS NOT NULL;

-- Employee schedule range queries
CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee_range
    ON app.shift_assignments(employee_id, assignment_date DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.shift_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see assignments for their current tenant
CREATE POLICY tenant_isolation ON app.shift_assignments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.shift_assignments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_shift_assignments_updated_at
    BEFORE UPDATE ON app.shift_assignments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get employee's schedule for a date range
CREATE OR REPLACE FUNCTION app.get_employee_schedule(
    p_employee_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    assignment_id uuid,
    assignment_date date,
    shift_id uuid,
    shift_name varchar(100),
    start_time time,
    end_time time,
    is_overnight boolean,
    actual_start_time timestamptz,
    actual_end_time timestamptz,
    attendance_status varchar(20)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sa.id AS assignment_id,
        sa.assignment_date,
        s.id AS shift_id,
        s.name AS shift_name,
        s.start_time,
        s.end_time,
        s.is_overnight,
        sa.actual_start_time,
        sa.actual_end_time,
        sa.attendance_status
    FROM app.shift_assignments sa
    JOIN app.shifts s ON sa.shift_id = s.id
    WHERE sa.employee_id = p_employee_id
      AND sa.assignment_date >= p_start_date
      AND sa.assignment_date <= p_end_date
      AND sa.is_published = true
    ORDER BY sa.assignment_date, s.start_time;
END;
$$;

COMMENT ON FUNCTION app.get_employee_schedule IS 'Returns an employee schedule for a date range (published assignments only)';

-- Function to get all assignments for a shift on a date
CREATE OR REPLACE FUNCTION app.get_shift_coverage(
    p_shift_id uuid,
    p_date date
)
RETURNS TABLE (
    assignment_id uuid,
    employee_id uuid,
    employee_number varchar(50),
    actual_start_time timestamptz,
    actual_end_time timestamptz,
    attendance_status varchar(20)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sa.id AS assignment_id,
        sa.employee_id,
        e.employee_number,
        sa.actual_start_time,
        sa.actual_end_time,
        sa.attendance_status
    FROM app.shift_assignments sa
    JOIN app.employees e ON sa.employee_id = e.id
    WHERE sa.shift_id = p_shift_id
      AND sa.assignment_date = p_date
    ORDER BY sa.created_at;
END;
$$;

COMMENT ON FUNCTION app.get_shift_coverage IS 'Returns all employees assigned to a shift on a specific date';

-- Function to check for overlapping assignments
CREATE OR REPLACE FUNCTION app.check_assignment_overlap(
    p_employee_id uuid,
    p_date date,
    p_shift_id uuid,
    p_exclude_assignment_id uuid DEFAULT NULL
)
RETURNS TABLE (
    overlapping_assignment_id uuid,
    overlapping_shift_name varchar(100),
    overlapping_start_time time,
    overlapping_end_time time
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_new_shift RECORD;
BEGIN
    -- Get the shift being assigned
    SELECT start_time, end_time, is_overnight
    INTO v_new_shift
    FROM app.shifts
    WHERE id = p_shift_id;

    IF v_new_shift IS NULL THEN
        RAISE EXCEPTION 'Shift not found: %', p_shift_id;
    END IF;

    -- Find overlapping assignments
    -- This is a simplified check - full overlap detection needs to consider overnight shifts
    RETURN QUERY
    SELECT
        sa.id,
        s.name,
        s.start_time,
        s.end_time
    FROM app.shift_assignments sa
    JOIN app.shifts s ON sa.shift_id = s.id
    WHERE sa.employee_id = p_employee_id
      AND sa.assignment_date = p_date
      AND (p_exclude_assignment_id IS NULL OR sa.id != p_exclude_assignment_id)
      AND (
          -- Simple overlap check (may need refinement for overnight shifts)
          (s.start_time < v_new_shift.end_time AND s.end_time > v_new_shift.start_time)
          OR (s.is_overnight AND NOT v_new_shift.is_overnight)
          OR (NOT s.is_overnight AND v_new_shift.is_overnight)
      );
END;
$$;

COMMENT ON FUNCTION app.check_assignment_overlap IS 'Checks for overlapping shift assignments for an employee on a date';

-- Function to update assignment with actual times from time events
CREATE OR REPLACE FUNCTION app.update_assignment_actual_times(
    p_assignment_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_assignment RECORD;
    v_shift RECORD;
    v_clock_in timestamptz;
    v_clock_out timestamptz;
    v_expected_start timestamptz;
    v_expected_end timestamptz;
BEGIN
    -- Get assignment details
    SELECT sa.*, s.start_time, s.end_time, s.is_overnight
    INTO v_assignment
    FROM app.shift_assignments sa
    JOIN app.shifts s ON sa.shift_id = s.id
    WHERE sa.id = p_assignment_id;

    IF v_assignment IS NULL THEN
        RETURN false;
    END IF;

    -- Calculate expected shift boundaries
    v_expected_start := v_assignment.assignment_date + v_assignment.start_time;
    IF v_assignment.is_overnight THEN
        v_expected_end := (v_assignment.assignment_date + interval '1 day') + v_assignment.end_time;
    ELSE
        v_expected_end := v_assignment.assignment_date + v_assignment.end_time;
    END IF;

    -- Find clock_in within reasonable window (2 hours before to 4 hours after expected start)
    SELECT event_time INTO v_clock_in
    FROM app.time_events
    WHERE employee_id = v_assignment.employee_id
      AND event_type = 'clock_in'
      AND event_time >= v_expected_start - interval '2 hours'
      AND event_time <= v_expected_start + interval '4 hours'
    ORDER BY event_time
    LIMIT 1;

    -- Find clock_out after clock_in
    IF v_clock_in IS NOT NULL THEN
        SELECT event_time INTO v_clock_out
        FROM app.time_events
        WHERE employee_id = v_assignment.employee_id
          AND event_type = 'clock_out'
          AND event_time > v_clock_in
          AND event_time <= v_expected_end + interval '4 hours'
        ORDER BY event_time
        LIMIT 1;
    END IF;

    -- Update assignment with actual times
    UPDATE app.shift_assignments
    SET actual_start_time = v_clock_in,
        actual_end_time = v_clock_out,
        attendance_status = CASE
            WHEN v_clock_in IS NULL THEN 'absent'
            WHEN v_clock_out IS NULL THEN 'partial'
            ELSE 'present'
        END
    WHERE id = p_assignment_id;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION app.update_assignment_actual_times IS 'Updates shift assignment with actual times from time events';

-- Function to publish assignments for a schedule
CREATE OR REPLACE FUNCTION app.publish_schedule_assignments(
    p_schedule_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE app.shift_assignments
    SET is_published = true
    WHERE shift_id IN (
        SELECT id FROM app.shifts WHERE schedule_id = p_schedule_id
    )
    AND is_published = false;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION app.publish_schedule_assignments IS 'Publishes all assignments for a schedule';

-- Function to get employees without assignments on a date
CREATE OR REPLACE FUNCTION app.get_unassigned_employees(
    p_org_unit_id uuid,
    p_date date
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.employee_number
    FROM app.employees e
    JOIN app.position_assignments pa ON e.id = pa.employee_id
    JOIN app.positions p ON pa.position_id = p.id
    WHERE p.org_unit_id = p_org_unit_id
      AND e.status = 'active'
      AND pa.is_current = true
      AND e.id NOT IN (
          SELECT sa.employee_id
          FROM app.shift_assignments sa
          WHERE sa.assignment_date = p_date
      )
    ORDER BY e.employee_number;
END;
$$;

COMMENT ON FUNCTION app.get_unassigned_employees IS 'Returns employees in an org unit without shift assignments on a date';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.shift_assignments IS 'Assigns employees to shifts on specific dates. Tracks scheduled vs actual times.';
COMMENT ON COLUMN app.shift_assignments.id IS 'Primary UUID identifier for the assignment';
COMMENT ON COLUMN app.shift_assignments.tenant_id IS 'Tenant that owns this assignment';
COMMENT ON COLUMN app.shift_assignments.shift_id IS 'The shift being assigned';
COMMENT ON COLUMN app.shift_assignments.employee_id IS 'The employee assigned to this shift';
COMMENT ON COLUMN app.shift_assignments.assignment_date IS 'The date of this assignment';
COMMENT ON COLUMN app.shift_assignments.actual_start_time IS 'Actual clock-in time';
COMMENT ON COLUMN app.shift_assignments.actual_end_time IS 'Actual clock-out time';
COMMENT ON COLUMN app.shift_assignments.is_published IS 'Whether assignment is visible to employee';
COMMENT ON COLUMN app.shift_assignments.attendance_status IS 'Attendance status (present, absent, partial, excused)';
COMMENT ON COLUMN app.shift_assignments.notes IS 'Manager or system notes';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_unassigned_employees(uuid, date);
-- DROP FUNCTION IF EXISTS app.publish_schedule_assignments(uuid);
-- DROP FUNCTION IF EXISTS app.update_assignment_actual_times(uuid);
-- DROP FUNCTION IF EXISTS app.check_assignment_overlap(uuid, date, uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_shift_coverage(uuid, date);
-- DROP FUNCTION IF EXISTS app.get_employee_schedule(uuid, date, date);
-- DROP TRIGGER IF EXISTS update_shift_assignments_updated_at ON app.shift_assignments;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.shift_assignments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.shift_assignments;
-- DROP INDEX IF EXISTS app.idx_shift_assignments_employee_range;
-- DROP INDEX IF EXISTS app.idx_shift_assignments_attendance;
-- DROP INDEX IF EXISTS app.idx_shift_assignments_published;
-- DROP INDEX IF EXISTS app.idx_shift_assignments_tenant_date;
-- DROP INDEX IF EXISTS app.idx_shift_assignments_shift;
-- DROP INDEX IF EXISTS app.idx_shift_assignments_tenant_employee_date;
-- DROP TABLE IF EXISTS app.shift_assignments;
