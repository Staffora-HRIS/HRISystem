-- Migration: 0135_contract_amendments
-- Created: 2026-03-13
-- Description: Contract amendment notification tracking for UK compliance.
--              Under the Employment Rights Act 1996, s.4, employers must notify
--              employees of any changes to their terms and conditions of employment
--              at the earliest opportunity and no later than 1 month before the
--              change takes effect (for most changes).
--
--              This table tracks:
--              - What was amended on the contract
--              - When the amendment takes effect
--              - When the employee was notified (must be >= 1 month before effective)
--              - Whether the employee acknowledged the change
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- contract_amendments - Amendment notification tracking
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.contract_amendments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The employee whose contract is being amended
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- The specific contract being amended
    contract_id uuid NOT NULL REFERENCES app.employment_contracts(id) ON DELETE CASCADE,

    -- Type of amendment (e.g., 'hours_change', 'role_change', 'location_change',
    -- 'pay_change', 'benefits_change', 'reporting_line', 'other')
    amendment_type varchar(50) NOT NULL,

    -- Human-readable description of what changed
    description text NOT NULL,

    -- When the amendment takes effect
    effective_date date NOT NULL,

    -- When the employee was (or will be) notified
    -- Must be at least 1 month before the effective date per ERA 1996 s.4
    notification_date date NOT NULL,

    -- Whether the notification has been sent
    notification_sent boolean NOT NULL DEFAULT false,

    -- Employee acknowledgement tracking
    acknowledged_by_employee boolean NOT NULL DEFAULT false,
    acknowledged_at timestamptz,

    -- Who created this amendment record
    created_by uuid,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Business constraints
    -- Notification date must be at least 1 month (30 days) before effective date
    CONSTRAINT ca_notification_lead_time CHECK (
        notification_date <= effective_date - INTERVAL '1 month'
    ),
    -- Acknowledgement timestamp requires acknowledgement flag
    CONSTRAINT ca_acknowledged_consistency CHECK (
        (acknowledged_by_employee = false AND acknowledged_at IS NULL)
        OR (acknowledged_by_employee = true AND acknowledged_at IS NOT NULL)
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_contract_amendments_tenant_employee
    ON app.contract_amendments(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_contract_amendments_tenant_notification
    ON app.contract_amendments(tenant_id, notification_date)
    WHERE notification_sent = false;

CREATE INDEX IF NOT EXISTS idx_contract_amendments_contract
    ON app.contract_amendments(contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_amendments_effective_date
    ON app.contract_amendments(tenant_id, effective_date);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.contract_amendments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.contract_amendments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.contract_amendments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_contract_amendments_updated_at
    BEFORE UPDATE ON app.contract_amendments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Table Comments
-- =============================================================================

COMMENT ON TABLE app.contract_amendments IS 'Contract amendment notification tracking. Employment Rights Act 1996 s.4 requires employers to notify employees of changes to terms and conditions no later than 1 month before the change takes effect.';

-- =============================================================================
-- GRANT access to the application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.contract_amendments TO hris_app;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_contract_amendments_updated_at ON app.contract_amendments;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.contract_amendments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.contract_amendments;
-- DROP INDEX IF EXISTS app.idx_contract_amendments_effective_date;
-- DROP INDEX IF EXISTS app.idx_contract_amendments_contract;
-- DROP INDEX IF EXISTS app.idx_contract_amendments_tenant_notification;
-- DROP INDEX IF EXISTS app.idx_contract_amendments_tenant_employee;
-- DROP TABLE IF EXISTS app.contract_amendments;
