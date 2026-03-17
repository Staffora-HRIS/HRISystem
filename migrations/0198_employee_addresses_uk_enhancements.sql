-- Migration: 0198_employee_addresses_uk_enhancements
-- Created: 2026-03-17
-- Description: Enhance employee_addresses table for UK HRIS requirements:
--   - Rename columns to UK conventions (address_line_1/2, county, postcode)
--   - Add created_by audit column (standard for effective-dated tables)
--   - Set country DEFAULT 'GB' (UK-first HRIS)
--   - Add UK postcode format validation constraint
--   - Add is_current generated column
--   - Update DB functions to use new column names

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Column Renames
-- -----------------------------------------------------------------------------
-- Rename to UK-standard address terminology:
--   street_line1 -> address_line_1
--   street_line2 -> address_line_2
--   state_province -> county
--   postal_code -> postcode

ALTER TABLE app.employee_addresses RENAME COLUMN street_line1 TO address_line_1;
ALTER TABLE app.employee_addresses RENAME COLUMN street_line2 TO address_line_2;
ALTER TABLE app.employee_addresses RENAME COLUMN state_province TO county;
ALTER TABLE app.employee_addresses RENAME COLUMN postal_code TO postcode;

-- -----------------------------------------------------------------------------
-- Add created_by column (standard for effective-dated tables)
-- -----------------------------------------------------------------------------
ALTER TABLE app.employee_addresses
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES app.users(id);

-- -----------------------------------------------------------------------------
-- Add is_current generated column
-- -----------------------------------------------------------------------------
-- is_current is true when effective_to IS NULL (record is currently active)
ALTER TABLE app.employee_addresses
    ADD COLUMN IF NOT EXISTS is_current boolean
    GENERATED ALWAYS AS (effective_to IS NULL) STORED;

-- -----------------------------------------------------------------------------
-- Change country default to 'GB'
-- -----------------------------------------------------------------------------
ALTER TABLE app.employee_addresses ALTER COLUMN country SET DEFAULT 'GB';

-- -----------------------------------------------------------------------------
-- UK Postcode Validation
-- -----------------------------------------------------------------------------
-- Validates UK postcode format:
--   A9 9AA, A99 9AA, A9A 9AA, AA9 9AA, AA99 9AA, AA9A 9AA
-- Also allows non-UK postcodes (up to 20 chars) when country != 'GB'
-- Case-insensitive matching via UPPER()
ALTER TABLE app.employee_addresses
    ADD CONSTRAINT employee_addresses_uk_postcode_format CHECK (
        postcode IS NULL
        OR country != 'GB'
        OR UPPER(TRIM(postcode)) ~ '^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$'
    );

-- Drop old constraints that reference renamed columns
ALTER TABLE app.employee_addresses DROP CONSTRAINT IF EXISTS employee_addresses_street_not_empty;
ALTER TABLE app.employee_addresses DROP CONSTRAINT IF EXISTS employee_addresses_city_not_empty;

-- Re-add constraints with correct column names
ALTER TABLE app.employee_addresses
    ADD CONSTRAINT employee_addresses_address_line_1_not_empty CHECK (
        length(trim(address_line_1)) > 0
    );

ALTER TABLE app.employee_addresses
    ADD CONSTRAINT employee_addresses_city_not_empty CHECK (
        length(trim(city)) > 0
    );

-- -----------------------------------------------------------------------------
-- Index on is_current for efficient current-address queries
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_employee_addresses_is_current
    ON app.employee_addresses(tenant_id, employee_id)
    WHERE is_current = true;

-- -----------------------------------------------------------------------------
-- Overlap prevention exclusion constraint
-- Per employee + address_type, no two current records should overlap
-- -----------------------------------------------------------------------------
-- We use a CHECK-based approach at the application level because
-- GiST exclusion constraints on date ranges are complex with NULLs.
-- The service layer validates overlaps inside a transaction.

-- -----------------------------------------------------------------------------
-- Update DB Functions to use new column names
-- -----------------------------------------------------------------------------

-- Function to get all current addresses for an employee
CREATE OR REPLACE FUNCTION app.get_employee_addresses(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    address_type app.address_type,
    address_line_1 varchar(255),
    address_line_2 varchar(255),
    city varchar(100),
    county varchar(100),
    postcode varchar(20),
    country varchar(3),
    is_primary boolean,
    effective_from date,
    is_current boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ea.id, ea.address_type, ea.address_line_1, ea.address_line_2,
           ea.city, ea.county, ea.postcode, ea.country,
           ea.is_primary, ea.effective_from, ea.is_current
    FROM app.employee_addresses ea
    WHERE ea.employee_id = p_employee_id
      AND ea.effective_to IS NULL
    ORDER BY ea.address_type, ea.is_primary DESC, ea.created_at;
END;
$$;

-- Function to get primary address of a specific type
CREATE OR REPLACE FUNCTION app.get_employee_address_by_type(
    p_employee_id uuid,
    p_address_type app.address_type
)
RETURNS TABLE (
    id uuid,
    address_line_1 varchar(255),
    address_line_2 varchar(255),
    city varchar(100),
    county varchar(100),
    postcode varchar(20),
    country varchar(3)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ea.id, ea.address_line_1, ea.address_line_2, ea.city,
           ea.county, ea.postcode, ea.country
    FROM app.employee_addresses ea
    WHERE ea.employee_id = p_employee_id
      AND ea.address_type = p_address_type
      AND ea.effective_to IS NULL
    ORDER BY ea.is_primary DESC, ea.created_at DESC
    LIMIT 1;
END;
$$;

-- Function to get employee's home address
CREATE OR REPLACE FUNCTION app.get_employee_home_address(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    address_line_1 varchar(255),
    address_line_2 varchar(255),
    city varchar(100),
    county varchar(100),
    postcode varchar(20),
    country varchar(3)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM app.get_employee_address_by_type(p_employee_id, 'home');
END;
$$;

-- Function to format address as single line
CREATE OR REPLACE FUNCTION app.format_address_single_line(
    p_address_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_formatted text;
BEGIN
    SELECT
        ea.address_line_1
        || COALESCE(', ' || ea.address_line_2, '')
        || ', ' || ea.city
        || COALESCE(', ' || ea.county, '')
        || COALESCE(' ' || ea.postcode, '')
        || ', ' || ea.country
    INTO v_formatted
    FROM app.employee_addresses ea
    WHERE ea.id = p_address_id;

    RETURN v_formatted;
END;
$$;

-- Function to add or update an address (effective-dated)
CREATE OR REPLACE FUNCTION app.upsert_employee_address(
    p_employee_id uuid,
    p_address_type app.address_type,
    p_address_line_1 varchar(255),
    p_address_line_2 varchar(255),
    p_city varchar(100),
    p_county varchar(100),
    p_postcode varchar(20),
    p_country varchar(3),
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
        UPDATE app.employee_addresses
        SET is_primary = false,
            updated_at = now()
        WHERE employee_id = p_employee_id
          AND address_type = p_address_type
          AND is_primary = true
          AND effective_to IS NULL;
    END IF;

    -- Close any existing address of same type
    UPDATE app.employee_addresses
    SET effective_to = p_effective_from,
        updated_at = now()
    WHERE employee_id = p_employee_id
      AND address_type = p_address_type
      AND is_primary = p_is_primary
      AND effective_to IS NULL
      AND effective_from < p_effective_from;

    -- Insert the new address record
    INSERT INTO app.employee_addresses (
        tenant_id, employee_id, effective_from,
        address_type, address_line_1, address_line_2, city,
        county, postcode, country, is_primary
    )
    VALUES (
        v_tenant_id, p_employee_id, p_effective_from,
        p_address_type, p_address_line_1, p_address_line_2, p_city,
        p_county, p_postcode, p_country, p_is_primary
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- Function to get employees by location (for location-based reports)
CREATE OR REPLACE FUNCTION app.get_employees_by_location(
    p_tenant_id uuid,
    p_country varchar(3) DEFAULT NULL,
    p_city varchar(100) DEFAULT NULL
)
RETURNS TABLE (
    employee_id uuid,
    city varchar(100),
    county varchar(100),
    country varchar(3)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ea.employee_id, ea.city, ea.county, ea.country
    FROM app.employee_addresses ea
    INNER JOIN app.employees e ON ea.employee_id = e.id
    WHERE ea.tenant_id = p_tenant_id
      AND ea.address_type = 'home'
      AND ea.effective_to IS NULL
      AND e.status IN ('active', 'on_leave')
      AND (p_country IS NULL OR ea.country = p_country)
      AND (p_city IS NULL OR ea.city ILIKE '%' || p_city || '%')
    ORDER BY ea.country, ea.city;
END;
$$;

-- -----------------------------------------------------------------------------
-- Update GDPR anonymize_employee function (from 0129) to use new column names
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.anonymize_employee(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_anonymized_label text DEFAULT 'ANONYMIZED'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    result jsonb := '{}'::jsonb;
    affected integer;
BEGIN
    -- Set tenant context so RLS is satisfied
    PERFORM app.set_tenant_context(p_tenant_id);

    -- 1. employees (anchor record)
    UPDATE app.employees SET
        employee_number = 'ANON-' || LEFT(p_employee_id::text, 8),
        user_id = NULL,
        termination_reason = CASE
            WHEN termination_reason IS NOT NULL THEN 'REDACTED'
            ELSE NULL
        END,
        updated_at = now()
    WHERE id = p_employee_id AND tenant_id = p_tenant_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    result := result || jsonb_build_object('employees', affected);

    -- 2. employee_personal (effective-dated personal info)
    UPDATE app.employee_personal SET
        first_name = p_anonymized_label,
        middle_name = NULL,
        last_name = 'USER',
        preferred_name = NULL,
        date_of_birth = NULL,
        gender = NULL,
        marital_status = NULL,
        nationality = NULL,
        updated_at = now()
    WHERE employee_id = p_employee_id AND tenant_id = p_tenant_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    result := result || jsonb_build_object('employee_personal', affected);

    -- 3. employee_contacts (phone, email, emergency contacts)
    UPDATE app.employee_contacts SET
        value = 'REDACTED',
        is_verified = false,
        updated_at = now()
    WHERE employee_id = p_employee_id AND tenant_id = p_tenant_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    result := result || jsonb_build_object('employee_contacts', affected);

    -- 4. employee_addresses (home, work, mailing addresses)
    -- Updated to use new column names (address_line_1, county, postcode)
    UPDATE app.employee_addresses SET
        address_line_1 = 'REDACTED',
        address_line_2 = NULL,
        city = 'REDACTED',
        county = NULL,
        postcode = NULL,
        updated_at = now()
    WHERE employee_id = p_employee_id AND tenant_id = p_tenant_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    result := result || jsonb_build_object('employee_addresses', affected);

    -- 5. employee_identifiers (SSN, passport, national ID, etc.)
    UPDATE app.employee_identifiers SET
        identifier_value = 'REDACTED',
        issuing_country = NULL,
        issue_date = NULL,
        expiry_date = NULL,
        updated_at = now()
    WHERE employee_id = p_employee_id AND tenant_id = p_tenant_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    result := result || jsonb_build_object('employee_identifiers', affected);

    RETURN result;
END;
$$;

-- =============================================================================
-- Comments (updated for new column names)
-- =============================================================================

COMMENT ON COLUMN app.employee_addresses.address_line_1 IS 'Primary address line';
COMMENT ON COLUMN app.employee_addresses.address_line_2 IS 'Secondary address line (flat, building, etc.)';
COMMENT ON COLUMN app.employee_addresses.county IS 'County (UK) or state/province';
COMMENT ON COLUMN app.employee_addresses.postcode IS 'UK postcode or postal code (validated for UK format when country=GB)';
COMMENT ON COLUMN app.employee_addresses.country IS 'Country code (ISO 3166-1 alpha-2, default GB)';
COMMENT ON COLUMN app.employee_addresses.created_by IS 'User who created this record';
COMMENT ON COLUMN app.employee_addresses.is_current IS 'Generated column: true when effective_to IS NULL';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- ALTER TABLE app.employee_addresses DROP CONSTRAINT IF EXISTS employee_addresses_uk_postcode_format;
-- ALTER TABLE app.employee_addresses DROP CONSTRAINT IF EXISTS employee_addresses_address_line_1_not_empty;
-- ALTER TABLE app.employee_addresses DROP COLUMN IF EXISTS is_current;
-- ALTER TABLE app.employee_addresses DROP COLUMN IF EXISTS created_by;
-- ALTER TABLE app.employee_addresses ALTER COLUMN country DROP DEFAULT;
-- ALTER TABLE app.employee_addresses RENAME COLUMN address_line_1 TO street_line1;
-- ALTER TABLE app.employee_addresses RENAME COLUMN address_line_2 TO street_line2;
-- ALTER TABLE app.employee_addresses RENAME COLUMN county TO state_province;
-- ALTER TABLE app.employee_addresses RENAME COLUMN postcode TO postal_code;
-- Re-add old constraints:
-- ALTER TABLE app.employee_addresses ADD CONSTRAINT employee_addresses_street_not_empty CHECK (length(trim(street_line1)) > 0);
-- ALTER TABLE app.employee_addresses ADD CONSTRAINT employee_addresses_city_not_empty CHECK (length(trim(city)) > 0);
-- Then recreate original functions (see migration 0020 for original definitions)
