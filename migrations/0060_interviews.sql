-- Migration: 0060_interviews
-- Created: 2026-01-07
-- Description: Create the interviews table for interview scheduling
--              Tracks interview sessions with candidates including type, time, and status

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Interviews Table
-- -----------------------------------------------------------------------------
-- Represents scheduled interviews with candidates
-- Supports multiple interview types and tracks completion status
CREATE TABLE IF NOT EXISTS app.interviews (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this interview
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Candidate being interviewed
    candidate_id uuid NOT NULL REFERENCES app.candidates(id) ON DELETE CASCADE,

    -- Primary interviewer (for panel interviews, this is the lead)
    interviewer_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Type of interview
    interview_type app.interview_type NOT NULL DEFAULT 'video',

    -- Scheduled time and duration
    scheduled_at timestamptz NOT NULL,
    duration_minutes integer NOT NULL DEFAULT 60,

    -- Current status
    status app.interview_status NOT NULL DEFAULT 'scheduled',

    -- Location details (for onsite) or video link (for video calls)
    location text,
    video_link text,

    -- Additional notes/agenda
    notes text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Duration must be reasonable (15 min to 4 hours)
    CONSTRAINT interviews_duration_range CHECK (
        duration_minutes >= 15 AND duration_minutes <= 240
    ),

    -- Scheduled time must be in the future (or recent past for updates)
    CONSTRAINT interviews_scheduled_reasonable CHECK (
        scheduled_at >= created_at - interval '1 day'
    ),

    -- Video link format validation (basic)
    CONSTRAINT interviews_video_link_format CHECK (
        video_link IS NULL OR video_link ~ '^https?://'
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + candidate
CREATE INDEX IF NOT EXISTS idx_interviews_tenant_candidate
    ON app.interviews(tenant_id, candidate_id);

-- Interviewer schedule (my interviews)
CREATE INDEX IF NOT EXISTS idx_interviews_tenant_interviewer_scheduled
    ON app.interviews(tenant_id, interviewer_id, scheduled_at)
    WHERE status = 'scheduled';

-- Date-based lookup (interview calendar)
CREATE INDEX IF NOT EXISTS idx_interviews_tenant_scheduled
    ON app.interviews(tenant_id, scheduled_at);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_interviews_tenant_status
    ON app.interviews(tenant_id, status);

-- Upcoming scheduled interviews
CREATE INDEX IF NOT EXISTS idx_interviews_tenant_upcoming
    ON app.interviews(tenant_id, scheduled_at)
    WHERE status = 'scheduled';

-- Interview type analytics
CREATE INDEX IF NOT EXISTS idx_interviews_tenant_type
    ON app.interviews(tenant_id, interview_type);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.interviews ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see interviews for their current tenant
CREATE POLICY tenant_isolation ON app.interviews
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.interviews
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_interviews_updated_at
    BEFORE UPDATE ON app.interviews
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- State Machine Validation
-- =============================================================================

-- Function to validate interview status transitions
CREATE OR REPLACE FUNCTION app.validate_interview_status_transition()
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
        WHEN 'scheduled' THEN
            -- scheduled can transition to completed, cancelled, or no_show
            IF NEW.status NOT IN ('completed', 'cancelled', 'no_show') THEN
                RAISE EXCEPTION 'Invalid status transition: scheduled can only transition to completed, cancelled, or no_show, not %', NEW.status;
            END IF;

        WHEN 'completed' THEN
            -- completed is a terminal state
            RAISE EXCEPTION 'Invalid status transition: completed is a terminal state';

        WHEN 'cancelled' THEN
            -- cancelled can be rescheduled (back to scheduled)
            IF NEW.status NOT IN ('scheduled') THEN
                RAISE EXCEPTION 'Invalid status transition: cancelled can only transition to scheduled (reschedule), not %', NEW.status;
            END IF;

        WHEN 'no_show' THEN
            -- no_show can be rescheduled
            IF NEW.status NOT IN ('scheduled') THEN
                RAISE EXCEPTION 'Invalid status transition: no_show can only transition to scheduled (reschedule), not %', NEW.status;
            END IF;

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_interview_status_transition
    BEFORE UPDATE OF status ON app.interviews
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_interview_status_transition();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get interviews for a candidate
CREATE OR REPLACE FUNCTION app.get_candidate_interviews(
    p_candidate_id uuid
)
RETURNS TABLE (
    id uuid,
    interviewer_id uuid,
    interview_type app.interview_type,
    scheduled_at timestamptz,
    duration_minutes integer,
    status app.interview_status,
    location text,
    video_link text,
    notes text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.id,
        i.interviewer_id,
        i.interview_type,
        i.scheduled_at,
        i.duration_minutes,
        i.status,
        i.location,
        i.video_link,
        i.notes,
        i.created_at
    FROM app.interviews i
    WHERE i.candidate_id = p_candidate_id
    ORDER BY i.scheduled_at ASC;
END;
$$;

-- Function to get interviewer's schedule
CREATE OR REPLACE FUNCTION app.get_interviewer_schedule(
    p_interviewer_id uuid,
    p_from_date date DEFAULT CURRENT_DATE,
    p_to_date date DEFAULT CURRENT_DATE + interval '7 days'
)
RETURNS TABLE (
    id uuid,
    candidate_id uuid,
    interview_type app.interview_type,
    scheduled_at timestamptz,
    duration_minutes integer,
    status app.interview_status,
    location text,
    video_link text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.id,
        i.candidate_id,
        i.interview_type,
        i.scheduled_at,
        i.duration_minutes,
        i.status,
        i.location,
        i.video_link
    FROM app.interviews i
    WHERE i.interviewer_id = p_interviewer_id
      AND i.scheduled_at >= p_from_date
      AND i.scheduled_at < p_to_date + interval '1 day'
      AND i.status = 'scheduled'
    ORDER BY i.scheduled_at ASC;
END;
$$;

-- Function to check for scheduling conflicts
CREATE OR REPLACE FUNCTION app.check_interview_conflicts(
    p_interviewer_id uuid,
    p_scheduled_at timestamptz,
    p_duration_minutes integer,
    p_exclude_interview_id uuid DEFAULT NULL
)
RETURNS TABLE (
    conflicting_interview_id uuid,
    scheduled_at timestamptz,
    duration_minutes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_end_time timestamptz;
BEGIN
    v_end_time := p_scheduled_at + (p_duration_minutes || ' minutes')::interval;

    RETURN QUERY
    SELECT
        i.id,
        i.scheduled_at,
        i.duration_minutes
    FROM app.interviews i
    WHERE i.interviewer_id = p_interviewer_id
      AND i.status = 'scheduled'
      AND (p_exclude_interview_id IS NULL OR i.id != p_exclude_interview_id)
      AND (
          -- New interview starts during existing interview
          (p_scheduled_at >= i.scheduled_at AND p_scheduled_at < i.scheduled_at + (i.duration_minutes || ' minutes')::interval)
          OR
          -- New interview ends during existing interview
          (v_end_time > i.scheduled_at AND v_end_time <= i.scheduled_at + (i.duration_minutes || ' minutes')::interval)
          OR
          -- New interview completely encompasses existing interview
          (p_scheduled_at <= i.scheduled_at AND v_end_time >= i.scheduled_at + (i.duration_minutes || ' minutes')::interval)
      );
END;
$$;

-- Function to get interview statistics
CREATE OR REPLACE FUNCTION app.get_interview_stats(
    p_tenant_id uuid,
    p_from_date date DEFAULT now()::date - interval '30 days',
    p_to_date date DEFAULT now()::date
)
RETURNS TABLE (
    total_interviews bigint,
    scheduled_count bigint,
    completed_count bigint,
    cancelled_count bigint,
    no_show_count bigint,
    avg_duration_minutes numeric,
    interviews_by_type jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::bigint AS total_interviews,
        COUNT(*) FILTER (WHERE i.status = 'scheduled')::bigint AS scheduled_count,
        COUNT(*) FILTER (WHERE i.status = 'completed')::bigint AS completed_count,
        COUNT(*) FILTER (WHERE i.status = 'cancelled')::bigint AS cancelled_count,
        COUNT(*) FILTER (WHERE i.status = 'no_show')::bigint AS no_show_count,
        ROUND(AVG(i.duration_minutes), 0) AS avg_duration_minutes,
        jsonb_object_agg(
            COALESCE(i.interview_type::text, 'unknown'),
            COALESCE(type_counts.cnt, 0)
        ) AS interviews_by_type
    FROM app.interviews i
    LEFT JOIN (
        SELECT interview_type, COUNT(*) AS cnt
        FROM app.interviews
        WHERE tenant_id = p_tenant_id
          AND created_at::date >= p_from_date
          AND created_at::date <= p_to_date
        GROUP BY interview_type
    ) type_counts ON type_counts.interview_type = i.interview_type
    WHERE i.tenant_id = p_tenant_id
      AND i.created_at::date >= p_from_date
      AND i.created_at::date <= p_to_date;
END;
$$;

-- Function to reschedule an interview
CREATE OR REPLACE FUNCTION app.reschedule_interview(
    p_interview_id uuid,
    p_new_scheduled_at timestamptz,
    p_new_duration_minutes integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_status app.interview_status;
    v_interviewer_id uuid;
    v_duration integer;
    v_conflict_count integer;
BEGIN
    -- Get current interview details
    SELECT status, interviewer_id, duration_minutes
    INTO v_current_status, v_interviewer_id, v_duration
    FROM app.interviews
    WHERE id = p_interview_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Interview not found: %', p_interview_id;
    END IF;

    -- Use new duration if provided
    v_duration := COALESCE(p_new_duration_minutes, v_duration);

    -- Check for conflicts
    SELECT COUNT(*) INTO v_conflict_count
    FROM app.check_interview_conflicts(v_interviewer_id, p_new_scheduled_at, v_duration, p_interview_id);

    IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 'Schedule conflict: interviewer has % conflicting interview(s)', v_conflict_count;
    END IF;

    -- Update the interview
    UPDATE app.interviews
    SET scheduled_at = p_new_scheduled_at,
        duration_minutes = v_duration,
        status = 'scheduled',
        updated_at = now()
    WHERE id = p_interview_id;

    RETURN true;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.interviews IS 'Scheduled interviews with candidates including type, time, location, and status';
COMMENT ON COLUMN app.interviews.id IS 'Primary UUID identifier for the interview';
COMMENT ON COLUMN app.interviews.tenant_id IS 'Tenant that owns this interview';
COMMENT ON COLUMN app.interviews.candidate_id IS 'Candidate being interviewed';
COMMENT ON COLUMN app.interviews.interviewer_id IS 'Primary interviewer (lead for panel interviews)';
COMMENT ON COLUMN app.interviews.interview_type IS 'Type of interview (phone, video, onsite, panel)';
COMMENT ON COLUMN app.interviews.scheduled_at IS 'Scheduled start time';
COMMENT ON COLUMN app.interviews.duration_minutes IS 'Expected duration in minutes';
COMMENT ON COLUMN app.interviews.status IS 'Current status (scheduled, completed, cancelled, no_show)';
COMMENT ON COLUMN app.interviews.location IS 'Physical location for onsite interviews';
COMMENT ON COLUMN app.interviews.video_link IS 'Video call link for remote interviews';
COMMENT ON COLUMN app.interviews.notes IS 'Interview notes or agenda';
COMMENT ON FUNCTION app.validate_interview_status_transition IS 'Enforces valid interview status transitions';
COMMENT ON FUNCTION app.get_candidate_interviews IS 'Returns all interviews for a candidate';
COMMENT ON FUNCTION app.get_interviewer_schedule IS 'Returns upcoming interviews for an interviewer';
COMMENT ON FUNCTION app.check_interview_conflicts IS 'Checks for scheduling conflicts';
COMMENT ON FUNCTION app.get_interview_stats IS 'Returns interview statistics for a tenant';
COMMENT ON FUNCTION app.reschedule_interview IS 'Reschedules an interview with conflict checking';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.reschedule_interview(uuid, timestamptz, integer);
-- DROP FUNCTION IF EXISTS app.get_interview_stats(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.check_interview_conflicts(uuid, timestamptz, integer, uuid);
-- DROP FUNCTION IF EXISTS app.get_interviewer_schedule(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.get_candidate_interviews(uuid);
-- DROP TRIGGER IF EXISTS validate_interview_status_transition ON app.interviews;
-- DROP FUNCTION IF EXISTS app.validate_interview_status_transition();
-- DROP TRIGGER IF EXISTS update_interviews_updated_at ON app.interviews;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.interviews;
-- DROP POLICY IF EXISTS tenant_isolation ON app.interviews;
-- DROP INDEX IF EXISTS app.idx_interviews_tenant_type;
-- DROP INDEX IF EXISTS app.idx_interviews_tenant_upcoming;
-- DROP INDEX IF EXISTS app.idx_interviews_tenant_status;
-- DROP INDEX IF EXISTS app.idx_interviews_tenant_scheduled;
-- DROP INDEX IF EXISTS app.idx_interviews_tenant_interviewer_scheduled;
-- DROP INDEX IF EXISTS app.idx_interviews_tenant_candidate;
-- DROP TABLE IF EXISTS app.interviews;
