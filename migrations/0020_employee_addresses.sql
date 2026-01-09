-- Migration: 0020_employee_addresses
-- Created: 2026-01-07
-- Description: Create the employee_addresses table for effective-dated addresses
--              Stores home, work, mailing, and emergency contact addresses
--              Uses effective dating for historical tracking

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Employee Addresses Table
-- -----------------------------------------------------------------------------
-- Effective-dated address information for employees
-- Each row represents an address valid for a date range
-- Supports multiple address types with primary designation
CREATE TABLE IF NOT EXISTS app.employee_addresses (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this data
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee this address belongs to
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Effective dating
    -- effective_from: When this address becomes valid
    -- effective_to: When this address ends (NULL = currently effective)
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,

    -- Address type
    address_type app.address_type NOT NULL,

    -- Address fields
    street_line1 varchar(255) NOT NULL,
    street_line2 varchar(255),
    city varchar(100) NOT NULL,
    state_province varchar(100),
    postal_code varchar(20),
    country varchar(3) NOT NULL, -- ISO 3166-1 alpha-3 country code

    -- Primary flag
    is_primary boolean NOT NULL DEFAULT false,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Effective dates validation
    CONSTRAINT employee_addresses_effective_dates CHECK (
        effective_to IS NULL OR effective_to > effective_from
    ),

    -- Country format (ISO 3166-1 alpha-3)
    CONSTRAINT employee_addresses_country_format CHECK (
        country ~ '^[A-Z]{3}$'
    ),

    -- Street line 1 cannot be empty
    CONSTRAINT employee_addresses_street_not_empty CHECK (
        length(trim(street_line1)) > 0
    ),

    -- City cannot be empty
    CONSTRAINT employee_addresses_city_not_empty CHECK (
        length(trim(city)) > 0
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: find addresses for an employee
CREATE INDEX IF NOT EXISTS idx_employee_addresses_tenant_employee
    ON app.employee_addresses(tenant_id, employee_id);

-- Find current addresses (effective_to IS NULL)
CREATE INDEX IF NOT EXISTS idx_employee_addresses_current
    ON app.employee_addresses(tenant_id, employee_id, address_type)
    WHERE effective_to IS NULL;

-- Effective date range queries
CREATE INDEX IF NOT EXISTS idx_employee_addresses_effective_range
    ON app.employee_addresses(tenant_id, employee_id, effective_from, effective_to);

-- Primary address lookup
CREATE INDEX IF NOT EXISTS idx_employee_addresses_primary
    ON app.employee_addresses(tenant_id, employee_id, address_type)
    WHERE is_primary = true AND effective_to IS NULL;

-- Address type filtering
CREATE INDEX IF NOT EXISTS idx_employee_addresses_type
    ON app.employee_addresses(tenant_id, address_type)
    WHERE effective_to IS NULL;

-- Location-based queries (city, country)
CREATE INDEX IF NOT EXISTS idx_employee_addresses_location
    ON app.employee_addresses(tenant_id, country, city)
    WHERE effective_to IS NULL;

-- Postal code lookup
CREATE INDEX IF NOT EXISTS idx_employee_addresses_postal
    ON app.employee_addresses(tenant_id, postal_code)
    WHERE effective_to IS NULL AND postal_code IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.employee_addresses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see addresses for their current tenant
CREATE POLICY tenant_isolation ON app.employee_addresses
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.employee_addresses
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_employee_addresses_updated_at
    BEFORE UPDATE ON app.employee_addresses
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get all current addresses for an employee
CREATE OR REPLACE FUNCTION app.get_employee_addresses(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    address_type app.address_type,
    street_line1 varchar(255),
    street_line2 varchar(255),
    city varchar(100),
    state_province varchar(100),
    postal_code varchar(20),
    country varchar(3),
    is_primary boolean,
    effective_from date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ea.id, ea.address_type, ea.street_line1, ea.street_line2,
           ea.city, ea.state_province, ea.postal_code, ea.country,
           ea.is_primary, ea.effective_from
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
    street_line1 varchar(255),
    street_line2 varchar(255),
    city varchar(100),
    state_province varchar(100),
    postal_code varchar(20),
    country varchar(3)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ea.id, ea.street_line1, ea.street_line2, ea.city,
           ea.state_province, ea.postal_code, ea.country
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
    street_line1 varchar(255),
    street_line2 varchar(255),
    city varchar(100),
    state_province varchar(100),
    postal_code varchar(20),
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
        street_line1
        || COALESCE(', ' || street_line2, '')
        || ', ' || city
        || COALESCE(', ' || state_province, '')
        || COALESCE(' ' || postal_code, '')
        || ', ' || country
    INTO v_formatted
    FROM app.employee_addresses
    WHERE id = p_address_id;

    RETURN v_formatted;
END;
$$;

-- Function to add or update an address (effective-dated)
CREATE OR REPLACE FUNCTION app.upsert_employee_address(
    p_employee_id uuid,
    p_address_type app.address_type,
    p_street_line1 varchar(255),
    p_street_line2 varchar(255),
    p_city varchar(100),
    p_state_province varchar(100),
    p_postal_code varchar(20),
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
        address_type, street_line1, street_line2, city,
        state_province, postal_code, country, is_primary
    )
    VALUES (
        v_tenant_id, p_employee_id, p_effective_from,
        p_address_type, p_street_line1, p_street_line2, p_city,
        p_state_province, p_postal_code, p_country, p_is_primary
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
    state_province varchar(100),
    country varchar(3)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ea.employee_id, ea.city, ea.state_province, ea.country
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

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.employee_addresses IS 'Effective-dated address information (home, work, mailing, emergency)';
COMMENT ON COLUMN app.employee_addresses.id IS 'Primary UUID identifier for this address record';
COMMENT ON COLUMN app.employee_addresses.tenant_id IS 'Tenant that owns this data';
COMMENT ON COLUMN app.employee_addresses.employee_id IS 'Employee this address belongs to';
COMMENT ON COLUMN app.employee_addresses.effective_from IS 'Date this address becomes effective';
COMMENT ON COLUMN app.employee_addresses.effective_to IS 'Date this address ends (NULL = current)';
COMMENT ON COLUMN app.employee_addresses.address_type IS 'Type of address (home, work, mailing, emergency)';
COMMENT ON COLUMN app.employee_addresses.street_line1 IS 'Primary street address';
COMMENT ON COLUMN app.employee_addresses.street_line2 IS 'Secondary address line (apt, suite, etc.)';
COMMENT ON COLUMN app.employee_addresses.city IS 'City name';
COMMENT ON COLUMN app.employee_addresses.state_province IS 'State, province, or region';
COMMENT ON COLUMN app.employee_addresses.postal_code IS 'ZIP or postal code';
COMMENT ON COLUMN app.employee_addresses.country IS 'Country (ISO 3166-1 alpha-3)';
COMMENT ON COLUMN app.employee_addresses.is_primary IS 'Whether this is the primary address for this type';
COMMENT ON FUNCTION app.get_employee_addresses IS 'Returns all current addresses for an employee';
COMMENT ON FUNCTION app.get_employee_address_by_type IS 'Returns address of a specific type';
COMMENT ON FUNCTION app.get_employee_home_address IS 'Returns primary home address';
COMMENT ON FUNCTION app.format_address_single_line IS 'Formats address as a single line string';
COMMENT ON FUNCTION app.upsert_employee_address IS 'Add or update an address with effective dating';
COMMENT ON FUNCTION app.get_employees_by_location IS 'Find employees by location (country/city)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_employees_by_location(uuid, varchar, varchar);
-- DROP FUNCTION IF EXISTS app.upsert_employee_address(uuid, app.address_type, varchar, varchar, varchar, varchar, varchar, varchar, boolean, date);
-- DROP FUNCTION IF EXISTS app.format_address_single_line(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_home_address(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_address_by_type(uuid, app.address_type);
-- DROP FUNCTION IF EXISTS app.get_employee_addresses(uuid);
-- DROP TRIGGER IF EXISTS update_employee_addresses_updated_at ON app.employee_addresses;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.employee_addresses;
-- DROP POLICY IF EXISTS tenant_isolation ON app.employee_addresses;
-- DROP INDEX IF EXISTS app.idx_employee_addresses_postal;
-- DROP INDEX IF EXISTS app.idx_employee_addresses_location;
-- DROP INDEX IF EXISTS app.idx_employee_addresses_type;
-- DROP INDEX IF EXISTS app.idx_employee_addresses_primary;
-- DROP INDEX IF EXISTS app.idx_employee_addresses_effective_range;
-- DROP INDEX IF EXISTS app.idx_employee_addresses_current;
-- DROP INDEX IF EXISTS app.idx_employee_addresses_tenant_employee;
-- DROP TABLE IF EXISTS app.employee_addresses;
