-- Migration: 0131_health_safety
-- Created: 2026-03-13
-- Description: Health & Safety module tables for UK compliance.
--              Implements:
--              - Accident book (hs_incidents) per Health and Safety at Work Act 1974
--              - RIDDOR reporting (Reporting of Injuries, Diseases and Dangerous Occurrences 2013)
--              - Risk assessments (Management of Health and Safety at Work Regulations 1999)
--              - DSE assessments (Health and Safety (Display Screen Equipment) Regulations 1992)
--
--              All tables are tenant-scoped with RLS policies.
--              Written H&S policy is required for employers with 5+ employees.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- Incident severity levels
DO $$ BEGIN
  CREATE TYPE app.hs_incident_severity AS ENUM (
    'minor',
    'moderate',
    'major',
    'fatal'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Incident status workflow: reported -> investigating -> resolved -> closed
DO $$ BEGIN
  CREATE TYPE app.hs_incident_status AS ENUM (
    'reported',
    'investigating',
    'resolved',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Risk assessment status workflow: draft -> active -> review_due -> archived
DO $$ BEGIN
  CREATE TYPE app.hs_risk_assessment_status AS ENUM (
    'draft',
    'active',
    'review_due',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Risk level for overall assessment
DO $$ BEGIN
  CREATE TYPE app.hs_risk_level AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DSE assessment status
DO $$ BEGIN
  CREATE TYPE app.hs_dse_status AS ENUM (
    'completed',
    'actions_pending',
    'review_due'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- hs_incidents - Accident Book / Incident Records
-- -----------------------------------------------------------------------------
-- The UK accident book requirement (Social Security (Claims and Payments)
-- Regulations 1979, as amended). Records all workplace incidents, injuries,
-- near-misses, and dangerous occurrences. RIDDOR-reportable incidents are
-- flagged and tracked separately.

CREATE TABLE IF NOT EXISTS app.hs_incidents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Who reported and who was injured (may be the same person)
    reported_by_employee_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,
    injured_employee_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,

    -- When and where
    incident_date timestamptz NOT NULL,
    reported_date timestamptz NOT NULL DEFAULT now(),
    location varchar(255),

    -- What happened
    description text NOT NULL,
    severity app.hs_incident_severity NOT NULL DEFAULT 'minor',
    injury_type varchar(100),
    body_part_affected varchar(100),
    treatment_given text,
    witness_names text[],

    -- Investigation workflow
    status app.hs_incident_status NOT NULL DEFAULT 'reported',
    investigation_findings text,
    corrective_actions text,

    -- RIDDOR fields (Reporting of Injuries, Diseases and Dangerous Occurrences Regulations 2013)
    -- Must report: deaths, specified injuries, over-7-day incapacity, occupational diseases, dangerous occurrences
    -- Deaths and specified injuries: immediately (phone) then within 10 days (online)
    -- Over-7-day incapacity: within 15 days
    riddor_reportable boolean NOT NULL DEFAULT false,
    riddor_reference varchar(50),
    riddor_reported_date date,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Reported date cannot be before incident date
    CONSTRAINT hs_incidents_dates_valid CHECK (
        reported_date >= incident_date
    ),
    -- RIDDOR reference requires reportable flag
    CONSTRAINT hs_incidents_riddor_ref CHECK (
        riddor_reference IS NULL OR riddor_reportable = true
    ),
    -- RIDDOR reported date requires reportable flag
    CONSTRAINT hs_incidents_riddor_date CHECK (
        riddor_reported_date IS NULL OR riddor_reportable = true
    )
);

-- =============================================================================
-- hs_incidents Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_hs_incidents_tenant
    ON app.hs_incidents(tenant_id);

CREATE INDEX IF NOT EXISTS idx_hs_incidents_tenant_status
    ON app.hs_incidents(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_hs_incidents_reported_by
    ON app.hs_incidents(tenant_id, reported_by_employee_id)
    WHERE reported_by_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hs_incidents_injured
    ON app.hs_incidents(tenant_id, injured_employee_id)
    WHERE injured_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hs_incidents_incident_date
    ON app.hs_incidents(tenant_id, incident_date DESC);

CREATE INDEX IF NOT EXISTS idx_hs_incidents_riddor
    ON app.hs_incidents(tenant_id, riddor_reportable)
    WHERE riddor_reportable = true;

CREATE INDEX IF NOT EXISTS idx_hs_incidents_severity
    ON app.hs_incidents(tenant_id, severity);

-- =============================================================================
-- hs_incidents RLS
-- =============================================================================

ALTER TABLE app.hs_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.hs_incidents
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.hs_incidents
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- hs_incidents Triggers
-- =============================================================================

CREATE TRIGGER update_hs_incidents_updated_at
    BEFORE UPDATE ON app.hs_incidents
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- hs_risk_assessments - Risk Assessment Records
-- -----------------------------------------------------------------------------
-- Required by Management of Health and Safety at Work Regulations 1999.
-- Must be documented for employers with 5+ employees.
-- Must be reviewed regularly and after any significant change.

CREATE TABLE IF NOT EXISTS app.hs_risk_assessments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Assessment details
    title varchar(255) NOT NULL,
    description text,
    area_or_activity varchar(255),

    -- Who assessed and when
    assessor_employee_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,
    assessment_date date NOT NULL,
    review_date date NOT NULL,

    -- Status
    status app.hs_risk_assessment_status NOT NULL DEFAULT 'draft',

    -- Hazard matrix stored as JSONB array
    -- Each element: { hazard, who_at_risk, existing_controls, risk_level, additional_controls }
    hazards jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Overall risk level (derived from hazards, stored for querying)
    overall_risk_level app.hs_risk_level NOT NULL DEFAULT 'low',

    -- Approval
    approved_by uuid REFERENCES app.employees(id) ON DELETE SET NULL,
    approved_at timestamptz,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Review date must be after assessment date
    CONSTRAINT hs_risk_assessments_dates_valid CHECK (
        review_date >= assessment_date
    ),
    -- Approval requires approved_by and approved_at together
    CONSTRAINT hs_risk_assessments_approval CHECK (
        (approved_by IS NULL AND approved_at IS NULL)
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
);

-- =============================================================================
-- hs_risk_assessments Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_hs_risk_assessments_tenant
    ON app.hs_risk_assessments(tenant_id);

CREATE INDEX IF NOT EXISTS idx_hs_risk_assessments_tenant_status
    ON app.hs_risk_assessments(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_hs_risk_assessments_assessor
    ON app.hs_risk_assessments(tenant_id, assessor_employee_id)
    WHERE assessor_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hs_risk_assessments_review_date
    ON app.hs_risk_assessments(tenant_id, review_date)
    WHERE status IN ('active', 'review_due');

CREATE INDEX IF NOT EXISTS idx_hs_risk_assessments_risk_level
    ON app.hs_risk_assessments(tenant_id, overall_risk_level);

-- =============================================================================
-- hs_risk_assessments RLS
-- =============================================================================

ALTER TABLE app.hs_risk_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.hs_risk_assessments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.hs_risk_assessments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- hs_risk_assessments Triggers
-- =============================================================================

CREATE TRIGGER update_hs_risk_assessments_updated_at
    BEFORE UPDATE ON app.hs_risk_assessments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- hs_dse_assessments - Display Screen Equipment Assessments
-- -----------------------------------------------------------------------------
-- Required by Health and Safety (Display Screen Equipment) Regulations 1992.
-- Employers must assess workstations of employees who habitually use VDUs.
-- Must offer eye tests and provide spectacles if needed for VDU work.

CREATE TABLE IF NOT EXISTS app.hs_dse_assessments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The employee being assessed
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Assessment dates
    assessment_date date NOT NULL,
    next_review_date date,

    -- Who performed the assessment
    assessor_employee_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,

    -- DSE checklist items
    workstation_adequate boolean,
    chair_adjustable boolean,
    screen_position_ok boolean,
    lighting_adequate boolean,
    breaks_taken boolean,
    eye_test_offered boolean,

    -- Findings and actions
    issues_found text,
    actions_required text,

    -- Status
    status app.hs_dse_status NOT NULL DEFAULT 'completed',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Next review must be after assessment
    CONSTRAINT hs_dse_assessments_dates_valid CHECK (
        next_review_date IS NULL OR next_review_date >= assessment_date
    )
);

-- =============================================================================
-- hs_dse_assessments Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_hs_dse_assessments_tenant
    ON app.hs_dse_assessments(tenant_id);

CREATE INDEX IF NOT EXISTS idx_hs_dse_assessments_employee
    ON app.hs_dse_assessments(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_hs_dse_assessments_status
    ON app.hs_dse_assessments(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_hs_dse_assessments_review_date
    ON app.hs_dse_assessments(tenant_id, next_review_date)
    WHERE status IN ('completed', 'review_due');

CREATE INDEX IF NOT EXISTS idx_hs_dse_assessments_assessor
    ON app.hs_dse_assessments(tenant_id, assessor_employee_id)
    WHERE assessor_employee_id IS NOT NULL;

-- =============================================================================
-- hs_dse_assessments RLS
-- =============================================================================

ALTER TABLE app.hs_dse_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.hs_dse_assessments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.hs_dse_assessments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- hs_dse_assessments Triggers
-- =============================================================================

CREATE TRIGGER update_hs_dse_assessments_updated_at
    BEFORE UPDATE ON app.hs_dse_assessments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Table Comments
-- =============================================================================

COMMENT ON TABLE app.hs_incidents IS 'Accident book / incident records. UK Health and Safety at Work Act 1974. Records all workplace incidents with RIDDOR tracking.';
COMMENT ON TABLE app.hs_risk_assessments IS 'Risk assessment records. Management of Health and Safety at Work Regulations 1999. Must be documented for 5+ employees.';
COMMENT ON TABLE app.hs_dse_assessments IS 'Display Screen Equipment assessments. Health and Safety (DSE) Regulations 1992. Required for habitual VDU users.';

-- =============================================================================
-- GRANT access to the application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.hs_incidents TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.hs_risk_assessments TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.hs_dse_assessments TO hris_app;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_hs_dse_assessments_updated_at ON app.hs_dse_assessments;
-- DROP TRIGGER IF EXISTS update_hs_risk_assessments_updated_at ON app.hs_risk_assessments;
-- DROP TRIGGER IF EXISTS update_hs_incidents_updated_at ON app.hs_incidents;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.hs_dse_assessments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.hs_dse_assessments;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.hs_risk_assessments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.hs_risk_assessments;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.hs_incidents;
-- DROP POLICY IF EXISTS tenant_isolation ON app.hs_incidents;
-- DROP INDEX IF EXISTS app.idx_hs_dse_assessments_assessor;
-- DROP INDEX IF EXISTS app.idx_hs_dse_assessments_review_date;
-- DROP INDEX IF EXISTS app.idx_hs_dse_assessments_status;
-- DROP INDEX IF EXISTS app.idx_hs_dse_assessments_employee;
-- DROP INDEX IF EXISTS app.idx_hs_dse_assessments_tenant;
-- DROP INDEX IF EXISTS app.idx_hs_risk_assessments_risk_level;
-- DROP INDEX IF EXISTS app.idx_hs_risk_assessments_review_date;
-- DROP INDEX IF EXISTS app.idx_hs_risk_assessments_assessor;
-- DROP INDEX IF EXISTS app.idx_hs_risk_assessments_tenant_status;
-- DROP INDEX IF EXISTS app.idx_hs_risk_assessments_tenant;
-- DROP INDEX IF EXISTS app.idx_hs_incidents_severity;
-- DROP INDEX IF EXISTS app.idx_hs_incidents_riddor;
-- DROP INDEX IF EXISTS app.idx_hs_incidents_incident_date;
-- DROP INDEX IF EXISTS app.idx_hs_incidents_injured;
-- DROP INDEX IF EXISTS app.idx_hs_incidents_reported_by;
-- DROP INDEX IF EXISTS app.idx_hs_incidents_tenant_status;
-- DROP INDEX IF EXISTS app.idx_hs_incidents_tenant;
-- DROP TABLE IF EXISTS app.hs_dse_assessments;
-- DROP TABLE IF EXISTS app.hs_risk_assessments;
-- DROP TABLE IF EXISTS app.hs_incidents;
-- DROP TYPE IF EXISTS app.hs_dse_status;
-- DROP TYPE IF EXISTS app.hs_risk_level;
-- DROP TYPE IF EXISTS app.hs_risk_assessment_status;
-- DROP TYPE IF EXISTS app.hs_incident_status;
-- DROP TYPE IF EXISTS app.hs_incident_severity;
