-- Migration: 0163_reference_checks
-- Created: 2026-03-14
-- Description: Reference checks table for recruitment pre-employment verification
--
-- Tracks employment references for candidates and existing employees.
-- Supports the full lifecycle: request -> send -> receive -> verify/fail.
--
-- Status lifecycle:
--   pending -> sent       (reference request email dispatched)
--   sent -> received      (referee has responded)
--   received -> verified  (HR has reviewed and confirmed satisfactory)
--   received -> failed    (reference is unsatisfactory or fraudulent)
--   pending -> failed     (unable to contact referee)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enum: referee relationship type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referee_relationship' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.referee_relationship AS ENUM ('manager', 'colleague', 'academic', 'character');
  END IF;
END
$$;

-- Enum: reference check status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reference_check_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.reference_check_status AS ENUM ('pending', 'sent', 'received', 'verified', 'failed');
  END IF;
END
$$;

-- =============================================================================
-- Table: reference_checks
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.reference_checks (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Subject of the reference check (one of these should be set)
    candidate_id uuid REFERENCES app.candidates(id) ON DELETE SET NULL,
    employee_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,

    -- Referee details
    referee_name varchar(255) NOT NULL,
    referee_email varchar(255) NOT NULL,
    referee_phone varchar(50),
    referee_relationship app.referee_relationship NOT NULL,
    company_name varchar(255),
    job_title varchar(255),

    -- Employment period being referenced
    dates_from date,
    dates_to date,

    -- Status tracking
    status app.reference_check_status NOT NULL DEFAULT 'pending',
    sent_at timestamptz,
    received_at timestamptz,

    -- Verification
    verified_by uuid REFERENCES app.employees(id) ON DELETE SET NULL,
    verification_notes text,
    reference_content text,
    satisfactory boolean,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Ensure at least one subject is specified
    CONSTRAINT chk_reference_subject CHECK (candidate_id IS NOT NULL OR employee_id IS NOT NULL)
);

-- Enable Row-Level Security
ALTER TABLE app.reference_checks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY tenant_isolation ON app.reference_checks
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.reference_checks
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Indexes
CREATE INDEX idx_reference_checks_tenant_candidate ON app.reference_checks (tenant_id, candidate_id)
    WHERE candidate_id IS NOT NULL;
CREATE INDEX idx_reference_checks_tenant_employee ON app.reference_checks (tenant_id, employee_id)
    WHERE employee_id IS NOT NULL;
CREATE INDEX idx_reference_checks_tenant_status ON app.reference_checks (tenant_id, status);
CREATE INDEX idx_reference_checks_tenant_created ON app.reference_checks (tenant_id, created_at DESC);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_reference_checks_updated_at
    BEFORE UPDATE ON app.reference_checks
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- DOWN Migration (commented out -- run manually to rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_reference_checks_updated_at ON app.reference_checks;
-- DROP INDEX IF EXISTS app.idx_reference_checks_tenant_created;
-- DROP INDEX IF EXISTS app.idx_reference_checks_tenant_status;
-- DROP INDEX IF EXISTS app.idx_reference_checks_tenant_employee;
-- DROP INDEX IF EXISTS app.idx_reference_checks_tenant_candidate;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.reference_checks;
-- DROP POLICY IF EXISTS tenant_isolation ON app.reference_checks;
-- DROP TABLE IF EXISTS app.reference_checks;
-- DROP TYPE IF EXISTS app.reference_check_status;
-- DROP TYPE IF EXISTS app.referee_relationship;
