-- Migration: 0059_candidate_stage_events
-- Created: 2026-01-07
-- Description: Create the candidate_stage_events table for immutable stage transitions
--              This is an append-only audit trail of all candidate stage changes
--              NO UPDATE or DELETE operations allowed

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Candidate Stage Events Table
-- -----------------------------------------------------------------------------
-- Immutable log of all stage transitions for candidates
-- Provides complete audit trail of hiring process decisions
CREATE TABLE IF NOT EXISTS app.candidate_stage_events (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this event
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Candidate this event relates to
    candidate_id uuid NOT NULL REFERENCES app.candidates(id) ON DELETE CASCADE,

    -- Stage transition
    from_stage app.candidate_stage,  -- NULL for initial application
    to_stage app.candidate_stage NOT NULL,

    -- Reason for the transition
    reason text,

    -- Who made this change
    actor_id uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- When this transition occurred (immutable)
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Cannot transition to the same stage
    CONSTRAINT candidate_stage_events_different_stages CHECK (
        from_stage IS NULL OR from_stage != to_stage
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + candidate (get candidate history)
CREATE INDEX IF NOT EXISTS idx_candidate_stage_events_tenant_candidate
    ON app.candidate_stage_events(tenant_id, candidate_id, created_at DESC);

-- Stage filter (find all rejections, hires, etc.)
CREATE INDEX IF NOT EXISTS idx_candidate_stage_events_tenant_to_stage
    ON app.candidate_stage_events(tenant_id, to_stage, created_at DESC);

-- Actor lookup (decisions by recruiter/hiring manager)
CREATE INDEX IF NOT EXISTS idx_candidate_stage_events_tenant_actor
    ON app.candidate_stage_events(tenant_id, actor_id, created_at DESC)
    WHERE actor_id IS NOT NULL;

-- Time-based queries (recent activity)
CREATE INDEX IF NOT EXISTS idx_candidate_stage_events_tenant_created
    ON app.candidate_stage_events(tenant_id, created_at DESC);

-- Rejections with reasons (for analytics)
CREATE INDEX IF NOT EXISTS idx_candidate_stage_events_rejections
    ON app.candidate_stage_events(tenant_id, created_at DESC)
    WHERE to_stage = 'rejected';

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.candidate_stage_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only READ stage events for their current tenant
-- Note: No UPDATE/DELETE policies as this is immutable
CREATE POLICY tenant_isolation_select ON app.candidate_stage_events
    FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy: Allow inserts through SECURITY DEFINER functions or system context
CREATE POLICY stage_events_insert_policy ON app.candidate_stage_events
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Prevent Updates and Deletes (Immutable Table)
-- =============================================================================

-- Trigger to prevent updates (stage events are immutable)
CREATE TRIGGER prevent_candidate_stage_events_update
    BEFORE UPDATE ON app.candidate_stage_events
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_update();

-- Trigger to prevent deletes (stage events are immutable)
CREATE TRIGGER prevent_candidate_stage_events_delete
    BEFORE DELETE ON app.candidate_stage_events
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_delete();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get stage history for a candidate
CREATE OR REPLACE FUNCTION app.get_candidate_stage_history(
    p_candidate_id uuid
)
RETURNS TABLE (
    id uuid,
    from_stage app.candidate_stage,
    to_stage app.candidate_stage,
    reason text,
    actor_id uuid,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cse.id,
        cse.from_stage,
        cse.to_stage,
        cse.reason,
        cse.actor_id,
        cse.created_at
    FROM app.candidate_stage_events cse
    WHERE cse.candidate_id = p_candidate_id
    ORDER BY cse.created_at ASC;
END;
$$;

-- Function to calculate time in each stage
CREATE OR REPLACE FUNCTION app.get_candidate_stage_durations(
    p_candidate_id uuid
)
RETURNS TABLE (
    stage app.candidate_stage,
    entered_at timestamptz,
    exited_at timestamptz,
    duration_hours numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH stage_transitions AS (
        SELECT
            cse.to_stage AS stage,
            cse.created_at AS entered_at,
            LEAD(cse.created_at) OVER (ORDER BY cse.created_at) AS exited_at
        FROM app.candidate_stage_events cse
        WHERE cse.candidate_id = p_candidate_id
    )
    SELECT
        st.stage,
        st.entered_at,
        st.exited_at,
        ROUND(
            EXTRACT(EPOCH FROM (COALESCE(st.exited_at, now()) - st.entered_at)) / 3600,
            2
        ) AS duration_hours
    FROM stage_transitions st
    ORDER BY st.entered_at ASC;
END;
$$;

-- Function to get rejection reasons analytics
CREATE OR REPLACE FUNCTION app.get_rejection_reason_stats(
    p_tenant_id uuid,
    p_from_date date DEFAULT now()::date - interval '90 days',
    p_to_date date DEFAULT now()::date
)
RETURNS TABLE (
    reason text,
    count bigint,
    percentage numeric(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_total bigint;
BEGIN
    -- Get total rejections
    SELECT COUNT(*) INTO v_total
    FROM app.candidate_stage_events cse
    WHERE cse.tenant_id = p_tenant_id
      AND cse.to_stage = 'rejected'
      AND cse.created_at::date >= p_from_date
      AND cse.created_at::date <= p_to_date;

    RETURN QUERY
    SELECT
        COALESCE(cse.reason, 'Not specified') AS reason,
        COUNT(*)::bigint AS count,
        ROUND(COUNT(*)::numeric / NULLIF(v_total::numeric, 0) * 100, 2) AS percentage
    FROM app.candidate_stage_events cse
    WHERE cse.tenant_id = p_tenant_id
      AND cse.to_stage = 'rejected'
      AND cse.created_at::date >= p_from_date
      AND cse.created_at::date <= p_to_date
    GROUP BY COALESCE(cse.reason, 'Not specified')
    ORDER BY count DESC;
END;
$$;

-- Function to get stage transition metrics
CREATE OR REPLACE FUNCTION app.get_stage_transition_metrics(
    p_tenant_id uuid,
    p_requisition_id uuid DEFAULT NULL,
    p_from_date date DEFAULT now()::date - interval '90 days',
    p_to_date date DEFAULT now()::date
)
RETURNS TABLE (
    from_stage app.candidate_stage,
    to_stage app.candidate_stage,
    transition_count bigint,
    avg_time_hours numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH stage_transitions AS (
        SELECT
            cse.candidate_id,
            cse.from_stage,
            cse.to_stage,
            cse.created_at,
            LAG(cse.created_at) OVER (PARTITION BY cse.candidate_id ORDER BY cse.created_at) AS prev_transition_at
        FROM app.candidate_stage_events cse
        JOIN app.candidates c ON c.id = cse.candidate_id
        WHERE cse.tenant_id = p_tenant_id
          AND cse.created_at::date >= p_from_date
          AND cse.created_at::date <= p_to_date
          AND (p_requisition_id IS NULL OR c.requisition_id = p_requisition_id)
    )
    SELECT
        st.from_stage,
        st.to_stage,
        COUNT(*)::bigint AS transition_count,
        ROUND(
            AVG(EXTRACT(EPOCH FROM (st.created_at - st.prev_transition_at)) / 3600),
            2
        ) AS avg_time_hours
    FROM stage_transitions st
    WHERE st.from_stage IS NOT NULL
    GROUP BY st.from_stage, st.to_stage
    ORDER BY transition_count DESC;
END;
$$;

-- Function to write a stage event (secure insert)
CREATE OR REPLACE FUNCTION app.write_candidate_stage_event(
    p_tenant_id uuid,
    p_candidate_id uuid,
    p_from_stage app.candidate_stage,
    p_to_stage app.candidate_stage,
    p_actor_id uuid,
    p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_event_id uuid;
BEGIN
    INSERT INTO app.candidate_stage_events (
        tenant_id,
        candidate_id,
        from_stage,
        to_stage,
        reason,
        actor_id
    )
    VALUES (
        p_tenant_id,
        p_candidate_id,
        p_from_stage,
        p_to_stage,
        p_reason,
        p_actor_id
    )
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.candidate_stage_events IS 'Immutable audit trail of candidate stage transitions. No UPDATE or DELETE allowed.';
COMMENT ON COLUMN app.candidate_stage_events.id IS 'Primary UUID identifier for the event';
COMMENT ON COLUMN app.candidate_stage_events.tenant_id IS 'Tenant that owns this event';
COMMENT ON COLUMN app.candidate_stage_events.candidate_id IS 'Candidate this event relates to';
COMMENT ON COLUMN app.candidate_stage_events.from_stage IS 'Previous stage (NULL for initial application)';
COMMENT ON COLUMN app.candidate_stage_events.to_stage IS 'New stage';
COMMENT ON COLUMN app.candidate_stage_events.reason IS 'Reason for the transition';
COMMENT ON COLUMN app.candidate_stage_events.actor_id IS 'User who made the change';
COMMENT ON COLUMN app.candidate_stage_events.created_at IS 'When the transition occurred';
COMMENT ON FUNCTION app.get_candidate_stage_history IS 'Returns chronological stage history for a candidate';
COMMENT ON FUNCTION app.get_candidate_stage_durations IS 'Calculates time spent in each stage';
COMMENT ON FUNCTION app.get_rejection_reason_stats IS 'Returns rejection reason analytics';
COMMENT ON FUNCTION app.get_stage_transition_metrics IS 'Returns stage transition counts and timing';
COMMENT ON FUNCTION app.write_candidate_stage_event IS 'Safely writes a stage transition event';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.write_candidate_stage_event(uuid, uuid, app.candidate_stage, app.candidate_stage, uuid, text);
-- DROP FUNCTION IF EXISTS app.get_stage_transition_metrics(uuid, uuid, date, date);
-- DROP FUNCTION IF EXISTS app.get_rejection_reason_stats(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.get_candidate_stage_durations(uuid);
-- DROP FUNCTION IF EXISTS app.get_candidate_stage_history(uuid);
-- DROP TRIGGER IF EXISTS prevent_candidate_stage_events_delete ON app.candidate_stage_events;
-- DROP TRIGGER IF EXISTS prevent_candidate_stage_events_update ON app.candidate_stage_events;
-- DROP POLICY IF EXISTS stage_events_insert_policy ON app.candidate_stage_events;
-- DROP POLICY IF EXISTS tenant_isolation_select ON app.candidate_stage_events;
-- DROP INDEX IF EXISTS app.idx_candidate_stage_events_rejections;
-- DROP INDEX IF EXISTS app.idx_candidate_stage_events_tenant_created;
-- DROP INDEX IF EXISTS app.idx_candidate_stage_events_tenant_actor;
-- DROP INDEX IF EXISTS app.idx_candidate_stage_events_tenant_to_stage;
-- DROP INDEX IF EXISTS app.idx_candidate_stage_events_tenant_candidate;
-- DROP TABLE IF EXISTS app.candidate_stage_events;
