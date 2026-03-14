-- Migration: 0157_flexible_working_enhancements
-- Created: 2026-03-14
-- Description: Enhances the flexible working request system for full UK compliance
--              with the Employment Relations (Flexible Working) Act 2023.
--
--              Changes:
--              1. Extend status enum with: submitted, under_review, consultation_scheduled,
--                 consultation_complete, appeal, appeal_approved, appeal_rejected
--              2. Add missing 8th statutory rejection ground: detrimental_effect_customer_demand
--              3. Add consultation tracking table for mandatory consultation records
--              4. Add request history table for immutable audit trail
--              5. Add columns for approved modifications and contract amendment reference
--              6. Add withdrawal_reason column
--
--              Reference: Employment Relations (Flexible Working) Act 2023 (c. 29)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend the flexible_working_status enum
-- -----------------------------------------------------------------------------

ALTER TYPE app.flexible_working_status ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'pending';
ALTER TYPE app.flexible_working_status ADD VALUE IF NOT EXISTS 'under_review' AFTER 'pending';
ALTER TYPE app.flexible_working_status ADD VALUE IF NOT EXISTS 'consultation_scheduled' AFTER 'under_review';
ALTER TYPE app.flexible_working_status ADD VALUE IF NOT EXISTS 'consultation_complete' AFTER 'consultation_scheduled';
ALTER TYPE app.flexible_working_status ADD VALUE IF NOT EXISTS 'appeal' AFTER 'rejected';
ALTER TYPE app.flexible_working_status ADD VALUE IF NOT EXISTS 'appeal_approved' AFTER 'appeal';
ALTER TYPE app.flexible_working_status ADD VALUE IF NOT EXISTS 'appeal_rejected' AFTER 'appeal_approved';

-- -----------------------------------------------------------------------------
-- 2. Add missing 8th statutory rejection ground
-- -----------------------------------------------------------------------------

ALTER TYPE app.flexible_working_rejection_ground ADD VALUE IF NOT EXISTS 'detrimental_effect_customer_demand';

-- -----------------------------------------------------------------------------
-- 3. Add new columns to flexible_working_requests
-- -----------------------------------------------------------------------------

-- Change type (what aspect of work the employee wants to change)
ALTER TABLE app.flexible_working_requests
    ADD COLUMN IF NOT EXISTS change_type varchar(50);

COMMENT ON COLUMN app.flexible_working_requests.change_type IS
    'Type of change requested: hours, times, location, pattern, or combination';

-- Approved modifications (differences from what was requested, if any)
ALTER TABLE app.flexible_working_requests
    ADD COLUMN IF NOT EXISTS approved_modifications text;

COMMENT ON COLUMN app.flexible_working_requests.approved_modifications IS
    'Description of any modifications agreed during consultation that differ from the original request';

-- Effective date (when the approved change takes effect)
ALTER TABLE app.flexible_working_requests
    ADD COLUMN IF NOT EXISTS effective_date date;

COMMENT ON COLUMN app.flexible_working_requests.effective_date IS
    'Date the approved flexible working arrangement takes effect';

-- Contract amendment reference
ALTER TABLE app.flexible_working_requests
    ADD COLUMN IF NOT EXISTS contract_amendment_id uuid;

COMMENT ON COLUMN app.flexible_working_requests.contract_amendment_id IS
    'Reference to the contract amendment record created when the request is approved';

-- Trial period end date (optional trial period for the new arrangement)
ALTER TABLE app.flexible_working_requests
    ADD COLUMN IF NOT EXISTS trial_period_end_date date;

COMMENT ON COLUMN app.flexible_working_requests.trial_period_end_date IS
    'Optional end date for a trial period of the new working arrangement';

-- Withdrawal reason
ALTER TABLE app.flexible_working_requests
    ADD COLUMN IF NOT EXISTS withdrawal_reason text;

COMMENT ON COLUMN app.flexible_working_requests.withdrawal_reason IS
    'Reason provided by the employee when withdrawing the request';

-- Appeal grounds
ALTER TABLE app.flexible_working_requests
    ADD COLUMN IF NOT EXISTS appeal_grounds text;

COMMENT ON COLUMN app.flexible_working_requests.appeal_grounds IS
    'Grounds provided by the employee for appealing the rejection decision';

-- Appeal decision by
ALTER TABLE app.flexible_working_requests
    ADD COLUMN IF NOT EXISTS appeal_decision_by uuid REFERENCES app.employees(id) ON DELETE SET NULL;

COMMENT ON COLUMN app.flexible_working_requests.appeal_decision_by IS
    'Employee (manager/HR) who decided the appeal';

-- Appeal decision date
ALTER TABLE app.flexible_working_requests
    ADD COLUMN IF NOT EXISTS appeal_decision_date date;

COMMENT ON COLUMN app.flexible_working_requests.appeal_decision_date IS
    'Date the appeal decision was made';

-- Consultation required before refusal flag
ALTER TABLE app.flexible_working_requests
    ADD COLUMN IF NOT EXISTS consultation_completed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN app.flexible_working_requests.consultation_completed IS
    'Whether the mandatory consultation meeting has been completed (required before refusal under the Act)';

-- -----------------------------------------------------------------------------
-- 4. Consultation tracking table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.flexible_working_consultations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Link to the flexible working request
    request_id uuid NOT NULL REFERENCES app.flexible_working_requests(id) ON DELETE CASCADE,

    -- Consultation details
    consultation_date date NOT NULL,
    consultation_type varchar(50) NOT NULL DEFAULT 'meeting',
    attendees text NOT NULL,
    notes text NOT NULL,
    outcomes text,
    next_steps text,

    -- Who recorded this
    recorded_by uuid NOT NULL REFERENCES app.employees(id) ON DELETE SET NULL,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Valid consultation types
    CONSTRAINT fwc_consultation_type_check CHECK (
        consultation_type IN ('meeting', 'phone_call', 'video_call', 'written')
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fwc_tenant_request
    ON app.flexible_working_consultations(tenant_id, request_id);

CREATE INDEX IF NOT EXISTS idx_fwc_request_date
    ON app.flexible_working_consultations(request_id, consultation_date);

-- RLS
ALTER TABLE app.flexible_working_consultations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.flexible_working_consultations
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.flexible_working_consultations
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Trigger
CREATE TRIGGER update_flexible_working_consultations_updated_at
    BEFORE UPDATE ON app.flexible_working_consultations
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON app.flexible_working_consultations TO hris_app;

-- Comments
COMMENT ON TABLE app.flexible_working_consultations IS
    'Records of mandatory consultation meetings for flexible working requests. '
    || 'Under the Employment Relations (Flexible Working) Act 2023, employers must '
    || 'consult with the employee before refusing a request.';

-- -----------------------------------------------------------------------------
-- 5. Request history table (immutable audit trail)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.flexible_working_request_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Link to the flexible working request
    request_id uuid NOT NULL REFERENCES app.flexible_working_requests(id) ON DELETE CASCADE,

    -- Transition details
    from_status app.flexible_working_status,
    to_status app.flexible_working_status NOT NULL,
    changed_by uuid REFERENCES app.employees(id) ON DELETE SET NULL,
    reason text,
    metadata jsonb,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fwrh_tenant_request
    ON app.flexible_working_request_history(tenant_id, request_id);

CREATE INDEX IF NOT EXISTS idx_fwrh_request_created
    ON app.flexible_working_request_history(request_id, created_at);

-- RLS
ALTER TABLE app.flexible_working_request_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.flexible_working_request_history
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.flexible_working_request_history
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Grants
GRANT SELECT, INSERT ON app.flexible_working_request_history TO hris_app;

-- Comments
COMMENT ON TABLE app.flexible_working_request_history IS
    'Immutable audit trail for flexible working request status transitions. '
    || 'Every state change is recorded with who made it and why.';

-- -----------------------------------------------------------------------------
-- 6. Update constraints on flexible_working_requests
-- -----------------------------------------------------------------------------

-- Drop old constraints that are too restrictive for the extended state machine
ALTER TABLE app.flexible_working_requests DROP CONSTRAINT IF EXISTS fwr_rejection_grounds_required;
ALTER TABLE app.flexible_working_requests DROP CONSTRAINT IF EXISTS fwr_decision_fields_required;

-- Re-add with extended status values
ALTER TABLE app.flexible_working_requests ADD CONSTRAINT fwr_rejection_grounds_required CHECK (
    (status NOT IN ('rejected', 'appeal_rejected'))
    OR (rejection_grounds IS NOT NULL AND rejection_explanation IS NOT NULL)
);

ALTER TABLE app.flexible_working_requests ADD CONSTRAINT fwr_decision_fields_required CHECK (
    (status NOT IN ('approved', 'rejected', 'appeal_approved', 'appeal_rejected'))
    OR (decision_date IS NOT NULL AND decision_by IS NOT NULL)
);

-- Effective date required when approved
ALTER TABLE app.flexible_working_requests ADD CONSTRAINT fwr_effective_date_when_approved CHECK (
    (status NOT IN ('approved', 'appeal_approved'))
    OR (effective_date IS NOT NULL)
);

-- Appeal outcome validation
ALTER TABLE app.flexible_working_requests DROP CONSTRAINT IF EXISTS fwr_appeal_outcome_values;
ALTER TABLE app.flexible_working_requests ADD CONSTRAINT fwr_appeal_outcome_values CHECK (
    appeal_outcome IS NULL OR appeal_outcome IN ('upheld', 'overturned', 'pending')
);

-- Trial period end must be after effective date
ALTER TABLE app.flexible_working_requests ADD CONSTRAINT fwr_trial_after_effective CHECK (
    trial_period_end_date IS NULL OR effective_date IS NULL
    OR trial_period_end_date > effective_date
);

-- Index for appeal tracking
CREATE INDEX IF NOT EXISTS idx_fwr_tenant_appeal
    ON app.flexible_working_requests(tenant_id, status)
    WHERE status IN ('appeal', 'appeal_approved', 'appeal_rejected');

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- Note: Enum values cannot be removed in PostgreSQL without recreating the type.
-- Rolling back requires:
-- DROP INDEX IF EXISTS app.idx_fwr_tenant_appeal;
-- ALTER TABLE app.flexible_working_requests DROP CONSTRAINT IF EXISTS fwr_trial_after_effective;
-- ALTER TABLE app.flexible_working_requests DROP CONSTRAINT IF EXISTS fwr_effective_date_when_approved;
-- ALTER TABLE app.flexible_working_requests DROP CONSTRAINT IF EXISTS fwr_decision_fields_required;
-- ALTER TABLE app.flexible_working_requests DROP CONSTRAINT IF EXISTS fwr_rejection_grounds_required;
-- -- Re-add original constraints from 0138
-- ALTER TABLE app.flexible_working_requests DROP COLUMN IF EXISTS appeal_decision_date;
-- ALTER TABLE app.flexible_working_requests DROP COLUMN IF EXISTS appeal_decision_by;
-- ALTER TABLE app.flexible_working_requests DROP COLUMN IF EXISTS appeal_grounds;
-- ALTER TABLE app.flexible_working_requests DROP COLUMN IF EXISTS withdrawal_reason;
-- ALTER TABLE app.flexible_working_requests DROP COLUMN IF EXISTS trial_period_end_date;
-- ALTER TABLE app.flexible_working_requests DROP COLUMN IF EXISTS contract_amendment_id;
-- ALTER TABLE app.flexible_working_requests DROP COLUMN IF EXISTS effective_date;
-- ALTER TABLE app.flexible_working_requests DROP COLUMN IF EXISTS approved_modifications;
-- ALTER TABLE app.flexible_working_requests DROP COLUMN IF EXISTS change_type;
-- ALTER TABLE app.flexible_working_requests DROP COLUMN IF EXISTS consultation_completed;
-- REVOKE SELECT, INSERT ON app.flexible_working_request_history FROM hris_app;
-- DROP TABLE IF EXISTS app.flexible_working_request_history;
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON app.flexible_working_consultations FROM hris_app;
-- DROP TRIGGER IF EXISTS update_flexible_working_consultations_updated_at ON app.flexible_working_consultations;
-- DROP TABLE IF EXISTS app.flexible_working_consultations;
