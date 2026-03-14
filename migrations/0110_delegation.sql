-- Migration: 0110_delegation
-- Created: 2026-01-16
-- Description: Approval delegation for workflow enhancements

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Approval delegation
CREATE TABLE IF NOT EXISTS app.approval_delegations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Delegation parties
    delegator_id uuid NOT NULL REFERENCES app.users(id),
    delegate_id uuid NOT NULL REFERENCES app.users(id),

    -- Delegation period
    start_date date NOT NULL,
    end_date date NOT NULL,

    -- Scope
    scope varchar(50) NOT NULL DEFAULT 'all', -- all, leave, expenses, time, purchase, etc.
    scope_filters jsonb DEFAULT '{}', -- Additional filters like amount limits

    -- Settings
    notify_delegator boolean DEFAULT true,
    include_pending boolean DEFAULT false, -- Apply to already pending items
    delegation_reason text,

    -- Status
    is_active boolean NOT NULL DEFAULT true,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id),

    CONSTRAINT valid_delegation_period CHECK (end_date >= start_date),
    CONSTRAINT no_self_delegation CHECK (delegator_id != delegate_id)
);

-- Delegation usage log
CREATE TABLE IF NOT EXISTS app.delegation_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    delegation_id uuid NOT NULL REFERENCES app.approval_delegations(id),

    -- Approval details
    workflow_instance_id uuid, -- Reference to workflow if applicable
    approval_type varchar(50) NOT NULL,
    approval_id uuid NOT NULL,

    -- Action taken
    action varchar(20) NOT NULL, -- approved, rejected
    notes text,

    -- By delegate
    performed_by uuid NOT NULL REFERENCES app.users(id),
    performed_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegator
    ON app.approval_delegations(delegator_id, is_active, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegate
    ON app.approval_delegations(delegate_id, is_active, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_approval_delegations_active
    ON app.approval_delegations(tenant_id, is_active, start_date, end_date)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_delegation_log_delegation
    ON app.delegation_log(delegation_id, performed_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.approval_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.delegation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.approval_delegations
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.delegation_log
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trg_approval_delegations_updated_at
    BEFORE UPDATE ON app.approval_delegations
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Check if user has active delegation
CREATE OR REPLACE FUNCTION app.get_active_delegation(
    p_delegator_id uuid,
    p_scope varchar DEFAULT 'all',
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    delegation_id uuid,
    delegate_id uuid,
    delegate_name text,
    scope varchar,
    end_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ad.id as delegation_id,
        ad.delegate_id,
        u.name as delegate_name,
        ad.scope,
        ad.end_date
    FROM app.approval_delegations ad
    INNER JOIN app.users u ON ad.delegate_id = u.id
    WHERE ad.delegator_id = p_delegator_id
      AND ad.is_active = true
      AND ad.start_date <= p_as_of_date
      AND ad.end_date >= p_as_of_date
      AND (ad.scope = 'all' OR ad.scope = p_scope)
    ORDER BY
        CASE WHEN ad.scope = p_scope THEN 0 ELSE 1 END,
        ad.created_at DESC
    LIMIT 1;
END;
$$;

-- Get all delegated approvers for a user
CREATE OR REPLACE FUNCTION app.get_delegated_approvers(
    p_approver_id uuid,
    p_scope varchar DEFAULT 'all',
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    delegate_id uuid,
    delegate_name text,
    delegation_id uuid,
    scope varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Returns users who can approve on behalf of p_approver_id
    RETURN QUERY
    SELECT
        ad.delegate_id,
        u.name as delegate_name,
        ad.id as delegation_id,
        ad.scope
    FROM app.approval_delegations ad
    INNER JOIN app.users u ON ad.delegate_id = u.id
    WHERE ad.delegator_id = p_approver_id
      AND ad.is_active = true
      AND ad.start_date <= p_as_of_date
      AND ad.end_date >= p_as_of_date
      AND (ad.scope = 'all' OR ad.scope = p_scope);
END;
$$;

-- Check if user can approve on behalf of another
CREATE OR REPLACE FUNCTION app.can_approve_as_delegate(
    p_delegate_id uuid,
    p_original_approver_id uuid,
    p_scope varchar DEFAULT 'all',
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM app.approval_delegations ad
        WHERE ad.delegator_id = p_original_approver_id
          AND ad.delegate_id = p_delegate_id
          AND ad.is_active = true
          AND ad.start_date <= p_as_of_date
          AND ad.end_date >= p_as_of_date
          AND (ad.scope = 'all' OR ad.scope = p_scope)
    );
END;
$$;

-- Log delegation usage
CREATE OR REPLACE FUNCTION app.log_delegation_usage(
    p_delegation_id uuid,
    p_approval_type varchar,
    p_approval_id uuid,
    p_action varchar,
    p_performed_by uuid,
    p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_tenant_id uuid;
BEGIN
    SELECT tenant_id INTO v_tenant_id
    FROM app.approval_delegations
    WHERE id = p_delegation_id;

    INSERT INTO app.delegation_log (
        tenant_id, delegation_id,
        approval_type, approval_id,
        action, notes, performed_by
    )
    VALUES (
        v_tenant_id, p_delegation_id,
        p_approval_type, p_approval_id,
        p_action, p_notes, p_performed_by
    );
END;
$$;

-- Get my delegations (as delegator)
CREATE OR REPLACE FUNCTION app.get_my_delegations(
    p_user_id uuid
)
RETURNS TABLE (
    delegation_id uuid,
    delegate_name text,
    scope varchar,
    start_date date,
    end_date date,
    is_active boolean,
    usage_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ad.id as delegation_id,
        u.name as delegate_name,
        ad.scope,
        ad.start_date,
        ad.end_date,
        ad.is_active AND ad.end_date >= CURRENT_DATE as is_active,
        COUNT(dl.id) as usage_count
    FROM app.approval_delegations ad
    INNER JOIN app.users u ON ad.delegate_id = u.id
    LEFT JOIN app.delegation_log dl ON dl.delegation_id = ad.id
    WHERE ad.delegator_id = p_user_id
    GROUP BY ad.id, u.name
    ORDER BY ad.start_date DESC;
END;
$$;

-- Get delegations I've received
CREATE OR REPLACE FUNCTION app.get_received_delegations(
    p_user_id uuid,
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    delegation_id uuid,
    delegator_name text,
    delegator_id uuid,
    scope varchar,
    end_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ad.id as delegation_id,
        u.name as delegator_name,
        ad.delegator_id,
        ad.scope,
        ad.end_date
    FROM app.approval_delegations ad
    INNER JOIN app.users u ON ad.delegator_id = u.id
    WHERE ad.delegate_id = p_user_id
      AND ad.is_active = true
      AND ad.start_date <= p_as_of_date
      AND ad.end_date >= p_as_of_date
    ORDER BY ad.end_date;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.approval_delegations IS 'Approval delegation configuration';
COMMENT ON TABLE app.delegation_log IS 'Log of approvals performed under delegation';

COMMENT ON COLUMN app.approval_delegations.scope IS 'What types of approvals are delegated';
COMMENT ON COLUMN app.approval_delegations.include_pending IS 'Whether to apply to items already pending at delegation start';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_received_delegations(uuid, date);
-- DROP FUNCTION IF EXISTS app.get_my_delegations(uuid);
-- DROP FUNCTION IF EXISTS app.log_delegation_usage(uuid, varchar, uuid, varchar, uuid, text);
-- DROP FUNCTION IF EXISTS app.can_approve_as_delegate(uuid, uuid, varchar, date);
-- DROP FUNCTION IF EXISTS app.get_delegated_approvers(uuid, varchar, date);
-- DROP FUNCTION IF EXISTS app.get_active_delegation(uuid, varchar, date);
-- DROP TRIGGER IF EXISTS trg_approval_delegations_updated_at ON app.approval_delegations;
-- DROP POLICY IF EXISTS tenant_isolation ON app.delegation_log;
-- DROP POLICY IF EXISTS tenant_isolation ON app.approval_delegations;
-- DROP TABLE IF EXISTS app.delegation_log;
-- DROP TABLE IF EXISTS app.approval_delegations;
