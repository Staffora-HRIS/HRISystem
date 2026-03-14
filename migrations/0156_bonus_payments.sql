-- Migration: 0156_bonus_payments
-- Created: 2026-03-14
-- Description: Create the bonus_payments table for tracking bonus payments to employees
--              Required for UK Gender Pay Gap reporting (bonus gap metrics)
--              Tracks profit sharing, productivity, performance and incentive payments
--              Used alongside compensation_history for complete GPG calculations

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Bonus Payments Table
-- -----------------------------------------------------------------------------
-- Stores individual bonus payments for employees
-- Used for GPG reporting: bonus pay = any pay relating to profit sharing,
-- productivity, performance, incentive (UK Equality Act 2010 definition)
CREATE TABLE IF NOT EXISTS app.bonus_payments (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this data
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee who received the bonus
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Bonus details
    amount numeric(15, 2) NOT NULL,
    currency varchar(3) NOT NULL DEFAULT 'GBP',

    -- Bonus type: categorises the payment for reporting purposes
    -- profit_sharing, productivity, performance, incentive, commission, other
    bonus_type varchar(30) NOT NULL DEFAULT 'performance',

    -- Date the bonus was paid (determines which GPG reporting period it falls in)
    payment_date date NOT NULL,

    -- Reference period for the bonus (e.g. the year the bonus relates to)
    period_start date,
    period_end date,

    -- Optional description
    description text,

    -- Audit trail
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT bonus_payments_amount_positive CHECK (amount > 0),

    CONSTRAINT bonus_payments_currency_format CHECK (currency ~ '^[A-Z]{3}$'),

    CONSTRAINT bonus_payments_type_valid CHECK (
        bonus_type IN (
            'profit_sharing', 'productivity', 'performance',
            'incentive', 'commission', 'other'
        )
    ),

    CONSTRAINT bonus_payments_period_valid CHECK (
        period_start IS NULL OR period_end IS NULL OR period_end >= period_start
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: bonus payments for an employee
CREATE INDEX IF NOT EXISTS idx_bonus_payments_tenant_employee
    ON app.bonus_payments(tenant_id, employee_id);

-- Payment date range queries (for GPG reporting period filtering)
CREATE INDEX IF NOT EXISTS idx_bonus_payments_payment_date
    ON app.bonus_payments(tenant_id, payment_date);

-- Employee + payment date composite for GPG queries
CREATE INDEX IF NOT EXISTS idx_bonus_payments_employee_date
    ON app.bonus_payments(tenant_id, employee_id, payment_date);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.bonus_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.bonus_payments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.bonus_payments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_bonus_payments_updated_at
    BEFORE UPDATE ON app.bonus_payments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Grant access to app role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.bonus_payments TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.bonus_payments IS 'Bonus payments to employees — used for UK Gender Pay Gap bonus gap calculations';
COMMENT ON COLUMN app.bonus_payments.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.bonus_payments.tenant_id IS 'Tenant that owns this payment';
COMMENT ON COLUMN app.bonus_payments.employee_id IS 'Employee who received the bonus';
COMMENT ON COLUMN app.bonus_payments.amount IS 'Bonus amount (positive, in stated currency)';
COMMENT ON COLUMN app.bonus_payments.currency IS 'Currency code (ISO 4217)';
COMMENT ON COLUMN app.bonus_payments.bonus_type IS 'Type: profit_sharing, productivity, performance, incentive, commission, other';
COMMENT ON COLUMN app.bonus_payments.payment_date IS 'Date the bonus was paid (determines GPG reporting period)';
COMMENT ON COLUMN app.bonus_payments.period_start IS 'Start of the period the bonus relates to';
COMMENT ON COLUMN app.bonus_payments.period_end IS 'End of the period the bonus relates to';
COMMENT ON COLUMN app.bonus_payments.description IS 'Optional description of the bonus';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_bonus_payments_updated_at ON app.bonus_payments;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.bonus_payments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.bonus_payments;
-- DROP INDEX IF EXISTS app.idx_bonus_payments_employee_date;
-- DROP INDEX IF EXISTS app.idx_bonus_payments_payment_date;
-- DROP INDEX IF EXISTS app.idx_bonus_payments_tenant_employee;
-- DROP TABLE IF EXISTS app.bonus_payments;
