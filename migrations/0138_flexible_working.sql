-- Migration: 0138_flexible_working
-- Created: 2026-03-13
-- Description: Flexible Working Request system.
--              Implements the day-one right to request flexible working under
--              the Employment Relations (Flexible Working) Act 2023, which
--              amends s.80F of the Employment Rights Act 1996.
--
--              Key statutory requirements:
--              - Day-one right (no 26-week qualifying period) from April 2024
--              - Employees can make 2 requests per 12-month rolling period
--              - Employers must respond within 2 months (decision period)
--              - Employer must consult before refusing
--              - Only 8 statutory grounds for refusal
--
--              Reference: Employment Relations (Flexible Working) Act 2023 (c. 29)
--              https://www.legislation.gov.uk/ukpga/2023/29

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum type for request status
-- -----------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE app.flexible_working_status AS ENUM (
        'pending',
        'consultation',
        'approved',
        'rejected',
        'withdrawn'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Enum type for rejection grounds (Employment Rights Act 1996, s.80G(1)(b))
-- -----------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE app.flexible_working_rejection_ground AS ENUM (
        'burden_of_additional_costs',
        'inability_to_reorganise',
        'inability_to_recruit',
        'detrimental_impact_quality',
        'detrimental_impact_performance',
        'insufficient_work',
        'planned_structural_changes',
        'other_specified'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- flexible_working_requests - Core table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.flexible_working_requests (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The employee making the request
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Request details
    request_date date NOT NULL DEFAULT CURRENT_DATE,
    current_working_pattern text NOT NULL,
    requested_working_pattern text NOT NULL,
    requested_start_date date NOT NULL,
    reason text NOT NULL,
    impact_assessment text,

    -- Status tracking
    status app.flexible_working_status NOT NULL DEFAULT 'pending',

    -- Statutory 2-month response deadline (calculated from request_date)
    response_deadline date NOT NULL,

    -- Decision fields
    decision_date date,
    decision_by uuid REFERENCES app.employees(id) ON DELETE SET NULL,

    -- Rejection details (only populated when status = 'rejected')
    rejection_grounds app.flexible_working_rejection_ground,
    rejection_explanation text,

    -- Appeal tracking
    appeal_date date,
    appeal_outcome varchar(20),

    -- Which request in the 12-month rolling period (1 or 2)
    request_number_in_period int NOT NULL DEFAULT 1,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Request number must be 1 or 2 (statutory maximum per 12-month period)
    CONSTRAINT fwr_request_number_check CHECK (
        request_number_in_period IN (1, 2)
    ),

    -- Requested start date must be on or after request date
    CONSTRAINT fwr_start_after_request CHECK (
        requested_start_date >= request_date
    ),

    -- Decision date must be on or after request date
    CONSTRAINT fwr_decision_after_request CHECK (
        decision_date IS NULL OR decision_date >= request_date
    ),

    -- Appeal date must be on or after decision date
    CONSTRAINT fwr_appeal_after_decision CHECK (
        appeal_date IS NULL OR (decision_date IS NOT NULL AND appeal_date >= decision_date)
    ),

    -- Rejection grounds required when rejected
    CONSTRAINT fwr_rejection_grounds_required CHECK (
        (status != 'rejected') OR (rejection_grounds IS NOT NULL AND rejection_explanation IS NOT NULL)
    ),

    -- Decision fields required when approved or rejected
    CONSTRAINT fwr_decision_fields_required CHECK (
        (status NOT IN ('approved', 'rejected')) OR (decision_date IS NOT NULL AND decision_by IS NOT NULL)
    ),

    -- Appeal outcome must be a recognized value
    CONSTRAINT fwr_appeal_outcome_values CHECK (
        appeal_outcome IS NULL OR appeal_outcome IN ('upheld', 'overturned', 'pending')
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: requests for an employee within a tenant
CREATE INDEX IF NOT EXISTS idx_fwr_tenant_employee
    ON app.flexible_working_requests(tenant_id, employee_id);

-- Status-based lookups (e.g., pending requests needing attention)
CREATE INDEX IF NOT EXISTS idx_fwr_tenant_status
    ON app.flexible_working_requests(tenant_id, status);

-- Response deadline tracking (for compliance: overdue responses)
CREATE INDEX IF NOT EXISTS idx_fwr_tenant_deadline
    ON app.flexible_working_requests(tenant_id, response_deadline)
    WHERE status IN ('pending', 'consultation');

-- Chronological listing
CREATE INDEX IF NOT EXISTS idx_fwr_tenant_request_date
    ON app.flexible_working_requests(tenant_id, request_date DESC);

-- Employee + date range lookup (for counting requests in 12-month period)
CREATE INDEX IF NOT EXISTS idx_fwr_employee_date
    ON app.flexible_working_requests(employee_id, request_date);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.flexible_working_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.flexible_working_requests
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.flexible_working_requests
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_flexible_working_requests_updated_at
    BEFORE UPDATE ON app.flexible_working_requests
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Table Comments
-- =============================================================================

COMMENT ON TABLE app.flexible_working_requests IS
    'Flexible working requests under the Employment Relations (Flexible Working) Act 2023. '
    || 'Day-one right from April 2024. Employees may make up to 2 requests per 12-month period. '
    || 'Employers must respond within 2 months and must consult before refusing.';

COMMENT ON COLUMN app.flexible_working_requests.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.flexible_working_requests.tenant_id IS 'Tenant that owns this record';
COMMENT ON COLUMN app.flexible_working_requests.employee_id IS 'Employee making the flexible working request';
COMMENT ON COLUMN app.flexible_working_requests.request_date IS 'Date the request was submitted';
COMMENT ON COLUMN app.flexible_working_requests.current_working_pattern IS 'Description of the employee current working pattern';
COMMENT ON COLUMN app.flexible_working_requests.requested_working_pattern IS 'Description of the requested new working pattern';
COMMENT ON COLUMN app.flexible_working_requests.requested_start_date IS 'When the employee wants the new pattern to start';
COMMENT ON COLUMN app.flexible_working_requests.reason IS 'Employee reason for requesting the change';
COMMENT ON COLUMN app.flexible_working_requests.impact_assessment IS 'Assessment of how the change might affect the business (optional at submission)';
COMMENT ON COLUMN app.flexible_working_requests.status IS 'Current status: pending, consultation, approved, rejected, withdrawn';
COMMENT ON COLUMN app.flexible_working_requests.response_deadline IS 'Statutory 2-month deadline for employer decision (from request_date)';
COMMENT ON COLUMN app.flexible_working_requests.decision_date IS 'Date the employer made their decision';
COMMENT ON COLUMN app.flexible_working_requests.decision_by IS 'Employee (manager/HR) who made the decision';
COMMENT ON COLUMN app.flexible_working_requests.rejection_grounds IS 'One of 8 statutory grounds for refusal (ERA 1996, s.80G(1)(b))';
COMMENT ON COLUMN app.flexible_working_requests.rejection_explanation IS 'Explanation of why the request was refused on the stated grounds';
COMMENT ON COLUMN app.flexible_working_requests.appeal_date IS 'Date the employee submitted an appeal (if applicable)';
COMMENT ON COLUMN app.flexible_working_requests.appeal_outcome IS 'Outcome of the appeal: upheld, overturned, or pending';
COMMENT ON COLUMN app.flexible_working_requests.request_number_in_period IS 'Which request this is in the current 12-month rolling period (1 or 2)';

-- =============================================================================
-- GRANT access to the application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.flexible_working_requests TO hris_app;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- REVOKE SELECT, INSERT, UPDATE, DELETE ON app.flexible_working_requests FROM hris_app;
-- DROP TRIGGER IF EXISTS update_flexible_working_requests_updated_at ON app.flexible_working_requests;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.flexible_working_requests;
-- DROP POLICY IF EXISTS tenant_isolation ON app.flexible_working_requests;
-- DROP INDEX IF EXISTS app.idx_fwr_employee_date;
-- DROP INDEX IF EXISTS app.idx_fwr_tenant_request_date;
-- DROP INDEX IF EXISTS app.idx_fwr_tenant_deadline;
-- DROP INDEX IF EXISTS app.idx_fwr_tenant_status;
-- DROP INDEX IF EXISTS app.idx_fwr_tenant_employee;
-- DROP TABLE IF EXISTS app.flexible_working_requests;
-- DROP TYPE IF EXISTS app.flexible_working_rejection_ground;
-- DROP TYPE IF EXISTS app.flexible_working_status;
