-- Migration: 0128_consent_management
-- Created: 2026-03-13
-- Description: GDPR Consent Management tables for recording, tracking, and auditing
--              data processing consent decisions per employee.
--
-- GDPR Requirements (Articles 6-7):
--   - Consent must be freely given, specific, informed, and unambiguous
--   - Must be as easy to withdraw as to give
--   - Must track: what was consented to, when, how, and the policy version
--   - Records must be kept as proof of consent
--
-- Legal bases for processing:
--   consent            - Processing based on explicit consent (GDPR Art. 6(1)(a))
--   legitimate_interest - Legitimate interest of the controller (Art. 6(1)(f))
--   contract           - Necessary for contract performance (Art. 6(1)(b))
--   legal_obligation   - Required by law (Art. 6(1)(c))
--
-- Consent status lifecycle:
--   pending   → granted     (employee gives consent)
--   pending   → withdrawn   (employee declines / never consents)
--   granted   → withdrawn   (employee withdraws consent — must be easy)
--   granted   → expired     (consent expiry date passed)
--   withdrawn → granted     (employee re-consents)
--   expired   → granted     (employee re-consents after expiry)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enum: legal basis for data processing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consent_legal_basis' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.consent_legal_basis AS ENUM ('consent', 'legitimate_interest', 'contract', 'legal_obligation');
  END IF;
END
$$;

-- Enum: consent record status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consent_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.consent_status AS ENUM ('pending', 'granted', 'withdrawn', 'expired');
  END IF;
END
$$;

-- Enum: how consent was collected
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consent_method' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.consent_method AS ENUM ('web_form', 'paper', 'email', 'onboarding', 'api');
  END IF;
END
$$;

-- Enum: consent audit action
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consent_audit_action' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.consent_audit_action AS ENUM ('granted', 'withdrawn', 'expired', 'renewed', 'purpose_updated');
  END IF;
END
$$;

-- =============================================================================
-- Table: consent_purposes
-- Defines each processing purpose that requires consent
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.consent_purposes (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Purpose identification
    code varchar(50) NOT NULL,
    name varchar(200) NOT NULL,
    description text NOT NULL,

    -- Legal framework
    legal_basis app.consent_legal_basis NOT NULL DEFAULT 'consent',
    data_categories text[] NOT NULL DEFAULT '{}',
    retention_period_days integer,

    -- Flags
    is_required boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,

    -- Versioning: incremented when purpose description/scope changes
    version integer NOT NULL DEFAULT 1,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Unique code per tenant
    CONSTRAINT uq_consent_purposes_tenant_code UNIQUE (tenant_id, code)
);

-- Enable Row-Level Security
ALTER TABLE app.consent_purposes ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY tenant_isolation ON app.consent_purposes
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.consent_purposes
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Indexes
CREATE INDEX idx_consent_purposes_tenant ON app.consent_purposes (tenant_id);
CREATE INDEX idx_consent_purposes_tenant_active ON app.consent_purposes (tenant_id, is_active)
    WHERE is_active = true;
CREATE INDEX idx_consent_purposes_tenant_code ON app.consent_purposes (tenant_id, code);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_consent_purposes_updated_at
    BEFORE UPDATE ON app.consent_purposes
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Table: consent_records
-- Individual consent decisions per employee per purpose
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.consent_records (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Subject and purpose
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
    consent_purpose_id uuid NOT NULL REFERENCES app.consent_purposes(id) ON DELETE CASCADE,

    -- Version snapshot: records which version of the purpose was active at consent time
    purpose_version integer NOT NULL,

    -- Status
    status app.consent_status NOT NULL DEFAULT 'pending',

    -- Timestamps for consent actions
    granted_at timestamptz,
    withdrawn_at timestamptz,

    -- How consent was obtained
    consent_method app.consent_method,

    -- Request metadata (proof of consent)
    ip_address varchar(45),
    user_agent text,

    -- Withdrawal details
    withdrawal_reason text,

    -- Expiry
    expires_at timestamptz,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE app.consent_records ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY tenant_isolation ON app.consent_records
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.consent_records
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Indexes
CREATE INDEX idx_consent_records_tenant_employee ON app.consent_records (tenant_id, employee_id);
CREATE INDEX idx_consent_records_tenant_purpose ON app.consent_records (tenant_id, consent_purpose_id);
CREATE INDEX idx_consent_records_tenant_status ON app.consent_records (tenant_id, status);
CREATE INDEX idx_consent_records_employee_purpose ON app.consent_records (employee_id, consent_purpose_id);
CREATE INDEX idx_consent_records_expires_at ON app.consent_records (tenant_id, expires_at)
    WHERE expires_at IS NOT NULL AND status = 'granted';
CREATE INDEX idx_consent_records_tenant_created ON app.consent_records (tenant_id, created_at DESC);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_consent_records_updated_at
    BEFORE UPDATE ON app.consent_records
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Table: consent_audit_log
-- Immutable history of all consent-related actions
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.consent_audit_log (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Reference to the consent record
    consent_record_id uuid NOT NULL REFERENCES app.consent_records(id) ON DELETE CASCADE,

    -- What happened
    action app.consent_audit_action NOT NULL,

    -- Who performed it (NULL for system-triggered actions like expiry)
    performed_by uuid,

    -- Additional context
    details jsonb NOT NULL DEFAULT '{}',

    -- Immutable timestamp
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE app.consent_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY tenant_isolation ON app.consent_audit_log
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.consent_audit_log
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Indexes
CREATE INDEX idx_consent_audit_log_record ON app.consent_audit_log (consent_record_id);
CREATE INDEX idx_consent_audit_log_tenant ON app.consent_audit_log (tenant_id);
CREATE INDEX idx_consent_audit_log_tenant_created ON app.consent_audit_log (tenant_id, created_at DESC);

-- =============================================================================
-- GRANT permissions to the application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON app.consent_purposes TO hris_app;
GRANT SELECT, INSERT, UPDATE ON app.consent_records TO hris_app;
GRANT SELECT, INSERT ON app.consent_audit_log TO hris_app;

-- =============================================================================
-- DOWN Migration (commented out — run manually to rollback)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_consent_audit_log_tenant_created;
-- DROP INDEX IF EXISTS app.idx_consent_audit_log_tenant;
-- DROP INDEX IF EXISTS app.idx_consent_audit_log_record;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.consent_audit_log;
-- DROP POLICY IF EXISTS tenant_isolation ON app.consent_audit_log;
-- DROP TABLE IF EXISTS app.consent_audit_log;
--
-- DROP TRIGGER IF EXISTS update_consent_records_updated_at ON app.consent_records;
-- DROP INDEX IF EXISTS app.idx_consent_records_tenant_created;
-- DROP INDEX IF EXISTS app.idx_consent_records_expires_at;
-- DROP INDEX IF EXISTS app.idx_consent_records_employee_purpose;
-- DROP INDEX IF EXISTS app.idx_consent_records_tenant_status;
-- DROP INDEX IF EXISTS app.idx_consent_records_tenant_purpose;
-- DROP INDEX IF EXISTS app.idx_consent_records_tenant_employee;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.consent_records;
-- DROP POLICY IF EXISTS tenant_isolation ON app.consent_records;
-- DROP TABLE IF EXISTS app.consent_records;
--
-- DROP TRIGGER IF EXISTS update_consent_purposes_updated_at ON app.consent_purposes;
-- DROP INDEX IF EXISTS app.idx_consent_purposes_tenant_code;
-- DROP INDEX IF EXISTS app.idx_consent_purposes_tenant_active;
-- DROP INDEX IF EXISTS app.idx_consent_purposes_tenant;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.consent_purposes;
-- DROP POLICY IF EXISTS tenant_isolation ON app.consent_purposes;
-- DROP TABLE IF EXISTS app.consent_purposes;
--
-- DROP TYPE IF EXISTS app.consent_audit_action;
-- DROP TYPE IF EXISTS app.consent_method;
-- DROP TYPE IF EXISTS app.consent_status;
-- DROP TYPE IF EXISTS app.consent_legal_basis;
