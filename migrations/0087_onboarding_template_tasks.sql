-- Migration: 0087_onboarding_template_tasks
-- Created: 2026-01-07
-- Description: Create the onboarding_template_tasks table - tasks within templates
--              This table defines the tasks that make up an onboarding template
--              Tasks are ordered and can have dependencies

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Onboarding Template Tasks Table
-- -----------------------------------------------------------------------------
-- Task definitions within onboarding templates
-- Tasks define what needs to be done during onboarding
CREATE TABLE IF NOT EXISTS app.onboarding_template_tasks (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this task
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Template this task belongs to
    template_id uuid NOT NULL REFERENCES app.onboarding_templates(id) ON DELETE CASCADE,

    -- Task identification
    name varchar(255) NOT NULL,
    description text,

    -- Task type
    task_type app.onboarding_task_type NOT NULL DEFAULT 'custom',

    -- Who is responsible for this task
    owner_type app.task_owner_type NOT NULL DEFAULT 'new_hire',

    -- Custom owner (when owner_type = 'custom')
    custom_owner_id uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Task ordering
    sequence_order integer NOT NULL DEFAULT 0,

    -- Timing configuration
    timing_type app.task_timing_type NOT NULL DEFAULT 'on_start',
    days_offset integer NOT NULL DEFAULT 0,  -- Days relative to timing_type
    due_days_offset integer,                 -- Days until due (from available date)

    -- Whether task is required for completion
    is_required boolean NOT NULL DEFAULT true,

    -- Dependencies (other task IDs that must be completed first)
    -- Structure: ["task_id_1", "task_id_2"]
    dependencies jsonb NOT NULL DEFAULT '[]',

    -- Task instructions
    instructions text,

    -- Form schema for form tasks
    -- Structure: JSON Schema
    form_schema jsonb,

    -- Integration configuration (for automated tasks)
    -- Structure: {
    --   "integration_type": "lms" | "it_provisioning" | "docusign",
    --   "action": "assign_course" | "create_account" | "send_document",
    --   "parameters": {...}
    -- }
    integration_config jsonb,

    -- Task settings
    -- Structure: {
    --   "reminder_days_before_due": [3, 1],
    --   "allow_delegation": true,
    --   "require_evidence": false,
    --   "evidence_types": ["document", "screenshot"],
    --   "auto_complete_on_integration": true
    -- }
    settings jsonb NOT NULL DEFAULT '{}',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Custom owner required when owner_type is custom
    CONSTRAINT onboarding_template_tasks_custom_owner CHECK (
        owner_type != 'custom' OR custom_owner_id IS NOT NULL
    ),

    -- Sequence order must be non-negative
    CONSTRAINT onboarding_template_tasks_sequence_positive CHECK (
        sequence_order >= 0
    ),

    -- Due days must be positive if set
    CONSTRAINT onboarding_template_tasks_due_days_positive CHECK (
        due_days_offset IS NULL OR due_days_offset > 0
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Template tasks in order
CREATE INDEX IF NOT EXISTS idx_onboarding_template_tasks_template_order
    ON app.onboarding_template_tasks(template_id, sequence_order);

-- Tenant filtering
CREATE INDEX IF NOT EXISTS idx_onboarding_template_tasks_tenant
    ON app.onboarding_template_tasks(tenant_id);

-- Task type filtering
CREATE INDEX IF NOT EXISTS idx_onboarding_template_tasks_type
    ON app.onboarding_template_tasks(template_id, task_type);

-- Owner type filtering
CREATE INDEX IF NOT EXISTS idx_onboarding_template_tasks_owner
    ON app.onboarding_template_tasks(template_id, owner_type);

-- Required tasks
CREATE INDEX IF NOT EXISTS idx_onboarding_template_tasks_required
    ON app.onboarding_template_tasks(template_id, is_required)
    WHERE is_required = true;

-- GIN index for dependencies queries
CREATE INDEX IF NOT EXISTS idx_onboarding_template_tasks_dependencies
    ON app.onboarding_template_tasks USING gin(dependencies);

-- GIN index for integration config
CREATE INDEX IF NOT EXISTS idx_onboarding_template_tasks_integration
    ON app.onboarding_template_tasks USING gin(integration_config)
    WHERE integration_config IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.onboarding_template_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see tasks for their current tenant
CREATE POLICY tenant_isolation ON app.onboarding_template_tasks
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.onboarding_template_tasks
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_onboarding_template_tasks_updated_at
    BEFORE UPDATE ON app.onboarding_template_tasks
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Function to validate dependencies exist in same template
CREATE OR REPLACE FUNCTION app.validate_onboarding_task_dependencies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_dep_id uuid;
    v_exists boolean;
BEGIN
    -- Check each dependency
    FOR v_dep_id IN SELECT jsonb_array_elements_text(NEW.dependencies)::uuid
    LOOP
        -- Verify the dependency exists in the same template
        SELECT EXISTS(
            SELECT 1
            FROM app.onboarding_template_tasks
            WHERE template_id = NEW.template_id
              AND id = v_dep_id
              AND id != NEW.id
        ) INTO v_exists;

        IF NOT v_exists THEN
            RAISE EXCEPTION 'Dependency task % does not exist in this template', v_dep_id;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_onboarding_task_dependencies
    BEFORE INSERT OR UPDATE OF dependencies ON app.onboarding_template_tasks
    FOR EACH ROW
    WHEN (jsonb_array_length(NEW.dependencies) > 0)
    EXECUTE FUNCTION app.validate_onboarding_task_dependencies();

-- Function to prevent circular dependencies
CREATE OR REPLACE FUNCTION app.prevent_circular_task_dependencies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_visited uuid[];
    v_queue uuid[];
    v_current uuid;
    v_deps jsonb;
    v_dep_id uuid;
BEGIN
    -- Simple BFS to detect cycles
    v_visited := ARRAY[]::uuid[];
    v_queue := ARRAY[NEW.id]::uuid[];

    WHILE array_length(v_queue, 1) > 0 LOOP
        v_current := v_queue[1];
        v_queue := v_queue[2:];

        IF v_current = ANY(v_visited) THEN
            CONTINUE;
        END IF;

        v_visited := v_visited || v_current;

        -- Get dependencies of current task
        IF v_current = NEW.id THEN
            v_deps := NEW.dependencies;
        ELSE
            SELECT dependencies INTO v_deps
            FROM app.onboarding_template_tasks
            WHERE id = v_current;
        END IF;

        IF v_deps IS NOT NULL THEN
            FOR v_dep_id IN SELECT jsonb_array_elements_text(v_deps)::uuid
            LOOP
                IF v_dep_id = NEW.id THEN
                    RAISE EXCEPTION 'Circular dependency detected';
                END IF;
                v_queue := v_queue || v_dep_id;
            END LOOP;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_circular_task_dependencies
    BEFORE INSERT OR UPDATE OF dependencies ON app.onboarding_template_tasks
    FOR EACH ROW
    WHEN (jsonb_array_length(NEW.dependencies) > 0)
    EXECUTE FUNCTION app.prevent_circular_task_dependencies();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get template tasks in order
CREATE OR REPLACE FUNCTION app.get_onboarding_template_tasks(
    p_template_id uuid
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    description text,
    task_type app.onboarding_task_type,
    owner_type app.task_owner_type,
    custom_owner_id uuid,
    sequence_order integer,
    timing_type app.task_timing_type,
    days_offset integer,
    due_days_offset integer,
    is_required boolean,
    dependencies jsonb,
    dependency_names text[],
    has_form boolean,
    has_integration boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.name,
        t.description,
        t.task_type,
        t.owner_type,
        t.custom_owner_id,
        t.sequence_order,
        t.timing_type,
        t.days_offset,
        t.due_days_offset,
        t.is_required,
        t.dependencies,
        ARRAY(
            SELECT dt.name
            FROM app.onboarding_template_tasks dt
            WHERE dt.id::text IN (SELECT jsonb_array_elements_text(t.dependencies))
        ) AS dependency_names,
        (t.form_schema IS NOT NULL) AS has_form,
        (t.integration_config IS NOT NULL) AS has_integration
    FROM app.onboarding_template_tasks t
    WHERE t.template_id = p_template_id
    ORDER BY t.sequence_order ASC;
END;
$$;

-- Function to add a task to a template
CREATE OR REPLACE FUNCTION app.add_onboarding_template_task(
    p_tenant_id uuid,
    p_template_id uuid,
    p_name varchar(255),
    p_task_type app.onboarding_task_type,
    p_owner_type app.task_owner_type,
    p_description text DEFAULT NULL,
    p_timing_type app.task_timing_type DEFAULT 'on_start',
    p_days_offset integer DEFAULT 0,
    p_due_days_offset integer DEFAULT NULL,
    p_is_required boolean DEFAULT true,
    p_dependencies jsonb DEFAULT '[]',
    p_instructions text DEFAULT NULL,
    p_form_schema jsonb DEFAULT NULL,
    p_integration_config jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_id uuid;
    v_max_order integer;
BEGIN
    -- Get next sequence order
    SELECT COALESCE(MAX(sequence_order), -1) + 1
    INTO v_max_order
    FROM app.onboarding_template_tasks
    WHERE template_id = p_template_id;

    INSERT INTO app.onboarding_template_tasks (
        tenant_id,
        template_id,
        name,
        description,
        task_type,
        owner_type,
        sequence_order,
        timing_type,
        days_offset,
        due_days_offset,
        is_required,
        dependencies,
        instructions,
        form_schema,
        integration_config
    )
    VALUES (
        p_tenant_id,
        p_template_id,
        p_name,
        p_description,
        p_task_type,
        p_owner_type,
        v_max_order,
        p_timing_type,
        p_days_offset,
        p_due_days_offset,
        p_is_required,
        p_dependencies,
        p_instructions,
        p_form_schema,
        p_integration_config
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Function to reorder tasks in a template
CREATE OR REPLACE FUNCTION app.reorder_onboarding_template_tasks(
    p_template_id uuid,
    p_task_order jsonb  -- Array of task IDs in new order
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_task_id uuid;
    v_new_order integer := 0;
BEGIN
    FOR v_task_id IN SELECT jsonb_array_elements_text(p_task_order)::uuid
    LOOP
        UPDATE app.onboarding_template_tasks
        SET sequence_order = v_new_order,
            updated_at = now()
        WHERE template_id = p_template_id
          AND id = v_task_id;

        v_new_order := v_new_order + 1;
    END LOOP;

    RETURN true;
END;
$$;

-- Function to get tasks by owner type for a template
CREATE OR REPLACE FUNCTION app.get_tasks_by_owner_type(
    p_template_id uuid,
    p_owner_type app.task_owner_type
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    task_type app.onboarding_task_type,
    timing_type app.task_timing_type,
    days_offset integer,
    is_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.name,
        t.task_type,
        t.timing_type,
        t.days_offset,
        t.is_required
    FROM app.onboarding_template_tasks t
    WHERE t.template_id = p_template_id
      AND t.owner_type = p_owner_type
    ORDER BY t.sequence_order ASC;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.onboarding_template_tasks IS 'Task definitions within onboarding templates.';
COMMENT ON COLUMN app.onboarding_template_tasks.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.onboarding_template_tasks.tenant_id IS 'Tenant that owns this task';
COMMENT ON COLUMN app.onboarding_template_tasks.template_id IS 'Template this task belongs to';
COMMENT ON COLUMN app.onboarding_template_tasks.name IS 'Task name';
COMMENT ON COLUMN app.onboarding_template_tasks.description IS 'Task description';
COMMENT ON COLUMN app.onboarding_template_tasks.task_type IS 'Type of task';
COMMENT ON COLUMN app.onboarding_template_tasks.owner_type IS 'Who is responsible';
COMMENT ON COLUMN app.onboarding_template_tasks.custom_owner_id IS 'Custom owner user ID';
COMMENT ON COLUMN app.onboarding_template_tasks.sequence_order IS 'Order within template';
COMMENT ON COLUMN app.onboarding_template_tasks.timing_type IS 'When task is available';
COMMENT ON COLUMN app.onboarding_template_tasks.days_offset IS 'Days relative to timing type';
COMMENT ON COLUMN app.onboarding_template_tasks.due_days_offset IS 'Days until due from available';
COMMENT ON COLUMN app.onboarding_template_tasks.is_required IS 'Whether task is required';
COMMENT ON COLUMN app.onboarding_template_tasks.dependencies IS 'Task IDs that must complete first';
COMMENT ON COLUMN app.onboarding_template_tasks.instructions IS 'Task instructions';
COMMENT ON COLUMN app.onboarding_template_tasks.form_schema IS 'Form schema for form tasks';
COMMENT ON COLUMN app.onboarding_template_tasks.integration_config IS 'Integration configuration';
COMMENT ON COLUMN app.onboarding_template_tasks.settings IS 'Task settings';
COMMENT ON FUNCTION app.validate_onboarding_task_dependencies IS 'Validates dependencies exist in template';
COMMENT ON FUNCTION app.prevent_circular_task_dependencies IS 'Prevents circular dependencies';
COMMENT ON FUNCTION app.get_onboarding_template_tasks IS 'Returns tasks in a template';
COMMENT ON FUNCTION app.add_onboarding_template_task IS 'Adds a task to a template';
COMMENT ON FUNCTION app.reorder_onboarding_template_tasks IS 'Reorders tasks in a template';
COMMENT ON FUNCTION app.get_tasks_by_owner_type IS 'Returns tasks for a specific owner type';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_tasks_by_owner_type(uuid, app.task_owner_type);
-- DROP FUNCTION IF EXISTS app.reorder_onboarding_template_tasks(uuid, jsonb);
-- DROP FUNCTION IF EXISTS app.add_onboarding_template_task(uuid, uuid, varchar, app.onboarding_task_type, app.task_owner_type, text, app.task_timing_type, integer, integer, boolean, jsonb, text, jsonb, jsonb);
-- DROP FUNCTION IF EXISTS app.get_onboarding_template_tasks(uuid);
-- DROP TRIGGER IF EXISTS prevent_circular_task_dependencies ON app.onboarding_template_tasks;
-- DROP FUNCTION IF EXISTS app.prevent_circular_task_dependencies();
-- DROP TRIGGER IF EXISTS validate_onboarding_task_dependencies ON app.onboarding_template_tasks;
-- DROP FUNCTION IF EXISTS app.validate_onboarding_task_dependencies();
-- DROP TRIGGER IF EXISTS update_onboarding_template_tasks_updated_at ON app.onboarding_template_tasks;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.onboarding_template_tasks;
-- DROP POLICY IF EXISTS tenant_isolation ON app.onboarding_template_tasks;
-- DROP INDEX IF EXISTS app.idx_onboarding_template_tasks_integration;
-- DROP INDEX IF EXISTS app.idx_onboarding_template_tasks_dependencies;
-- DROP INDEX IF EXISTS app.idx_onboarding_template_tasks_required;
-- DROP INDEX IF EXISTS app.idx_onboarding_template_tasks_owner;
-- DROP INDEX IF EXISTS app.idx_onboarding_template_tasks_type;
-- DROP INDEX IF EXISTS app.idx_onboarding_template_tasks_tenant;
-- DROP INDEX IF EXISTS app.idx_onboarding_template_tasks_template_order;
-- DROP TABLE IF EXISTS app.onboarding_template_tasks;
