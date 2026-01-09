-- Migration: 0028_workflow_definitions
-- Created: 2026-01-07
-- Description: Create the workflow_definitions table - workflow templates
--              This table stores the metadata for workflow templates
--              Actual workflow steps are stored in versioned workflow_versions table
--              Supports manual, event-triggered, and scheduled workflows

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Workflow Definitions Table
-- -----------------------------------------------------------------------------
-- The workflow definition/template record
-- One definition can have multiple versions (only one active at a time)
-- Triggers define how workflows are initiated
CREATE TABLE IF NOT EXISTS app.workflow_definitions (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this workflow definition
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Unique code within tenant (e.g., 'leave-approval', 'expense-claim')
    -- Used for programmatic reference and API calls
    code varchar(100) NOT NULL,

    -- Human-readable name
    name varchar(255) NOT NULL,

    -- Detailed description of what this workflow does
    description text,

    -- Category for organization/filtering
    -- Examples: hr, time, absence, talent, expense, onboarding, offboarding
    category varchar(100),

    -- How this workflow is triggered
    trigger_type app.workflow_trigger_type NOT NULL DEFAULT 'manual',

    -- Trigger configuration (structure depends on trigger_type)
    -- For 'event': { "event_types": ["employee.created", "leave.requested"], "conditions": {...} }
    -- For 'scheduled': { "cron": "0 9 * * 1", "timezone": "America/New_York" }
    -- For 'manual': { "allowed_roles": ["hr_admin", "manager"], "entity_types": ["employee", "leave_request"] }
    trigger_config jsonb NOT NULL DEFAULT '{}',

    -- Whether this workflow definition is active (can start new instances)
    is_active boolean NOT NULL DEFAULT true,

    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Constraints
    -- Code must be unique within tenant
    CONSTRAINT workflow_definitions_code_unique UNIQUE (tenant_id, code),

    -- Code format: lowercase alphanumeric with hyphens, must start with letter
    CONSTRAINT workflow_definitions_code_format CHECK (
        code ~ '^[a-z][a-z0-9-]*$' AND LENGTH(code) >= 2
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + code
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_tenant_code
    ON app.workflow_definitions(tenant_id, code);

-- Category filtering
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_tenant_category
    ON app.workflow_definitions(tenant_id, category)
    WHERE category IS NOT NULL;

-- Active definitions
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_tenant_active
    ON app.workflow_definitions(tenant_id)
    WHERE is_active = true;

-- Trigger type filtering (for event processing)
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_tenant_trigger
    ON app.workflow_definitions(tenant_id, trigger_type)
    WHERE is_active = true;

-- GIN index for trigger config queries (event matching)
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_trigger_config
    ON app.workflow_definitions USING gin(trigger_config);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.workflow_definitions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see workflow definitions for their current tenant
CREATE POLICY tenant_isolation ON app.workflow_definitions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.workflow_definitions
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_workflow_definitions_updated_at
    BEFORE UPDATE ON app.workflow_definitions
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get workflow definitions by category
CREATE OR REPLACE FUNCTION app.get_workflow_definitions_by_category(
    p_tenant_id uuid,
    p_category varchar(100) DEFAULT NULL,
    p_active_only boolean DEFAULT true
)
RETURNS TABLE (
    id uuid,
    code varchar(100),
    name varchar(255),
    description text,
    category varchar(100),
    trigger_type app.workflow_trigger_type,
    is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wd.id,
        wd.code,
        wd.name,
        wd.description,
        wd.category,
        wd.trigger_type,
        wd.is_active
    FROM app.workflow_definitions wd
    WHERE wd.tenant_id = p_tenant_id
      AND (p_category IS NULL OR wd.category = p_category)
      AND (NOT p_active_only OR wd.is_active = true)
    ORDER BY wd.category NULLS LAST, wd.name ASC;
END;
$$;

-- Function to find workflow definitions matching an event
CREATE OR REPLACE FUNCTION app.find_workflows_for_event(
    p_tenant_id uuid,
    p_event_type varchar(255)
)
RETURNS TABLE (
    id uuid,
    code varchar(100),
    name varchar(255),
    trigger_config jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wd.id,
        wd.code,
        wd.name,
        wd.trigger_config
    FROM app.workflow_definitions wd
    WHERE wd.tenant_id = p_tenant_id
      AND wd.is_active = true
      AND wd.trigger_type = 'event'
      AND wd.trigger_config->'event_types' ? p_event_type;
END;
$$;

-- Function to get a workflow definition by code
CREATE OR REPLACE FUNCTION app.get_workflow_definition_by_code(
    p_tenant_id uuid,
    p_code varchar(100)
)
RETURNS TABLE (
    id uuid,
    code varchar(100),
    name varchar(255),
    description text,
    category varchar(100),
    trigger_type app.workflow_trigger_type,
    trigger_config jsonb,
    is_active boolean,
    created_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wd.id,
        wd.code,
        wd.name,
        wd.description,
        wd.category,
        wd.trigger_type,
        wd.trigger_config,
        wd.is_active,
        wd.created_at,
        wd.updated_at
    FROM app.workflow_definitions wd
    WHERE wd.tenant_id = p_tenant_id
      AND wd.code = p_code;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.workflow_definitions IS 'Workflow templates/definitions. One definition can have multiple versions.';
COMMENT ON COLUMN app.workflow_definitions.id IS 'Primary UUID identifier for the workflow definition';
COMMENT ON COLUMN app.workflow_definitions.tenant_id IS 'Tenant that owns this workflow definition';
COMMENT ON COLUMN app.workflow_definitions.code IS 'Unique code within tenant for programmatic reference';
COMMENT ON COLUMN app.workflow_definitions.name IS 'Human-readable workflow name';
COMMENT ON COLUMN app.workflow_definitions.description IS 'Detailed description of the workflow purpose';
COMMENT ON COLUMN app.workflow_definitions.category IS 'Category for organization (hr, time, absence, etc.)';
COMMENT ON COLUMN app.workflow_definitions.trigger_type IS 'How this workflow is triggered (manual, event, scheduled)';
COMMENT ON COLUMN app.workflow_definitions.trigger_config IS 'Trigger configuration (event types, conditions, schedule)';
COMMENT ON COLUMN app.workflow_definitions.is_active IS 'Whether this workflow can start new instances';
COMMENT ON COLUMN app.workflow_definitions.created_by IS 'User who created this workflow definition';
COMMENT ON COLUMN app.workflow_definitions.updated_by IS 'User who last updated this workflow definition';
COMMENT ON FUNCTION app.get_workflow_definitions_by_category IS 'Returns workflow definitions filtered by category';
COMMENT ON FUNCTION app.find_workflows_for_event IS 'Finds workflows that should trigger for a given event type';
COMMENT ON FUNCTION app.get_workflow_definition_by_code IS 'Returns a workflow definition by its code';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_workflow_definition_by_code(uuid, varchar);
-- DROP FUNCTION IF EXISTS app.find_workflows_for_event(uuid, varchar);
-- DROP FUNCTION IF EXISTS app.get_workflow_definitions_by_category(uuid, varchar, boolean);
-- DROP TRIGGER IF EXISTS update_workflow_definitions_updated_at ON app.workflow_definitions;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.workflow_definitions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.workflow_definitions;
-- DROP INDEX IF EXISTS app.idx_workflow_definitions_trigger_config;
-- DROP INDEX IF EXISTS app.idx_workflow_definitions_tenant_trigger;
-- DROP INDEX IF EXISTS app.idx_workflow_definitions_tenant_active;
-- DROP INDEX IF EXISTS app.idx_workflow_definitions_tenant_category;
-- DROP INDEX IF EXISTS app.idx_workflow_definitions_tenant_code;
-- DROP TABLE IF EXISTS app.workflow_definitions;
