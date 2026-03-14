-- Migration: 0164_cpd_records
-- Created: 2026-03-14
-- Description: Continuing Professional Development (CPD) record tracking

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enum for CPD activity types
DO $$ BEGIN
    CREATE TYPE app.cpd_activity_type AS ENUM (
        'course', 'conference', 'workshop', 'self_study',
        'mentoring', 'publication', 'presentation', 'professional_body'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- CPD Records Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.cpd_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
    activity_type app.cpd_activity_type NOT NULL,
    title varchar(500) NOT NULL,
    provider varchar(300),
    hours numeric(7, 2) NOT NULL CHECK (hours > 0),
    points numeric(7, 2) NOT NULL DEFAULT 0 CHECK (points >= 0),
    start_date date NOT NULL,
    end_date date,
    certificate_key varchar(500),
    reflection text,
    verified boolean NOT NULL DEFAULT false,
    verified_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT cpd_records_end_after_start CHECK (
        end_date IS NULL OR end_date >= start_date
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_cpd_records_tenant
    ON app.cpd_records(tenant_id);

CREATE INDEX IF NOT EXISTS idx_cpd_records_tenant_employee
    ON app.cpd_records(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_cpd_records_tenant_type
    ON app.cpd_records(tenant_id, activity_type);

CREATE INDEX IF NOT EXISTS idx_cpd_records_employee_dates
    ON app.cpd_records(employee_id, start_date DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.cpd_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.cpd_records
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.cpd_records
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_cpd_records_updated_at
    BEFORE UPDATE ON app.cpd_records
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Grant permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.cpd_records TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.cpd_records IS 'Continuing Professional Development activity records';
COMMENT ON COLUMN app.cpd_records.hours IS 'Time spent on the CPD activity in hours';
COMMENT ON COLUMN app.cpd_records.points IS 'CPD points awarded for the activity';
COMMENT ON COLUMN app.cpd_records.certificate_key IS 'Storage key for certificate upload';
COMMENT ON COLUMN app.cpd_records.reflection IS 'Employee reflection on learning outcomes';
COMMENT ON COLUMN app.cpd_records.verified IS 'Whether the CPD record has been verified by a manager/L&D';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TABLE IF EXISTS app.cpd_records;
-- DROP TYPE IF EXISTS app.cpd_activity_type;
