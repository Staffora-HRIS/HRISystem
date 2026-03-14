-- Migration: 0160_acas_disciplinary
-- Created: 2026-03-14
-- Description: ACAS Code of Practice compliant disciplinary and grievance case management.
--              Non-compliance with ACAS Code results in up to 25% tribunal award uplift
--              (s.207A Trade Union and Labour Relations (Consolidation) Act 1992).
--
-- Covers:
--   - Disciplinary flow: investigation -> notification -> hearing -> decision -> appeal -> closed
--   - Grievance flow:    informal -> formal_submission -> investigation -> hearing -> decision -> appeal -> closed
--   - Right to be accompanied (Trade Union and Labour Relations Act 1992, s.10)
--   - Minimum 5 working days notice before hearing
--   - Appeal heard by different, more senior manager
--   - Full audit trail of every stage transition

-- =============================================================================
-- ENUM: Disciplinary Case Type
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'disciplinary_case_type') THEN
        CREATE TYPE app.disciplinary_case_type AS ENUM (
            'disciplinary',
            'grievance'
        );
    END IF;
END $$;

COMMENT ON TYPE app.disciplinary_case_type IS 'Type of ACAS-regulated case: disciplinary or grievance';

-- =============================================================================
-- ENUM: Disciplinary Stage
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'disciplinary_stage') THEN
        CREATE TYPE app.disciplinary_stage AS ENUM (
            'informal_resolution',     -- Grievance only: attempt informal resolution first
            'formal_submission',       -- Grievance only: formal written grievance submitted
            'investigation',           -- Both: gather evidence, witness statements
            'notification',            -- Disciplinary: written notice of hearing with evidence pack
            'hearing',                 -- Both: formal hearing with right to be accompanied
            'decision',                -- Both: outcome recorded with reasons
            'appeal',                  -- Both: employee has exercised right to appeal
            'closed'                   -- Both: process complete (no further action or appeal exhausted)
        );
    END IF;
END $$;

COMMENT ON TYPE app.disciplinary_stage IS 'ACAS Code stages for disciplinary/grievance process';

-- =============================================================================
-- ENUM: Disciplinary Decision Outcome
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'disciplinary_decision') THEN
        CREATE TYPE app.disciplinary_decision AS ENUM (
            -- Disciplinary outcomes
            'no_action',
            'verbal_warning',
            'written_warning',
            'final_written_warning',
            'dismissal',
            -- Grievance outcomes
            'uphold_grievance',
            'partial_uphold',
            'reject_grievance'
        );
    END IF;
END $$;

COMMENT ON TYPE app.disciplinary_decision IS 'Possible outcomes for disciplinary/grievance decisions';

-- =============================================================================
-- ENUM: Companion Type (s.10 TULRCA 1992)
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'companion_type') THEN
        CREATE TYPE app.companion_type AS ENUM (
            'trade_union_rep',     -- Trade union official or workplace rep
            'colleague'            -- Fellow worker employed by same employer
        );
    END IF;
END $$;

COMMENT ON TYPE app.companion_type IS 'Right to be accompanied: companion type per s.10 TULRCA 1992';

-- =============================================================================
-- ENUM: Appeal Outcome
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appeal_outcome') THEN
        CREATE TYPE app.appeal_outcome AS ENUM (
            'upheld',              -- Original decision overturned
            'partially_upheld',    -- Decision modified
            'rejected'             -- Original decision confirmed
        );
    END IF;
END $$;

COMMENT ON TYPE app.appeal_outcome IS 'Appeal hearing outcomes';

-- =============================================================================
-- TABLE: disciplinary_cases
-- =============================================================================
CREATE TABLE IF NOT EXISTS app.disciplinary_cases (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Link to parent HR case (provides case number, requester, SLA, etc.)
    case_id uuid NOT NULL REFERENCES app.cases(id) ON DELETE CASCADE,

    -- Employee subject to the process
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,

    -- Type and current stage
    case_type app.disciplinary_case_type NOT NULL,
    stage app.disciplinary_stage NOT NULL DEFAULT 'investigation',

    -- =========================================================================
    -- Investigation stage
    -- =========================================================================
    allegation_summary text,
    investigation_findings text,
    investigator_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,
    investigation_started_at timestamptz,
    investigation_completed_at timestamptz,
    evidence_documents jsonb NOT NULL DEFAULT '[]',

    -- =========================================================================
    -- Notification stage (disciplinary only)
    -- =========================================================================
    -- ACAS Code para 9: written notification with sufficient detail
    notification_sent_at timestamptz,
    notification_sent_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    notification_content text,

    -- =========================================================================
    -- Hearing stage
    -- =========================================================================
    -- ACAS Code para 11: hearing should be held without unreasonable delay
    -- ACAS Code para 12: minimum 5 working days notice
    hearing_date timestamptz,
    hearing_location text,
    hearing_notice_sent_at timestamptz,

    -- Right to be accompanied (s.10 TULRCA 1992 / ACAS Code para 14)
    companion_name varchar(200),
    companion_type app.companion_type,
    companion_organisation varchar(200),

    hearing_notes text,
    hearing_attended boolean,
    hearing_conducted_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- =========================================================================
    -- Decision stage
    -- =========================================================================
    -- ACAS Code para 19: decision should be communicated in writing
    decision app.disciplinary_decision,
    decision_date timestamptz,
    decision_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    decision_reason text,
    decision_letter_sent_at timestamptz,

    -- Warning expiry (for written/final warnings)
    warning_expiry_date date,

    -- =========================================================================
    -- Appeal stage
    -- =========================================================================
    -- ACAS Code para 26: right to appeal
    right_to_appeal_expires timestamptz,
    appeal_submitted boolean NOT NULL DEFAULT false,
    appeal_date timestamptz,
    appeal_grounds text,

    -- ACAS Code para 27: appeal should be heard by more senior manager
    -- who was not involved in the original decision
    appeal_heard_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    appeal_hearing_date timestamptz,
    appeal_outcome app.appeal_outcome,
    appeal_outcome_reason text,
    appeal_date_decided timestamptz,

    -- =========================================================================
    -- Informal resolution (grievance only)
    -- =========================================================================
    informal_resolution_attempted boolean NOT NULL DEFAULT false,
    informal_resolution_notes text,
    informal_resolution_date timestamptz,

    -- =========================================================================
    -- Metadata
    -- =========================================================================
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- =========================================================================
    -- Constraints
    -- =========================================================================

    -- One disciplinary record per case
    CONSTRAINT disciplinary_cases_case_unique UNIQUE (case_id),

    -- Grievance must start at informal_resolution or formal_submission
    CONSTRAINT disciplinary_grievance_stage CHECK (
        case_type != 'grievance'
        OR stage NOT IN ('notification') -- Grievances skip notification
    ),

    -- Decision must have reason
    CONSTRAINT disciplinary_decision_has_reason CHECK (
        decision IS NULL OR decision_reason IS NOT NULL
    ),

    -- Appeal grounds required when appeal is submitted
    CONSTRAINT disciplinary_appeal_has_grounds CHECK (
        appeal_submitted = false OR appeal_grounds IS NOT NULL
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Tenant + case lookup
CREATE INDEX IF NOT EXISTS idx_disciplinary_cases_tenant
    ON app.disciplinary_cases(tenant_id);

-- Employee's disciplinary/grievance history
CREATE INDEX IF NOT EXISTS idx_disciplinary_cases_employee
    ON app.disciplinary_cases(tenant_id, employee_id, case_type);

-- Active cases by stage
CREATE INDEX IF NOT EXISTS idx_disciplinary_cases_stage
    ON app.disciplinary_cases(tenant_id, stage)
    WHERE stage != 'closed';

-- Cases with pending appeals (appeal window not expired)
CREATE INDEX IF NOT EXISTS idx_disciplinary_cases_pending_appeal
    ON app.disciplinary_cases(tenant_id, right_to_appeal_expires)
    WHERE stage = 'decision' AND appeal_submitted = false AND right_to_appeal_expires IS NOT NULL;

-- GIN index on evidence_documents JSONB
CREATE INDEX IF NOT EXISTS idx_disciplinary_cases_evidence
    ON app.disciplinary_cases USING gin(evidence_documents);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.disciplinary_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.disciplinary_cases
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.disciplinary_cases
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- TABLE: disciplinary_stage_history
-- =============================================================================
-- Immutable audit trail of every stage transition (ACAS compliance evidence)
CREATE TABLE IF NOT EXISTS app.disciplinary_stage_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    disciplinary_case_id uuid NOT NULL REFERENCES app.disciplinary_cases(id) ON DELETE CASCADE,
    from_stage app.disciplinary_stage,
    to_stage app.disciplinary_stage NOT NULL,
    changed_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for stage history
CREATE INDEX IF NOT EXISTS idx_disciplinary_stage_history_case
    ON app.disciplinary_stage_history(disciplinary_case_id, created_at);

CREATE INDEX IF NOT EXISTS idx_disciplinary_stage_history_tenant
    ON app.disciplinary_stage_history(tenant_id);

-- RLS for stage history
ALTER TABLE app.disciplinary_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.disciplinary_stage_history
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.disciplinary_stage_history
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at
CREATE TRIGGER update_disciplinary_cases_updated_at
    BEFORE UPDATE ON app.disciplinary_cases
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Valid Stage Transitions
-- =============================================================================
-- Enforced at application level (service layer) rather than trigger level
-- because disciplinary and grievance have different valid flows:
--
-- Disciplinary: investigation -> notification -> hearing -> decision -> appeal -> closed
--                                                decision -> closed (no appeal submitted)
--
-- Grievance:    informal_resolution -> formal_submission -> investigation -> hearing -> decision -> appeal -> closed
--               informal_resolution -> closed (resolved informally)
--               formal_submission -> investigation (skip if evidence clear)
--                                                   decision -> closed (no appeal submitted)

-- =============================================================================
-- GRANT permissions to app role
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON app.disciplinary_cases TO hris_app;
GRANT SELECT, INSERT ON app.disciplinary_stage_history TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON TABLE app.disciplinary_cases IS 'ACAS Code of Practice compliant disciplinary and grievance case records. Links to parent HR case. Non-compliance risks 25% tribunal award uplift.';
COMMENT ON TABLE app.disciplinary_stage_history IS 'Immutable audit trail of disciplinary/grievance stage transitions for ACAS compliance evidence.';
COMMENT ON COLUMN app.disciplinary_cases.case_id IS 'FK to parent HR case (cases table) for SLA, case number, and comments';
COMMENT ON COLUMN app.disciplinary_cases.employee_id IS 'Employee subject to the disciplinary/grievance process';
COMMENT ON COLUMN app.disciplinary_cases.companion_name IS 'Name of companion exercising right to be accompanied (s.10 TULRCA 1992)';
COMMENT ON COLUMN app.disciplinary_cases.companion_type IS 'Type of companion: trade union rep or colleague (s.10 TULRCA 1992)';
COMMENT ON COLUMN app.disciplinary_cases.right_to_appeal_expires IS 'Deadline by which employee must submit appeal (typically 5 working days from decision)';
COMMENT ON COLUMN app.disciplinary_cases.appeal_heard_by IS 'Must be different (more senior) manager than original decision maker (ACAS Code para 27)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================
-- DROP TABLE IF EXISTS app.disciplinary_stage_history;
-- DROP TABLE IF EXISTS app.disciplinary_cases;
-- DROP TYPE IF EXISTS app.appeal_outcome;
-- DROP TYPE IF EXISTS app.companion_type;
-- DROP TYPE IF EXISTS app.disciplinary_decision;
-- DROP TYPE IF EXISTS app.disciplinary_stage;
-- DROP TYPE IF EXISTS app.disciplinary_case_type;
