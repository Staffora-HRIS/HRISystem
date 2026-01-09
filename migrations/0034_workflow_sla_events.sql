-- Migration: 0034_workflow_sla_events
-- Created: 2026-01-07
-- Description: Create the workflow_sla_events table - SLA breach events
--              This table tracks SLA warning and breach events for processing
--              Used by the workflow worker to trigger escalation actions

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Workflow SLA Events Table
-- -----------------------------------------------------------------------------
-- Records of SLA warning and breach events
-- Created by a scheduled job that checks task SLAs
-- Processed by the workflow worker to trigger escalation actions
CREATE TABLE IF NOT EXISTS app.workflow_sla_events (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant where this event occurred
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Related task
    task_id uuid NOT NULL REFERENCES app.workflow_tasks(id) ON DELETE CASCADE,

    -- Related SLA definition
    sla_id uuid NOT NULL REFERENCES app.workflow_slas(id) ON DELETE CASCADE,

    -- Type of event: warning (approaching deadline) or breached (past deadline)
    event_type varchar(50) NOT NULL,

    -- Escalation action to be taken
    escalation_action app.escalation_action NOT NULL,

    -- Target for escalation (copied from SLA at event creation time)
    escalation_target_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
    escalation_target_role_id uuid REFERENCES app.roles(id) ON DELETE SET NULL,

    -- Processing status
    -- NULL = not yet processed, timestamp = when processed
    processed_at timestamptz,

    -- Processing result/notes
    -- Structure: {
    --   "success": true,
    --   "action_taken": "notification_sent",
    --   "notification_id": "uuid",
    --   "error": null
    -- }
    processing_result jsonb,

    -- When the event was created
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Event type must be valid
    CONSTRAINT workflow_sla_events_type_valid CHECK (
        event_type IN ('warning', 'breached')
    ),

    -- Prevent duplicate events for same task/sla/type
    CONSTRAINT workflow_sla_events_unique UNIQUE (task_id, sla_id, event_type)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Unprocessed events (for worker pickup)
CREATE INDEX IF NOT EXISTS idx_workflow_sla_events_unprocessed
    ON app.workflow_sla_events(created_at ASC)
    WHERE processed_at IS NULL;

-- Events by tenant (for tenant-specific processing)
CREATE INDEX IF NOT EXISTS idx_workflow_sla_events_tenant_unprocessed
    ON app.workflow_sla_events(tenant_id, created_at ASC)
    WHERE processed_at IS NULL;

-- Events by task
CREATE INDEX IF NOT EXISTS idx_workflow_sla_events_task_id
    ON app.workflow_sla_events(task_id);

-- Events by SLA (for SLA analytics)
CREATE INDEX IF NOT EXISTS idx_workflow_sla_events_sla_id
    ON app.workflow_sla_events(sla_id, created_at DESC);

-- Event type filtering
CREATE INDEX IF NOT EXISTS idx_workflow_sla_events_tenant_type
    ON app.workflow_sla_events(tenant_id, event_type, created_at DESC);

-- Recent events (for dashboard)
CREATE INDEX IF NOT EXISTS idx_workflow_sla_events_tenant_created
    ON app.workflow_sla_events(tenant_id, created_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.workflow_sla_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see SLA events for their current tenant
CREATE POLICY tenant_isolation ON app.workflow_sla_events
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.workflow_sla_events
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to create an SLA event (called by SLA checker job)
CREATE OR REPLACE FUNCTION app.create_sla_event(
    p_tenant_id uuid,
    p_task_id uuid,
    p_sla_id uuid,
    p_event_type varchar(50)
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_event_id uuid;
    v_sla record;
BEGIN
    -- Get SLA details
    SELECT escalation_action, escalation_target_user_id, escalation_target_role_id
    INTO v_sla
    FROM app.workflow_slas
    WHERE id = p_sla_id;

    IF v_sla IS NULL THEN
        RAISE EXCEPTION 'SLA not found: %', p_sla_id;
    END IF;

    -- Create the event (ignore if duplicate)
    INSERT INTO app.workflow_sla_events (
        tenant_id,
        task_id,
        sla_id,
        event_type,
        escalation_action,
        escalation_target_user_id,
        escalation_target_role_id
    )
    VALUES (
        p_tenant_id,
        p_task_id,
        p_sla_id,
        p_event_type,
        v_sla.escalation_action,
        v_sla.escalation_target_user_id,
        v_sla.escalation_target_role_id
    )
    ON CONFLICT (task_id, sla_id, event_type) DO NOTHING
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$;

-- Function to get unprocessed SLA events (for worker)
CREATE OR REPLACE FUNCTION app.get_unprocessed_sla_events(
    p_limit integer DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    tenant_id uuid,
    task_id uuid,
    sla_id uuid,
    event_type varchar(50),
    escalation_action app.escalation_action,
    escalation_target_user_id uuid,
    escalation_target_role_id uuid,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        se.id,
        se.tenant_id,
        se.task_id,
        se.sla_id,
        se.event_type,
        se.escalation_action,
        se.escalation_target_user_id,
        se.escalation_target_role_id,
        se.created_at
    FROM app.workflow_sla_events se
    WHERE se.processed_at IS NULL
    ORDER BY se.created_at ASC
    LIMIT p_limit;
END;
$$;

-- Function to mark SLA event as processed
CREATE OR REPLACE FUNCTION app.mark_sla_event_processed(
    p_event_id uuid,
    p_result jsonb DEFAULT '{}'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.workflow_sla_events
    SET processed_at = now(),
        processing_result = p_result
    WHERE id = p_event_id
      AND processed_at IS NULL;

    RETURN FOUND;
END;
$$;

-- Function to check tasks for SLA warnings and breaches
-- This should be called by a scheduled job
CREATE OR REPLACE FUNCTION app.check_workflow_task_slas()
RETURNS TABLE (
    events_created integer,
    warnings_created integer,
    breaches_created integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_events_created integer := 0;
    v_warnings_created integer := 0;
    v_breaches_created integer := 0;
    v_task record;
    v_sla record;
    v_event_id uuid;
BEGIN
    -- Find all active tasks with SLA deadlines
    FOR v_task IN
        SELECT
            wt.id AS task_id,
            wt.tenant_id,
            wi.definition_id,
            wt.step_index,
            wt.sla_deadline,
            wt.created_at AS task_created_at
        FROM app.workflow_tasks wt
        JOIN app.workflow_instances wi ON wi.id = wt.instance_id
        WHERE wt.status IN ('pending', 'assigned', 'in_progress')
          AND wt.sla_deadline IS NOT NULL
    LOOP
        -- Get the applicable SLA
        SELECT * INTO v_sla
        FROM app.workflow_slas
        WHERE definition_id = v_task.definition_id
          AND (step_index = v_task.step_index OR step_index IS NULL)
          AND is_active = true
        ORDER BY step_index NULLS LAST
        LIMIT 1;

        IF v_sla IS NOT NULL THEN
            -- Check for breach
            IF v_task.sla_deadline < now() THEN
                -- Create breach event
                SELECT app.create_sla_event(
                    v_task.tenant_id,
                    v_task.task_id,
                    v_sla.id,
                    'breached'
                ) INTO v_event_id;

                IF v_event_id IS NOT NULL THEN
                    v_breaches_created := v_breaches_created + 1;
                    v_events_created := v_events_created + 1;
                END IF;
            -- Check for warning
            ELSIF v_sla.warning_hours IS NOT NULL THEN
                -- Calculate warning time
                IF v_task.task_created_at + (v_sla.warning_hours || ' hours')::interval < now() THEN
                    -- Create warning event
                    SELECT app.create_sla_event(
                        v_task.tenant_id,
                        v_task.task_id,
                        v_sla.id,
                        'warning'
                    ) INTO v_event_id;

                    IF v_event_id IS NOT NULL THEN
                        v_warnings_created := v_warnings_created + 1;
                        v_events_created := v_events_created + 1;
                    END IF;
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_events_created, v_warnings_created, v_breaches_created;
END;
$$;

-- Function to get SLA statistics for a workflow
CREATE OR REPLACE FUNCTION app.get_workflow_sla_stats(
    p_tenant_id uuid,
    p_definition_id uuid DEFAULT NULL,
    p_from_date timestamptz DEFAULT now() - interval '30 days',
    p_to_date timestamptz DEFAULT now()
)
RETURNS TABLE (
    definition_id uuid,
    definition_code varchar(100),
    definition_name varchar(255),
    total_tasks bigint,
    warning_events bigint,
    breach_events bigint,
    breach_rate numeric,
    avg_resolution_hours numeric
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
        COUNT(DISTINCT wt.id)::bigint AS total_tasks,
        COUNT(DISTINCT se.id) FILTER (WHERE se.event_type = 'warning')::bigint AS warning_events,
        COUNT(DISTINCT se.id) FILTER (WHERE se.event_type = 'breached')::bigint AS breach_events,
        ROUND(
            COUNT(DISTINCT se.id) FILTER (WHERE se.event_type = 'breached')::numeric /
            NULLIF(COUNT(DISTINCT wt.id)::numeric, 0) * 100,
            2
        ) AS breach_rate,
        ROUND(AVG(
            EXTRACT(EPOCH FROM (wt.completed_at - wt.created_at)) / 3600
        ) FILTER (WHERE wt.completed_at IS NOT NULL), 2) AS avg_resolution_hours
    FROM app.workflow_tasks wt
    JOIN app.workflow_instances wi ON wi.id = wt.instance_id
    JOIN app.workflow_definitions wd ON wd.id = wi.definition_id
    LEFT JOIN app.workflow_sla_events se ON se.task_id = wt.id
    WHERE wt.tenant_id = p_tenant_id
      AND wt.created_at >= p_from_date
      AND wt.created_at <= p_to_date
      AND (p_definition_id IS NULL OR wi.definition_id = p_definition_id)
    GROUP BY wi.definition_id, wd.code, wd.name
    ORDER BY breach_events DESC, total_tasks DESC;
END;
$$;

-- Function to get recent SLA events for dashboard
CREATE OR REPLACE FUNCTION app.get_recent_sla_events(
    p_tenant_id uuid,
    p_event_type varchar(50) DEFAULT NULL,
    p_limit integer DEFAULT 50
)
RETURNS TABLE (
    id uuid,
    task_id uuid,
    definition_code varchar(100),
    definition_name varchar(255),
    step_name varchar(255),
    event_type varchar(50),
    escalation_action app.escalation_action,
    assigned_to uuid,
    processed_at timestamptz,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        se.id,
        se.task_id,
        wd.code AS definition_code,
        wd.name AS definition_name,
        wt.step_name,
        se.event_type,
        se.escalation_action,
        wt.assigned_to,
        se.processed_at,
        se.created_at
    FROM app.workflow_sla_events se
    JOIN app.workflow_tasks wt ON wt.id = se.task_id
    JOIN app.workflow_instances wi ON wi.id = wt.instance_id
    JOIN app.workflow_definitions wd ON wd.id = wi.definition_id
    WHERE se.tenant_id = p_tenant_id
      AND (p_event_type IS NULL OR se.event_type = p_event_type)
    ORDER BY se.created_at DESC
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.workflow_sla_events IS 'SLA warning and breach events. Processed by workflow worker to trigger escalations.';
COMMENT ON COLUMN app.workflow_sla_events.id IS 'Primary UUID identifier for the event';
COMMENT ON COLUMN app.workflow_sla_events.tenant_id IS 'Tenant where this event occurred';
COMMENT ON COLUMN app.workflow_sla_events.task_id IS 'Related workflow task';
COMMENT ON COLUMN app.workflow_sla_events.sla_id IS 'Related SLA definition';
COMMENT ON COLUMN app.workflow_sla_events.event_type IS 'Type of event: warning or breached';
COMMENT ON COLUMN app.workflow_sla_events.escalation_action IS 'Action to take for this event';
COMMENT ON COLUMN app.workflow_sla_events.escalation_target_user_id IS 'User to escalate to';
COMMENT ON COLUMN app.workflow_sla_events.escalation_target_role_id IS 'Role to escalate to';
COMMENT ON COLUMN app.workflow_sla_events.processed_at IS 'When the event was processed (NULL if pending)';
COMMENT ON COLUMN app.workflow_sla_events.processing_result IS 'Result of processing the event';
COMMENT ON FUNCTION app.create_sla_event IS 'Creates an SLA event for a task';
COMMENT ON FUNCTION app.get_unprocessed_sla_events IS 'Returns unprocessed SLA events for worker processing';
COMMENT ON FUNCTION app.mark_sla_event_processed IS 'Marks an SLA event as processed';
COMMENT ON FUNCTION app.check_workflow_task_slas IS 'Checks all active tasks for SLA warnings and breaches';
COMMENT ON FUNCTION app.get_workflow_sla_stats IS 'Returns SLA statistics for workflows';
COMMENT ON FUNCTION app.get_recent_sla_events IS 'Returns recent SLA events for dashboard';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_recent_sla_events(uuid, varchar, integer);
-- DROP FUNCTION IF EXISTS app.get_workflow_sla_stats(uuid, uuid, timestamptz, timestamptz);
-- DROP FUNCTION IF EXISTS app.check_workflow_task_slas();
-- DROP FUNCTION IF EXISTS app.mark_sla_event_processed(uuid, jsonb);
-- DROP FUNCTION IF EXISTS app.get_unprocessed_sla_events(integer);
-- DROP FUNCTION IF EXISTS app.create_sla_event(uuid, uuid, uuid, varchar);
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.workflow_sla_events;
-- DROP POLICY IF EXISTS tenant_isolation ON app.workflow_sla_events;
-- DROP INDEX IF EXISTS app.idx_workflow_sla_events_tenant_created;
-- DROP INDEX IF EXISTS app.idx_workflow_sla_events_tenant_type;
-- DROP INDEX IF EXISTS app.idx_workflow_sla_events_sla_id;
-- DROP INDEX IF EXISTS app.idx_workflow_sla_events_task_id;
-- DROP INDEX IF EXISTS app.idx_workflow_sla_events_tenant_unprocessed;
-- DROP INDEX IF EXISTS app.idx_workflow_sla_events_unprocessed;
-- DROP TABLE IF EXISTS app.workflow_sla_events;
