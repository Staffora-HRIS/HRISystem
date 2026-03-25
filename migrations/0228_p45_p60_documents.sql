-- Migration: 0228_p45_p60_documents
-- Created: 2026-03-25
-- Description: Create p45_documents and p60_documents tables for UK
--              statutory document generation. P45 is issued when an
--              employee leaves; P60 is an annual tax summary.
--
-- Depends on: 0017_employees, 0002_tenants, 0003_users

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- P45 Documents Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.p45_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- P45 data
    leaving_date date NOT NULL,
    tax_code_at_leaving varchar(20) NOT NULL,
    ni_number varchar(20),
    total_pay_in_year numeric(12,2) NOT NULL DEFAULT 0,
    total_tax_in_year numeric(12,2) NOT NULL DEFAULT 0,
    student_loan_indicator boolean NOT NULL DEFAULT false,
    student_loan_plan varchar(20),
    tax_year varchar(10) NOT NULL,  -- e.g. '2025-26'

    -- Parts generated (all four P45 parts)
    parts_generated jsonb NOT NULL DEFAULT '{"part1": true, "part1a": true, "part2": true, "part3": true}'::jsonb,

    -- Status lifecycle: generated -> issued -> superseded
    status varchar(20) NOT NULL DEFAULT 'generated',

    -- Generation metadata
    generated_at timestamptz NOT NULL DEFAULT now(),
    generated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    issued_at timestamptz,
    issued_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- One P45 per employee per tax year
    CONSTRAINT p45_documents_unique UNIQUE (tenant_id, employee_id, tax_year)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_p45_documents_tenant
    ON app.p45_documents(tenant_id);

CREATE INDEX IF NOT EXISTS idx_p45_documents_employee
    ON app.p45_documents(employee_id);

CREATE INDEX IF NOT EXISTS idx_p45_documents_tax_year
    ON app.p45_documents(tenant_id, tax_year);

-- RLS
ALTER TABLE app.p45_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.p45_documents
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.p45_documents
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Updated at trigger
CREATE TRIGGER update_p45_documents_updated_at
    BEFORE UPDATE ON app.p45_documents
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- P60 Documents Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.p60_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- P60 data
    tax_year varchar(10) NOT NULL,  -- e.g. '2025-26'
    final_tax_code varchar(20) NOT NULL,
    total_pay numeric(12,2) NOT NULL DEFAULT 0,
    total_tax numeric(12,2) NOT NULL DEFAULT 0,
    ni_contributions jsonb NOT NULL DEFAULT '{}'::jsonb,
    student_loan_deductions numeric(12,2) NOT NULL DEFAULT 0,
    pension_contributions numeric(12,2) NOT NULL DEFAULT 0,

    -- Status lifecycle: generated -> issued -> superseded
    status varchar(20) NOT NULL DEFAULT 'generated',

    -- Generation metadata
    generated_at timestamptz NOT NULL DEFAULT now(),
    generated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    issued_at timestamptz,
    issued_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- One P60 per employee per tax year
    CONSTRAINT p60_documents_unique UNIQUE (tenant_id, employee_id, tax_year)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_p60_documents_tenant
    ON app.p60_documents(tenant_id);

CREATE INDEX IF NOT EXISTS idx_p60_documents_employee
    ON app.p60_documents(employee_id);

CREATE INDEX IF NOT EXISTS idx_p60_documents_tax_year
    ON app.p60_documents(tenant_id, tax_year);

-- RLS
ALTER TABLE app.p60_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.p60_documents
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.p60_documents
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Updated at trigger
CREATE TRIGGER update_p60_documents_updated_at
    BEFORE UPDATE ON app.p60_documents
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.p45_documents IS 'P45 documents issued when employees leave employment (UK statutory requirement)';
COMMENT ON TABLE app.p60_documents IS 'P60 documents summarising annual pay and tax for employees (UK statutory requirement)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_p60_documents_updated_at ON app.p60_documents;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.p60_documents;
-- DROP POLICY IF EXISTS tenant_isolation ON app.p60_documents;
-- DROP TABLE IF EXISTS app.p60_documents;
-- DROP TRIGGER IF EXISTS update_p45_documents_updated_at ON app.p45_documents;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.p45_documents;
-- DROP POLICY IF EXISTS tenant_isolation ON app.p45_documents;
-- DROP TABLE IF EXISTS app.p45_documents;
