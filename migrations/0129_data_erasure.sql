-- Migration: 0129_data_erasure
-- Created: 2026-03-13
-- Description: GDPR Article 17 - Right to Erasure (Right to be Forgotten)
--              Creates tables to track erasure requests, per-table/module erasure items,
--              and an immutable audit trail. Includes a SECURITY DEFINER function to
--              anonymize employee PII across all relevant tables.
--
--              Design decisions:
--              - Anonymization preferred over hard-delete to preserve referential integrity
--              - Audit logs are NEVER anonymized (legal retention requirement)
--              - Compensation/payroll data may be retained for statutory tax periods
--              - Each table's anonymization result is tracked in erasure_items

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Erasure Request Status Enum
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE app.erasure_request_status AS ENUM (
    'received',
    'reviewing',
    'approved',
    'in_progress',
    'completed',
    'rejected',
    'partially_completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Erasure Item Action Enum
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE app.erasure_item_action AS ENUM (
    'anonymized',
    'deleted',
    'retained',
    'pending'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Erasure Requests Table
-- -----------------------------------------------------------------------------
-- Main table tracking GDPR Article 17 erasure requests
CREATE TABLE IF NOT EXISTS app.erasure_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The employee whose data should be erased
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,

    -- Who submitted the erasure request (can be the employee themselves or HR)
    requested_by_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,

    -- Current status of the request
    status app.erasure_request_status NOT NULL DEFAULT 'received',

    -- Date the request was received (for SLA tracking)
    received_date date NOT NULL DEFAULT CURRENT_DATE,

    -- Statutory deadline: must complete within 30 calendar days of receipt
    deadline_date date NOT NULL DEFAULT (CURRENT_DATE + interval '30 days')::date,

    -- Approval workflow
    approved_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    approved_at timestamptz,

    -- Completion
    completed_at timestamptz,

    -- Rejection
    rejection_reason text,

    -- Free-form notes
    notes text,

    -- Reference to the generated erasure certificate (file storage key)
    certificate_file_key varchar(500),

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Deadline must be on or after received date
    CONSTRAINT erasure_requests_deadline_valid CHECK (
        deadline_date >= received_date
    ),

    -- Approval requires different user from requester
    CONSTRAINT erasure_requests_approval_not_self CHECK (
        approved_by IS NULL OR approved_by != requested_by_user_id
    ),

    -- Rejection reason required when rejected
    CONSTRAINT erasure_requests_rejection_reason CHECK (
        status != 'rejected' OR rejection_reason IS NOT NULL
    )
);

-- =============================================================================
-- Erasure Requests Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_erasure_requests_tenant
    ON app.erasure_requests(tenant_id);

CREATE INDEX IF NOT EXISTS idx_erasure_requests_tenant_status
    ON app.erasure_requests(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_erasure_requests_tenant_employee
    ON app.erasure_requests(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_erasure_requests_deadline
    ON app.erasure_requests(tenant_id, deadline_date)
    WHERE status NOT IN ('completed', 'rejected');

CREATE INDEX IF NOT EXISTS idx_erasure_requests_overdue
    ON app.erasure_requests(tenant_id, deadline_date)
    WHERE status IN ('received', 'reviewing', 'approved', 'in_progress');

-- =============================================================================
-- Erasure Requests RLS
-- =============================================================================

ALTER TABLE app.erasure_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.erasure_requests
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.erasure_requests
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Erasure Requests Triggers
-- =============================================================================

CREATE TRIGGER update_erasure_requests_updated_at
    BEFORE UPDATE ON app.erasure_requests
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Erasure Items Table
-- -----------------------------------------------------------------------------
-- Per-table / per-module tracking of what was done to each data source
CREATE TABLE IF NOT EXISTS app.erasure_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Parent erasure request
    erasure_request_id uuid NOT NULL REFERENCES app.erasure_requests(id) ON DELETE CASCADE,

    -- Which table was processed
    table_name varchar(100) NOT NULL,

    -- Which module this table belongs to (for UI grouping)
    module_name varchar(50),

    -- How many records were affected
    record_count integer NOT NULL DEFAULT 0,

    -- What action was taken
    action_taken app.erasure_item_action NOT NULL DEFAULT 'pending',

    -- If retained, explain why (e.g., "Tax records: 7-year statutory retention")
    retention_reason text,

    -- When this table was processed
    completed_at timestamptz,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Erasure Items Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_erasure_items_tenant
    ON app.erasure_items(tenant_id);

CREATE INDEX IF NOT EXISTS idx_erasure_items_request
    ON app.erasure_items(tenant_id, erasure_request_id);

CREATE INDEX IF NOT EXISTS idx_erasure_items_action
    ON app.erasure_items(tenant_id, action_taken);

-- =============================================================================
-- Erasure Items RLS
-- =============================================================================

ALTER TABLE app.erasure_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.erasure_items
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.erasure_items
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Erasure Items Triggers
-- =============================================================================

CREATE TRIGGER update_erasure_items_updated_at
    BEFORE UPDATE ON app.erasure_items
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Erasure Audit Log Table
-- -----------------------------------------------------------------------------
-- Immutable audit trail for all erasure operations
-- This table is append-only — no updates or deletes permitted
CREATE TABLE IF NOT EXISTS app.erasure_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Parent erasure request
    erasure_request_id uuid NOT NULL REFERENCES app.erasure_requests(id) ON DELETE CASCADE,

    -- What action was performed
    action varchar(50) NOT NULL,

    -- Who performed the action
    performed_by uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,

    -- Additional details (JSON)
    details jsonb,

    -- Immutable timestamp — no updated_at on purpose
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Erasure Audit Log Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_erasure_audit_log_tenant
    ON app.erasure_audit_log(tenant_id);

CREATE INDEX IF NOT EXISTS idx_erasure_audit_log_request
    ON app.erasure_audit_log(tenant_id, erasure_request_id);

CREATE INDEX IF NOT EXISTS idx_erasure_audit_log_action
    ON app.erasure_audit_log(tenant_id, action);

-- =============================================================================
-- Erasure Audit Log RLS
-- =============================================================================

ALTER TABLE app.erasure_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.erasure_audit_log
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.erasure_audit_log
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Anonymization Function
-- =============================================================================

-- Function to anonymize a specific employee's personal data across all relevant
-- tables. Uses SECURITY DEFINER to run with elevated privileges so it can
-- update all rows regardless of the current RLS context (it sets tenant
-- context internally). Returns a JSONB summary of affected row counts.
--
-- Tables anonymized:
--   employees         — name-related columns cleared from the anchor record
--   employee_personal — names, DOB, gender, marital status, nationality
--   employee_contacts — contact values replaced with REDACTED
--   employee_addresses— address lines, city, postal_code replaced
--   employee_identifiers — identifier values replaced with REDACTED
--
-- Tables explicitly NOT anonymized:
--   audit_log / erasure_audit_log — legal retention requirement
--   compensation_history          — may be retained for tax statutory periods
--   employee_status_history       — operational record, no PII
--   leave_requests / leave_balances — anonymized via employee FK, no standalone PII

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

    -- -------------------------------------------------------------------------
    -- 1. employees (anchor record)
    -- -------------------------------------------------------------------------
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

    -- -------------------------------------------------------------------------
    -- 2. employee_personal (effective-dated personal info)
    -- -------------------------------------------------------------------------
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

    -- -------------------------------------------------------------------------
    -- 3. employee_contacts (phone, email, emergency contacts)
    -- -------------------------------------------------------------------------
    UPDATE app.employee_contacts SET
        value = 'REDACTED',
        is_verified = false,
        updated_at = now()
    WHERE employee_id = p_employee_id AND tenant_id = p_tenant_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    result := result || jsonb_build_object('employee_contacts', affected);

    -- -------------------------------------------------------------------------
    -- 4. employee_addresses (home, work, mailing addresses)
    -- -------------------------------------------------------------------------
    UPDATE app.employee_addresses SET
        street_line1 = 'REDACTED',
        street_line2 = NULL,
        city = 'REDACTED',
        state_province = NULL,
        postal_code = 'XX',
        updated_at = now()
    WHERE employee_id = p_employee_id AND tenant_id = p_tenant_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    result := result || jsonb_build_object('employee_addresses', affected);

    -- -------------------------------------------------------------------------
    -- 5. employee_identifiers (SSN, passport, national ID, etc.)
    -- -------------------------------------------------------------------------
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

COMMENT ON FUNCTION app.anonymize_employee IS
    'GDPR Article 17 - Anonymizes an employee''s personal data across all PII-bearing tables. '
    'Returns a JSONB summary of affected row counts per table.';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.erasure_requests IS 'GDPR Article 17 erasure requests tracking';
COMMENT ON TABLE app.erasure_items IS 'Per-table/module tracking of erasure actions taken';
COMMENT ON TABLE app.erasure_audit_log IS 'Immutable audit trail for erasure operations';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.anonymize_employee(uuid, uuid, text);
-- DROP TRIGGER IF EXISTS update_erasure_items_updated_at ON app.erasure_items;
-- DROP TRIGGER IF EXISTS update_erasure_requests_updated_at ON app.erasure_requests;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.erasure_audit_log;
-- DROP POLICY IF EXISTS tenant_isolation ON app.erasure_audit_log;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.erasure_items;
-- DROP POLICY IF EXISTS tenant_isolation ON app.erasure_items;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.erasure_requests;
-- DROP POLICY IF EXISTS tenant_isolation ON app.erasure_requests;
-- DROP INDEX IF EXISTS app.idx_erasure_audit_log_action;
-- DROP INDEX IF EXISTS app.idx_erasure_audit_log_request;
-- DROP INDEX IF EXISTS app.idx_erasure_audit_log_tenant;
-- DROP INDEX IF EXISTS app.idx_erasure_items_action;
-- DROP INDEX IF EXISTS app.idx_erasure_items_request;
-- DROP INDEX IF EXISTS app.idx_erasure_items_tenant;
-- DROP INDEX IF EXISTS app.idx_erasure_requests_overdue;
-- DROP INDEX IF EXISTS app.idx_erasure_requests_deadline;
-- DROP INDEX IF EXISTS app.idx_erasure_requests_tenant_employee;
-- DROP INDEX IF EXISTS app.idx_erasure_requests_tenant_status;
-- DROP INDEX IF EXISTS app.idx_erasure_requests_tenant;
-- DROP TABLE IF EXISTS app.erasure_audit_log;
-- DROP TABLE IF EXISTS app.erasure_items;
-- DROP TABLE IF EXISTS app.erasure_requests;
-- DROP TYPE IF EXISTS app.erasure_item_action;
-- DROP TYPE IF EXISTS app.erasure_request_status;
