-- Migration: 0141_contract_statements
-- Created: 2026-03-13
-- Description: UK Written Statement of Employment Particulars generation and tracking.
--              Since 6 April 2020, all UK employees (and workers) must receive a
--              written statement of employment particulars on or before their first day
--              of work (Section 1, Employment Rights Act 1996 as amended by the
--              Employment Rights (Employment Particulars and Paid Annual Leave)
--              (Amendment) Regulations 2018).
--
--              This table stores generated statements, tracks issuance, and records
--              employee acknowledgement. Two statement types are supported:
--              - section_1: Day-one statement (must be given on or before first day)
--              - section_2: Wider written statement (within 2 months of start)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Statement type enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statement_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
        CREATE TYPE app.statement_type AS ENUM ('section_1', 'section_2');
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- contract_statements - Generated written statements
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.contract_statements (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The employee this statement is for
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- The contract this statement relates to
    contract_id uuid NOT NULL REFERENCES app.employment_contracts(id) ON DELETE CASCADE,

    -- Type of statement (section_1 = day-one particulars, section_2 = wider details)
    statement_type app.statement_type NOT NULL DEFAULT 'section_1',

    -- When this statement was generated
    generated_at timestamptz NOT NULL DEFAULT now(),

    -- Who generated this statement (HR user)
    generated_by uuid NOT NULL REFERENCES app.users(id),

    -- Optional template used for PDF rendering
    template_id uuid,

    -- The assembled statement data (Section 1 particulars as structured JSON)
    -- Contains: employer_name, employee_name, job_title, start_date, pay,
    --           hours, holiday_entitlement, location, notice_periods, pension,
    --           collective_agreements, etc.
    content jsonb NOT NULL DEFAULT '{}',

    -- Reference to generated PDF file in storage (nullable until PDF is generated)
    pdf_file_key varchar(500),

    -- When the statement was formally issued to the employee
    issued_at timestamptz,

    -- When the employee acknowledged receipt of the statement
    acknowledged_at timestamptz,

    -- Whether the employee has acknowledged the statement
    acknowledged_by_employee boolean NOT NULL DEFAULT false,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Acknowledgement consistency: if acknowledged, must have timestamp
    CONSTRAINT cs_acknowledged_consistency CHECK (
        (acknowledged_by_employee = false AND acknowledged_at IS NULL)
        OR (acknowledged_by_employee = true AND acknowledged_at IS NOT NULL)
    ),
    -- Issued before acknowledged
    CONSTRAINT cs_issued_before_acknowledged CHECK (
        acknowledged_at IS NULL OR (issued_at IS NOT NULL AND acknowledged_at >= issued_at)
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: statements for an employee
CREATE INDEX IF NOT EXISTS idx_contract_statements_tenant_employee
    ON app.contract_statements(tenant_id, employee_id);

-- Lookup by contract
CREATE INDEX IF NOT EXISTS idx_contract_statements_tenant_contract
    ON app.contract_statements(tenant_id, contract_id);

-- Find unissued statements (for HR dashboard / reminders)
CREATE INDEX IF NOT EXISTS idx_contract_statements_unissued
    ON app.contract_statements(tenant_id, generated_at)
    WHERE issued_at IS NULL;

-- Find unacknowledged statements
CREATE INDEX IF NOT EXISTS idx_contract_statements_unacknowledged
    ON app.contract_statements(tenant_id, issued_at)
    WHERE issued_at IS NOT NULL AND acknowledged_by_employee = false;

-- Statement type filtering
CREATE INDEX IF NOT EXISTS idx_contract_statements_type
    ON app.contract_statements(tenant_id, statement_type);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.contract_statements ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see statements for their current tenant
CREATE POLICY tenant_isolation ON app.contract_statements
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.contract_statements
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_contract_statements_updated_at
    BEFORE UPDATE ON app.contract_statements
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.contract_statements IS 'UK Written Statement of Employment Particulars (ERA 1996 s.1-7B)';
COMMENT ON COLUMN app.contract_statements.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.contract_statements.tenant_id IS 'Tenant that owns this data';
COMMENT ON COLUMN app.contract_statements.employee_id IS 'Employee this statement is for';
COMMENT ON COLUMN app.contract_statements.contract_id IS 'Employment contract this statement relates to';
COMMENT ON COLUMN app.contract_statements.statement_type IS 'section_1 = day-one statement, section_2 = wider written statement within 2 months';
COMMENT ON COLUMN app.contract_statements.generated_at IS 'When the statement content was assembled';
COMMENT ON COLUMN app.contract_statements.generated_by IS 'HR user who generated this statement';
COMMENT ON COLUMN app.contract_statements.template_id IS 'Optional template used for PDF rendering';
COMMENT ON COLUMN app.contract_statements.content IS 'Assembled statement data as structured JSON';
COMMENT ON COLUMN app.contract_statements.pdf_file_key IS 'Reference to generated PDF in storage';
COMMENT ON COLUMN app.contract_statements.issued_at IS 'When statement was formally issued to employee';
COMMENT ON COLUMN app.contract_statements.acknowledged_at IS 'When employee acknowledged receipt';
COMMENT ON COLUMN app.contract_statements.acknowledged_by_employee IS 'Whether employee has acknowledged';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_contract_statements_updated_at ON app.contract_statements;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.contract_statements;
-- DROP POLICY IF EXISTS tenant_isolation ON app.contract_statements;
-- DROP INDEX IF EXISTS app.idx_contract_statements_type;
-- DROP INDEX IF EXISTS app.idx_contract_statements_unacknowledged;
-- DROP INDEX IF EXISTS app.idx_contract_statements_unissued;
-- DROP INDEX IF EXISTS app.idx_contract_statements_tenant_contract;
-- DROP INDEX IF EXISTS app.idx_contract_statements_tenant_employee;
-- DROP TABLE IF EXISTS app.contract_statements;
-- DROP TYPE IF EXISTS app.statement_type;
