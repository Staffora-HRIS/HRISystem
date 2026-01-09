-- Migration: 0082_onboarding_templates
-- Created: 2026-01-07
-- Description: Create the onboarding_templates table - template definitions
--              This table stores onboarding process templates that can be
--              assigned to new employees based on role, department, location

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Onboarding Templates Table
-- -----------------------------------------------------------------------------
-- Template definitions for onboarding processes
-- Templates can be configured for specific roles, departments, or locations
CREATE TABLE IF NOT EXISTS app.onboarding_templates (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this template
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Template identification
    code varchar(50) NOT NULL,
    name varchar(255) NOT NULL,
    description text,

    -- Current status
    status app.template_status NOT NULL DEFAULT 'draft',

    -- Template applicability (for auto-assignment)
    -- Structure: {
    --   "positions": ["uuid1", "uuid2"],
    --   "org_units": ["uuid1", "uuid2"],
    --   "employment_types": ["full_time", "part_time"],
    --   "contract_types": ["permanent", "contractor"],
    --   "locations": ["US", "UK"],
    --   "is_default": false
    -- }
    applicability_rules jsonb NOT NULL DEFAULT '{}',

    -- Whether this is the default template (fallback)
    is_default boolean NOT NULL DEFAULT false,

    -- Priority for rule matching (higher = checked first)
    priority integer NOT NULL DEFAULT 0,

    -- Estimated duration in days
    estimated_duration_days integer NOT NULL DEFAULT 30,

    -- Settings
    -- Structure: {
    --   "send_welcome_email": true,
    --   "welcome_email_template_id": "uuid",
    --   "enable_buddy_assignment": true,
    --   "require_manager_signoff": true,
    --   "allow_task_delegation": true,
    --   "reminder_days_before_due": [3, 1],
    --   "escalation_after_days": 7
    -- }
    settings jsonb NOT NULL DEFAULT '{}',

    -- Welcome message for new hires
    welcome_message text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Publication metadata
    published_at timestamptz,
    published_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Constraints
    -- Code must be unique within tenant
    CONSTRAINT onboarding_templates_code_unique UNIQUE (tenant_id, code),

    -- Only one default template per tenant
    CONSTRAINT onboarding_templates_single_default UNIQUE (tenant_id, is_default)
        DEFERRABLE INITIALLY DEFERRED,

    -- Duration must be positive
    CONSTRAINT onboarding_templates_duration_positive CHECK (
        estimated_duration_days > 0
    ),

    -- Published metadata required when active
    CONSTRAINT onboarding_templates_active_has_published CHECK (
        status != 'active' OR (published_at IS NOT NULL AND published_by IS NOT NULL)
    )
);

-- Partial unique index for default template (only one true per tenant)
DROP INDEX IF EXISTS app.idx_onboarding_templates_default_unique;
CREATE UNIQUE INDEX idx_onboarding_templates_default_unique
    ON app.onboarding_templates(tenant_id)
    WHERE is_default = true;

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + code
CREATE INDEX IF NOT EXISTS idx_onboarding_templates_tenant_code
    ON app.onboarding_templates(tenant_id, code);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_onboarding_templates_tenant_status
    ON app.onboarding_templates(tenant_id, status);

-- Active templates
CREATE INDEX IF NOT EXISTS idx_onboarding_templates_tenant_active
    ON app.onboarding_templates(tenant_id, priority DESC)
    WHERE status = 'active';

-- Default template lookup
CREATE INDEX IF NOT EXISTS idx_onboarding_templates_tenant_default
    ON app.onboarding_templates(tenant_id)
    WHERE is_default = true AND status = 'active';

-- GIN index for applicability rules queries
CREATE INDEX IF NOT EXISTS idx_onboarding_templates_applicability
    ON app.onboarding_templates USING gin(applicability_rules);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.onboarding_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see templates for their current tenant
CREATE POLICY tenant_isolation ON app.onboarding_templates
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.onboarding_templates
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_onboarding_templates_updated_at
    BEFORE UPDATE ON app.onboarding_templates
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Function to validate template status transitions
CREATE OR REPLACE FUNCTION app.validate_onboarding_template_status_transition()
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
            IF NEW.status NOT IN ('active', 'archived') THEN
                RAISE EXCEPTION 'Invalid status transition: draft can only transition to active or archived, not %', NEW.status;
            END IF;

        WHEN 'active' THEN
            IF NEW.status NOT IN ('archived') THEN
                RAISE EXCEPTION 'Invalid status transition: active can only transition to archived, not %', NEW.status;
            END IF;

        WHEN 'archived' THEN
            RAISE EXCEPTION 'Invalid status transition: archived is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_onboarding_template_status_transition
    BEFORE UPDATE OF status ON app.onboarding_templates
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_onboarding_template_status_transition();

-- Function to ensure template has tasks before publishing
CREATE OR REPLACE FUNCTION app.validate_onboarding_template_has_tasks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_task_count integer;
BEGIN
    IF NEW.status = 'active' AND (OLD.status = 'draft' OR TG_OP = 'INSERT') THEN
        SELECT COUNT(*) INTO v_task_count
        FROM app.onboarding_template_tasks
        WHERE template_id = NEW.id;

        IF v_task_count = 0 THEN
            RAISE EXCEPTION 'Cannot publish template without any tasks';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_onboarding_template_has_tasks
    BEFORE UPDATE OF status ON app.onboarding_templates
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_onboarding_template_has_tasks();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to find matching template for a new hire
CREATE OR REPLACE FUNCTION app.find_onboarding_template(
    p_tenant_id uuid,
    p_position_id uuid DEFAULT NULL,
    p_org_unit_id uuid DEFAULT NULL,
    p_employment_type app.employment_type DEFAULT NULL,
    p_contract_type app.contract_type DEFAULT NULL,
    p_location varchar(50) DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    code varchar(50),
    name varchar(255),
    estimated_duration_days integer,
    is_default boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ot.id,
        ot.code,
        ot.name,
        ot.estimated_duration_days,
        ot.is_default
    FROM app.onboarding_templates ot
    WHERE ot.tenant_id = p_tenant_id
      AND ot.status = 'active'
      AND (
          -- Match by position
          (p_position_id IS NOT NULL AND
           ot.applicability_rules->'positions' ? p_position_id::text)
          OR
          -- Match by org unit
          (p_org_unit_id IS NOT NULL AND
           ot.applicability_rules->'org_units' ? p_org_unit_id::text)
          OR
          -- Match by employment type
          (p_employment_type IS NOT NULL AND
           ot.applicability_rules->'employment_types' ? p_employment_type::text)
          OR
          -- Match by contract type
          (p_contract_type IS NOT NULL AND
           ot.applicability_rules->'contract_types' ? p_contract_type::text)
          OR
          -- Match by location
          (p_location IS NOT NULL AND
           ot.applicability_rules->'locations' ? p_location)
          OR
          -- Default template (lowest priority)
          ot.is_default = true
      )
    ORDER BY
        ot.is_default ASC,  -- Non-default first
        ot.priority DESC,   -- Higher priority first
        ot.created_at ASC   -- Older first (tie-breaker)
    LIMIT 1;
END;
$$;

-- Function to publish a template
CREATE OR REPLACE FUNCTION app.publish_onboarding_template(
    p_template_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.onboarding_templates
    SET status = 'active',
        published_at = now(),
        published_by = p_user_id
    WHERE id = p_template_id
      AND status = 'draft';

    RETURN FOUND;
END;
$$;

-- Function to clone a template
CREATE OR REPLACE FUNCTION app.clone_onboarding_template(
    p_source_template_id uuid,
    p_new_code varchar(50),
    p_new_name varchar(255),
    p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_new_template_id uuid;
    v_tenant_id uuid;
BEGIN
    -- Get tenant ID from source
    SELECT tenant_id INTO v_tenant_id
    FROM app.onboarding_templates
    WHERE id = p_source_template_id;

    -- Clone template
    INSERT INTO app.onboarding_templates (
        tenant_id,
        code,
        name,
        description,
        status,
        applicability_rules,
        is_default,
        priority,
        estimated_duration_days,
        settings,
        welcome_message,
        created_by
    )
    SELECT
        tenant_id,
        p_new_code,
        p_new_name,
        description,
        'draft',
        applicability_rules,
        false,  -- Not default
        priority,
        estimated_duration_days,
        settings,
        welcome_message,
        p_user_id
    FROM app.onboarding_templates
    WHERE id = p_source_template_id
    RETURNING id INTO v_new_template_id;

    -- Clone tasks
    INSERT INTO app.onboarding_template_tasks (
        tenant_id,
        template_id,
        name,
        description,
        task_type,
        owner_type,
        custom_owner_id,
        sequence_order,
        timing_type,
        days_offset,
        due_days_offset,
        is_required,
        dependencies,
        instructions,
        form_schema,
        integration_config,
        settings
    )
    SELECT
        tenant_id,
        v_new_template_id,
        name,
        description,
        task_type,
        owner_type,
        custom_owner_id,
        sequence_order,
        timing_type,
        days_offset,
        due_days_offset,
        is_required,
        dependencies,
        instructions,
        form_schema,
        integration_config,
        settings
    FROM app.onboarding_template_tasks
    WHERE template_id = p_source_template_id;

    RETURN v_new_template_id;
END;
$$;

-- Function to get template with task count
CREATE OR REPLACE FUNCTION app.get_onboarding_templates(
    p_tenant_id uuid,
    p_status app.template_status DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    code varchar(50),
    name varchar(255),
    description text,
    status app.template_status,
    is_default boolean,
    priority integer,
    estimated_duration_days integer,
    task_count bigint,
    instance_count bigint,
    created_at timestamptz,
    published_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ot.id,
        ot.code,
        ot.name,
        ot.description,
        ot.status,
        ot.is_default,
        ot.priority,
        ot.estimated_duration_days,
        (SELECT COUNT(*) FROM app.onboarding_template_tasks t WHERE t.template_id = ot.id) AS task_count,
        (SELECT COUNT(*) FROM app.onboarding_instances i WHERE i.template_id = ot.id) AS instance_count,
        ot.created_at,
        ot.published_at
    FROM app.onboarding_templates ot
    WHERE ot.tenant_id = p_tenant_id
      AND (p_status IS NULL OR ot.status = p_status)
    ORDER BY ot.is_default DESC, ot.priority DESC, ot.name ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.onboarding_templates IS 'Onboarding process template definitions.';
COMMENT ON COLUMN app.onboarding_templates.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.onboarding_templates.tenant_id IS 'Tenant that owns this template';
COMMENT ON COLUMN app.onboarding_templates.code IS 'Unique template code within tenant';
COMMENT ON COLUMN app.onboarding_templates.name IS 'Human-readable template name';
COMMENT ON COLUMN app.onboarding_templates.description IS 'Template description';
COMMENT ON COLUMN app.onboarding_templates.status IS 'Current template status';
COMMENT ON COLUMN app.onboarding_templates.applicability_rules IS 'Rules for auto-matching template to new hires';
COMMENT ON COLUMN app.onboarding_templates.is_default IS 'Whether this is the fallback template';
COMMENT ON COLUMN app.onboarding_templates.priority IS 'Priority for rule matching';
COMMENT ON COLUMN app.onboarding_templates.estimated_duration_days IS 'Expected duration in days';
COMMENT ON COLUMN app.onboarding_templates.settings IS 'Template settings';
COMMENT ON COLUMN app.onboarding_templates.welcome_message IS 'Welcome message for new hires';
COMMENT ON COLUMN app.onboarding_templates.published_at IS 'When template was published';
COMMENT ON COLUMN app.onboarding_templates.published_by IS 'User who published template';
COMMENT ON FUNCTION app.validate_onboarding_template_status_transition IS 'Enforces valid status transitions';
COMMENT ON FUNCTION app.validate_onboarding_template_has_tasks IS 'Ensures template has tasks before publishing';
COMMENT ON FUNCTION app.find_onboarding_template IS 'Finds matching template for a new hire';
COMMENT ON FUNCTION app.publish_onboarding_template IS 'Publishes a draft template';
COMMENT ON FUNCTION app.clone_onboarding_template IS 'Clones a template with all tasks';
COMMENT ON FUNCTION app.get_onboarding_templates IS 'Returns templates with counts';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_onboarding_templates(uuid, app.template_status, integer, integer);
-- DROP FUNCTION IF EXISTS app.clone_onboarding_template(uuid, varchar, varchar, uuid);
-- DROP FUNCTION IF EXISTS app.publish_onboarding_template(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.find_onboarding_template(uuid, uuid, uuid, app.employment_type, app.contract_type, varchar);
-- DROP TRIGGER IF EXISTS validate_onboarding_template_has_tasks ON app.onboarding_templates;
-- DROP FUNCTION IF EXISTS app.validate_onboarding_template_has_tasks();
-- DROP TRIGGER IF EXISTS validate_onboarding_template_status_transition ON app.onboarding_templates;
-- DROP FUNCTION IF EXISTS app.validate_onboarding_template_status_transition();
-- DROP TRIGGER IF EXISTS update_onboarding_templates_updated_at ON app.onboarding_templates;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.onboarding_templates;
-- DROP POLICY IF EXISTS tenant_isolation ON app.onboarding_templates;
-- DROP INDEX IF EXISTS app.idx_onboarding_templates_applicability;
-- DROP INDEX IF EXISTS app.idx_onboarding_templates_tenant_default;
-- DROP INDEX IF EXISTS app.idx_onboarding_templates_tenant_active;
-- DROP INDEX IF EXISTS app.idx_onboarding_templates_tenant_status;
-- DROP INDEX IF EXISTS app.idx_onboarding_templates_tenant_code;
-- DROP INDEX IF EXISTS app.idx_onboarding_templates_default_unique;
-- DROP TABLE IF EXISTS app.onboarding_templates;
