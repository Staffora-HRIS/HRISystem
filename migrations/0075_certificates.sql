-- Migration: 0075_certificates
-- Created: 2026-01-07
-- Description: Create the certificates table - generated learning certificates
--              This table stores certificates issued upon course/path completion
--              Certificates can expire and be revoked

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Certificates Table
-- -----------------------------------------------------------------------------
-- Learning certificates issued upon completion
-- Certificates are tied to completion records and can expire
CREATE TABLE IF NOT EXISTS app.certificates (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant where this certificate was issued
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee who earned the certificate
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Completion record this certificate is based on
    completion_id uuid NOT NULL REFERENCES app.completions(id) ON DELETE CASCADE,

    -- Certificate identification
    certificate_number varchar(100) NOT NULL,

    -- Certificate details (denormalized for historical accuracy)
    course_id uuid REFERENCES app.courses(id) ON DELETE SET NULL,
    learning_path_id uuid REFERENCES app.learning_paths(id) ON DELETE SET NULL,
    content_name varchar(255) NOT NULL,
    content_code varchar(50) NOT NULL,

    -- Certificate dates
    issued_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,

    -- Current status
    status app.certificate_status NOT NULL DEFAULT 'active',

    -- Revocation details
    revoked_at timestamptz,
    revoked_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    revocation_reason text,

    -- Certificate data
    -- Structure: {
    --   "score": 95,
    --   "credits": 2.5,
    --   "skills_certified": ["skill1", "skill2"],
    --   "issuer_name": "HR Training Department",
    --   "issuer_title": "Training Manager",
    --   "template_id": "uuid",
    --   "custom_fields": {...}
    -- }
    certificate_data jsonb NOT NULL DEFAULT '{}',

    -- Generated certificate file
    certificate_url text,
    certificate_file_hash varchar(64),

    -- Verification
    verification_code varchar(50) NOT NULL,
    verification_url text,

    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Certificate number must be unique within tenant
    CONSTRAINT certificates_number_unique UNIQUE (tenant_id, certificate_number),

    -- Verification code must be unique
    CONSTRAINT certificates_verification_unique UNIQUE (verification_code),

    -- Must have either course or learning path
    CONSTRAINT certificates_content_type CHECK (
        course_id IS NOT NULL OR learning_path_id IS NOT NULL
    ),

    -- Expiry must be after issue date
    CONSTRAINT certificates_expiry_after_issue CHECK (
        expires_at IS NULL OR expires_at > issued_at
    ),

    -- Revoked certificates must have revocation info
    CONSTRAINT certificates_revoked_has_info CHECK (
        status != 'revoked' OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Employee's certificates
CREATE INDEX IF NOT EXISTS idx_certificates_tenant_employee
    ON app.certificates(tenant_id, employee_id, issued_at DESC);

-- Certificate number lookup
CREATE INDEX IF NOT EXISTS idx_certificates_tenant_number
    ON app.certificates(tenant_id, certificate_number);

-- Verification code lookup
CREATE INDEX IF NOT EXISTS idx_certificates_verification_code
    ON app.certificates(verification_code);

-- Course certificates
CREATE INDEX IF NOT EXISTS idx_certificates_tenant_course
    ON app.certificates(tenant_id, course_id)
    WHERE course_id IS NOT NULL;

-- Learning path certificates
CREATE INDEX IF NOT EXISTS idx_certificates_tenant_path
    ON app.certificates(tenant_id, learning_path_id)
    WHERE learning_path_id IS NOT NULL;

-- Active certificates
CREATE INDEX IF NOT EXISTS idx_certificates_tenant_active
    ON app.certificates(tenant_id, status)
    WHERE status = 'active';

-- Expiring certificates (for notifications)
CREATE INDEX IF NOT EXISTS idx_certificates_tenant_expires
    ON app.certificates(tenant_id, expires_at)
    WHERE expires_at IS NOT NULL AND status = 'active';

-- Completion lookup
CREATE INDEX IF NOT EXISTS idx_certificates_completion_id
    ON app.certificates(completion_id);

-- GIN index for certificate data queries
CREATE INDEX IF NOT EXISTS idx_certificates_data
    ON app.certificates USING gin(certificate_data);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.certificates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see certificates for their current tenant
CREATE POLICY tenant_isolation ON app.certificates
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.certificates
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_certificates_updated_at
    BEFORE UPDATE ON app.certificates
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Function to validate certificate status transitions
CREATE OR REPLACE FUNCTION app.validate_certificate_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- If status hasn't changed, allow the update
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Validate transition based on current (old) status
    CASE OLD.status
        WHEN 'active' THEN
            -- active can transition to expired or revoked
            IF NEW.status NOT IN ('expired', 'revoked') THEN
                RAISE EXCEPTION 'Invalid status transition: active can only transition to expired or revoked, not %', NEW.status;
            END IF;

        WHEN 'expired' THEN
            -- expired can only transition to revoked (retroactive revocation)
            IF NEW.status NOT IN ('revoked') THEN
                RAISE EXCEPTION 'Invalid status transition: expired can only transition to revoked, not %', NEW.status;
            END IF;

        WHEN 'revoked' THEN
            -- revoked is a terminal state
            RAISE EXCEPTION 'Invalid status transition: revoked is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_certificate_status_transition
    BEFORE UPDATE OF status ON app.certificates
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_certificate_status_transition();

-- Function to auto-generate certificate number
CREATE OR REPLACE FUNCTION app.generate_certificate_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_year text;
    v_sequence integer;
BEGIN
    IF NEW.certificate_number IS NULL OR NEW.certificate_number = '' THEN
        v_year := TO_CHAR(now(), 'YYYY');

        -- Get next sequence number for this tenant/year
        SELECT COALESCE(MAX(
            CASE
                WHEN certificate_number ~ ('^CERT-' || v_year || '-[0-9]+$')
                THEN CAST(SUBSTRING(certificate_number FROM '[0-9]+$') AS integer)
                ELSE 0
            END
        ), 0) + 1 INTO v_sequence
        FROM app.certificates
        WHERE tenant_id = NEW.tenant_id;

        NEW.certificate_number := 'CERT-' || v_year || '-' || LPAD(v_sequence::text, 6, '0');
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER generate_certificate_number
    BEFORE INSERT ON app.certificates
    FOR EACH ROW
    EXECUTE FUNCTION app.generate_certificate_number();

-- Function to auto-generate verification code
CREATE OR REPLACE FUNCTION app.generate_certificate_verification_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    IF NEW.verification_code IS NULL OR NEW.verification_code = '' THEN
        -- Generate a unique verification code
        NEW.verification_code := UPPER(
            SUBSTRING(encode(gen_random_bytes(16), 'hex') FROM 1 FOR 16)
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER generate_certificate_verification_code
    BEFORE INSERT ON app.certificates
    FOR EACH ROW
    EXECUTE FUNCTION app.generate_certificate_verification_code();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to issue a certificate
CREATE OR REPLACE FUNCTION app.issue_certificate(
    p_tenant_id uuid,
    p_completion_id uuid,
    p_expiration_days integer DEFAULT NULL,
    p_certificate_data jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_id uuid;
    v_completion app.completions%ROWTYPE;
    v_expires_at timestamptz;
BEGIN
    -- Get completion details
    SELECT * INTO v_completion
    FROM app.completions
    WHERE id = p_completion_id;

    IF v_completion.id IS NULL THEN
        RAISE EXCEPTION 'Completion not found: %', p_completion_id;
    END IF;

    IF NOT v_completion.passed THEN
        RAISE EXCEPTION 'Cannot issue certificate for failed completion';
    END IF;

    -- Calculate expiration date
    IF p_expiration_days IS NOT NULL THEN
        v_expires_at := now() + (p_expiration_days || ' days')::interval;
    END IF;

    -- Issue the certificate
    INSERT INTO app.certificates (
        tenant_id,
        employee_id,
        completion_id,
        course_id,
        learning_path_id,
        content_name,
        content_code,
        expires_at,
        certificate_data
    )
    VALUES (
        p_tenant_id,
        v_completion.employee_id,
        p_completion_id,
        v_completion.course_id,
        v_completion.learning_path_id,
        v_completion.content_name,
        v_completion.content_code,
        v_expires_at,
        p_certificate_data
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Function to revoke a certificate
CREATE OR REPLACE FUNCTION app.revoke_certificate(
    p_certificate_id uuid,
    p_revoked_by uuid,
    p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.certificates
    SET status = 'revoked',
        revoked_at = now(),
        revoked_by = p_revoked_by,
        revocation_reason = p_reason
    WHERE id = p_certificate_id
      AND status IN ('active', 'expired');

    RETURN FOUND;
END;
$$;

-- Function to verify a certificate
CREATE OR REPLACE FUNCTION app.verify_certificate(
    p_verification_code varchar(50)
)
RETURNS TABLE (
    certificate_id uuid,
    certificate_number varchar(100),
    employee_name text,
    content_name varchar(255),
    content_code varchar(50),
    issued_at timestamptz,
    expires_at timestamptz,
    status app.certificate_status,
    is_valid boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id AS certificate_id,
        c.certificate_number,
        -- Note: Would join with employee_personal for full name in production
        e.employee_number AS employee_name,
        c.content_name,
        c.content_code,
        c.issued_at,
        c.expires_at,
        c.status,
        (c.status = 'active' AND (c.expires_at IS NULL OR c.expires_at > now())) AS is_valid
    FROM app.certificates c
    JOIN app.employees e ON e.id = c.employee_id
    WHERE c.verification_code = p_verification_code;
END;
$$;

-- Function to get employee's certificates
CREATE OR REPLACE FUNCTION app.get_employee_certificates(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_status app.certificate_status DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    certificate_number varchar(100),
    content_name varchar(255),
    content_code varchar(50),
    issued_at timestamptz,
    expires_at timestamptz,
    status app.certificate_status,
    is_valid boolean,
    days_until_expiry integer,
    verification_code varchar(50)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.certificate_number,
        c.content_name,
        c.content_code,
        c.issued_at,
        c.expires_at,
        c.status,
        (c.status = 'active' AND (c.expires_at IS NULL OR c.expires_at > now())) AS is_valid,
        CASE
            WHEN c.expires_at IS NOT NULL THEN (c.expires_at::date - CURRENT_DATE)
            ELSE NULL
        END AS days_until_expiry,
        c.verification_code
    FROM app.certificates c
    WHERE c.tenant_id = p_tenant_id
      AND c.employee_id = p_employee_id
      AND (p_status IS NULL OR c.status = p_status)
    ORDER BY c.issued_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get expiring certificates
CREATE OR REPLACE FUNCTION app.get_expiring_certificates(
    p_tenant_id uuid,
    p_days_threshold integer DEFAULT 30
)
RETURNS TABLE (
    id uuid,
    employee_id uuid,
    certificate_number varchar(100),
    content_name varchar(255),
    expires_at timestamptz,
    days_until_expiry integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.employee_id,
        c.certificate_number,
        c.content_name,
        c.expires_at,
        (c.expires_at::date - CURRENT_DATE) AS days_until_expiry
    FROM app.certificates c
    WHERE c.tenant_id = p_tenant_id
      AND c.status = 'active'
      AND c.expires_at IS NOT NULL
      AND c.expires_at <= now() + (p_days_threshold || ' days')::interval
      AND c.expires_at > now()
    ORDER BY c.expires_at ASC;
END;
$$;

-- Function to expire certificates (for scheduled job)
CREATE OR REPLACE FUNCTION app.expire_certificates()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE app.certificates
    SET status = 'expired'
    WHERE status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at <= now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.certificates IS 'Learning certificates issued upon course/learning path completion.';
COMMENT ON COLUMN app.certificates.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.certificates.tenant_id IS 'Tenant where this certificate was issued';
COMMENT ON COLUMN app.certificates.employee_id IS 'Employee who earned the certificate';
COMMENT ON COLUMN app.certificates.completion_id IS 'Completion record this certificate is based on';
COMMENT ON COLUMN app.certificates.certificate_number IS 'Unique certificate number within tenant';
COMMENT ON COLUMN app.certificates.course_id IS 'Course the certificate is for (if applicable)';
COMMENT ON COLUMN app.certificates.learning_path_id IS 'Learning path the certificate is for (if applicable)';
COMMENT ON COLUMN app.certificates.content_name IS 'Content name at time of issue (denormalized)';
COMMENT ON COLUMN app.certificates.content_code IS 'Content code at time of issue (denormalized)';
COMMENT ON COLUMN app.certificates.issued_at IS 'When the certificate was issued';
COMMENT ON COLUMN app.certificates.expires_at IS 'When the certificate expires';
COMMENT ON COLUMN app.certificates.status IS 'Current certificate status';
COMMENT ON COLUMN app.certificates.revoked_at IS 'When the certificate was revoked';
COMMENT ON COLUMN app.certificates.revoked_by IS 'User who revoked the certificate';
COMMENT ON COLUMN app.certificates.revocation_reason IS 'Reason for revocation';
COMMENT ON COLUMN app.certificates.certificate_data IS 'Additional certificate data';
COMMENT ON COLUMN app.certificates.certificate_url IS 'URL to generated certificate PDF';
COMMENT ON COLUMN app.certificates.certificate_file_hash IS 'Hash of certificate file for integrity';
COMMENT ON COLUMN app.certificates.verification_code IS 'Code for external verification';
COMMENT ON COLUMN app.certificates.verification_url IS 'Public URL for verification';
COMMENT ON FUNCTION app.validate_certificate_status_transition IS 'Enforces valid status transitions';
COMMENT ON FUNCTION app.generate_certificate_number IS 'Auto-generates certificate number';
COMMENT ON FUNCTION app.generate_certificate_verification_code IS 'Auto-generates verification code';
COMMENT ON FUNCTION app.issue_certificate IS 'Issues a new certificate';
COMMENT ON FUNCTION app.revoke_certificate IS 'Revokes a certificate';
COMMENT ON FUNCTION app.verify_certificate IS 'Verifies a certificate by verification code';
COMMENT ON FUNCTION app.get_employee_certificates IS 'Returns certificates for an employee';
COMMENT ON FUNCTION app.get_expiring_certificates IS 'Returns certificates expiring within threshold';
COMMENT ON FUNCTION app.expire_certificates IS 'Marks expired certificates (for scheduled job)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.expire_certificates();
-- DROP FUNCTION IF EXISTS app.get_expiring_certificates(uuid, integer);
-- DROP FUNCTION IF EXISTS app.get_employee_certificates(uuid, uuid, app.certificate_status, integer, integer);
-- DROP FUNCTION IF EXISTS app.verify_certificate(varchar);
-- DROP FUNCTION IF EXISTS app.revoke_certificate(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS app.issue_certificate(uuid, uuid, integer, jsonb);
-- DROP TRIGGER IF EXISTS generate_certificate_verification_code ON app.certificates;
-- DROP FUNCTION IF EXISTS app.generate_certificate_verification_code();
-- DROP TRIGGER IF EXISTS generate_certificate_number ON app.certificates;
-- DROP FUNCTION IF EXISTS app.generate_certificate_number();
-- DROP TRIGGER IF EXISTS validate_certificate_status_transition ON app.certificates;
-- DROP FUNCTION IF EXISTS app.validate_certificate_status_transition();
-- DROP TRIGGER IF EXISTS update_certificates_updated_at ON app.certificates;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.certificates;
-- DROP POLICY IF EXISTS tenant_isolation ON app.certificates;
-- DROP INDEX IF EXISTS app.idx_certificates_data;
-- DROP INDEX IF EXISTS app.idx_certificates_completion_id;
-- DROP INDEX IF EXISTS app.idx_certificates_tenant_expires;
-- DROP INDEX IF EXISTS app.idx_certificates_tenant_active;
-- DROP INDEX IF EXISTS app.idx_certificates_tenant_path;
-- DROP INDEX IF EXISTS app.idx_certificates_tenant_course;
-- DROP INDEX IF EXISTS app.idx_certificates_verification_code;
-- DROP INDEX IF EXISTS app.idx_certificates_tenant_number;
-- DROP INDEX IF EXISTS app.idx_certificates_tenant_employee;
-- DROP TABLE IF EXISTS app.certificates;
