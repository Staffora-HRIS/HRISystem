-- Migration: 0032_workflow_transitions
-- Created: 2026-01-07
-- Description: Create the workflow_transitions table - immutable transition history
--              This table is APPEND-ONLY - no updates or deletes allowed
--              Tracks all state transitions for compliance, debugging, and analytics

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Workflow Transitions Table
-- -----------------------------------------------------------------------------
-- Immutable record of all workflow state transitions
-- Used for audit trail, debugging, and workflow analytics
-- NO UPDATE OR DELETE ALLOWED
CREATE TABLE IF NOT EXISTS app.workflow_transitions (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant where this transition occurred
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Parent workflow instance
    instance_id uuid NOT NULL REFERENCES app.workflow_instances(id) ON DELETE CASCADE,

    -- Related task (if transition was from a task action)
    task_id uuid REFERENCES app.workflow_tasks(id) ON DELETE SET NULL,

    -- Status transition
    from_status varchar(50),  -- NULL for initial state
    to_status varchar(50) NOT NULL,

    -- Step transition
    from_step_index integer,  -- NULL for initial state
    to_step_index integer,

    -- Action that caused the transition
    action app.workflow_action_type,

    -- User who triggered the transition (NULL for system/automated)
    actor_id uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Comment or reason for the transition
    comment text,

    -- Snapshot of instance context at transition time
    -- Useful for debugging and understanding state at each step
    context_snapshot jsonb,

    -- When the transition occurred
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Transitions by instance (most common query)
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_instance_id
    ON app.workflow_transitions(instance_id, created_at ASC);

-- Tenant filtering
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_tenant_id
    ON app.workflow_transitions(tenant_id, created_at DESC);

-- Transitions by actor (user activity tracking)
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_actor_id
    ON app.workflow_transitions(actor_id, created_at DESC)
    WHERE actor_id IS NOT NULL;

-- Transitions by task
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_task_id
    ON app.workflow_transitions(task_id)
    WHERE task_id IS NOT NULL;

-- Action filtering (for analytics)
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_tenant_action
    ON app.workflow_transitions(tenant_id, action, created_at DESC)
    WHERE action IS NOT NULL;

-- Status transition patterns (for analytics)
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_status_pattern
    ON app.workflow_transitions(tenant_id, from_status, to_status);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.workflow_transitions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read workflow transitions for their current tenant
CREATE POLICY tenant_isolation_select ON app.workflow_transitions
    FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy: Allow inserts only through SECURITY DEFINER function
CREATE POLICY transition_insert_policy ON app.workflow_transitions
    FOR INSERT
    WITH CHECK (app.is_system_context());

-- =============================================================================
-- Prevent Updates and Deletes
-- =============================================================================

-- Trigger to prevent updates (transition log is immutable)
CREATE TRIGGER prevent_workflow_transitions_update
    BEFORE UPDATE ON app.workflow_transitions
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_update();

-- Trigger to prevent deletes (transition log is immutable)
CREATE TRIGGER prevent_workflow_transitions_delete
    BEFORE DELETE ON app.workflow_transitions
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_delete();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to record a workflow transition (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION app.record_workflow_transition(
    p_tenant_id uuid,
    p_instance_id uuid,
    p_task_id uuid DEFAULT NULL,
    p_from_status varchar(50) DEFAULT NULL,
    p_to_status varchar(50) DEFAULT NULL,
    p_from_step_index integer DEFAULT NULL,
    p_to_step_index integer DEFAULT NULL,
    p_action app.workflow_action_type DEFAULT NULL,
    p_actor_id uuid DEFAULT NULL,
    p_comment text DEFAULT NULL,
    p_context_snapshot jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_transition_id uuid;
BEGIN
    -- Enable system context for insert
    PERFORM app.enable_system_context();

    INSERT INTO app.workflow_transitions (
        tenant_id,
        instance_id,
        task_id,
        from_status,
        to_status,
        from_step_index,
        to_step_index,
        action,
        actor_id,
        comment,
        context_snapshot,
        created_at
    )
    VALUES (
        p_tenant_id,
        p_instance_id,
        p_task_id,
        p_from_status,
        p_to_status,
        p_from_step_index,
        p_to_step_index,
        p_action,
        p_actor_id,
        p_comment,
        p_context_snapshot,
        now()
    )
    RETURNING id INTO v_transition_id;

    -- Disable system context
    PERFORM app.disable_system_context();

    RETURN v_transition_id;
END;
$$;

-- Function to get transition history for a workflow instance
CREATE OR REPLACE FUNCTION app.get_workflow_transition_history(
    p_instance_id uuid
)
RETURNS TABLE (
    id uuid,
    task_id uuid,
    from_status varchar(50),
    to_status varchar(50),
    from_step_index integer,
    to_step_index integer,
    action app.workflow_action_type,
    actor_id uuid,
    comment text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wt.id,
        wt.task_id,
        wt.from_status,
        wt.to_status,
        wt.from_step_index,
        wt.to_step_index,
        wt.action,
        wt.actor_id,
        wt.comment,
        wt.created_at
    FROM app.workflow_transitions wt
    WHERE wt.instance_id = p_instance_id
    ORDER BY wt.created_at ASC;
END;
$$;

-- Function to get user's recent workflow actions
CREATE OR REPLACE FUNCTION app.get_user_workflow_actions(
    p_tenant_id uuid,
    p_user_id uuid,
    p_from_date timestamptz DEFAULT now() - interval '30 days',
    p_limit integer DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    instance_id uuid,
    definition_code varchar(100),
    definition_name varchar(255),
    action app.workflow_action_type,
    comment text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wtr.id,
        wtr.instance_id,
        wd.code AS definition_code,
        wd.name AS definition_name,
        wtr.action,
        wtr.comment,
        wtr.created_at
    FROM app.workflow_transitions wtr
    JOIN app.workflow_instances wi ON wi.id = wtr.instance_id
    JOIN app.workflow_definitions wd ON wd.id = wi.definition_id
    WHERE wtr.tenant_id = p_tenant_id
      AND wtr.actor_id = p_user_id
      AND wtr.created_at >= p_from_date
      AND wtr.action IS NOT NULL
    ORDER BY wtr.created_at DESC
    LIMIT p_limit;
END;
$$;

-- Function to analyze workflow transition patterns
CREATE OR REPLACE FUNCTION app.analyze_workflow_transitions(
    p_tenant_id uuid,
    p_definition_id uuid DEFAULT NULL,
    p_from_date timestamptz DEFAULT now() - interval '30 days',
    p_to_date timestamptz DEFAULT now()
)
RETURNS TABLE (
    from_status varchar(50),
    to_status varchar(50),
    action app.workflow_action_type,
    transition_count bigint,
    avg_time_to_transition_hours numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH transitions_with_prev AS (
        SELECT
            wtr.*,
            wi.definition_id,
            LAG(wtr.created_at) OVER (PARTITION BY wtr.instance_id ORDER BY wtr.created_at) AS prev_created_at
        FROM app.workflow_transitions wtr
        JOIN app.workflow_instances wi ON wi.id = wtr.instance_id
        WHERE wtr.tenant_id = p_tenant_id
          AND wtr.created_at >= p_from_date
          AND wtr.created_at <= p_to_date
          AND (p_definition_id IS NULL OR wi.definition_id = p_definition_id)
    )
    SELECT
        t.from_status,
        t.to_status,
        t.action,
        COUNT(*)::bigint AS transition_count,
        ROUND(AVG(
            EXTRACT(EPOCH FROM (t.created_at - t.prev_created_at)) / 3600
        ), 2) AS avg_time_to_transition_hours
    FROM transitions_with_prev t
    GROUP BY t.from_status, t.to_status, t.action
    ORDER BY transition_count DESC;
END;
$$;

-- Function to get action distribution by workflow
CREATE OR REPLACE FUNCTION app.get_workflow_action_distribution(
    p_tenant_id uuid,
    p_from_date timestamptz DEFAULT now() - interval '30 days',
    p_to_date timestamptz DEFAULT now()
)
RETURNS TABLE (
    definition_id uuid,
    definition_code varchar(100),
    definition_name varchar(255),
    approve_count bigint,
    reject_count bigint,
    delegate_count bigint,
    escalate_count bigint,
    request_info_count bigint,
    approval_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wi.definition_id,
        wd.code AS definition_code,
        wd.name AS definition_name,
        COUNT(*) FILTER (WHERE wtr.action = 'approve')::bigint AS approve_count,
        COUNT(*) FILTER (WHERE wtr.action = 'reject')::bigint AS reject_count,
        COUNT(*) FILTER (WHERE wtr.action = 'delegate')::bigint AS delegate_count,
        COUNT(*) FILTER (WHERE wtr.action = 'escalate')::bigint AS escalate_count,
        COUNT(*) FILTER (WHERE wtr.action = 'request_info')::bigint AS request_info_count,
        ROUND(
            COUNT(*) FILTER (WHERE wtr.action = 'approve')::numeric /
            NULLIF(COUNT(*) FILTER (WHERE wtr.action IN ('approve', 'reject'))::numeric, 0) * 100,
            2
        ) AS approval_rate
    FROM app.workflow_transitions wtr
    JOIN app.workflow_instances wi ON wi.id = wtr.instance_id
    JOIN app.workflow_definitions wd ON wd.id = wi.definition_id
    WHERE wtr.tenant_id = p_tenant_id
      AND wtr.created_at >= p_from_date
      AND wtr.created_at <= p_to_date
      AND wtr.action IS NOT NULL
    GROUP BY wi.definition_id, wd.code, wd.name
    ORDER BY (approve_count + reject_count) DESC;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.workflow_transitions IS 'Immutable record of workflow state transitions. No updates or deletes allowed.';
COMMENT ON COLUMN app.workflow_transitions.id IS 'Primary UUID identifier for the transition';
COMMENT ON COLUMN app.workflow_transitions.tenant_id IS 'Tenant where this transition occurred';
COMMENT ON COLUMN app.workflow_transitions.instance_id IS 'Parent workflow instance';
COMMENT ON COLUMN app.workflow_transitions.task_id IS 'Related task (if from a task action)';
COMMENT ON COLUMN app.workflow_transitions.from_status IS 'Previous status (NULL for initial state)';
COMMENT ON COLUMN app.workflow_transitions.to_status IS 'New status';
COMMENT ON COLUMN app.workflow_transitions.from_step_index IS 'Previous step index';
COMMENT ON COLUMN app.workflow_transitions.to_step_index IS 'New step index';
COMMENT ON COLUMN app.workflow_transitions.action IS 'Action that caused the transition';
COMMENT ON COLUMN app.workflow_transitions.actor_id IS 'User who triggered the transition';
COMMENT ON COLUMN app.workflow_transitions.comment IS 'Comment or reason for the transition';
COMMENT ON COLUMN app.workflow_transitions.context_snapshot IS 'Snapshot of instance context at transition time';
COMMENT ON FUNCTION app.record_workflow_transition IS 'Records a workflow transition (use this instead of direct INSERT)';
COMMENT ON FUNCTION app.get_workflow_transition_history IS 'Returns transition history for a workflow instance';
COMMENT ON FUNCTION app.get_user_workflow_actions IS 'Returns recent workflow actions by a user';
COMMENT ON FUNCTION app.analyze_workflow_transitions IS 'Analyzes transition patterns for workflows';
COMMENT ON FUNCTION app.get_workflow_action_distribution IS 'Returns action distribution statistics by workflow';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_workflow_action_distribution(uuid, timestamptz, timestamptz);
-- DROP FUNCTION IF EXISTS app.analyze_workflow_transitions(uuid, uuid, timestamptz, timestamptz);
-- DROP FUNCTION IF EXISTS app.get_user_workflow_actions(uuid, uuid, timestamptz, integer);
-- DROP FUNCTION IF EXISTS app.get_workflow_transition_history(uuid);
-- DROP FUNCTION IF EXISTS app.record_workflow_transition(uuid, uuid, uuid, varchar, varchar, integer, integer, app.workflow_action_type, uuid, text, jsonb);
-- DROP TRIGGER IF EXISTS prevent_workflow_transitions_delete ON app.workflow_transitions;
-- DROP TRIGGER IF EXISTS prevent_workflow_transitions_update ON app.workflow_transitions;
-- DROP POLICY IF EXISTS transition_insert_policy ON app.workflow_transitions;
-- DROP POLICY IF EXISTS tenant_isolation_select ON app.workflow_transitions;
-- DROP INDEX IF EXISTS app.idx_workflow_transitions_status_pattern;
-- DROP INDEX IF EXISTS app.idx_workflow_transitions_tenant_action;
-- DROP INDEX IF EXISTS app.idx_workflow_transitions_task_id;
-- DROP INDEX IF EXISTS app.idx_workflow_transitions_actor_id;
-- DROP INDEX IF EXISTS app.idx_workflow_transitions_tenant_id;
-- DROP INDEX IF EXISTS app.idx_workflow_transitions_instance_id;
-- DROP TABLE IF EXISTS app.workflow_transitions;
