-- Migration: 0198_salary_sacrifices
-- Created: 2026-03-17
-- Description: Create salary_sacrifices table for salary sacrifice processing (TODO-232)
--   - Tracks salary sacrifice arrangements (pension, cycle_to_work, childcare_vouchers, electric_car, technology)
--   - Supports monthly and annual frequencies
--   - Status lifecycle: active -> paused | ended
--   - RLS enforced for multi-tenant isolation
--   - UK: salary sacrifice must not reduce pay below National Minimum Wage

-- =============================================================================
-- 1. Create sacrifice_type enum
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sacrifice_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
        CREATE TYPE app.sacrifice_type AS ENUM ('pension', 'cycle_to_work', 'childcare_vouchers', 'electric_car', 'technology');
    END IF;
END
$$;

-- =============================================================================
-- 2. Create sacrifice_frequency enum
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sacrifice_frequency' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
        CREATE TYPE app.sacrifice_frequency AS ENUM ('monthly', 'annual');
    END IF;
END
$$;

-- =============================================================================
-- 3. Create sacrifice_status enum
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sacrifice_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
        CREATE TYPE app.sacrifice_status AS ENUM ('active', 'paused', 'ended');
    END IF;
END
$$;

-- =============================================================================
-- 4. Create salary_sacrifices table
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.salary_sacrifices (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL,
    employee_id       uuid NOT NULL REFERENCES app.employees(id),

    -- Sacrifice details
    sacrifice_type    app.sacrifice_type NOT NULL,
    amount            numeric(12, 2) NOT NULL CHECK (amount > 0),
    frequency         app.sacrifice_frequency NOT NULL DEFAULT 'monthly',
    start_date        date NOT NULL,
    end_date          date,

    -- Status
    status            app.sacrifice_status NOT NULL DEFAULT 'active',

    -- Metadata
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT salary_sacrifices_valid_dates CHECK (
        end_date IS NULL OR end_date >= start_date
    )
);

-- =============================================================================
-- 5. Enable RLS
-- =============================================================================

ALTER TABLE app.salary_sacrifices ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (SELECT, UPDATE, DELETE)
CREATE POLICY salary_sacrifices_tenant_isolation ON app.salary_sacrifices
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Tenant isolation policy (INSERT)
CREATE POLICY salary_sacrifices_tenant_isolation_insert ON app.salary_sacrifices
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- 6. Indexes
-- =============================================================================

-- Tenant + employee lookup (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_salary_sacrifices_tenant_employee
    ON app.salary_sacrifices(tenant_id, employee_id);

-- Active sacrifices per employee (for NMW checks and payroll)
CREATE INDEX IF NOT EXISTS idx_salary_sacrifices_active
    ON app.salary_sacrifices(tenant_id, employee_id, status)
    WHERE status = 'active';

-- Sacrifice type lookup (for reports by type)
CREATE INDEX IF NOT EXISTS idx_salary_sacrifices_type
    ON app.salary_sacrifices(tenant_id, sacrifice_type);

-- =============================================================================
-- 7. Auto-update updated_at trigger
-- =============================================================================

CREATE OR REPLACE TRIGGER update_salary_sacrifices_updated_at
    BEFORE UPDATE ON app.salary_sacrifices
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- 8. Grant permissions to app role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.salary_sacrifices TO hris_app;

-- =============================================================================
-- 9. Comments
-- =============================================================================

COMMENT ON TABLE app.salary_sacrifices IS 'Salary sacrifice arrangements allowing employees to exchange gross salary for non-cash benefits. UK: must not reduce pay below NMW.';
COMMENT ON COLUMN app.salary_sacrifices.sacrifice_type IS 'Type of salary sacrifice: pension, cycle_to_work, childcare_vouchers, electric_car, technology.';
COMMENT ON COLUMN app.salary_sacrifices.amount IS 'Sacrifice amount in GBP. Must be greater than zero.';
COMMENT ON COLUMN app.salary_sacrifices.frequency IS 'How often the sacrifice is applied: monthly or annual.';
COMMENT ON COLUMN app.salary_sacrifices.status IS 'active: currently deducted; paused: temporarily stopped; ended: permanently concluded.';
COMMENT ON CONSTRAINT salary_sacrifices_valid_dates ON app.salary_sacrifices IS 'End date must be on or after start date.';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_salary_sacrifices_updated_at ON app.salary_sacrifices;
-- DROP TABLE IF EXISTS app.salary_sacrifices;
-- DROP TYPE IF EXISTS app.sacrifice_status;
-- DROP TYPE IF EXISTS app.sacrifice_frequency;
-- DROP TYPE IF EXISTS app.sacrifice_type;
