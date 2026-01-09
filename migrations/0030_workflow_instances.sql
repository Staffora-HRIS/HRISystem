-- Migration: 0030_workflow_instances
-- Created: 2026-01-07
-- Description: Create the workflow_instances table - running workflow instances
--              This table tracks individual executions of workflow definitions
--              Contains the execution context, current state, and lifecycle timestamps

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Workflow Instances Table
-- -----------------------------------------------------------------------------
-- Running instances of workflows
-- Each instance is a specific execution of a workflow version
-- Tracks current step, context variables, and lifecycle
CREATE TABLE IF NOT EXISTS app.workflow_instances (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant where this workflow is running
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The workflow definition being executed
    definition_id uuid NOT NULL REFERENCES app.workflow_definitions(id) ON DELETE RESTRICT,

    -- The specific version being executed
    -- RESTRICT because we need to keep version for history
    version_id uuid NOT NULL REFERENCES app.workflow_versions(id) ON DELETE RESTRICT,

    -- Current status of the workflow instance
    status app.workflow_instance_status NOT NULL DEFAULT 'pending',

    -- Execution context (variables and entity references)
    -- Structure: {
    --   "entity": { "type": "leave_request", "id": "uuid" },
    --   "requester": { "id": "uuid", "name": "John Doe", "role": "employee" },
    --   "variables": { "total_approved": 0, "comments": [] },
    --   "metadata": { "source": "self_service", "request_id": "abc123" }
    -- }
    context jsonb NOT NULL DEFAULT '{}',

    -- Current step index (0-based)
    current_step_index integer NOT NULL DEFAULT 0,

    -- Lifecycle timestamps
    started_at timestamptz,
    completed_at timestamptz,
    cancelled_at timestamptz,

    -- Who cancelled (if cancelled)
    cancelled_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Error message (if failed)
    error_message text,

    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Constraints
    -- Cannot complete, cancel, or fail a pending workflow
    CONSTRAINT workflow_instances_status_dates CHECK (
        (status = 'pending' AND started_at IS NULL AND completed_at IS NULL AND cancelled_at IS NULL)
        OR (status = 'in_progress' AND started_at IS NOT NULL AND completed_at IS NULL AND cancelled_at IS NULL)
        OR (status = 'completed' AND completed_at IS NOT NULL)
        OR (status = 'cancelled' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)
        OR (status = 'failed')
    ),

    -- Current step index must be non-negative
    CONSTRAINT workflow_instances_step_index_valid CHECK (
        current_step_index >= 0
    ),

    -- Failed instances must have error message
    CONSTRAINT workflow_instances_failed_has_error CHECK (
        status != 'failed' OR error_message IS NOT NULL
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Active workflows by tenant (most common query)
CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant_status
    ON app.workflow_instances(tenant_id, status);

-- Workflows by definition (for analytics)
CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant_definition_status
    ON app.workflow_instances(tenant_id, definition_id, status);

-- Workflows by version (for migration tracking)
CREATE INDEX IF NOT EXISTS idx_workflow_instances_version_id
    ON app.workflow_instances(version_id);

-- Active workflows only (common filter)
CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant_active
    ON app.workflow_instances(tenant_id)
    WHERE status IN ('pending', 'in_progress');

-- Created by user (my workflows)
CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant_created_by
    ON app.workflow_instances(tenant_id, created_by)
    WHERE created_by IS NOT NULL;

-- GIN index for context queries (entity lookups)
CREATE INDEX IF NOT EXISTS idx_workflow_instances_context
    ON app.workflow_instances USING gin(context);

-- Recent workflows (dashboard)
CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant_created_at
    ON app.workflow_instances(tenant_id, created_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.workflow_instances ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see workflow instances for their current tenant
CREATE POLICY tenant_isolation ON app.workflow_instances
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.workflow_instances
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Function to validate workflow instance status transitions
CREATE OR REPLACE FUNCTION app.validate_workflow_instance_status_transition()
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
        WHEN 'pending' THEN
            -- pending can transition to in_progress or cancelled
            IF NEW.status NOT IN ('in_progress', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: pending can only transition to in_progress or cancelled, not %', NEW.status;
            END IF;

        WHEN 'in_progress' THEN
            -- in_progress can transition to completed, cancelled, or failed
            IF NEW.status NOT IN ('completed', 'cancelled', 'failed') THEN
                RAISE EXCEPTION 'Invalid status transition: in_progress can only transition to completed, cancelled, or failed, not %', NEW.status;
            END IF;

        WHEN 'completed' THEN
            -- completed is a terminal state
            RAISE EXCEPTION 'Invalid status transition: completed is a terminal state';

        WHEN 'cancelled' THEN
            -- cancelled is a terminal state
            RAISE EXCEPTION 'Invalid status transition: cancelled is a terminal state';

        WHEN 'failed' THEN
            -- failed is a terminal state
            RAISE EXCEPTION 'Invalid status transition: failed is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_workflow_instance_status_transition
    BEFORE UPDATE OF status ON app.workflow_instances
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_workflow_instance_status_transition();

-- Function to auto-set lifecycle timestamps
CREATE OR REPLACE FUNCTION app.set_workflow_instance_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Set started_at when transitioning to in_progress
    IF NEW.status = 'in_progress' AND (OLD IS NULL OR OLD.status = 'pending') THEN
        NEW.started_at := COALESCE(NEW.started_at, now());
    END IF;

    -- Set completed_at when transitioning to completed
    IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
        NEW.completed_at := COALESCE(NEW.completed_at, now());
    END IF;

    -- Set cancelled_at when transitioning to cancelled
    IF NEW.status = 'cancelled' AND (OLD IS NULL OR OLD.status != 'cancelled') THEN
        NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER set_workflow_instance_timestamps
    BEFORE INSERT OR UPDATE OF status ON app.workflow_instances
    FOR EACH ROW
    EXECUTE FUNCTION app.set_workflow_instance_timestamps();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to start a new workflow instance
CREATE OR REPLACE FUNCTION app.start_workflow_instance(
    p_tenant_id uuid,
    p_definition_code varchar(100),
    p_context jsonb,
    p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_definition_id uuid;
    v_version_id uuid;
    v_instance_id uuid;
BEGIN
    -- Get the active workflow definition and version
    SELECT wd.id, wv.id
    INTO v_definition_id, v_version_id
    FROM app.workflow_definitions wd
    JOIN app.workflow_versions wv ON wv.definition_id = wd.id AND wv.status = 'active'
    WHERE wd.tenant_id = p_tenant_id
      AND wd.code = p_definition_code
      AND wd.is_active = true;

    IF v_definition_id IS NULL THEN
        RAISE EXCEPTION 'No active workflow definition found for code: %', p_definition_code;
    END IF;

    IF v_version_id IS NULL THEN
        RAISE EXCEPTION 'No active version found for workflow: %', p_definition_code;
    END IF;

    -- Create the workflow instance
    INSERT INTO app.workflow_instances (
        tenant_id,
        definition_id,
        version_id,
        status,
        context,
        created_by
    )
    VALUES (
        p_tenant_id,
        v_definition_id,
        v_version_id,
        'pending',
        p_context,
        p_user_id
    )
    RETURNING id INTO v_instance_id;

    RETURN v_instance_id;
END;
$$;

-- Function to get active workflow instances for a tenant
CREATE OR REPLACE FUNCTION app.get_active_workflow_instances(
    p_tenant_id uuid,
    p_definition_id uuid DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    definition_id uuid,
    definition_code varchar(100),
    definition_name varchar(255),
    version integer,
    status app.workflow_instance_status,
    current_step_index integer,
    context jsonb,
    started_at timestamptz,
    created_at timestamptz,
    created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wi.id,
        wi.definition_id,
        wd.code AS definition_code,
        wd.name AS definition_name,
        wv.version,
        wi.status,
        wi.current_step_index,
        wi.context,
        wi.started_at,
        wi.created_at,
        wi.created_by
    FROM app.workflow_instances wi
    JOIN app.workflow_definitions wd ON wd.id = wi.definition_id
    JOIN app.workflow_versions wv ON wv.id = wi.version_id
    WHERE wi.tenant_id = p_tenant_id
      AND wi.status IN ('pending', 'in_progress')
      AND (p_definition_id IS NULL OR wi.definition_id = p_definition_id)
    ORDER BY wi.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get workflow instances for an entity
CREATE OR REPLACE FUNCTION app.get_workflow_instances_for_entity(
    p_tenant_id uuid,
    p_entity_type varchar(100),
    p_entity_id uuid
)
RETURNS TABLE (
    id uuid,
    definition_code varchar(100),
    definition_name varchar(255),
    status app.workflow_instance_status,
    current_step_index integer,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wi.id,
        wd.code AS definition_code,
        wd.name AS definition_name,
        wi.status,
        wi.current_step_index,
        wi.started_at,
        wi.completed_at,
        wi.created_at
    FROM app.workflow_instances wi
    JOIN app.workflow_definitions wd ON wd.id = wi.definition_id
    WHERE wi.tenant_id = p_tenant_id
      AND wi.context->'entity'->>'type' = p_entity_type
      AND wi.context->'entity'->>'id' = p_entity_id::text
    ORDER BY wi.created_at DESC;
END;
$$;

-- Function to cancel a workflow instance
CREATE OR REPLACE FUNCTION app.cancel_workflow_instance(
    p_instance_id uuid,
    p_user_id uuid,
    p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_status app.workflow_instance_status;
BEGIN
    -- Get current status
    SELECT status INTO v_current_status
    FROM app.workflow_instances
    WHERE id = p_instance_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Workflow instance not found: %', p_instance_id;
    END IF;

    IF v_current_status NOT IN ('pending', 'in_progress') THEN
        RAISE EXCEPTION 'Cannot cancel workflow in status: %', v_current_status;
    END IF;

    -- Cancel the instance
    UPDATE app.workflow_instances
    SET status = 'cancelled',
        cancelled_by = p_user_id,
        cancelled_at = now(),
        error_message = p_reason
    WHERE id = p_instance_id;

    RETURN true;
END;
$$;

-- Function to get workflow instance statistics
CREATE OR REPLACE FUNCTION app.get_workflow_instance_stats(
    p_tenant_id uuid,
    p_from_date timestamptz DEFAULT now() - interval '30 days',
    p_to_date timestamptz DEFAULT now()
)
RETURNS TABLE (
    definition_id uuid,
    definition_code varchar(100),
    definition_name varchar(255),
    total_instances bigint,
    pending_count bigint,
    in_progress_count bigint,
    completed_count bigint,
    cancelled_count bigint,
    failed_count bigint,
    avg_completion_time_hours numeric
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
        COUNT(*)::bigint AS total_instances,
        COUNT(*) FILTER (WHERE wi.status = 'pending')::bigint AS pending_count,
        COUNT(*) FILTER (WHERE wi.status = 'in_progress')::bigint AS in_progress_count,
        COUNT(*) FILTER (WHERE wi.status = 'completed')::bigint AS completed_count,
        COUNT(*) FILTER (WHERE wi.status = 'cancelled')::bigint AS cancelled_count,
        COUNT(*) FILTER (WHERE wi.status = 'failed')::bigint AS failed_count,
        ROUND(AVG(
            EXTRACT(EPOCH FROM (wi.completed_at - wi.started_at)) / 3600
        ) FILTER (WHERE wi.status = 'completed'), 2) AS avg_completion_time_hours
    FROM app.workflow_instances wi
    JOIN app.workflow_definitions wd ON wd.id = wi.definition_id
    WHERE wi.tenant_id = p_tenant_id
      AND wi.created_at >= p_from_date
      AND wi.created_at <= p_to_date
    GROUP BY wi.definition_id, wd.code, wd.name
    ORDER BY total_instances DESC;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.workflow_instances IS 'Running workflow instances. Each instance is a specific execution of a workflow version.';
COMMENT ON COLUMN app.workflow_instances.id IS 'Primary UUID identifier for the workflow instance';
COMMENT ON COLUMN app.workflow_instances.tenant_id IS 'Tenant where this workflow is running';
COMMENT ON COLUMN app.workflow_instances.definition_id IS 'The workflow definition being executed';
COMMENT ON COLUMN app.workflow_instances.version_id IS 'The specific workflow version being executed';
COMMENT ON COLUMN app.workflow_instances.status IS 'Current status (pending, in_progress, completed, cancelled, failed)';
COMMENT ON COLUMN app.workflow_instances.context IS 'Execution context with entity references and variables';
COMMENT ON COLUMN app.workflow_instances.current_step_index IS 'Current step index (0-based)';
COMMENT ON COLUMN app.workflow_instances.started_at IS 'When workflow execution started';
COMMENT ON COLUMN app.workflow_instances.completed_at IS 'When workflow completed successfully';
COMMENT ON COLUMN app.workflow_instances.cancelled_at IS 'When workflow was cancelled';
COMMENT ON COLUMN app.workflow_instances.cancelled_by IS 'User who cancelled the workflow';
COMMENT ON COLUMN app.workflow_instances.error_message IS 'Error message if workflow failed';
COMMENT ON FUNCTION app.validate_workflow_instance_status_transition IS 'Enforces valid status transitions';
COMMENT ON FUNCTION app.set_workflow_instance_timestamps IS 'Auto-sets lifecycle timestamps';
COMMENT ON FUNCTION app.start_workflow_instance IS 'Starts a new workflow instance from a definition code';
COMMENT ON FUNCTION app.get_active_workflow_instances IS 'Returns active workflow instances for a tenant';
COMMENT ON FUNCTION app.get_workflow_instances_for_entity IS 'Returns workflow instances for a specific entity';
COMMENT ON FUNCTION app.cancel_workflow_instance IS 'Cancels a workflow instance';
COMMENT ON FUNCTION app.get_workflow_instance_stats IS 'Returns workflow statistics for a tenant';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_workflow_instance_stats(uuid, timestamptz, timestamptz);
-- DROP FUNCTION IF EXISTS app.cancel_workflow_instance(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS app.get_workflow_instances_for_entity(uuid, varchar, uuid);
-- DROP FUNCTION IF EXISTS app.get_active_workflow_instances(uuid, uuid, integer, integer);
-- DROP FUNCTION IF EXISTS app.start_workflow_instance(uuid, varchar, jsonb, uuid);
-- DROP TRIGGER IF EXISTS set_workflow_instance_timestamps ON app.workflow_instances;
-- DROP FUNCTION IF EXISTS app.set_workflow_instance_timestamps();
-- DROP TRIGGER IF EXISTS validate_workflow_instance_status_transition ON app.workflow_instances;
-- DROP FUNCTION IF EXISTS app.validate_workflow_instance_status_transition();
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.workflow_instances;
-- DROP POLICY IF EXISTS tenant_isolation ON app.workflow_instances;
-- DROP INDEX IF EXISTS app.idx_workflow_instances_tenant_created_at;
-- DROP INDEX IF EXISTS app.idx_workflow_instances_context;
-- DROP INDEX IF EXISTS app.idx_workflow_instances_tenant_created_by;
-- DROP INDEX IF EXISTS app.idx_workflow_instances_tenant_active;
-- DROP INDEX IF EXISTS app.idx_workflow_instances_version_id;
-- DROP INDEX IF EXISTS app.idx_workflow_instances_tenant_definition_status;
-- DROP INDEX IF EXISTS app.idx_workflow_instances_tenant_status;
-- DROP TABLE IF EXISTS app.workflow_instances;
