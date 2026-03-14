-- Migration: 0130_working_time_regulations
-- Created: 2026-03-13
-- Description: Create tables for UK Working Time Regulations 1998 monitoring
--              Tracks 48-hour opt-out agreements and compliance alerts
--              for weekly hours, daily/weekly rest, break violations, and night work

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- WTR Opt-Out Status Enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wtr_opt_out_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
        CREATE TYPE app.wtr_opt_out_status AS ENUM ('active', 'revoked');
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- WTR Alert Type Enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wtr_alert_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
        CREATE TYPE app.wtr_alert_type AS ENUM (
            'weekly_hours_exceeded',
            'weekly_hours_warning',
            'daily_rest_violation',
            'weekly_rest_violation',
            'break_violation',
            'night_worker_exceeded'
        );
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- WTR Opt-Out Agreements Table
-- -----------------------------------------------------------------------------
-- Tracks employees who have opted out of the 48-hour weekly limit
-- Under UK law, workers can voluntarily opt out in writing
-- They can opt back in with notice (up to 3 months)
CREATE TABLE IF NOT EXISTS app.wtr_opt_outs (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this record
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee who has opted out
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Whether the employee has opted out of the 48-hour limit
    opted_out boolean NOT NULL DEFAULT false,

    -- Date the employee signed the opt-out agreement
    opt_out_date date NOT NULL,

    -- Date the employee revoked the opt-out (opted back in)
    opt_in_date date,

    -- Notice period in weeks when opting back in (0 to ~13 weeks / 3 months)
    notice_period_weeks integer NOT NULL DEFAULT 0,

    -- Reference to the signed document (e.g., S3 key or document ID)
    signed_document_key varchar(500),

    -- Current status of the opt-out agreement
    status app.wtr_opt_out_status NOT NULL DEFAULT 'active',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Notice period must be between 0 and 13 weeks (~3 months max)
    CONSTRAINT wtr_opt_outs_notice_period_range CHECK (
        notice_period_weeks >= 0 AND notice_period_weeks <= 13
    ),

    -- If revoked, opt_in_date must be set
    CONSTRAINT wtr_opt_outs_revocation_date CHECK (
        status != 'revoked' OR opt_in_date IS NOT NULL
    ),

    -- Opt-in date must be after opt-out date
    CONSTRAINT wtr_opt_outs_date_order CHECK (
        opt_in_date IS NULL OR opt_in_date >= opt_out_date
    )
);

-- =============================================================================
-- WTR Opt-Out Indexes
-- =============================================================================

-- Primary lookup: tenant + employee
CREATE INDEX IF NOT EXISTS idx_wtr_opt_outs_tenant_employee
    ON app.wtr_opt_outs(tenant_id, employee_id);

-- Find active opt-outs for compliance checks
CREATE INDEX IF NOT EXISTS idx_wtr_opt_outs_active
    ON app.wtr_opt_outs(tenant_id, status)
    WHERE status = 'active';

-- Employee opt-out history (most recent first)
CREATE INDEX IF NOT EXISTS idx_wtr_opt_outs_employee_history
    ON app.wtr_opt_outs(employee_id, opt_out_date DESC);

-- =============================================================================
-- WTR Opt-Out Row Level Security
-- =============================================================================

ALTER TABLE app.wtr_opt_outs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.wtr_opt_outs
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.wtr_opt_outs
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- WTR Opt-Out Triggers
-- =============================================================================

CREATE TRIGGER update_wtr_opt_outs_updated_at
    BEFORE UPDATE ON app.wtr_opt_outs
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- WTR Compliance Alerts Table
-- -----------------------------------------------------------------------------
-- Generated alerts when employees approach or exceed working time limits
-- Alerts must be acknowledged by an authorised person
CREATE TABLE IF NOT EXISTS app.wtr_alerts (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this alert
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee the alert relates to
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Type of working time regulation alert
    alert_type app.wtr_alert_type NOT NULL,

    -- Reference period for the calculation
    reference_period_start date NOT NULL,
    reference_period_end date NOT NULL,

    -- Actual measured value (e.g., 52.5 hours average)
    actual_value numeric(8, 2) NOT NULL,

    -- Regulatory threshold (e.g., 48 hours)
    threshold_value numeric(8, 2) NOT NULL,

    -- Additional details about the alert (breakdown, specific dates, etc.)
    details jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Whether the alert has been acknowledged
    acknowledged boolean NOT NULL DEFAULT false,

    -- Who acknowledged the alert
    acknowledged_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- When the alert was acknowledged
    acknowledged_at timestamptz,

    -- Standard timestamp (alerts are immutable once created, only acknowledgement changes)
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Reference period end must be after start
    CONSTRAINT wtr_alerts_period_range CHECK (
        reference_period_end >= reference_period_start
    ),

    -- Acknowledgement consistency
    CONSTRAINT wtr_alerts_acknowledgement_consistency CHECK (
        (NOT acknowledged) OR (acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL)
    ),

    -- Actual value must be non-negative
    CONSTRAINT wtr_alerts_actual_positive CHECK (actual_value >= 0),

    -- Threshold value must be positive
    CONSTRAINT wtr_alerts_threshold_positive CHECK (threshold_value > 0)
);

-- =============================================================================
-- WTR Alert Indexes
-- =============================================================================

-- Primary lookup: tenant + employee
CREATE INDEX IF NOT EXISTS idx_wtr_alerts_tenant_employee
    ON app.wtr_alerts(tenant_id, employee_id);

-- Unacknowledged alerts (compliance dashboard)
CREATE INDEX IF NOT EXISTS idx_wtr_alerts_unacknowledged
    ON app.wtr_alerts(tenant_id, created_at DESC)
    WHERE acknowledged = false;

-- Alert type filtering
CREATE INDEX IF NOT EXISTS idx_wtr_alerts_type
    ON app.wtr_alerts(tenant_id, alert_type);

-- Employee alert history (most recent first)
CREATE INDEX IF NOT EXISTS idx_wtr_alerts_employee_history
    ON app.wtr_alerts(employee_id, created_at DESC);

-- Reference period queries
CREATE INDEX IF NOT EXISTS idx_wtr_alerts_period
    ON app.wtr_alerts(tenant_id, reference_period_start, reference_period_end);

-- =============================================================================
-- WTR Alert Row Level Security
-- =============================================================================

ALTER TABLE app.wtr_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.wtr_alerts
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.wtr_alerts
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.wtr_opt_outs IS 'UK Working Time Regulations 48-hour opt-out agreements. Workers can voluntarily opt out of the 48-hour weekly limit.';
COMMENT ON COLUMN app.wtr_opt_outs.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.wtr_opt_outs.tenant_id IS 'Tenant that owns this record';
COMMENT ON COLUMN app.wtr_opt_outs.employee_id IS 'Employee who has opted out';
COMMENT ON COLUMN app.wtr_opt_outs.opted_out IS 'Whether the employee has opted out';
COMMENT ON COLUMN app.wtr_opt_outs.opt_out_date IS 'Date the opt-out was signed';
COMMENT ON COLUMN app.wtr_opt_outs.opt_in_date IS 'Date the opt-out was revoked';
COMMENT ON COLUMN app.wtr_opt_outs.notice_period_weeks IS 'Notice period in weeks for opt-in (max 13 weeks / 3 months)';
COMMENT ON COLUMN app.wtr_opt_outs.signed_document_key IS 'Reference to signed opt-out document';
COMMENT ON COLUMN app.wtr_opt_outs.status IS 'Current status: active or revoked';

COMMENT ON TABLE app.wtr_alerts IS 'UK Working Time Regulations compliance alerts. Generated when employees approach or exceed regulatory limits.';
COMMENT ON COLUMN app.wtr_alerts.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.wtr_alerts.tenant_id IS 'Tenant that owns this alert';
COMMENT ON COLUMN app.wtr_alerts.employee_id IS 'Employee the alert relates to';
COMMENT ON COLUMN app.wtr_alerts.alert_type IS 'Type of WTR violation or warning';
COMMENT ON COLUMN app.wtr_alerts.reference_period_start IS 'Start of the reference period for calculation';
COMMENT ON COLUMN app.wtr_alerts.reference_period_end IS 'End of the reference period for calculation';
COMMENT ON COLUMN app.wtr_alerts.actual_value IS 'Actual measured value (e.g., average weekly hours)';
COMMENT ON COLUMN app.wtr_alerts.threshold_value IS 'Regulatory threshold value';
COMMENT ON COLUMN app.wtr_alerts.details IS 'Additional details (weekly breakdown, specific violation dates, etc.)';
COMMENT ON COLUMN app.wtr_alerts.acknowledged IS 'Whether the alert has been reviewed';
COMMENT ON COLUMN app.wtr_alerts.acknowledged_by IS 'User who acknowledged the alert';
COMMENT ON COLUMN app.wtr_alerts.acknowledged_at IS 'When the alert was acknowledged';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_wtr_opt_outs_updated_at ON app.wtr_opt_outs;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.wtr_alerts;
-- DROP POLICY IF EXISTS tenant_isolation ON app.wtr_alerts;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.wtr_opt_outs;
-- DROP POLICY IF EXISTS tenant_isolation ON app.wtr_opt_outs;
-- DROP INDEX IF EXISTS app.idx_wtr_alerts_period;
-- DROP INDEX IF EXISTS app.idx_wtr_alerts_employee_history;
-- DROP INDEX IF EXISTS app.idx_wtr_alerts_type;
-- DROP INDEX IF EXISTS app.idx_wtr_alerts_unacknowledged;
-- DROP INDEX IF EXISTS app.idx_wtr_alerts_tenant_employee;
-- DROP INDEX IF EXISTS app.idx_wtr_opt_outs_employee_history;
-- DROP INDEX IF EXISTS app.idx_wtr_opt_outs_active;
-- DROP INDEX IF EXISTS app.idx_wtr_opt_outs_tenant_employee;
-- DROP TABLE IF EXISTS app.wtr_alerts;
-- DROP TABLE IF EXISTS app.wtr_opt_outs;
-- DROP TYPE IF EXISTS app.wtr_alert_type;
-- DROP TYPE IF EXISTS app.wtr_opt_out_status;
