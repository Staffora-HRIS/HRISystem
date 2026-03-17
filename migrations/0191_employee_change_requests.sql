-- Migration: 0191_employee_change_requests
-- Created: 2026-03-17
-- Description: Create the employee_change_requests table for approval workflow
--              Sensitive field changes (name, bank details) require manager/HR approval
--              Non-sensitive fields (phone, address, emergency contacts) are updated directly

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Change Request Status Enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'change_request_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
        CREATE TYPE app.change_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
    END IF;
END$$;

-- -----------------------------------------------------------------------------
-- Field Category Enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'field_category' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
        CREATE TYPE app.field_category AS ENUM ('personal', 'bank_details', 'contact', 'address', 'emergency_contact');
    END IF;
END$$;

-- -----------------------------------------------------------------------------
-- Employee Change Requests Table
-- -----------------------------------------------------------------------------
-- Stores requests from employees to update their personal details
-- Sensitive fields require approval; non-sensitive changes are auto-approved
CREATE TABLE IF NOT EXISTS app.employee_change_requests (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this data
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee requesting the change
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- What is being changed
    field_category app.field_category NOT NULL,
    field_name varchar(100) NOT NULL,
    old_value text,
    new_value text NOT NULL,

    -- Whether this change requires approval
    requires_approval boolean NOT NULL DEFAULT true,

    -- Status tracking
    status app.change_request_status NOT NULL DEFAULT 'pending',

    -- Reviewer information
    reviewer_id uuid REFERENCES app.users(id),
    reviewer_notes text,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,

    -- Constraints
    CONSTRAINT change_request_status_review CHECK (
        (status IN ('approved', 'rejected') AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)
        OR status IN ('pending', 'cancelled')
    ),

    CONSTRAINT change_request_new_value_not_empty CHECK (
        length(trim(new_value)) > 0
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Lookup by tenant and employee (list my change requests)
CREATE INDEX IF NOT EXISTS idx_change_requests_tenant_employee
    ON app.employee_change_requests(tenant_id, employee_id);

-- Lookup pending requests for reviewers
CREATE INDEX IF NOT EXISTS idx_change_requests_tenant_status
    ON app.employee_change_requests(tenant_id, status)
    WHERE status = 'pending';

-- Lookup by employee and status
CREATE INDEX IF NOT EXISTS idx_change_requests_employee_status
    ON app.employee_change_requests(tenant_id, employee_id, status);

-- Ordering by creation date
CREATE INDEX IF NOT EXISTS idx_change_requests_created_at
    ON app.employee_change_requests(tenant_id, created_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.employee_change_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see change requests for their current tenant
CREATE POLICY tenant_isolation ON app.employee_change_requests
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.employee_change_requests
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_change_requests_updated_at
    BEFORE UPDATE ON app.employee_change_requests
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Grants
-- =============================================================================

-- Grant access to the application role
GRANT SELECT, INSERT, UPDATE ON app.employee_change_requests TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.employee_change_requests IS 'Employee self-service change requests requiring approval for sensitive fields';
COMMENT ON COLUMN app.employee_change_requests.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.employee_change_requests.tenant_id IS 'Tenant that owns this data';
COMMENT ON COLUMN app.employee_change_requests.employee_id IS 'Employee requesting the change';
COMMENT ON COLUMN app.employee_change_requests.field_category IS 'Category of field being changed (personal, bank_details, contact, address, emergency_contact)';
COMMENT ON COLUMN app.employee_change_requests.field_name IS 'Specific field name being changed (e.g., first_name, sort_code)';
COMMENT ON COLUMN app.employee_change_requests.old_value IS 'Previous value (null for new entries)';
COMMENT ON COLUMN app.employee_change_requests.new_value IS 'Requested new value';
COMMENT ON COLUMN app.employee_change_requests.requires_approval IS 'Whether this change requires manager/HR approval';
COMMENT ON COLUMN app.employee_change_requests.status IS 'Current status: pending, approved, rejected, cancelled';
COMMENT ON COLUMN app.employee_change_requests.reviewer_id IS 'User who reviewed the request';
COMMENT ON COLUMN app.employee_change_requests.reviewer_notes IS 'Notes from the reviewer';
COMMENT ON COLUMN app.employee_change_requests.reviewed_at IS 'When the request was reviewed';
COMMENT ON TYPE app.change_request_status IS 'Status enum for employee change requests';
COMMENT ON TYPE app.field_category IS 'Category of field for change request classification';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_change_requests_updated_at ON app.employee_change_requests;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.employee_change_requests;
-- DROP POLICY IF EXISTS tenant_isolation ON app.employee_change_requests;
-- DROP INDEX IF EXISTS app.idx_change_requests_created_at;
-- DROP INDEX IF EXISTS app.idx_change_requests_employee_status;
-- DROP INDEX IF EXISTS app.idx_change_requests_tenant_status;
-- DROP INDEX IF EXISTS app.idx_change_requests_tenant_employee;
-- DROP TABLE IF EXISTS app.employee_change_requests;
-- DROP TYPE IF EXISTS app.field_category;
-- DROP TYPE IF EXISTS app.change_request_status;
