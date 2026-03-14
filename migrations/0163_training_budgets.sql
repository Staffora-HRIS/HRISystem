-- Migration: 0163_training_budgets
-- Created: 2026-03-14
-- Description: Training budget management and expense tracking for LMS

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enum for training expense status
DO $$ BEGIN
    CREATE TYPE app.training_expense_status AS ENUM (
        'pending', 'approved', 'rejected', 'paid'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Training Budgets Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.training_budgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    department_id uuid,
    financial_year varchar(9) NOT NULL, -- e.g. '2025/2026'
    total_budget numeric(15, 2) NOT NULL CHECK (total_budget >= 0),
    spent numeric(15, 2) NOT NULL DEFAULT 0 CHECK (spent >= 0),
    committed numeric(15, 2) NOT NULL DEFAULT 0 CHECK (committed >= 0),
    currency varchar(3) NOT NULL DEFAULT 'GBP',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT training_budgets_unique_dept_year UNIQUE (tenant_id, department_id, financial_year)
);

-- -----------------------------------------------------------------------------
-- Training Expenses Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.training_expenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    budget_id uuid NOT NULL REFERENCES app.training_budgets(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
    course_id uuid,
    description text NOT NULL,
    amount numeric(15, 2) NOT NULL CHECK (amount > 0),
    expense_date date NOT NULL,
    receipt_key varchar(500),
    status app.training_expense_status NOT NULL DEFAULT 'pending',
    approved_by uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_training_budgets_tenant
    ON app.training_budgets(tenant_id);

CREATE INDEX IF NOT EXISTS idx_training_budgets_tenant_year
    ON app.training_budgets(tenant_id, financial_year);

CREATE INDEX IF NOT EXISTS idx_training_expenses_tenant
    ON app.training_expenses(tenant_id);

CREATE INDEX IF NOT EXISTS idx_training_expenses_budget
    ON app.training_expenses(budget_id);

CREATE INDEX IF NOT EXISTS idx_training_expenses_employee
    ON app.training_expenses(employee_id);

CREATE INDEX IF NOT EXISTS idx_training_expenses_status
    ON app.training_expenses(tenant_id, status);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.training_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.training_budgets
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.training_budgets
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

ALTER TABLE app.training_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.training_expenses
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.training_expenses
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_training_budgets_updated_at
    BEFORE UPDATE ON app.training_budgets
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Grant permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.training_budgets TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.training_expenses TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.training_budgets IS 'Department training budgets per financial year';
COMMENT ON TABLE app.training_expenses IS 'Individual training expense claims against budgets';
COMMENT ON COLUMN app.training_budgets.financial_year IS 'Financial year in format YYYY/YYYY';
COMMENT ON COLUMN app.training_budgets.spent IS 'Total amount paid out from this budget';
COMMENT ON COLUMN app.training_budgets.committed IS 'Total amount approved but not yet paid';
COMMENT ON COLUMN app.training_expenses.receipt_key IS 'Storage key for receipt upload';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TABLE IF EXISTS app.training_expenses;
-- DROP TABLE IF EXISTS app.training_budgets;
-- DROP TYPE IF EXISTS app.training_expense_status;
