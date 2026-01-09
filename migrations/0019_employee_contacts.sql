-- Migration: 0019_employee_contacts
-- Created: 2026-01-07
-- Description: Create the employee_contacts table for effective-dated contact methods
--              Stores phone numbers, email addresses, and emergency contacts
--              Supports multiple contacts of different types with primary designation

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Employee Contacts Table
-- -----------------------------------------------------------------------------
-- Effective-dated contact information for employees
-- Each row represents a contact method valid for a date range
-- Supports multiple contacts per type (e.g., work phone, personal phone)
CREATE TABLE IF NOT EXISTS app.employee_contacts (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this data
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee this contact belongs to
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Effective dating
    -- effective_from: When this contact becomes valid
    -- effective_to: When this contact ends (NULL = currently effective)
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,

    -- Contact details
    contact_type app.contact_type NOT NULL,
    value varchar(255) NOT NULL, -- Phone number, email, etc.

    -- Flags
    is_primary boolean NOT NULL DEFAULT false, -- Primary contact for this type
    is_verified boolean NOT NULL DEFAULT false, -- Has been verified (email confirmed, etc.)

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Effective dates validation
    CONSTRAINT employee_contacts_effective_dates CHECK (
        effective_to IS NULL OR effective_to > effective_from
    ),

    -- Value cannot be empty
    CONSTRAINT employee_contacts_value_not_empty CHECK (
        length(trim(value)) > 0
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: find contacts for an employee
CREATE INDEX IF NOT EXISTS idx_employee_contacts_tenant_employee
    ON app.employee_contacts(tenant_id, employee_id);

-- Find current contacts (effective_to IS NULL)
CREATE INDEX IF NOT EXISTS idx_employee_contacts_current
    ON app.employee_contacts(tenant_id, employee_id, contact_type)
    WHERE effective_to IS NULL;

-- Effective date range queries
CREATE INDEX IF NOT EXISTS idx_employee_contacts_effective_range
    ON app.employee_contacts(tenant_id, employee_id, effective_from, effective_to);

-- Primary contact lookup
CREATE INDEX IF NOT EXISTS idx_employee_contacts_primary
    ON app.employee_contacts(tenant_id, employee_id, contact_type)
    WHERE is_primary = true AND effective_to IS NULL;

-- Contact type filtering
CREATE INDEX IF NOT EXISTS idx_employee_contacts_type
    ON app.employee_contacts(tenant_id, contact_type)
    WHERE effective_to IS NULL;

-- Value search (find employee by phone/email)
CREATE INDEX IF NOT EXISTS idx_employee_contacts_value
    ON app.employee_contacts(tenant_id, contact_type, value)
    WHERE effective_to IS NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.employee_contacts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see contacts for their current tenant
CREATE POLICY tenant_isolation ON app.employee_contacts
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.employee_contacts
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_employee_contacts_updated_at
    BEFORE UPDATE ON app.employee_contacts
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get all current contacts for an employee
CREATE OR REPLACE FUNCTION app.get_employee_contacts(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    contact_type app.contact_type,
    value varchar(255),
    is_primary boolean,
    is_verified boolean,
    effective_from date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ec.id, ec.contact_type, ec.value, ec.is_primary, ec.is_verified, ec.effective_from
    FROM app.employee_contacts ec
    WHERE ec.employee_id = p_employee_id
      AND ec.effective_to IS NULL
    ORDER BY ec.contact_type, ec.is_primary DESC, ec.created_at;
END;
$$;

-- Function to get primary contact of a specific type
CREATE OR REPLACE FUNCTION app.get_employee_primary_contact(
    p_employee_id uuid,
    p_contact_type app.contact_type
)
RETURNS varchar(255)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_value varchar(255);
BEGIN
    SELECT value INTO v_value
    FROM app.employee_contacts
    WHERE employee_id = p_employee_id
      AND contact_type = p_contact_type
      AND is_primary = true
      AND effective_to IS NULL
    LIMIT 1;

    -- If no primary, get most recent one
    IF v_value IS NULL THEN
        SELECT value INTO v_value
        FROM app.employee_contacts
        WHERE employee_id = p_employee_id
          AND contact_type = p_contact_type
          AND effective_to IS NULL
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    RETURN v_value;
END;
$$;

-- Function to get employee's primary email
CREATE OR REPLACE FUNCTION app.get_employee_email(
    p_employee_id uuid
)
RETURNS varchar(255)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN app.get_employee_primary_contact(p_employee_id, 'email');
END;
$$;

-- Function to get employee's primary phone
CREATE OR REPLACE FUNCTION app.get_employee_phone(
    p_employee_id uuid
)
RETURNS varchar(255)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_phone varchar(255);
BEGIN
    -- First try mobile
    v_phone := app.get_employee_primary_contact(p_employee_id, 'mobile');

    -- Fall back to phone
    IF v_phone IS NULL THEN
        v_phone := app.get_employee_primary_contact(p_employee_id, 'phone');
    END IF;

    RETURN v_phone;
END;
$$;

-- Function to find employees by contact value (search)
CREATE OR REPLACE FUNCTION app.find_employees_by_contact(
    p_tenant_id uuid,
    p_search_value varchar(255)
)
RETURNS TABLE (
    employee_id uuid,
    contact_type app.contact_type,
    value varchar(255)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ec.employee_id, ec.contact_type, ec.value
    FROM app.employee_contacts ec
    WHERE ec.tenant_id = p_tenant_id
      AND ec.value ILIKE '%' || p_search_value || '%'
      AND ec.effective_to IS NULL
    ORDER BY ec.employee_id;
END;
$$;

-- Function to add or update a contact (effective-dated)
CREATE OR REPLACE FUNCTION app.upsert_employee_contact(
    p_employee_id uuid,
    p_contact_type app.contact_type,
    p_value varchar(255),
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
        UPDATE app.employee_contacts
        SET is_primary = false,
            updated_at = now()
        WHERE employee_id = p_employee_id
          AND contact_type = p_contact_type
          AND is_primary = true
          AND effective_to IS NULL;
    END IF;

    -- Close any existing contact with same value and type
    UPDATE app.employee_contacts
    SET effective_to = p_effective_from,
        updated_at = now()
    WHERE employee_id = p_employee_id
      AND contact_type = p_contact_type
      AND value = p_value
      AND effective_to IS NULL
      AND effective_from < p_effective_from;

    -- Insert the new contact record
    INSERT INTO app.employee_contacts (
        tenant_id, employee_id, effective_from,
        contact_type, value, is_primary
    )
    VALUES (
        v_tenant_id, p_employee_id, p_effective_from,
        p_contact_type, p_value, p_is_primary
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- Function to mark a contact as verified
CREATE OR REPLACE FUNCTION app.verify_employee_contact(
    p_contact_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.employee_contacts
    SET is_verified = true,
        updated_at = now()
    WHERE id = p_contact_id
      AND effective_to IS NULL;

    RETURN FOUND;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.employee_contacts IS 'Effective-dated contact information (phone, email, emergency contacts)';
COMMENT ON COLUMN app.employee_contacts.id IS 'Primary UUID identifier for this contact record';
COMMENT ON COLUMN app.employee_contacts.tenant_id IS 'Tenant that owns this data';
COMMENT ON COLUMN app.employee_contacts.employee_id IS 'Employee this contact belongs to';
COMMENT ON COLUMN app.employee_contacts.effective_from IS 'Date this contact becomes effective';
COMMENT ON COLUMN app.employee_contacts.effective_to IS 'Date this contact ends (NULL = current)';
COMMENT ON COLUMN app.employee_contacts.contact_type IS 'Type of contact (phone, mobile, email, emergency)';
COMMENT ON COLUMN app.employee_contacts.value IS 'Contact value (phone number, email address, etc.)';
COMMENT ON COLUMN app.employee_contacts.is_primary IS 'Whether this is the primary contact for this type';
COMMENT ON COLUMN app.employee_contacts.is_verified IS 'Whether this contact has been verified';
COMMENT ON FUNCTION app.get_employee_contacts IS 'Returns all current contacts for an employee';
COMMENT ON FUNCTION app.get_employee_primary_contact IS 'Returns primary contact of a specific type';
COMMENT ON FUNCTION app.get_employee_email IS 'Returns primary email for an employee';
COMMENT ON FUNCTION app.get_employee_phone IS 'Returns primary phone (mobile preferred) for an employee';
COMMENT ON FUNCTION app.find_employees_by_contact IS 'Search for employees by contact value';
COMMENT ON FUNCTION app.upsert_employee_contact IS 'Add or update a contact with effective dating';
COMMENT ON FUNCTION app.verify_employee_contact IS 'Mark a contact as verified';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.verify_employee_contact(uuid);
-- DROP FUNCTION IF EXISTS app.upsert_employee_contact(uuid, app.contact_type, varchar, boolean, date);
-- DROP FUNCTION IF EXISTS app.find_employees_by_contact(uuid, varchar);
-- DROP FUNCTION IF EXISTS app.get_employee_phone(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_email(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_primary_contact(uuid, app.contact_type);
-- DROP FUNCTION IF EXISTS app.get_employee_contacts(uuid);
-- DROP TRIGGER IF EXISTS update_employee_contacts_updated_at ON app.employee_contacts;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.employee_contacts;
-- DROP POLICY IF EXISTS tenant_isolation ON app.employee_contacts;
-- DROP INDEX IF EXISTS app.idx_employee_contacts_value;
-- DROP INDEX IF EXISTS app.idx_employee_contacts_type;
-- DROP INDEX IF EXISTS app.idx_employee_contacts_primary;
-- DROP INDEX IF EXISTS app.idx_employee_contacts_effective_range;
-- DROP INDEX IF EXISTS app.idx_employee_contacts_current;
-- DROP INDEX IF EXISTS app.idx_employee_contacts_tenant_employee;
-- DROP TABLE IF EXISTS app.employee_contacts;
