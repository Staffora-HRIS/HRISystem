-- Migration: 0126_right_to_work
-- Created: 2026-03-13
-- Description: Right to Work (RTW) verification tables for UK employment law compliance
--
-- UK employers face fines up to £60,000 per illegal worker. This migration creates
-- tables to track RTW checks, document copies, and follow-up dates.
--
-- Check types:
--   manual_list_a  - Physical document check, List A (permanent right to work)
--   manual_list_b  - Physical document check, List B (time-limited right)
--   online_share_code - Home Office online check via share code
--   idvt           - Identity Document Validation Technology (British/Irish passport)
--
-- Status lifecycle:
--   pending → verified       (check completed successfully)
--   pending → failed         (check failed)
--   verified → expired       (document expiry date passed)
--   verified → follow_up_required (follow-up date approaching for List B)
--   follow_up_required → verified (follow-up check completed)
--   follow_up_required → expired  (follow-up not completed before expiry)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enum: RTW check type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rtw_check_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.rtw_check_type AS ENUM ('manual_list_a', 'manual_list_b', 'online_share_code', 'idvt');
  END IF;
END
$$;

-- Enum: RTW status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rtw_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.rtw_status AS ENUM ('pending', 'verified', 'expired', 'failed', 'follow_up_required');
  END IF;
END
$$;

-- =============================================================================
-- Table: rtw_checks
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.rtw_checks (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee being checked
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Check details
    check_type app.rtw_check_type NOT NULL,
    check_date date NOT NULL,
    checked_by_user_id uuid NOT NULL,

    -- Status
    status app.rtw_status NOT NULL DEFAULT 'pending',

    -- Document details
    document_type varchar(100),       -- e.g., 'UK Passport', 'BRP', 'Share Code'
    document_reference varchar(255),  -- Document number or reference
    document_expiry_date date,        -- NULL for List A (unlimited right to work)
    share_code varchar(20),           -- For online share code checks

    -- Follow-up tracking (List B documents require re-checks before expiry)
    follow_up_date date,              -- When next check is due (28 days before expiry)
    follow_up_completed boolean NOT NULL DEFAULT false,

    -- Verification result
    right_to_work_confirmed boolean NOT NULL DEFAULT false,
    restriction_details text,         -- Any work restrictions noted (e.g., limited hours)

    -- Audit / notes
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE app.rtw_checks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY tenant_isolation ON app.rtw_checks
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.rtw_checks
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Indexes
CREATE INDEX idx_rtw_checks_tenant_employee ON app.rtw_checks (tenant_id, employee_id);
CREATE INDEX idx_rtw_checks_tenant_status ON app.rtw_checks (tenant_id, status);
CREATE INDEX idx_rtw_checks_follow_up_date ON app.rtw_checks (tenant_id, follow_up_date)
    WHERE follow_up_date IS NOT NULL AND follow_up_completed = false;
CREATE INDEX idx_rtw_checks_document_expiry ON app.rtw_checks (tenant_id, document_expiry_date)
    WHERE document_expiry_date IS NOT NULL;
CREATE INDEX idx_rtw_checks_tenant_created ON app.rtw_checks (tenant_id, created_at DESC);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_rtw_checks_updated_at
    BEFORE UPDATE ON app.rtw_checks
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Table: rtw_documents
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.rtw_documents (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Parent check
    rtw_check_id uuid NOT NULL REFERENCES app.rtw_checks(id) ON DELETE CASCADE,

    -- File details
    document_name varchar(255) NOT NULL,
    document_type varchar(100),       -- MIME-friendly label (e.g., 'passport_photo_page')
    file_key varchar(500),            -- Reference to storage (local filesystem or S3)
    file_size_bytes bigint,
    mime_type varchar(100),

    -- Audit
    uploaded_by uuid,
    uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE app.rtw_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY tenant_isolation ON app.rtw_documents
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.rtw_documents
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Indexes
CREATE INDEX idx_rtw_documents_check ON app.rtw_documents (rtw_check_id);
CREATE INDEX idx_rtw_documents_tenant ON app.rtw_documents (tenant_id);

-- =============================================================================
-- DOWN Migration (commented out — run manually to rollback)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_rtw_documents_tenant;
-- DROP INDEX IF EXISTS app.idx_rtw_documents_check;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.rtw_documents;
-- DROP POLICY IF EXISTS tenant_isolation ON app.rtw_documents;
-- DROP TABLE IF EXISTS app.rtw_documents;
--
-- DROP TRIGGER IF EXISTS update_rtw_checks_updated_at ON app.rtw_checks;
-- DROP INDEX IF EXISTS app.idx_rtw_checks_tenant_created;
-- DROP INDEX IF EXISTS app.idx_rtw_checks_document_expiry;
-- DROP INDEX IF EXISTS app.idx_rtw_checks_follow_up_date;
-- DROP INDEX IF EXISTS app.idx_rtw_checks_tenant_status;
-- DROP INDEX IF EXISTS app.idx_rtw_checks_tenant_employee;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.rtw_checks;
-- DROP POLICY IF EXISTS tenant_isolation ON app.rtw_checks;
-- DROP TABLE IF EXISTS app.rtw_checks;
--
-- DROP TYPE IF EXISTS app.rtw_status;
-- DROP TYPE IF EXISTS app.rtw_check_type;
