-- Migration: 0033_workflow_slas
-- Created: 2026-01-07
-- Description: Create the workflow_slas table - SLA definitions and tracking
--              This table defines SLA rules for workflow steps including
--              warning thresholds, deadlines, and escalation actions

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Workflow SLAs Table
-- -----------------------------------------------------------------------------
-- SLA definitions for workflow steps
-- Each workflow can have different SLAs per step
-- Supports warning thresholds and automatic escalation actions
CREATE TABLE IF NOT EXISTS app.workflow_slas (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this SLA definition
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Workflow definition this SLA applies to
    definition_id uuid NOT NULL REFERENCES app.workflow_definitions(id) ON DELETE CASCADE,

    -- Step index this SLA applies to (NULL means all steps)
    step_index integer,

    -- Step name (for reference, not enforced)
    step_name varchar(255),

    -- Warning threshold in hours (sends notification but no action)
    warning_hours integer,

    -- Deadline in hours (triggers escalation action)
    deadline_hours integer NOT NULL,

    -- Action to take when deadline is breached
    escalation_action app.escalation_action NOT NULL DEFAULT 'notify',

    -- Target for escalation (user or role)
    -- If NULL, escalates to the assignee's manager
    escalation_target_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
    escalation_target_role_id uuid REFERENCES app.roles(id) ON DELETE SET NULL,

    -- Additional escalation configuration
    -- Structure: {
    --   "notification_template": "sla_breach",
    --   "include_task_details": true,
    --   "cc_roles": ["hr_admin"],
    --   "repeat_notification_hours": 24
    -- }
    escalation_config jsonb NOT NULL DEFAULT '{}',

    -- Whether this SLA is active
    is_active boolean NOT NULL DEFAULT true,

    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Constraints
    -- Warning must be less than deadline
    CONSTRAINT workflow_slas_warning_before_deadline CHECK (
        warning_hours IS NULL OR warning_hours < deadline_hours
    ),

    -- Deadline must be positive
    CONSTRAINT workflow_slas_deadline_positive CHECK (
        deadline_hours > 0
    ),

    -- At least one escalation target must be set (unless auto_approve/auto_reject)
    CONSTRAINT workflow_slas_has_escalation_target CHECK (
        escalation_action IN ('auto_approve', 'auto_reject')
        OR escalation_target_user_id IS NOT NULL
        OR escalation_target_role_id IS NOT NULL
    ),

    -- Unique SLA per definition per step (or NULL step for default)
    CONSTRAINT workflow_slas_unique_per_step UNIQUE NULLS NOT DISTINCT (definition_id, step_index)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: definition + step
CREATE INDEX IF NOT EXISTS idx_workflow_slas_definition_step
    ON app.workflow_slas(definition_id, step_index);

-- Tenant filtering
CREATE INDEX IF NOT EXISTS idx_workflow_slas_tenant_id
    ON app.workflow_slas(tenant_id);

-- Active SLAs only
CREATE INDEX IF NOT EXISTS idx_workflow_slas_definition_active
    ON app.workflow_slas(definition_id)
    WHERE is_active = true;

-- Escalation targets
CREATE INDEX IF NOT EXISTS idx_workflow_slas_escalation_user
    ON app.workflow_slas(escalation_target_user_id)
    WHERE escalation_target_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_slas_escalation_role
    ON app.workflow_slas(escalation_target_role_id)
    WHERE escalation_target_role_id IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.workflow_slas ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see workflow SLAs for their current tenant
CREATE POLICY tenant_isolation ON app.workflow_slas
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.workflow_slas
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_workflow_slas_updated_at
    BEFORE UPDATE ON app.workflow_slas
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get SLA for a specific step (or default)
CREATE OR REPLACE FUNCTION app.get_workflow_step_sla(
    p_definition_id uuid,
    p_step_index integer
)
RETURNS TABLE (
    id uuid,
    warning_hours integer,
    deadline_hours integer,
    escalation_action app.escalation_action,
    escalation_target_user_id uuid,
    escalation_target_role_id uuid,
    escalation_config jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- First try to find step-specific SLA
    RETURN QUERY
    SELECT
        ws.id,
        ws.warning_hours,
        ws.deadline_hours,
        ws.escalation_action,
        ws.escalation_target_user_id,
        ws.escalation_target_role_id,
        ws.escalation_config
    FROM app.workflow_slas ws
    WHERE ws.definition_id = p_definition_id
      AND ws.step_index = p_step_index
      AND ws.is_active = true
    LIMIT 1;

    -- If no rows returned, try default SLA (step_index IS NULL)
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            ws.id,
            ws.warning_hours,
            ws.deadline_hours,
            ws.escalation_action,
            ws.escalation_target_user_id,
            ws.escalation_target_role_id,
            ws.escalation_config
        FROM app.workflow_slas ws
        WHERE ws.definition_id = p_definition_id
          AND ws.step_index IS NULL
          AND ws.is_active = true
        LIMIT 1;
    END IF;
END;
$$;

-- Function to get all SLAs for a workflow definition
CREATE OR REPLACE FUNCTION app.get_workflow_slas(
    p_definition_id uuid
)
RETURNS TABLE (
    id uuid,
    step_index integer,
    step_name varchar(255),
    warning_hours integer,
    deadline_hours integer,
    escalation_action app.escalation_action,
    escalation_target_user_id uuid,
    escalation_target_role_id uuid,
    is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ws.id,
        ws.step_index,
        ws.step_name,
        ws.warning_hours,
        ws.deadline_hours,
        ws.escalation_action,
        ws.escalation_target_user_id,
        ws.escalation_target_role_id,
        ws.is_active
    FROM app.workflow_slas ws
    WHERE ws.definition_id = p_definition_id
    ORDER BY ws.step_index NULLS FIRST;
END;
$$;

-- Function to calculate SLA deadline for a task
CREATE OR REPLACE FUNCTION app.calculate_task_sla_deadline(
    p_definition_id uuid,
    p_step_index integer,
    p_created_at timestamptz DEFAULT now()
)
RETURNS TABLE (
    warning_at timestamptz,
    deadline_at timestamptz,
    escalation_action app.escalation_action,
    escalation_target_user_id uuid,
    escalation_target_role_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_sla record;
BEGIN
    -- Get the applicable SLA
    SELECT * INTO v_sla
    FROM app.get_workflow_step_sla(p_definition_id, p_step_index);

    IF v_sla IS NULL THEN
        RETURN;  -- No SLA configured
    END IF;

    RETURN QUERY
    SELECT
        CASE WHEN v_sla.warning_hours IS NOT NULL
            THEN p_created_at + (v_sla.warning_hours || ' hours')::interval
            ELSE NULL
        END AS warning_at,
        p_created_at + (v_sla.deadline_hours || ' hours')::interval AS deadline_at,
        v_sla.escalation_action,
        v_sla.escalation_target_user_id,
        v_sla.escalation_target_role_id;
END;
$$;

-- Function to create or update an SLA
CREATE OR REPLACE FUNCTION app.upsert_workflow_sla(
    p_tenant_id uuid,
    p_definition_id uuid,
    p_step_index integer,
    p_step_name varchar(255),
    p_warning_hours integer,
    p_deadline_hours integer,
    p_escalation_action app.escalation_action,
    p_escalation_target_user_id uuid DEFAULT NULL,
    p_escalation_target_role_id uuid DEFAULT NULL,
    p_escalation_config jsonb DEFAULT '{}',
    p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_sla_id uuid;
BEGIN
    INSERT INTO app.workflow_slas (
        tenant_id,
        definition_id,
        step_index,
        step_name,
        warning_hours,
        deadline_hours,
        escalation_action,
        escalation_target_user_id,
        escalation_target_role_id,
        escalation_config,
        created_by,
        updated_by
    )
    VALUES (
        p_tenant_id,
        p_definition_id,
        p_step_index,
        p_step_name,
        p_warning_hours,
        p_deadline_hours,
        p_escalation_action,
        p_escalation_target_user_id,
        p_escalation_target_role_id,
        p_escalation_config,
        p_user_id,
        p_user_id
    )
    ON CONFLICT (definition_id, step_index)
    DO UPDATE SET
        step_name = EXCLUDED.step_name,
        warning_hours = EXCLUDED.warning_hours,
        deadline_hours = EXCLUDED.deadline_hours,
        escalation_action = EXCLUDED.escalation_action,
        escalation_target_user_id = EXCLUDED.escalation_target_user_id,
        escalation_target_role_id = EXCLUDED.escalation_target_role_id,
        escalation_config = EXCLUDED.escalation_config,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
    RETURNING id INTO v_sla_id;

    RETURN v_sla_id;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.workflow_slas IS 'SLA definitions for workflow steps. Defines warning and deadline thresholds with escalation actions.';
COMMENT ON COLUMN app.workflow_slas.id IS 'Primary UUID identifier for the SLA';
COMMENT ON COLUMN app.workflow_slas.tenant_id IS 'Tenant that owns this SLA definition';
COMMENT ON COLUMN app.workflow_slas.definition_id IS 'Workflow definition this SLA applies to';
COMMENT ON COLUMN app.workflow_slas.step_index IS 'Step index this SLA applies to (NULL for default)';
COMMENT ON COLUMN app.workflow_slas.step_name IS 'Human-readable step name for reference';
COMMENT ON COLUMN app.workflow_slas.warning_hours IS 'Hours until warning notification is sent';
COMMENT ON COLUMN app.workflow_slas.deadline_hours IS 'Hours until escalation action is triggered';
COMMENT ON COLUMN app.workflow_slas.escalation_action IS 'Action to take when deadline is breached';
COMMENT ON COLUMN app.workflow_slas.escalation_target_user_id IS 'User to escalate to';
COMMENT ON COLUMN app.workflow_slas.escalation_target_role_id IS 'Role to escalate to';
COMMENT ON COLUMN app.workflow_slas.escalation_config IS 'Additional escalation configuration';
COMMENT ON COLUMN app.workflow_slas.is_active IS 'Whether this SLA is active';
COMMENT ON FUNCTION app.get_workflow_step_sla IS 'Gets the applicable SLA for a workflow step';
COMMENT ON FUNCTION app.get_workflow_slas IS 'Gets all SLAs for a workflow definition';
COMMENT ON FUNCTION app.calculate_task_sla_deadline IS 'Calculates warning and deadline timestamps for a task';
COMMENT ON FUNCTION app.upsert_workflow_sla IS 'Creates or updates an SLA definition';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.upsert_workflow_sla(uuid, uuid, integer, varchar, integer, integer, app.escalation_action, uuid, uuid, jsonb, uuid);
-- DROP FUNCTION IF EXISTS app.calculate_task_sla_deadline(uuid, integer, timestamptz);
-- DROP FUNCTION IF EXISTS app.get_workflow_slas(uuid);
-- DROP FUNCTION IF EXISTS app.get_workflow_step_sla(uuid, integer);
-- DROP TRIGGER IF EXISTS update_workflow_slas_updated_at ON app.workflow_slas;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.workflow_slas;
-- DROP POLICY IF EXISTS tenant_isolation ON app.workflow_slas;
-- DROP INDEX IF EXISTS app.idx_workflow_slas_escalation_role;
-- DROP INDEX IF EXISTS app.idx_workflow_slas_escalation_user;
-- DROP INDEX IF EXISTS app.idx_workflow_slas_definition_active;
-- DROP INDEX IF EXISTS app.idx_workflow_slas_tenant_id;
-- DROP INDEX IF EXISTS app.idx_workflow_slas_definition_step;
-- DROP TABLE IF EXISTS app.workflow_slas;
