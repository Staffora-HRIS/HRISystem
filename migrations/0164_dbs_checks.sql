-- Migration: 0164_dbs_checks
-- Created: 2026-03-14
-- Description: DBS (Disclosure and Barring Service) checks for UK employment compliance
--
-- UK employers may be legally required to obtain DBS checks for roles involving
-- work with children, vulnerable adults, or positions of trust. This migration
-- tracks the DBS check lifecycle and update service registrations.
--
-- Check levels:
--   basic     - Unspent convictions only
--   standard  - Spent and unspent convictions, cautions, reprimands, warnings
--   enhanced  - Standard + relevant police information
--   enhanced_barred - Enhanced + barred list check(s)
--
-- Status lifecycle:
--   pending -> submitted   (application sent to DBS)
--   submitted -> received  (certificate received)
--   received -> clear      (no relevant information disclosed)
--   received -> flagged    (information disclosed, requires review)
--   clear -> expired       (certificate age exceeds policy threshold)
--   flagged -> expired     (certificate age exceeds policy threshold)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enum: DBS check level
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dbs_check_level' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.dbs_check_level AS ENUM ('basic', 'standard', 'enhanced', 'enhanced_barred');
  END IF;
END
$$;

-- Enum: DBS check status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dbs_check_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.dbs_check_status AS ENUM ('pending', 'submitted', 'received', 'clear', 'flagged', 'expired');
  END IF;
END
$$;

-- =============================================================================
-- Table: dbs_checks
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.dbs_checks (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee being checked
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Check details
    check_level app.dbs_check_level NOT NULL,
    certificate_number varchar(50),
    issue_date date,

    -- DBS Update Service
    dbs_update_service_registered boolean NOT NULL DEFAULT false,
    update_service_id varchar(50),

    -- Status tracking
    status app.dbs_check_status NOT NULL DEFAULT 'pending',
    result text,
    expiry_date date,

    -- Verification
    checked_by uuid REFERENCES app.employees(id) ON DELETE SET NULL,
    notes text,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE app.dbs_checks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY tenant_isolation ON app.dbs_checks
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.dbs_checks
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Indexes
CREATE INDEX idx_dbs_checks_tenant_employee ON app.dbs_checks (tenant_id, employee_id);
CREATE INDEX idx_dbs_checks_tenant_status ON app.dbs_checks (tenant_id, status);
CREATE INDEX idx_dbs_checks_certificate ON app.dbs_checks (certificate_number)
    WHERE certificate_number IS NOT NULL;
CREATE INDEX idx_dbs_checks_expiry ON app.dbs_checks (tenant_id, expiry_date)
    WHERE expiry_date IS NOT NULL;
CREATE INDEX idx_dbs_checks_tenant_created ON app.dbs_checks (tenant_id, created_at DESC);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_dbs_checks_updated_at
    BEFORE UPDATE ON app.dbs_checks
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- DOWN Migration (commented out -- run manually to rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_dbs_checks_updated_at ON app.dbs_checks;
-- DROP INDEX IF EXISTS app.idx_dbs_checks_tenant_created;
-- DROP INDEX IF EXISTS app.idx_dbs_checks_expiry;
-- DROP INDEX IF EXISTS app.idx_dbs_checks_certificate;
-- DROP INDEX IF EXISTS app.idx_dbs_checks_tenant_status;
-- DROP INDEX IF EXISTS app.idx_dbs_checks_tenant_employee;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.dbs_checks;
-- DROP POLICY IF EXISTS tenant_isolation ON app.dbs_checks;
-- DROP TABLE IF EXISTS app.dbs_checks;
-- DROP TYPE IF EXISTS app.dbs_check_status;
-- DROP TYPE IF EXISTS app.dbs_check_level;
