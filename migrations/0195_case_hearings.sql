-- Migration: 0195_case_hearings
-- Created: 2026-03-17
-- Description: Hearing scheduling and management for disciplinary/grievance cases (TODO-215).
--              ACAS Code of Practice requires reasonable notice (typically 5 working days)
--              before any disciplinary or grievance hearing.
--
-- Features:
--   - Dedicated case_hearings table for scheduling hearings per case
--   - Support for disciplinary, grievance, and appeal hearing types
--   - Minimum notice period enforcement (default 5 working days per ACAS Code para 12)
--   - Right to be accompanied (s.10 TULRCA 1992, ACAS Code para 14)
--   - Chair person, HR representative, and companion tracking
--   - Full audit trail with outcome recording
--   - Tenant-isolated via RLS

-- =============================================================================
-- ENUM: Hearing Type
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hearing_type') THEN
        CREATE TYPE app.hearing_type AS ENUM (
            'disciplinary',    -- Disciplinary hearing
            'grievance',       -- Grievance hearing
            'appeal'           -- Appeal hearing (ACAS Code para 26-27)
        );
    END IF;
END $$;

COMMENT ON TYPE app.hearing_type IS 'Type of formal hearing: disciplinary, grievance, or appeal';

-- =============================================================================
-- ENUM: Hearing Status
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hearing_status') THEN
        CREATE TYPE app.hearing_status AS ENUM (
            'scheduled',       -- Hearing has been scheduled, notice period applies
            'postponed',       -- Hearing has been postponed (e.g. companion unavailable)
            'in_progress',     -- Hearing is currently underway
            'completed',       -- Hearing has been held, outcome pending or recorded
            'cancelled'        -- Hearing was cancelled
        );
    END IF;
END $$;

COMMENT ON TYPE app.hearing_status IS 'Status of a scheduled hearing';

-- =============================================================================
-- TABLE: case_hearings
-- =============================================================================
CREATE TABLE IF NOT EXISTS app.case_hearings (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Link to parent HR case
    case_id uuid NOT NULL REFERENCES app.cases(id) ON DELETE CASCADE,

    -- Hearing classification
    hearing_type app.hearing_type NOT NULL,
    status app.hearing_status NOT NULL DEFAULT 'scheduled',

    -- Scheduling
    scheduled_date timestamptz NOT NULL,
    location text NOT NULL,

    -- Participants
    -- Chair person conducting the hearing
    chair_person_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
    -- HR representative present at hearing
    hr_representative_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
    -- Employee subject of the hearing
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
    -- Companion (right to be accompanied per s.10 TULRCA 1992)
    companion_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,
    companion_type app.companion_type,

    -- Notice period enforcement
    -- ACAS Code para 12: employee must receive reasonable notice of hearing
    notice_sent_at timestamptz,
    minimum_notice_days integer NOT NULL DEFAULT 5,

    -- Outcome
    outcome text,
    notes text,

    -- Metadata
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- =======================================================================
    -- Constraints
    -- =======================================================================

    -- Ensure scheduled_date is in the future (at creation time, enforced by service layer
    -- since DB constraint would block historical imports)

    -- Ensure minimum_notice_days is reasonable
    CONSTRAINT case_hearings_min_notice_positive CHECK (minimum_notice_days >= 0 AND minimum_notice_days <= 30),

    -- Ensure companion_type is set when companion_id is provided
    CONSTRAINT case_hearings_companion_type_required CHECK (
        (companion_id IS NULL) OR (companion_type IS NOT NULL)
    )
);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.case_hearings ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (SELECT, UPDATE, DELETE)
CREATE POLICY case_hearings_tenant_isolation ON app.case_hearings
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Insert policy
CREATE POLICY case_hearings_tenant_isolation_insert ON app.case_hearings
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: hearings for a case
CREATE INDEX IF NOT EXISTS idx_case_hearings_case_id
    ON app.case_hearings(case_id);

-- Tenant scoped queries
CREATE INDEX IF NOT EXISTS idx_case_hearings_tenant_id
    ON app.case_hearings(tenant_id);

-- Find hearings by employee
CREATE INDEX IF NOT EXISTS idx_case_hearings_employee_id
    ON app.case_hearings(employee_id);

-- Find upcoming hearings by chair person
CREATE INDEX IF NOT EXISTS idx_case_hearings_chair_person
    ON app.case_hearings(chair_person_id)
    WHERE chair_person_id IS NOT NULL;

-- Scheduling queries: upcoming hearings
CREATE INDEX IF NOT EXISTS idx_case_hearings_scheduled_date
    ON app.case_hearings(scheduled_date)
    WHERE status IN ('scheduled', 'postponed');

-- Composite: tenant + case for RLS-optimized queries
CREATE INDEX IF NOT EXISTS idx_case_hearings_tenant_case
    ON app.case_hearings(tenant_id, case_id);

-- =============================================================================
-- Auto-update updated_at trigger
-- =============================================================================

CREATE OR REPLACE TRIGGER update_case_hearings_updated_at
    BEFORE UPDATE ON app.case_hearings
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Grant permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.case_hearings TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.case_hearings IS 'Hearing scheduling and management for disciplinary/grievance/appeal cases per ACAS Code of Practice';
COMMENT ON COLUMN app.case_hearings.hearing_type IS 'Type of hearing: disciplinary, grievance, or appeal';
COMMENT ON COLUMN app.case_hearings.status IS 'Current status of the hearing';
COMMENT ON COLUMN app.case_hearings.scheduled_date IS 'Scheduled date and time for the hearing';
COMMENT ON COLUMN app.case_hearings.location IS 'Physical or virtual location where the hearing will take place';
COMMENT ON COLUMN app.case_hearings.chair_person_id IS 'User conducting/chairing the hearing';
COMMENT ON COLUMN app.case_hearings.hr_representative_id IS 'HR representative attending the hearing';
COMMENT ON COLUMN app.case_hearings.employee_id IS 'Employee who is the subject of the hearing';
COMMENT ON COLUMN app.case_hearings.companion_id IS 'Companion accompanying the employee (trade union rep or colleague per s.10 TULRCA 1992)';
COMMENT ON COLUMN app.case_hearings.companion_type IS 'Type of companion: trade_union_rep or colleague';
COMMENT ON COLUMN app.case_hearings.notice_sent_at IS 'When notice of the hearing was sent to the employee';
COMMENT ON COLUMN app.case_hearings.minimum_notice_days IS 'Minimum working days notice required (default 5 per ACAS Code para 12)';
COMMENT ON COLUMN app.case_hearings.outcome IS 'Outcome recorded after the hearing is completed';
COMMENT ON COLUMN app.case_hearings.notes IS 'Notes and minutes from the hearing';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_case_hearings_updated_at ON app.case_hearings;
-- DROP POLICY IF EXISTS case_hearings_tenant_isolation ON app.case_hearings;
-- DROP POLICY IF EXISTS case_hearings_tenant_isolation_insert ON app.case_hearings;
-- DROP INDEX IF EXISTS app.idx_case_hearings_case_id;
-- DROP INDEX IF EXISTS app.idx_case_hearings_tenant_id;
-- DROP INDEX IF EXISTS app.idx_case_hearings_employee_id;
-- DROP INDEX IF EXISTS app.idx_case_hearings_chair_person;
-- DROP INDEX IF EXISTS app.idx_case_hearings_scheduled_date;
-- DROP INDEX IF EXISTS app.idx_case_hearings_tenant_case;
-- DROP TABLE IF EXISTS app.case_hearings;
-- DROP TYPE IF EXISTS app.hearing_status;
-- DROP TYPE IF EXISTS app.hearing_type;
