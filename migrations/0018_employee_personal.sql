-- Migration: 0018_employee_personal
-- Created: 2026-01-07
-- Description: Create the employee_personal table for effective-dated personal information
--              Stores name, date of birth, gender, marital status, nationality
--              Uses effective dating for historical tracking and future scheduling

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Employee Personal Information Table
-- -----------------------------------------------------------------------------
-- Effective-dated personal information for employees
-- Each row represents a version of personal data valid for a date range
-- Only one record can be current (effective_to IS NULL) at any time per employee
CREATE TABLE IF NOT EXISTS app.employee_personal (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this data
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee this personal info belongs to
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Effective dating
    -- effective_from: When this version of data becomes valid
    -- effective_to: When this version ends (NULL = currently effective)
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,

    -- Name fields
    first_name varchar(100) NOT NULL,
    middle_name varchar(100),
    last_name varchar(100) NOT NULL,
    preferred_name varchar(100), -- Nickname or preferred name

    -- Personal details
    date_of_birth date,
    gender app.gender,
    marital_status app.marital_status,

    -- Nationality (ISO 3166-1 alpha-3 country code, e.g., 'USA', 'GBR')
    nationality varchar(3),

    -- Audit trail
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Only one record can be effective at a given time per employee
    -- effective_from must be unique per employee for each effective period
    CONSTRAINT employee_personal_effective_unique UNIQUE (tenant_id, employee_id, effective_from),

    -- Effective dates validation
    CONSTRAINT employee_personal_effective_dates CHECK (
        effective_to IS NULL OR effective_to > effective_from
    ),

    -- Date of birth sanity check (employee must be at least 14 years old)
    CONSTRAINT employee_personal_dob_reasonable CHECK (
        date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE - interval '14 years'
    ),

    -- Nationality format (ISO 3166-1 alpha-3)
    CONSTRAINT employee_personal_nationality_format CHECK (
        nationality IS NULL OR nationality ~ '^[A-Z]{3}$'
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: find personal info for an employee
CREATE INDEX IF NOT EXISTS idx_employee_personal_tenant_employee
    ON app.employee_personal(tenant_id, employee_id);

-- Find current record (effective_to IS NULL)
CREATE INDEX IF NOT EXISTS idx_employee_personal_current
    ON app.employee_personal(tenant_id, employee_id, effective_from)
    WHERE effective_to IS NULL;

-- Effective date range queries (find record valid at a specific date)
CREATE INDEX IF NOT EXISTS idx_employee_personal_effective_range
    ON app.employee_personal(tenant_id, employee_id, effective_from, effective_to);

-- Name search within tenant
CREATE INDEX IF NOT EXISTS idx_employee_personal_name
    ON app.employee_personal(tenant_id, last_name, first_name);

-- Date of birth queries (birthday reports)
CREATE INDEX IF NOT EXISTS idx_employee_personal_dob
    ON app.employee_personal(tenant_id, date_of_birth)
    WHERE date_of_birth IS NOT NULL AND effective_to IS NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.employee_personal ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see personal data for their current tenant
CREATE POLICY tenant_isolation ON app.employee_personal
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.employee_personal
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_employee_personal_updated_at
    BEFORE UPDATE ON app.employee_personal
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Effective Dating Helper Functions
-- =============================================================================

-- Function to get current personal info for an employee
CREATE OR REPLACE FUNCTION app.get_current_employee_personal(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    first_name varchar(100),
    middle_name varchar(100),
    last_name varchar(100),
    preferred_name varchar(100),
    date_of_birth date,
    gender app.gender,
    marital_status app.marital_status,
    nationality varchar(3),
    effective_from date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ep.id, ep.first_name, ep.middle_name, ep.last_name, ep.preferred_name,
           ep.date_of_birth, ep.gender, ep.marital_status, ep.nationality, ep.effective_from
    FROM app.employee_personal ep
    WHERE ep.employee_id = p_employee_id
      AND ep.effective_to IS NULL
    LIMIT 1;
END;
$$;

-- Function to get personal info as of a specific date
CREATE OR REPLACE FUNCTION app.get_employee_personal_as_of(
    p_employee_id uuid,
    p_as_of_date date
)
RETURNS TABLE (
    id uuid,
    first_name varchar(100),
    middle_name varchar(100),
    last_name varchar(100),
    preferred_name varchar(100),
    date_of_birth date,
    gender app.gender,
    marital_status app.marital_status,
    nationality varchar(3),
    effective_from date,
    effective_to date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ep.id, ep.first_name, ep.middle_name, ep.last_name, ep.preferred_name,
           ep.date_of_birth, ep.gender, ep.marital_status, ep.nationality,
           ep.effective_from, ep.effective_to
    FROM app.employee_personal ep
    WHERE ep.employee_id = p_employee_id
      AND ep.effective_from <= p_as_of_date
      AND (ep.effective_to IS NULL OR ep.effective_to > p_as_of_date)
    ORDER BY ep.effective_from DESC
    LIMIT 1;
END;
$$;

-- Function to get full history of personal info for an employee
CREATE OR REPLACE FUNCTION app.get_employee_personal_history(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    first_name varchar(100),
    last_name varchar(100),
    effective_from date,
    effective_to date,
    created_at timestamptz,
    created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ep.id, ep.first_name, ep.last_name,
           ep.effective_from, ep.effective_to, ep.created_at, ep.created_by
    FROM app.employee_personal ep
    WHERE ep.employee_id = p_employee_id
    ORDER BY ep.effective_from DESC;
END;
$$;

-- Function to close current record and insert new one (for updates)
-- This maintains the effective dating pattern properly
CREATE OR REPLACE FUNCTION app.update_employee_personal(
    p_employee_id uuid,
    p_first_name varchar(100),
    p_middle_name varchar(100),
    p_last_name varchar(100),
    p_preferred_name varchar(100),
    p_date_of_birth date,
    p_gender app.gender,
    p_marital_status app.marital_status,
    p_nationality varchar(3),
    p_effective_from date,
    p_created_by uuid
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

    -- Close the current record (if any) by setting effective_to
    UPDATE app.employee_personal
    SET effective_to = p_effective_from,
        updated_at = now()
    WHERE employee_id = p_employee_id
      AND effective_to IS NULL
      AND effective_from < p_effective_from;

    -- Insert the new record
    INSERT INTO app.employee_personal (
        tenant_id, employee_id, effective_from,
        first_name, middle_name, last_name, preferred_name,
        date_of_birth, gender, marital_status, nationality,
        created_by
    )
    VALUES (
        v_tenant_id, p_employee_id, p_effective_from,
        p_first_name, p_middle_name, p_last_name, p_preferred_name,
        p_date_of_birth, p_gender, p_marital_status, p_nationality,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- Function to get employee's full name (for display)
CREATE OR REPLACE FUNCTION app.get_employee_full_name(
    p_employee_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_full_name text;
BEGIN
    SELECT
        CASE
            WHEN middle_name IS NOT NULL THEN first_name || ' ' || middle_name || ' ' || last_name
            ELSE first_name || ' ' || last_name
        END
    INTO v_full_name
    FROM app.employee_personal
    WHERE employee_id = p_employee_id
      AND effective_to IS NULL;

    RETURN v_full_name;
END;
$$;

-- Function to get employee's display name (preferred or first name)
CREATE OR REPLACE FUNCTION app.get_employee_display_name(
    p_employee_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_display_name text;
BEGIN
    SELECT COALESCE(preferred_name, first_name) || ' ' || last_name
    INTO v_display_name
    FROM app.employee_personal
    WHERE employee_id = p_employee_id
      AND effective_to IS NULL;

    RETURN v_display_name;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.employee_personal IS 'Effective-dated personal information (name, DOB, gender, etc.)';
COMMENT ON COLUMN app.employee_personal.id IS 'Primary UUID identifier for this version of personal data';
COMMENT ON COLUMN app.employee_personal.tenant_id IS 'Tenant that owns this data';
COMMENT ON COLUMN app.employee_personal.employee_id IS 'Employee this personal info belongs to';
COMMENT ON COLUMN app.employee_personal.effective_from IS 'Date this version becomes effective';
COMMENT ON COLUMN app.employee_personal.effective_to IS 'Date this version ends (NULL = current)';
COMMENT ON COLUMN app.employee_personal.first_name IS 'Legal first name';
COMMENT ON COLUMN app.employee_personal.middle_name IS 'Middle name (optional)';
COMMENT ON COLUMN app.employee_personal.last_name IS 'Legal last name / surname';
COMMENT ON COLUMN app.employee_personal.preferred_name IS 'Preferred/nickname for display';
COMMENT ON COLUMN app.employee_personal.date_of_birth IS 'Date of birth';
COMMENT ON COLUMN app.employee_personal.gender IS 'Gender identity';
COMMENT ON COLUMN app.employee_personal.marital_status IS 'Current marital status';
COMMENT ON COLUMN app.employee_personal.nationality IS 'Nationality (ISO 3166-1 alpha-3)';
COMMENT ON COLUMN app.employee_personal.created_by IS 'User who created this version';
COMMENT ON FUNCTION app.get_current_employee_personal IS 'Returns current (effective_to IS NULL) personal info';
COMMENT ON FUNCTION app.get_employee_personal_as_of IS 'Returns personal info effective at a specific date';
COMMENT ON FUNCTION app.get_employee_personal_history IS 'Returns all versions of personal info for audit';
COMMENT ON FUNCTION app.update_employee_personal IS 'Closes current record and inserts new version';
COMMENT ON FUNCTION app.get_employee_full_name IS 'Returns formatted full name for display';
COMMENT ON FUNCTION app.get_employee_display_name IS 'Returns preferred name or first name for display';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_employee_display_name(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_full_name(uuid);
-- DROP FUNCTION IF EXISTS app.update_employee_personal(uuid, varchar, varchar, varchar, varchar, date, app.gender, app.marital_status, varchar, date, uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_personal_history(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_personal_as_of(uuid, date);
-- DROP FUNCTION IF EXISTS app.get_current_employee_personal(uuid);
-- DROP TRIGGER IF EXISTS update_employee_personal_updated_at ON app.employee_personal;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.employee_personal;
-- DROP POLICY IF EXISTS tenant_isolation ON app.employee_personal;
-- DROP INDEX IF EXISTS app.idx_employee_personal_dob;
-- DROP INDEX IF EXISTS app.idx_employee_personal_name;
-- DROP INDEX IF EXISTS app.idx_employee_personal_effective_range;
-- DROP INDEX IF EXISTS app.idx_employee_personal_current;
-- DROP INDEX IF EXISTS app.idx_employee_personal_tenant_employee;
-- DROP TABLE IF EXISTS app.employee_personal;
