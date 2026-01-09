-- Migration: 0061_interview_feedback
-- Created: 2026-01-07
-- Description: Create the interview_feedback table for interviewer assessments
--              Captures ratings, recommendations, strengths, and concerns from each interview

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Interview Feedback Table
-- -----------------------------------------------------------------------------
-- Captures feedback from interviewers after completed interviews
-- Each interviewer submits their own feedback with rating and recommendation
CREATE TABLE IF NOT EXISTS app.interview_feedback (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this feedback
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Interview this feedback is for
    interview_id uuid NOT NULL REFERENCES app.interviews(id) ON DELETE CASCADE,

    -- Interviewer providing the feedback
    interviewer_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Overall rating (1-5 stars)
    rating integer NOT NULL,

    -- Hiring recommendation
    recommendation app.recommendation NOT NULL,

    -- Qualitative feedback
    strengths text,
    concerns text,
    notes text,

    -- When feedback was submitted
    submitted_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- One feedback per interviewer per interview
    CONSTRAINT interview_feedback_unique UNIQUE (interview_id, interviewer_id),

    -- Rating must be 1-5
    CONSTRAINT interview_feedback_rating_range CHECK (
        rating >= 1 AND rating <= 5
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + interview
CREATE INDEX IF NOT EXISTS idx_interview_feedback_tenant_interview
    ON app.interview_feedback(tenant_id, interview_id);

-- Interviewer's feedback history
CREATE INDEX IF NOT EXISTS idx_interview_feedback_tenant_interviewer
    ON app.interview_feedback(tenant_id, interviewer_id, submitted_at DESC);

-- Recommendation filtering (find strong hires)
CREATE INDEX IF NOT EXISTS idx_interview_feedback_tenant_recommendation
    ON app.interview_feedback(tenant_id, recommendation);

-- Rating filtering (find high-rated candidates)
CREATE INDEX IF NOT EXISTS idx_interview_feedback_tenant_rating
    ON app.interview_feedback(tenant_id, rating DESC);

-- Recent feedback
CREATE INDEX IF NOT EXISTS idx_interview_feedback_tenant_submitted
    ON app.interview_feedback(tenant_id, submitted_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.interview_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see feedback for their current tenant
CREATE POLICY tenant_isolation ON app.interview_feedback
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.interview_feedback
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get all feedback for an interview
CREATE OR REPLACE FUNCTION app.get_interview_feedback(
    p_interview_id uuid
)
RETURNS TABLE (
    id uuid,
    interviewer_id uuid,
    rating integer,
    recommendation app.recommendation,
    strengths text,
    concerns text,
    notes text,
    submitted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        f.interviewer_id,
        f.rating,
        f.recommendation,
        f.strengths,
        f.concerns,
        f.notes,
        f.submitted_at
    FROM app.interview_feedback f
    WHERE f.interview_id = p_interview_id
    ORDER BY f.submitted_at ASC;
END;
$$;

-- Function to get aggregate feedback for a candidate
CREATE OR REPLACE FUNCTION app.get_candidate_feedback_summary(
    p_candidate_id uuid
)
RETURNS TABLE (
    total_interviews bigint,
    feedback_count bigint,
    avg_rating numeric(3,2),
    strong_hire_count bigint,
    hire_count bigint,
    no_hire_count bigint,
    strong_no_hire_count bigint,
    overall_recommendation text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT i.id)::bigint AS total_interviews,
        COUNT(f.id)::bigint AS feedback_count,
        ROUND(AVG(f.rating), 2) AS avg_rating,
        COUNT(*) FILTER (WHERE f.recommendation = 'strong_hire')::bigint AS strong_hire_count,
        COUNT(*) FILTER (WHERE f.recommendation = 'hire')::bigint AS hire_count,
        COUNT(*) FILTER (WHERE f.recommendation = 'no_hire')::bigint AS no_hire_count,
        COUNT(*) FILTER (WHERE f.recommendation = 'strong_no_hire')::bigint AS strong_no_hire_count,
        CASE
            WHEN COUNT(*) FILTER (WHERE f.recommendation = 'strong_no_hire') > 0 THEN 'Do Not Hire'
            WHEN COUNT(*) FILTER (WHERE f.recommendation = 'no_hire') > COUNT(*) FILTER (WHERE f.recommendation IN ('hire', 'strong_hire')) THEN 'Leaning No'
            WHEN COUNT(*) FILTER (WHERE f.recommendation = 'strong_hire') > COUNT(f.id) / 2 THEN 'Strong Hire'
            WHEN COUNT(*) FILTER (WHERE f.recommendation IN ('hire', 'strong_hire')) > COUNT(*) FILTER (WHERE f.recommendation IN ('no_hire', 'strong_no_hire')) THEN 'Leaning Yes'
            ELSE 'Mixed'
        END AS overall_recommendation
    FROM app.interviews i
    LEFT JOIN app.interview_feedback f ON f.interview_id = i.id
    WHERE i.candidate_id = p_candidate_id;
END;
$$;

-- Function to check if feedback is pending for an interview
CREATE OR REPLACE FUNCTION app.is_feedback_pending(
    p_interview_id uuid,
    p_interviewer_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_feedback_exists boolean;
    v_interview_completed boolean;
BEGIN
    -- Check if interview is completed
    SELECT status = 'completed' INTO v_interview_completed
    FROM app.interviews
    WHERE id = p_interview_id;

    IF NOT v_interview_completed THEN
        RETURN false;
    END IF;

    -- Check if feedback exists
    SELECT EXISTS(
        SELECT 1 FROM app.interview_feedback
        WHERE interview_id = p_interview_id
          AND interviewer_id = p_interviewer_id
    ) INTO v_feedback_exists;

    RETURN NOT v_feedback_exists;
END;
$$;

-- Function to get pending feedback for an interviewer
CREATE OR REPLACE FUNCTION app.get_pending_feedback(
    p_interviewer_id uuid,
    p_limit integer DEFAULT 20
)
RETURNS TABLE (
    interview_id uuid,
    candidate_id uuid,
    interview_type app.interview_type,
    scheduled_at timestamptz,
    days_since_interview integer
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
        EXTRACT(DAY FROM now() - i.scheduled_at)::integer AS days_since_interview
    FROM app.interviews i
    LEFT JOIN app.interview_feedback f ON f.interview_id = i.id AND f.interviewer_id = i.interviewer_id
    WHERE i.interviewer_id = p_interviewer_id
      AND i.status = 'completed'
      AND f.id IS NULL
    ORDER BY i.scheduled_at DESC
    LIMIT p_limit;
END;
$$;

-- Function to submit interview feedback
CREATE OR REPLACE FUNCTION app.submit_interview_feedback(
    p_tenant_id uuid,
    p_interview_id uuid,
    p_interviewer_id uuid,
    p_rating integer,
    p_recommendation app.recommendation,
    p_strengths text DEFAULT NULL,
    p_concerns text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_feedback_id uuid;
    v_interview_status app.interview_status;
BEGIN
    -- Verify interview is completed
    SELECT status INTO v_interview_status
    FROM app.interviews
    WHERE id = p_interview_id;

    IF v_interview_status IS NULL THEN
        RAISE EXCEPTION 'Interview not found: %', p_interview_id;
    END IF;

    IF v_interview_status != 'completed' THEN
        RAISE EXCEPTION 'Cannot submit feedback for interview with status: %', v_interview_status;
    END IF;

    -- Insert feedback
    INSERT INTO app.interview_feedback (
        tenant_id,
        interview_id,
        interviewer_id,
        rating,
        recommendation,
        strengths,
        concerns,
        notes
    )
    VALUES (
        p_tenant_id,
        p_interview_id,
        p_interviewer_id,
        p_rating,
        p_recommendation,
        p_strengths,
        p_concerns,
        p_notes
    )
    RETURNING id INTO v_feedback_id;

    RETURN v_feedback_id;
END;
$$;

-- Function to get interviewer calibration stats
CREATE OR REPLACE FUNCTION app.get_interviewer_calibration_stats(
    p_tenant_id uuid,
    p_from_date date DEFAULT now()::date - interval '90 days',
    p_to_date date DEFAULT now()::date
)
RETURNS TABLE (
    interviewer_id uuid,
    total_interviews bigint,
    avg_rating numeric(3,2),
    strong_hire_pct numeric(5,2),
    hire_pct numeric(5,2),
    no_hire_pct numeric(5,2),
    strong_no_hire_pct numeric(5,2),
    hired_after_strong_hire bigint,
    hired_after_any_recommendation bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.interviewer_id,
        COUNT(*)::bigint AS total_interviews,
        ROUND(AVG(f.rating), 2) AS avg_rating,
        ROUND(COUNT(*) FILTER (WHERE f.recommendation = 'strong_hire')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS strong_hire_pct,
        ROUND(COUNT(*) FILTER (WHERE f.recommendation = 'hire')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS hire_pct,
        ROUND(COUNT(*) FILTER (WHERE f.recommendation = 'no_hire')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS no_hire_pct,
        ROUND(COUNT(*) FILTER (WHERE f.recommendation = 'strong_no_hire')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS strong_no_hire_pct,
        COUNT(*) FILTER (WHERE f.recommendation = 'strong_hire' AND c.current_stage = 'hired')::bigint AS hired_after_strong_hire,
        COUNT(*) FILTER (WHERE f.recommendation IN ('hire', 'strong_hire') AND c.current_stage = 'hired')::bigint AS hired_after_any_recommendation
    FROM app.interview_feedback f
    JOIN app.interviews i ON i.id = f.interview_id
    JOIN app.candidates c ON c.id = i.candidate_id
    WHERE f.tenant_id = p_tenant_id
      AND f.submitted_at::date >= p_from_date
      AND f.submitted_at::date <= p_to_date
    GROUP BY f.interviewer_id
    ORDER BY total_interviews DESC;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.interview_feedback IS 'Interviewer feedback after completed interviews with ratings and recommendations';
COMMENT ON COLUMN app.interview_feedback.id IS 'Primary UUID identifier for the feedback';
COMMENT ON COLUMN app.interview_feedback.tenant_id IS 'Tenant that owns this feedback';
COMMENT ON COLUMN app.interview_feedback.interview_id IS 'Interview this feedback is for';
COMMENT ON COLUMN app.interview_feedback.interviewer_id IS 'Interviewer who provided the feedback';
COMMENT ON COLUMN app.interview_feedback.rating IS 'Overall rating (1-5)';
COMMENT ON COLUMN app.interview_feedback.recommendation IS 'Hiring recommendation';
COMMENT ON COLUMN app.interview_feedback.strengths IS 'Candidate strengths observed';
COMMENT ON COLUMN app.interview_feedback.concerns IS 'Concerns or areas of improvement';
COMMENT ON COLUMN app.interview_feedback.notes IS 'Additional notes';
COMMENT ON COLUMN app.interview_feedback.submitted_at IS 'When feedback was submitted';
COMMENT ON FUNCTION app.get_interview_feedback IS 'Returns all feedback for an interview';
COMMENT ON FUNCTION app.get_candidate_feedback_summary IS 'Returns aggregate feedback summary for a candidate';
COMMENT ON FUNCTION app.is_feedback_pending IS 'Checks if feedback is pending for an interviewer';
COMMENT ON FUNCTION app.get_pending_feedback IS 'Returns interviews pending feedback for an interviewer';
COMMENT ON FUNCTION app.submit_interview_feedback IS 'Submits interview feedback';
COMMENT ON FUNCTION app.get_interviewer_calibration_stats IS 'Returns calibration statistics for interviewers';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_interviewer_calibration_stats(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.submit_interview_feedback(uuid, uuid, uuid, integer, app.recommendation, text, text, text);
-- DROP FUNCTION IF EXISTS app.get_pending_feedback(uuid, integer);
-- DROP FUNCTION IF EXISTS app.is_feedback_pending(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_candidate_feedback_summary(uuid);
-- DROP FUNCTION IF EXISTS app.get_interview_feedback(uuid);
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.interview_feedback;
-- DROP POLICY IF EXISTS tenant_isolation ON app.interview_feedback;
-- DROP INDEX IF EXISTS app.idx_interview_feedback_tenant_submitted;
-- DROP INDEX IF EXISTS app.idx_interview_feedback_tenant_rating;
-- DROP INDEX IF EXISTS app.idx_interview_feedback_tenant_recommendation;
-- DROP INDEX IF EXISTS app.idx_interview_feedback_tenant_interviewer;
-- DROP INDEX IF EXISTS app.idx_interview_feedback_tenant_interview;
-- DROP TABLE IF EXISTS app.interview_feedback;
