-- Migration: 0021_employee_identifiers
-- Created: 2026-01-07
-- Description: Create the employee_identifiers table for effective-dated ID documents
--              Stores SSN, passport, national ID, driver's license, tax ID, employee badge
--              Values should be encrypted at the application layer before storage

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Employee Identifiers Table
-- -----------------------------------------------------------------------------
-- Effective-dated identification documents for employees
-- IMPORTANT: Identifier values should be encrypted at the application layer
-- This table stores the encrypted values; decryption happens in the app
CREATE TABLE IF NOT EXISTS app.employee_identifiers (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this data
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee this identifier belongs to
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Effective dating
    -- effective_from: When this identifier becomes valid
    -- effective_to: When this identifier ends (NULL = currently effective)
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,

    -- Identifier details
    identifier_type app.identifier_type NOT NULL,

    -- The identifier value (ENCRYPTED at application layer)
    -- Examples: SSN, passport number, driver's license number
    -- NEVER store plaintext sensitive identifiers
    identifier_value varchar(255) NOT NULL,

    -- Document details
    issuing_country varchar(3), -- ISO 3166-1 alpha-3 for passports, national IDs
    issue_date date,
    expiry_date date,

    -- Primary flag (primary ID of this type)
    is_primary boolean NOT NULL DEFAULT false,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Effective dates validation
    CONSTRAINT employee_identifiers_effective_dates CHECK (
        effective_to IS NULL OR effective_to > effective_from
    ),

    -- Expiry must be after issue date
    CONSTRAINT employee_identifiers_expiry_after_issue CHECK (
        expiry_date IS NULL OR issue_date IS NULL OR expiry_date > issue_date
    ),

    -- Issuing country format (ISO 3166-1 alpha-3)
    CONSTRAINT employee_identifiers_country_format CHECK (
        issuing_country IS NULL OR issuing_country ~ '^[A-Z]{3}$'
    ),

    -- Identifier value cannot be empty
    CONSTRAINT employee_identifiers_value_not_empty CHECK (
        length(trim(identifier_value)) > 0
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: find identifiers for an employee
CREATE INDEX IF NOT EXISTS idx_employee_identifiers_tenant_employee
    ON app.employee_identifiers(tenant_id, employee_id);

-- Find current identifiers (effective_to IS NULL)
CREATE INDEX IF NOT EXISTS idx_employee_identifiers_current
    ON app.employee_identifiers(tenant_id, employee_id, identifier_type)
    WHERE effective_to IS NULL;

-- Effective date range queries
CREATE INDEX IF NOT EXISTS idx_employee_identifiers_effective_range
    ON app.employee_identifiers(tenant_id, employee_id, effective_from, effective_to);

-- Primary identifier lookup
CREATE INDEX IF NOT EXISTS idx_employee_identifiers_primary
    ON app.employee_identifiers(tenant_id, employee_id, identifier_type)
    WHERE is_primary = true AND effective_to IS NULL;

-- Identifier type filtering
CREATE INDEX IF NOT EXISTS idx_employee_identifiers_type
    ON app.employee_identifiers(tenant_id, identifier_type)
    WHERE effective_to IS NULL;

-- Expiring documents (for compliance alerts)
CREATE INDEX IF NOT EXISTS idx_employee_identifiers_expiry
    ON app.employee_identifiers(tenant_id, expiry_date)
    WHERE effective_to IS NULL AND expiry_date IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.employee_identifiers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see identifiers for their current tenant
-- Note: Additional app-level controls should restrict access to sensitive data
CREATE POLICY tenant_isolation ON app.employee_identifiers
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.employee_identifiers
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_employee_identifiers_updated_at
    BEFORE UPDATE ON app.employee_identifiers
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get all current identifiers for an employee
-- Note: Returns encrypted values; decryption is application responsibility
CREATE OR REPLACE FUNCTION app.get_employee_identifiers(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    identifier_type app.identifier_type,
    identifier_value varchar(255),
    issuing_country varchar(3),
    issue_date date,
    expiry_date date,
    is_primary boolean,
    effective_from date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ei.id, ei.identifier_type, ei.identifier_value, ei.issuing_country,
           ei.issue_date, ei.expiry_date, ei.is_primary, ei.effective_from
    FROM app.employee_identifiers ei
    WHERE ei.employee_id = p_employee_id
      AND ei.effective_to IS NULL
    ORDER BY ei.identifier_type, ei.is_primary DESC, ei.created_at;
END;
$$;

-- Function to get primary identifier of a specific type
CREATE OR REPLACE FUNCTION app.get_employee_identifier_by_type(
    p_employee_id uuid,
    p_identifier_type app.identifier_type
)
RETURNS TABLE (
    id uuid,
    identifier_value varchar(255),
    issuing_country varchar(3),
    issue_date date,
    expiry_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ei.id, ei.identifier_value, ei.issuing_country, ei.issue_date, ei.expiry_date
    FROM app.employee_identifiers ei
    WHERE ei.employee_id = p_employee_id
      AND ei.identifier_type = p_identifier_type
      AND ei.effective_to IS NULL
    ORDER BY ei.is_primary DESC, ei.created_at DESC
    LIMIT 1;
END;
$$;

-- Function to get expiring identifiers (for compliance alerts)
CREATE OR REPLACE FUNCTION app.get_expiring_identifiers(
    p_tenant_id uuid,
    p_days_ahead integer DEFAULT 90
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50),
    identifier_type app.identifier_type,
    expiry_date date,
    days_until_expiry integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ei.employee_id, e.employee_number, ei.identifier_type, ei.expiry_date,
           (ei.expiry_date - CURRENT_DATE)::integer AS days_until_expiry
    FROM app.employee_identifiers ei
    INNER JOIN app.employees e ON ei.employee_id = e.id
    WHERE ei.tenant_id = p_tenant_id
      AND ei.effective_to IS NULL
      AND ei.expiry_date IS NOT NULL
      AND ei.expiry_date <= CURRENT_DATE + p_days_ahead
      AND ei.expiry_date >= CURRENT_DATE
      AND e.status IN ('active', 'on_leave')
    ORDER BY ei.expiry_date, e.employee_number;
END;
$$;

-- Function to get expired identifiers (for compliance issues)
CREATE OR REPLACE FUNCTION app.get_expired_identifiers(
    p_tenant_id uuid
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50),
    identifier_type app.identifier_type,
    expiry_date date,
    days_expired integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ei.employee_id, e.employee_number, ei.identifier_type, ei.expiry_date,
           (CURRENT_DATE - ei.expiry_date)::integer AS days_expired
    FROM app.employee_identifiers ei
    INNER JOIN app.employees e ON ei.employee_id = e.id
    WHERE ei.tenant_id = p_tenant_id
      AND ei.effective_to IS NULL
      AND ei.expiry_date IS NOT NULL
      AND ei.expiry_date < CURRENT_DATE
      AND e.status IN ('active', 'on_leave')
    ORDER BY ei.expiry_date, e.employee_number;
END;
$$;

-- Function to add or update an identifier (effective-dated)
CREATE OR REPLACE FUNCTION app.upsert_employee_identifier(
    p_employee_id uuid,
    p_identifier_type app.identifier_type,
    p_identifier_value varchar(255),
    p_issuing_country varchar(3) DEFAULT NULL,
    p_issue_date date DEFAULT NULL,
    p_expiry_date date DEFAULT NULL,
    p_is_primary boolean DEFAULT false,
    p_effective_from date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_tenant_id uuid;
    v_new_id uuid;
BEGIN
    -- Get tenant from employee
    SELECT tenant_id INTO v_tenant_id
    FROM app.employees
    WHERE id = p_employee_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Employee not found: %', p_employee_id;
    END IF;

    -- If setting as primary, unset any existing primary of this type
    IF p_is_primary THEN
        UPDATE app.employee_identifiers
        SET is_primary = false,
            updated_at = now()
        WHERE employee_id = p_employee_id
          AND identifier_type = p_identifier_type
          AND is_primary = true
          AND effective_to IS NULL;
    END IF;

    -- Close any existing identifier of same type and value
    UPDATE app.employee_identifiers
    SET effective_to = p_effective_from,
        updated_at = now()
    WHERE employee_id = p_employee_id
      AND identifier_type = p_identifier_type
      AND effective_to IS NULL
      AND effective_from < p_effective_from;

    -- Insert the new identifier record
    INSERT INTO app.employee_identifiers (
        tenant_id, employee_id, effective_from,
        identifier_type, identifier_value,
        issuing_country, issue_date, expiry_date, is_primary
    )
    VALUES (
        v_tenant_id, p_employee_id, p_effective_from,
        p_identifier_type, p_identifier_value,
        p_issuing_country, p_issue_date, p_expiry_date, p_is_primary
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- Function to mask identifier value (show only last 4 characters)
-- For display purposes where full value should not be shown
CREATE OR REPLACE FUNCTION app.mask_identifier(
    p_identifier_value varchar(255)
)
RETURNS varchar(255)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_length integer;
BEGIN
    IF p_identifier_value IS NULL THEN
        RETURN NULL;
    END IF;

    v_length := length(p_identifier_value);

    IF v_length <= 4 THEN
        RETURN repeat('*', v_length);
    END IF;

    RETURN repeat('*', v_length - 4) || substring(p_identifier_value from v_length - 3);
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.employee_identifiers IS 'Effective-dated identification documents (SSN, passport, etc.). Values are encrypted at app layer.';
COMMENT ON COLUMN app.employee_identifiers.id IS 'Primary UUID identifier for this identifier record';
COMMENT ON COLUMN app.employee_identifiers.tenant_id IS 'Tenant that owns this data';
COMMENT ON COLUMN app.employee_identifiers.employee_id IS 'Employee this identifier belongs to';
COMMENT ON COLUMN app.employee_identifiers.effective_from IS 'Date this identifier becomes effective';
COMMENT ON COLUMN app.employee_identifiers.effective_to IS 'Date this identifier ends (NULL = current)';
COMMENT ON COLUMN app.employee_identifiers.identifier_type IS 'Type of identifier (SSN, passport, etc.)';
COMMENT ON COLUMN app.employee_identifiers.identifier_value IS 'Encrypted identifier value - NEVER store plaintext';
COMMENT ON COLUMN app.employee_identifiers.issuing_country IS 'Country that issued the document (ISO 3166-1 alpha-3)';
COMMENT ON COLUMN app.employee_identifiers.issue_date IS 'Date the document was issued';
COMMENT ON COLUMN app.employee_identifiers.expiry_date IS 'Date the document expires (for compliance tracking)';
COMMENT ON COLUMN app.employee_identifiers.is_primary IS 'Whether this is the primary identifier for this type';
COMMENT ON FUNCTION app.get_employee_identifiers IS 'Returns all current identifiers for an employee';
COMMENT ON FUNCTION app.get_employee_identifier_by_type IS 'Returns identifier of a specific type';
COMMENT ON FUNCTION app.get_expiring_identifiers IS 'Returns identifiers expiring within N days (compliance)';
COMMENT ON FUNCTION app.get_expired_identifiers IS 'Returns expired identifiers for active employees';
COMMENT ON FUNCTION app.upsert_employee_identifier IS 'Add or update an identifier with effective dating';
COMMENT ON FUNCTION app.mask_identifier IS 'Masks identifier value showing only last 4 characters';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.mask_identifier(varchar);
-- DROP FUNCTION IF EXISTS app.upsert_employee_identifier(uuid, app.identifier_type, varchar, varchar, date, date, boolean, date);
-- DROP FUNCTION IF EXISTS app.get_expired_identifiers(uuid);
-- DROP FUNCTION IF EXISTS app.get_expiring_identifiers(uuid, integer);
-- DROP FUNCTION IF EXISTS app.get_employee_identifier_by_type(uuid, app.identifier_type);
-- DROP FUNCTION IF EXISTS app.get_employee_identifiers(uuid);
-- DROP TRIGGER IF EXISTS update_employee_identifiers_updated_at ON app.employee_identifiers;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.employee_identifiers;
-- DROP POLICY IF EXISTS tenant_isolation ON app.employee_identifiers;
-- DROP INDEX IF EXISTS app.idx_employee_identifiers_expiry;
-- DROP INDEX IF EXISTS app.idx_employee_identifiers_type;
-- DROP INDEX IF EXISTS app.idx_employee_identifiers_primary;
-- DROP INDEX IF EXISTS app.idx_employee_identifiers_effective_range;
-- DROP INDEX IF EXISTS app.idx_employee_identifiers_current;
-- DROP INDEX IF EXISTS app.idx_employee_identifiers_tenant_employee;
-- DROP TABLE IF EXISTS app.employee_identifiers;
