-- Migration: 0029_workflow_versions
-- Created: 2026-01-07
-- Description: Create the workflow_versions table - versioned workflow definitions
--              This table stores the actual workflow steps and logic
--              Each definition can have multiple versions, but only one active at a time
--              Supports approval chains, parallel steps, and conditional branching

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Workflow Versions Table
-- -----------------------------------------------------------------------------
-- Versioned workflow definitions with steps and variables
-- Only one version per definition can be active at a time
-- Steps are stored as JSONB array for flexibility
CREATE TABLE IF NOT EXISTS app.workflow_versions (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this workflow version
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Parent workflow definition
    definition_id uuid NOT NULL REFERENCES app.workflow_definitions(id) ON DELETE CASCADE,

    -- Version number (incrementing per definition)
    version integer NOT NULL,

    -- Version status
    status app.workflow_status NOT NULL DEFAULT 'draft',

    -- Workflow steps definition (array of step objects)
    -- Structure: [
    --   {
    --     "index": 0,
    --     "name": "Manager Approval",
    --     "type": "approval", // approval, task, notification, condition, parallel
    --     "assignment": {
    --       "type": "manager", // manager, role, user, expression
    --       "value": null, // role_id, user_id, or expression
    --       "fallback": { "type": "role", "value": "hr_admin" }
    --     },
    --     "actions": ["approve", "reject", "request_info"],
    --     "conditions": {
    --       "skip_if": "context.amount < 1000",
    --       "auto_approve_if": "context.requester.role == 'manager'"
    --     },
    --     "sla": { "warning_hours": 24, "deadline_hours": 48 },
    --     "on_complete": { "approve": "next", "reject": "end" },
    --     "metadata": {}
    --   }
    -- ]
    steps jsonb NOT NULL DEFAULT '[]',

    -- Workflow variables schema
    -- Defines variables that can be used across steps
    -- Structure: {
    --   "total_approved": { "type": "number", "default": 0 },
    --   "approval_comments": { "type": "array", "default": [] },
    --   "final_decision": { "type": "string", "default": null }
    -- }
    variables jsonb NOT NULL DEFAULT '{}',

    -- Publication metadata (only set when status = 'active')
    published_at timestamptz,
    published_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Constraints
    -- Version must be unique within definition
    CONSTRAINT workflow_versions_definition_version_unique UNIQUE (definition_id, version),

    -- Version must be positive
    CONSTRAINT workflow_versions_version_positive CHECK (version > 0),

    -- Published metadata required when active
    CONSTRAINT workflow_versions_active_has_published CHECK (
        status != 'active' OR (published_at IS NOT NULL AND published_by IS NOT NULL)
    ),

    -- Steps must be a non-empty array when active
    CONSTRAINT workflow_versions_active_has_steps CHECK (
        status = 'draft' OR jsonb_array_length(steps) > 0
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: definition + version
CREATE INDEX IF NOT EXISTS idx_workflow_versions_definition_version
    ON app.workflow_versions(definition_id, version DESC);

-- Tenant filtering
CREATE INDEX IF NOT EXISTS idx_workflow_versions_tenant_id
    ON app.workflow_versions(tenant_id);

-- Active versions per definition
CREATE INDEX IF NOT EXISTS idx_workflow_versions_definition_active
    ON app.workflow_versions(definition_id)
    WHERE status = 'active';

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_workflow_versions_tenant_status
    ON app.workflow_versions(tenant_id, status);

-- GIN index for steps queries
CREATE INDEX IF NOT EXISTS idx_workflow_versions_steps
    ON app.workflow_versions USING gin(steps);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.workflow_versions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see workflow versions for their current tenant
CREATE POLICY tenant_isolation ON app.workflow_versions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.workflow_versions
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Function to ensure only one active version per definition
CREATE OR REPLACE FUNCTION app.enforce_single_active_workflow_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- If setting this version to active, archive any other active version
    IF NEW.status = 'active' AND (OLD IS NULL OR OLD.status != 'active') THEN
        UPDATE app.workflow_versions
        SET status = 'archived'
        WHERE definition_id = NEW.definition_id
          AND id != NEW.id
          AND status = 'active';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_single_active_workflow_version
    BEFORE INSERT OR UPDATE OF status ON app.workflow_versions
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_single_active_workflow_version();

-- Function to auto-generate version number
CREATE OR REPLACE FUNCTION app.generate_workflow_version_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_max_version integer;
BEGIN
    -- Only set version if not provided or is 0
    IF NEW.version IS NULL OR NEW.version = 0 THEN
        SELECT COALESCE(MAX(version), 0) + 1
        INTO v_max_version
        FROM app.workflow_versions
        WHERE definition_id = NEW.definition_id;

        NEW.version := v_max_version;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER generate_workflow_version_number
    BEFORE INSERT ON app.workflow_versions
    FOR EACH ROW
    EXECUTE FUNCTION app.generate_workflow_version_number();

-- Function to validate status transitions
CREATE OR REPLACE FUNCTION app.validate_workflow_version_status_transition()
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
        WHEN 'draft' THEN
            -- draft can transition to active or archived
            IF NEW.status NOT IN ('active', 'archived') THEN
                RAISE EXCEPTION 'Invalid status transition: draft can only transition to active or archived, not %', NEW.status;
            END IF;

        WHEN 'active' THEN
            -- active can only transition to archived
            IF NEW.status NOT IN ('archived') THEN
                RAISE EXCEPTION 'Invalid status transition: active can only transition to archived, not %', NEW.status;
            END IF;

        WHEN 'archived' THEN
            -- archived is a terminal state
            RAISE EXCEPTION 'Invalid status transition: archived is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_workflow_version_status_transition
    BEFORE UPDATE OF status ON app.workflow_versions
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_workflow_version_status_transition();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get the active version for a workflow definition
CREATE OR REPLACE FUNCTION app.get_active_workflow_version(
    p_definition_id uuid
)
RETURNS TABLE (
    id uuid,
    definition_id uuid,
    version integer,
    steps jsonb,
    variables jsonb,
    published_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wv.id,
        wv.definition_id,
        wv.version,
        wv.steps,
        wv.variables,
        wv.published_at
    FROM app.workflow_versions wv
    WHERE wv.definition_id = p_definition_id
      AND wv.status = 'active'
    LIMIT 1;
END;
$$;

-- Function to get all versions for a workflow definition
CREATE OR REPLACE FUNCTION app.get_workflow_versions(
    p_definition_id uuid
)
RETURNS TABLE (
    id uuid,
    version integer,
    status app.workflow_status,
    steps_count integer,
    published_at timestamptz,
    published_by uuid,
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
        wv.id,
        wv.version,
        wv.status,
        jsonb_array_length(wv.steps)::integer AS steps_count,
        wv.published_at,
        wv.published_by,
        wv.created_at,
        wv.created_by
    FROM app.workflow_versions wv
    WHERE wv.definition_id = p_definition_id
    ORDER BY wv.version DESC;
END;
$$;

-- Function to publish a workflow version (set to active)
CREATE OR REPLACE FUNCTION app.publish_workflow_version(
    p_version_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_status app.workflow_status;
BEGIN
    -- Get current status
    SELECT status INTO v_current_status
    FROM app.workflow_versions
    WHERE id = p_version_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Workflow version not found: %', p_version_id;
    END IF;

    IF v_current_status != 'draft' THEN
        RAISE EXCEPTION 'Only draft versions can be published. Current status: %', v_current_status;
    END IF;

    -- Publish the version
    UPDATE app.workflow_versions
    SET status = 'active',
        published_at = now(),
        published_by = p_user_id
    WHERE id = p_version_id;

    RETURN true;
END;
$$;

-- Function to create a new draft version from an existing version
CREATE OR REPLACE FUNCTION app.clone_workflow_version(
    p_source_version_id uuid,
    p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_new_id uuid;
    v_definition_id uuid;
    v_tenant_id uuid;
    v_steps jsonb;
    v_variables jsonb;
BEGIN
    -- Get source version data
    SELECT definition_id, tenant_id, steps, variables
    INTO v_definition_id, v_tenant_id, v_steps, v_variables
    FROM app.workflow_versions
    WHERE id = p_source_version_id;

    IF v_definition_id IS NULL THEN
        RAISE EXCEPTION 'Source workflow version not found: %', p_source_version_id;
    END IF;

    -- Create new draft version
    INSERT INTO app.workflow_versions (
        tenant_id,
        definition_id,
        status,
        steps,
        variables,
        created_by
    )
    VALUES (
        v_tenant_id,
        v_definition_id,
        'draft',
        v_steps,
        v_variables,
        p_user_id
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.workflow_versions IS 'Versioned workflow definitions with steps. Only one active version per definition.';
COMMENT ON COLUMN app.workflow_versions.id IS 'Primary UUID identifier for the workflow version';
COMMENT ON COLUMN app.workflow_versions.tenant_id IS 'Tenant that owns this workflow version';
COMMENT ON COLUMN app.workflow_versions.definition_id IS 'Parent workflow definition';
COMMENT ON COLUMN app.workflow_versions.version IS 'Version number (incrementing per definition)';
COMMENT ON COLUMN app.workflow_versions.status IS 'Version status (draft, active, archived)';
COMMENT ON COLUMN app.workflow_versions.steps IS 'Workflow steps definition as JSONB array';
COMMENT ON COLUMN app.workflow_versions.variables IS 'Workflow variables schema';
COMMENT ON COLUMN app.workflow_versions.published_at IS 'When this version was published';
COMMENT ON COLUMN app.workflow_versions.published_by IS 'User who published this version';
COMMENT ON COLUMN app.workflow_versions.created_by IS 'User who created this version';
COMMENT ON FUNCTION app.enforce_single_active_workflow_version IS 'Ensures only one active version per definition';
COMMENT ON FUNCTION app.generate_workflow_version_number IS 'Auto-generates version number on insert';
COMMENT ON FUNCTION app.validate_workflow_version_status_transition IS 'Enforces valid status transitions';
COMMENT ON FUNCTION app.get_active_workflow_version IS 'Returns the active version for a workflow definition';
COMMENT ON FUNCTION app.get_workflow_versions IS 'Returns all versions for a workflow definition';
COMMENT ON FUNCTION app.publish_workflow_version IS 'Publishes a draft version (sets to active)';
COMMENT ON FUNCTION app.clone_workflow_version IS 'Creates a new draft version from an existing version';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.clone_workflow_version(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.publish_workflow_version(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_workflow_versions(uuid);
-- DROP FUNCTION IF EXISTS app.get_active_workflow_version(uuid);
-- DROP TRIGGER IF EXISTS validate_workflow_version_status_transition ON app.workflow_versions;
-- DROP FUNCTION IF EXISTS app.validate_workflow_version_status_transition();
-- DROP TRIGGER IF EXISTS generate_workflow_version_number ON app.workflow_versions;
-- DROP FUNCTION IF EXISTS app.generate_workflow_version_number();
-- DROP TRIGGER IF EXISTS enforce_single_active_workflow_version ON app.workflow_versions;
-- DROP FUNCTION IF EXISTS app.enforce_single_active_workflow_version();
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.workflow_versions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.workflow_versions;
-- DROP INDEX IF EXISTS app.idx_workflow_versions_steps;
-- DROP INDEX IF EXISTS app.idx_workflow_versions_tenant_status;
-- DROP INDEX IF EXISTS app.idx_workflow_versions_definition_active;
-- DROP INDEX IF EXISTS app.idx_workflow_versions_tenant_id;
-- DROP INDEX IF EXISTS app.idx_workflow_versions_definition_version;
-- DROP TABLE IF EXISTS app.workflow_versions;
