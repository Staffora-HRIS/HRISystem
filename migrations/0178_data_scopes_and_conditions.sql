-- Migration: 0178_data_scopes_and_conditions
-- Created: 2026-03-14
-- Description: Layer 2 (data-scoped access), Layer 3 (contextual permissions),
--              Layer 4 (approval chains, SoD), Layer 5 (access reviews, alerts).

-- =============================================================================
-- UP Migration
-- =============================================================================

-- =============================================================================
-- LAYER 2: Data Scope Types & Custom Scopes
-- =============================================================================

-- Enum for built-in scope types
DO $$ BEGIN
    CREATE TYPE app.scope_type AS ENUM (
        'self', 'direct_reports', 'indirect_reports',
        'department', 'division', 'location',
        'cost_centre', 'legal_entity', 'all', 'custom'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enum for sensitivity tiers
DO $$ BEGIN
    CREATE TYPE app.sensitivity_tier AS ENUM ('public', 'internal', 'restricted', 'confidential', 'privileged');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Custom scope definitions (for the 'custom' scope type)
CREATE TABLE IF NOT EXISTS app.data_scopes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    description text,
    scope_type app.scope_type NOT NULL DEFAULT 'custom',
    -- Filter criteria as JSONB for flexible matching
    -- { "tags": ["vip"], "employee_groups": ["uuid1"], "locations": ["uuid1"] }
    filter_criteria jsonb NOT NULL DEFAULT '{}',
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES app.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT data_scopes_name_unique UNIQUE (tenant_id, name)
);

-- Members of a custom scope (materialised for performance)
CREATE TABLE IF NOT EXISTS app.data_scope_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    scope_id uuid NOT NULL REFERENCES app.data_scopes(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL,
    added_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT scope_members_unique UNIQUE (scope_id, employee_id)
);

-- Sensitivity tier assignments for fields
-- Extends field_registry with tier classification
ALTER TABLE app.field_registry
    ADD COLUMN IF NOT EXISTS sensitivity_tier smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN app.field_registry.sensitivity_tier IS '0=public, 1=internal, 2=restricted, 3=confidential, 4=privileged';

-- Update existing fields with appropriate tiers based on is_sensitive flag
SELECT app.enable_system_context();

UPDATE app.field_registry SET sensitivity_tier = CASE
    -- Tier 0: Public (name, job title, department, work email)
    WHEN entity_name = 'employee_personal' AND field_name IN ('first_name', 'last_name', 'preferred_name', 'photo_url') THEN 0
    WHEN entity_name = 'employee_contact' AND field_name IN ('email', 'work_phone') THEN 0
    WHEN entity_name = 'position' AND field_name IN ('title') THEN 0
    WHEN entity_name = 'org_unit' THEN 0
    -- Tier 1: Internal (start date, manager, location, cost centre)
    WHEN entity_name = 'employee' AND field_name IN ('hire_date', 'status', 'employee_number') THEN 1
    WHEN entity_name = 'position' AND field_name NOT IN ('id', 'title') THEN 1
    WHEN entity_name = 'position_assignment' THEN 1
    WHEN entity_name = 'contract' AND field_name IN ('contract_type', 'start_date', 'end_date') THEN 1
    -- Tier 2: Restricted (salary, bonus, performance, disciplinary)
    WHEN entity_name = 'compensation' THEN 2
    WHEN entity_name = 'performance_review' AND field_name = 'calibrated_rating' THEN 2
    WHEN entity_name = 'performance_review' AND field_name = 'overall_rating' THEN 2
    -- Tier 3: Confidential (medical, bank, NI, DBS, RTW, diversity)
    WHEN entity_name = 'bank_details' THEN 3
    WHEN entity_name = 'employee_identifier' THEN 3
    WHEN entity_name = 'employee_personal' AND field_name IN ('date_of_birth', 'gender', 'nationality', 'marital_status') THEN 3
    WHEN entity_name = 'employee_address' THEN 3
    WHEN entity_name = 'leave_request' AND field_name IN ('medical_certificate', 'return_to_work_notes') THEN 3
    -- Default based on is_sensitive
    WHEN is_sensitive THEN 2
    ELSE 0
END
WHERE tenant_id IS NULL;

SELECT app.disable_system_context();

-- =============================================================================
-- Indexes for data scopes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_data_scopes_tenant ON app.data_scopes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_data_scope_members_scope ON app.data_scope_members(scope_id);
CREATE INDEX IF NOT EXISTS idx_data_scope_members_employee ON app.data_scope_members(employee_id);
CREATE INDEX IF NOT EXISTS idx_field_registry_sensitivity ON app.field_registry(sensitivity_tier);

-- =============================================================================
-- RLS for data scopes
-- =============================================================================

ALTER TABLE app.data_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.data_scope_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.data_scopes
    FOR ALL USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.data_scope_members
    FOR ALL USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- LAYER 3: Contextual Permission Conditions
-- =============================================================================

-- Permission conditions: time-based, workflow-state, employment-status rules
CREATE TABLE IF NOT EXISTS app.permission_conditions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES app.tenants(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    description text,

    -- Which permission this condition applies to
    resource varchar(100) NOT NULL,
    action varchar(100) NOT NULL,

    -- Condition type
    condition_type varchar(50) NOT NULL, -- 'time_window', 'workflow_state', 'employment_status', 'payroll_lock', 'custom'

    -- Condition parameters (varies by type)
    -- time_window:      { "start": "2026-01-01", "end": "2026-03-31" }
    -- workflow_state:   { "allowed_states": ["draft", "pending"] }
    -- employment_status: { "allowed_statuses": ["active"] }
    -- payroll_lock:     { "deny_when_locked": true }
    -- custom:           { "expression": "..." }
    condition_params jsonb NOT NULL DEFAULT '{}',

    -- Effect: 'deny' overrides grants; 'require' adds extra conditions
    effect varchar(10) NOT NULL DEFAULT 'deny', -- 'deny' or 'require'

    is_active boolean NOT NULL DEFAULT true,
    priority smallint NOT NULL DEFAULT 0, -- Higher = evaluated first

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permission_conditions_resource
    ON app.permission_conditions(resource, action);
CREATE INDEX IF NOT EXISTS idx_permission_conditions_type
    ON app.permission_conditions(condition_type);
CREATE INDEX IF NOT EXISTS idx_permission_conditions_active
    ON app.permission_conditions(is_active) WHERE is_active = true;

ALTER TABLE app.permission_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.permission_conditions
    FOR ALL USING (
        tenant_id IS NULL
        OR tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- LAYER 4: Approval Chain Definitions & Separation of Duties
-- =============================================================================

-- Approval chain definitions (configurable per tenant)
CREATE TABLE IF NOT EXISTS app.approval_chain_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    description text,

    -- What type of approval this chain handles
    approval_type varchar(50) NOT NULL, -- 'leave', 'expense', 'recruitment', 'payroll', 'contract_change', 'salary_change', 'custom'

    -- Chain steps as ordered JSONB array
    -- [
    --   { "level": 1, "approver_type": "line_manager", "skip_if": { "condition": "amount_below", "value": 100 } },
    --   { "level": 2, "approver_type": "department_head", "skip_if": null },
    --   { "level": 3, "approver_type": "role:hr_admin", "skip_if": null }
    -- ]
    steps jsonb NOT NULL DEFAULT '[]',

    -- Configuration
    is_parallel boolean NOT NULL DEFAULT false,
    escalation_hours integer DEFAULT 48,
    sla_hours integer DEFAULT 24,
    max_levels smallint NOT NULL DEFAULT 3,

    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT approval_chain_name_unique UNIQUE (tenant_id, name),
    CONSTRAINT approval_chain_type_unique UNIQUE (tenant_id, approval_type)
);

CREATE INDEX IF NOT EXISTS idx_approval_chain_type
    ON app.approval_chain_definitions(tenant_id, approval_type);

ALTER TABLE app.approval_chain_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.approval_chain_definitions
    FOR ALL USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Separation of duties rules
CREATE TABLE IF NOT EXISTS app.separation_of_duties_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES app.tenants(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    description text,

    -- Rule type
    rule_type varchar(50) NOT NULL, -- 'self_approval', 'creator_approver', 'two_person', 'role_conflict'

    -- The conflicting actions
    -- self_approval:     { "resource": "leave_requests", "action": "approve" }
    -- creator_approver:  { "create_action": "payroll_runs:create", "approve_action": "payroll_runs:approve" }
    -- two_person:        { "action": "data_erasure:execute", "min_approvers": 2 }
    -- role_conflict:     { "role_a": "payroll_admin", "role_b": "tenant_admin", "disallow_same_user": true }
    rule_params jsonb NOT NULL DEFAULT '{}',

    -- How to enforce: 'block' prevents action, 'warn' logs warning, 'audit' only logs
    enforcement varchar(10) NOT NULL DEFAULT 'block', -- 'block', 'warn', 'audit'

    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sod_rules_type
    ON app.separation_of_duties_rules(rule_type);

ALTER TABLE app.separation_of_duties_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.separation_of_duties_rules
    FOR ALL USING (
        tenant_id IS NULL
        OR tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Seed default SoD rules (system-wide, tenant_id = NULL)
SELECT app.enable_system_context();

INSERT INTO app.separation_of_duties_rules (tenant_id, name, description, rule_type, rule_params, enforcement) VALUES
    (NULL, 'No self-approval', 'Users cannot approve their own requests', 'self_approval',
     '{"resources": ["leave_requests", "expenses", "salary_changes", "bonus_payments"]}', 'block'),
    (NULL, 'Payroll four-eyes', 'Payroll creator cannot also approve the same run', 'creator_approver',
     '{"create_action": "payroll_runs:create", "approve_action": "payroll_runs:approve"}', 'block'),
    (NULL, 'Data erasure two-person', 'Data erasure requires two separate approvers', 'two_person',
     '{"action": "data_erasure:execute", "min_approvers": 2}', 'block'),
    (NULL, 'Salary bulk update two-person', 'Bulk salary updates require two separate approvers', 'two_person',
     '{"action": "employees:bulk_update", "min_approvers": 2, "context": "salary"}', 'block')
ON CONFLICT DO NOTHING;

SELECT app.disable_system_context();

-- =============================================================================
-- LAYER 5: Access Reviews & Security Alerts
-- =============================================================================

-- Access review campaigns
CREATE TABLE IF NOT EXISTS app.access_review_campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    name varchar(200) NOT NULL,
    description text,

    -- Campaign configuration
    review_type varchar(50) NOT NULL, -- 'quarterly', 'annual', 'ad_hoc', 'stale_permissions'
    status varchar(20) NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'completed', 'cancelled'

    -- Date range
    start_date date NOT NULL,
    due_date date NOT NULL,
    completed_date date,

    -- Scope: which roles/users to review
    scope_config jsonb NOT NULL DEFAULT '{}',
    -- { "review_admin_roles": true, "review_manager_roles": true, "stale_days": 90 }

    -- Statistics
    total_reviews integer DEFAULT 0,
    completed_reviews integer DEFAULT 0,
    revocations integer DEFAULT 0,

    created_by uuid REFERENCES app.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Individual review items within a campaign
CREATE TABLE IF NOT EXISTS app.access_review_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    campaign_id uuid NOT NULL REFERENCES app.access_review_campaigns(id) ON DELETE CASCADE,

    -- The user whose access is being reviewed
    target_user_id uuid NOT NULL REFERENCES app.users(id),
    -- The reviewer
    reviewer_id uuid NOT NULL REFERENCES app.users(id),

    -- What's being reviewed
    role_assignment_id uuid REFERENCES app.role_assignments(id),
    permission_key varchar(200),

    -- Review decision
    decision varchar(20), -- 'approve', 'revoke', 'modify', 'pending'
    decision_notes text,
    decided_at timestamptz,

    -- Whether action was taken
    action_taken boolean DEFAULT false,
    action_taken_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now()
);

-- Security alerts for anomaly detection
CREATE TABLE IF NOT EXISTS app.security_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Alert details
    alert_type varchar(50) NOT NULL, -- 'bulk_export', 'off_hours', 'escalation_attempt', 'failed_access', 'cross_tenant', 'sensitive_frequency'
    severity varchar(10) NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    title varchar(200) NOT NULL,
    description text,

    -- Who triggered it
    user_id uuid REFERENCES app.users(id),
    ip_address varchar(45),

    -- Context
    details jsonb NOT NULL DEFAULT '{}',
    -- { "resource": "employees", "action": "export", "record_count": 5000, "timestamp": "..." }

    -- Status
    status varchar(20) NOT NULL DEFAULT 'open', -- 'open', 'investigating', 'resolved', 'false_positive'
    resolved_by uuid REFERENCES app.users(id),
    resolved_at timestamptz,
    resolution_notes text,

    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes for Layer 5
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_access_review_campaigns_tenant
    ON app.access_review_campaigns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_access_review_items_campaign
    ON app.access_review_items(campaign_id, decision);
CREATE INDEX IF NOT EXISTS idx_access_review_items_reviewer
    ON app.access_review_items(reviewer_id) WHERE decision IS NULL;
CREATE INDEX IF NOT EXISTS idx_security_alerts_tenant
    ON app.security_alerts(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_user
    ON app.security_alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_type
    ON app.security_alerts(alert_type, severity);

-- =============================================================================
-- RLS for Layer 5
-- =============================================================================

ALTER TABLE app.access_review_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.access_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.security_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.access_review_campaigns
    FOR ALL USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.access_review_items
    FOR ALL USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.security_alerts
    FOR ALL USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_data_scopes_updated_at
    BEFORE UPDATE ON app.data_scopes
    FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER update_permission_conditions_updated_at
    BEFORE UPDATE ON app.permission_conditions
    FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER update_approval_chain_definitions_updated_at
    BEFORE UPDATE ON app.approval_chain_definitions
    FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER update_sod_rules_updated_at
    BEFORE UPDATE ON app.separation_of_duties_rules
    FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER update_access_review_campaigns_updated_at
    BEFORE UPDATE ON app.access_review_campaigns
    FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions: Data Scope Resolution
-- =============================================================================

-- Resolve the effective data scope for a user across all their roles
-- Returns the set of employee IDs the user can access
CREATE OR REPLACE FUNCTION app.resolve_user_data_scope(
    p_tenant_id uuid,
    p_user_id uuid,
    p_resource varchar DEFAULT 'employees'
)
RETURNS TABLE (employee_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_scope text;
    v_has_all boolean := false;
    v_employee_id uuid;
BEGIN
    -- Check all active role assignments for scope
    FOR v_scope IN
        SELECT DISTINCT COALESCE(ra.constraints->>'scope', 'self')
        FROM app.role_assignments ra
        WHERE ra.tenant_id = p_tenant_id
          AND ra.user_id = p_user_id
          AND ra.effective_from <= now()
          AND (ra.effective_to IS NULL OR ra.effective_to > now())
    LOOP
        IF v_scope = 'all' THEN
            v_has_all := true;
            EXIT;
        END IF;
    END LOOP;

    -- If any role grants 'all' scope, return all employees
    IF v_has_all THEN
        RETURN QUERY
        SELECT e.id FROM app.employees e
        WHERE e.tenant_id = p_tenant_id;
        RETURN;
    END IF;

    -- Resolve the employee_id for this user within the tenant
    SELECT e.id INTO v_employee_id
    FROM app.employees e
    WHERE e.tenant_id = p_tenant_id AND e.user_id = p_user_id
    LIMIT 1;

    -- Otherwise, union all scopes
    RETURN QUERY
    SELECT DISTINCT sub.eid FROM (
        -- Self scope (always included)
        SELECT emp.id AS eid
        FROM app.employees emp
        WHERE emp.tenant_id = p_tenant_id
          AND emp.user_id = p_user_id

        UNION

        -- Direct reports scope (uses manager_subordinates materialized view)
        SELECT ms.subordinate_id AS eid
        FROM app.role_assignments ra
        JOIN app.manager_subordinates ms
          ON ms.manager_id = v_employee_id
          AND ms.tenant_id = p_tenant_id
          AND ms.depth = 1
        WHERE ra.tenant_id = p_tenant_id
          AND ra.user_id = p_user_id
          AND ra.effective_from <= now()
          AND (ra.effective_to IS NULL OR ra.effective_to > now())
          AND COALESCE(ra.constraints->>'scope', 'self') = 'direct_reports'
          AND v_employee_id IS NOT NULL

        UNION

        -- Indirect reports scope (all subordinates via materialized view)
        SELECT ms.subordinate_id AS eid
        FROM app.role_assignments ra
        JOIN app.manager_subordinates ms
          ON ms.manager_id = v_employee_id
          AND ms.tenant_id = p_tenant_id
        WHERE ra.tenant_id = p_tenant_id
          AND ra.user_id = p_user_id
          AND ra.effective_from <= now()
          AND (ra.effective_to IS NULL OR ra.effective_to > now())
          AND COALESCE(ra.constraints->>'scope', 'self') = 'indirect_reports'
          AND v_employee_id IS NOT NULL

        UNION

        -- Department scope
        SELECT dep_emp.id AS eid
        FROM app.role_assignments ra
        CROSS JOIN LATERAL (
            SELECT e2.id FROM app.employees e2
            JOIN app.position_assignments pa2 ON pa2.employee_id = e2.id AND pa2.is_primary = true
              AND (pa2.effective_to IS NULL OR pa2.effective_to > now())
            JOIN app.positions p2 ON p2.id = pa2.position_id
            WHERE e2.tenant_id = p_tenant_id
              AND p2.department_id IN (
                  SELECT p3.department_id FROM app.positions p3
                  JOIN app.position_assignments pa3 ON pa3.position_id = p3.id AND pa3.is_primary = true
                    AND (pa3.effective_to IS NULL OR pa3.effective_to > now())
                  JOIN app.employees e3 ON e3.id = pa3.employee_id AND e3.user_id = p_user_id
              )
        ) dep_emp
        WHERE ra.tenant_id = p_tenant_id
          AND ra.user_id = p_user_id
          AND ra.effective_from <= now()
          AND (ra.effective_to IS NULL OR ra.effective_to > now())
          AND COALESCE(ra.constraints->>'scope', 'self') = 'department'

        UNION

        -- Custom scope members
        SELECT dsm.employee_id AS eid
        FROM app.role_assignments ra
        JOIN app.data_scope_members dsm ON dsm.scope_id = (ra.constraints->>'custom_scope_id')::uuid
        WHERE ra.tenant_id = p_tenant_id
          AND ra.user_id = p_user_id
          AND ra.effective_from <= now()
          AND (ra.effective_to IS NULL OR ra.effective_to > now())
          AND COALESCE(ra.constraints->>'scope', 'self') = 'custom'
          AND ra.constraints->>'custom_scope_id' IS NOT NULL
    ) sub;
END;
$$;

-- Function to check SoD violations
CREATE OR REPLACE FUNCTION app.check_separation_of_duties(
    p_tenant_id uuid,
    p_user_id uuid,
    p_resource varchar,
    p_action varchar,
    p_context jsonb DEFAULT '{}'
)
RETURNS TABLE (
    rule_id uuid,
    rule_name varchar,
    violation_type varchar,
    enforcement varchar,
    details text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id AS rule_id,
        r.name AS rule_name,
        r.rule_type AS violation_type,
        r.enforcement,
        r.description AS details
    FROM app.separation_of_duties_rules r
    WHERE r.is_active = true
      AND (r.tenant_id IS NULL OR r.tenant_id = p_tenant_id)
      AND (
          -- Self-approval check
          (r.rule_type = 'self_approval'
           AND p_action = 'approve'
           AND r.rule_params->'resources' ? p_resource)
          OR
          -- Creator-approver check
          (r.rule_type = 'creator_approver'
           AND (r.rule_params->>'approve_action') = (p_resource || ':' || p_action))
          OR
          -- Two-person rule check
          (r.rule_type = 'two_person'
           AND (r.rule_params->>'action') = (p_resource || ':' || p_action))
      )
    ORDER BY r.rule_type;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.data_scopes IS 'Custom data scope definitions for filtering employee visibility';
COMMENT ON TABLE app.data_scope_members IS 'Materialised membership for custom data scopes';
COMMENT ON TABLE app.permission_conditions IS 'Contextual conditions that modify permission grants (time, workflow, status)';
COMMENT ON TABLE app.approval_chain_definitions IS 'Configurable multi-level approval routing per action type';
COMMENT ON TABLE app.separation_of_duties_rules IS 'SoD rules preventing conflicting actions by same user';
COMMENT ON TABLE app.access_review_campaigns IS 'Periodic access certification campaigns';
COMMENT ON TABLE app.access_review_items IS 'Individual items within an access review campaign';
COMMENT ON TABLE app.security_alerts IS 'Security anomaly alerts for monitoring';
COMMENT ON FUNCTION app.resolve_user_data_scope IS 'Resolves effective employee visibility for a user across all roles';
COMMENT ON FUNCTION app.check_separation_of_duties IS 'Checks if an action violates any SoD rules';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.check_separation_of_duties(uuid, uuid, varchar, varchar, jsonb);
-- DROP FUNCTION IF EXISTS app.resolve_user_data_scope(uuid, uuid, varchar);
-- DROP TABLE IF EXISTS app.security_alerts;
-- DROP TABLE IF EXISTS app.access_review_items;
-- DROP TABLE IF EXISTS app.access_review_campaigns;
-- DROP TABLE IF EXISTS app.separation_of_duties_rules;
-- DROP TABLE IF EXISTS app.approval_chain_definitions;
-- DROP TABLE IF EXISTS app.permission_conditions;
-- DROP TABLE IF EXISTS app.data_scope_members;
-- DROP TABLE IF EXISTS app.data_scopes;
-- ALTER TABLE app.field_registry DROP COLUMN IF EXISTS sensitivity_tier;
-- DROP TYPE IF EXISTS app.sensitivity_tier;
-- DROP TYPE IF EXISTS app.scope_type;
