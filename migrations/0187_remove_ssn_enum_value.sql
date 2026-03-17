-- Migration: 0187_remove_ssn_enum_value.sql
-- Description: Fully remove the deprecated 'ssn' value from the identifier_type enum.
--              PostgreSQL does not support ALTER TYPE ... REMOVE VALUE, so we must
--              recreate the enum type entirely. This involves:
--              1. Dropping functions that reference the enum in signatures
--              2. Converting the column to text
--              3. Dropping and recreating the enum without 'ssn'
--              4. Converting the column back to the new enum
--              5. Recreating the functions with the new enum type
--
-- Depends on: 0186_uk_compliance_cleanup.sql (which already migrated all 'ssn' rows to 'nino')

BEGIN;

-- =============================================================================
-- 1. Drop functions that reference app.identifier_type in their signatures
-- =============================================================================

DROP FUNCTION IF EXISTS app.get_employee_identifiers(uuid);
DROP FUNCTION IF EXISTS app.get_employee_identifier_by_type(uuid, app.identifier_type);
DROP FUNCTION IF EXISTS app.get_expiring_identifiers(uuid, integer);
DROP FUNCTION IF EXISTS app.get_expired_identifiers(uuid);
DROP FUNCTION IF EXISTS app.upsert_employee_identifier(uuid, app.identifier_type, varchar, varchar, date, date, boolean, date);

-- =============================================================================
-- 2. Convert column from enum to text temporarily
-- =============================================================================

ALTER TABLE app.employee_identifiers
    ALTER COLUMN identifier_type TYPE text;

-- =============================================================================
-- 3. Drop the old enum and create the new one without 'ssn'
-- =============================================================================

DROP TYPE app.identifier_type;

CREATE TYPE app.identifier_type AS ENUM (
    'nino',             -- National Insurance Number (UK)
    'passport',         -- Passport number
    'national_id',      -- National ID card number
    'drivers_license',  -- Driver's license number
    'tax_id',           -- Tax identification number
    'employee_id',      -- Internal employee ID badge number
    'work_permit',      -- Work permit number
    'visa',             -- Visa number
    'other'             -- Other identifier type
);

COMMENT ON TYPE app.identifier_type IS 'Type of identification document. UK system: nino (National Insurance Number), passport, national_id, drivers_license, tax_id, employee_id, work_permit, visa, or other.';

-- =============================================================================
-- 4. Convert column back to the new enum type
-- =============================================================================

ALTER TABLE app.employee_identifiers
    ALTER COLUMN identifier_type TYPE app.identifier_type
    USING identifier_type::app.identifier_type;

ALTER TABLE app.employee_identifiers
    ALTER COLUMN identifier_type SET NOT NULL;

-- =============================================================================
-- 5. Recreate all functions with the new enum type
-- =============================================================================

-- Function: get_employee_identifiers
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

-- Function: get_employee_identifier_by_type
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

-- Function: get_expiring_identifiers
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

-- Function: get_expired_identifiers
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

-- Function: upsert_employee_identifier
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

COMMIT;
