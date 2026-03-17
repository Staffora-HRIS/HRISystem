-- Migration: 0181_approval_instances
-- Created: 2026-03-16
-- Description: Instance tracking tables for approval workflow execution,
--              plus append-only permission change audit log.
--              Depends on: 0178 (approval_chain_definitions), 0110 (approval_delegations).

-- =============================================================================
-- UP Migration
-- =============================================================================

-- =============================================================================
-- TABLE 1: Approval Instances
-- Tracks each approval workflow instance tied to a chain definition.
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.approval_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    chain_definition_id uuid NOT NULL REFERENCES app.approval_chain_definitions(id),
    entity_type varchar(50) NOT NULL,
    entity_id uuid NOT NULL,
    submitted_by uuid NOT NULL REFERENCES app.users(id),
    submitted_at timestamptz NOT NULL DEFAULT now(),
    current_step integer NOT NULL DEFAULT 1,
    status varchar(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'escalated', 'expired')),
    metadata jsonb DEFAULT '{}',
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- TABLE 2: Approval Step Decisions
-- Individual step-level decisions within an approval instance.
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.approval_step_decisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    approval_instance_id uuid NOT NULL REFERENCES app.approval_instances(id) ON DELETE CASCADE,
    step_number integer NOT NULL,
    step_name varchar(100) NOT NULL,
    assigned_to uuid NOT NULL REFERENCES app.users(id),
    decided_by uuid REFERENCES app.users(id),
    delegation_id uuid REFERENCES app.approval_delegations(id),
    decision varchar(20) CHECK (decision IN ('approved', 'rejected', 'skipped', 'escalated')),
    decision_at timestamptz,
    comments text,
    due_at timestamptz,
    escalated_at timestamptz,
    escalated_to uuid REFERENCES app.users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- TABLE 3: Permission Change Log
-- Append-only audit log for all permission, role, and delegation changes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.permission_change_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    change_type varchar(30) NOT NULL CHECK (change_type IN (
        'role_created', 'role_updated', 'role_deleted', 'role_archived',
        'role_assigned', 'role_revoked',
        'permission_granted', 'permission_revoked',
        'field_permission_changed',
        'delegation_created', 'delegation_revoked', 'delegation_used', 'delegation_expired',
        'portal_access_granted', 'portal_access_revoked',
        'data_scope_changed', 'condition_changed',
        'sod_violation'
    )),
    actor_id uuid NOT NULL,
    target_user_id uuid,
    target_role_id uuid,
    previous_state jsonb,
    new_state jsonb,
    reason text,
    ip_address inet,
    request_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- approval_instances: lookup by tenant + entity (e.g. "all approvals for this leave request")
CREATE INDEX IF NOT EXISTS idx_approval_instances_tenant_entity
    ON app.approval_instances(tenant_id, entity_type, entity_id);

-- approval_instances: filter by status (e.g. pending approvals dashboard)
CREATE INDEX IF NOT EXISTS idx_approval_instances_status
    ON app.approval_instances(tenant_id, status)
    WHERE status = 'pending';

-- approval_instances: submitted_by (my submissions)
CREATE INDEX IF NOT EXISTS idx_approval_instances_submitted_by
    ON app.approval_instances(submitted_by, status);

-- approval_instances: chain definition lookup
CREATE INDEX IF NOT EXISTS idx_approval_instances_chain
    ON app.approval_instances(chain_definition_id);

-- approval_step_decisions: find steps for an instance
CREATE INDEX IF NOT EXISTS idx_approval_step_decisions_instance
    ON app.approval_step_decisions(approval_instance_id, step_number);

-- approval_step_decisions: pending items assigned to a user (approver inbox)
CREATE INDEX IF NOT EXISTS idx_approval_step_decisions_assigned_pending
    ON app.approval_step_decisions(assigned_to, tenant_id)
    WHERE decision IS NULL;

-- approval_step_decisions: escalated items
CREATE INDEX IF NOT EXISTS idx_approval_step_decisions_escalated
    ON app.approval_step_decisions(escalated_to, tenant_id)
    WHERE escalated_at IS NOT NULL;

-- approval_step_decisions: delegation reference
CREATE INDEX IF NOT EXISTS idx_approval_step_decisions_delegation
    ON app.approval_step_decisions(delegation_id)
    WHERE delegation_id IS NOT NULL;

-- permission_change_log: tenant + chronological
CREATE INDEX IF NOT EXISTS idx_permission_change_log_tenant
    ON app.permission_change_log(tenant_id, created_at DESC);

-- permission_change_log: actor audit trail
CREATE INDEX IF NOT EXISTS idx_permission_change_log_actor
    ON app.permission_change_log(actor_id, created_at DESC);

-- permission_change_log: target user audit trail
CREATE INDEX IF NOT EXISTS idx_permission_change_log_target_user
    ON app.permission_change_log(target_user_id, created_at DESC)
    WHERE target_user_id IS NOT NULL;

-- permission_change_log: target role audit trail
CREATE INDEX IF NOT EXISTS idx_permission_change_log_target_role
    ON app.permission_change_log(target_role_id, created_at DESC)
    WHERE target_role_id IS NOT NULL;

-- permission_change_log: filter by change type
CREATE INDEX IF NOT EXISTS idx_permission_change_log_type
    ON app.permission_change_log(change_type, created_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.approval_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.approval_step_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.permission_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.approval_instances
    FOR ALL USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.approval_step_decisions
    FOR ALL USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.permission_change_log
    FOR ALL USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Append-Only Enforcement for permission_change_log
-- The hris_app role may INSERT and SELECT, but never UPDATE or DELETE.
-- =============================================================================

REVOKE UPDATE, DELETE ON app.permission_change_log FROM hris_app;

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_approval_instances_updated_at
    BEFORE UPDATE ON app.approval_instances
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.approval_instances IS 'Tracks each approval workflow instance tied to an approval chain definition';
COMMENT ON COLUMN app.approval_instances.entity_type IS 'Type of entity being approved (e.g. leave_request, expense, salary_change)';
COMMENT ON COLUMN app.approval_instances.entity_id IS 'UUID of the entity being approved';
COMMENT ON COLUMN app.approval_instances.current_step IS 'The current step number in the approval chain';
COMMENT ON COLUMN app.approval_instances.status IS 'Instance status: pending, approved, rejected, cancelled, escalated, expired';
COMMENT ON COLUMN app.approval_instances.metadata IS 'Arbitrary metadata for the approval context (e.g. amount, category)';

COMMENT ON TABLE app.approval_step_decisions IS 'Individual step-level decisions within an approval workflow instance';
COMMENT ON COLUMN app.approval_step_decisions.step_number IS 'Ordinal position of this step in the chain';
COMMENT ON COLUMN app.approval_step_decisions.assigned_to IS 'User originally assigned to decide this step';
COMMENT ON COLUMN app.approval_step_decisions.decided_by IS 'User who actually decided (may differ from assigned_to if delegated)';
COMMENT ON COLUMN app.approval_step_decisions.delegation_id IS 'Reference to delegation record if decision was made by a delegate';
COMMENT ON COLUMN app.approval_step_decisions.escalated_to IS 'User this step was escalated to after SLA breach';

COMMENT ON TABLE app.permission_change_log IS 'Append-only audit log for all permission, role, and delegation changes';
COMMENT ON COLUMN app.permission_change_log.change_type IS 'Category of permission change for filtering and reporting';
COMMENT ON COLUMN app.permission_change_log.previous_state IS 'Snapshot of state before the change (for diffing)';
COMMENT ON COLUMN app.permission_change_log.new_state IS 'Snapshot of state after the change (for diffing)';
COMMENT ON COLUMN app.permission_change_log.request_id IS 'Correlation ID from the originating HTTP request';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- GRANT UPDATE, DELETE ON app.permission_change_log TO hris_app;
-- DROP TRIGGER IF EXISTS update_approval_instances_updated_at ON app.approval_instances;
-- DROP POLICY IF EXISTS tenant_isolation ON app.permission_change_log;
-- DROP POLICY IF EXISTS tenant_isolation ON app.approval_step_decisions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.approval_instances;
-- DROP TABLE IF EXISTS app.permission_change_log;
-- DROP TABLE IF EXISTS app.approval_step_decisions;
-- DROP TABLE IF EXISTS app.approval_instances;
