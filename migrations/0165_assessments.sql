-- Migration: 0165_assessments
-- Created: 2026-03-14
-- Description: Assessment templates and candidate assessments for recruitment
--
-- Supports multiple assessment types (skills tests, psychometric, technical,
-- situational judgement, presentations) with configurable scoring criteria.
--
-- Assessment status lifecycle:
--   scheduled -> in_progress  (candidate starts the assessment)
--   in_progress -> completed  (candidate finishes / assessor records result)
--   scheduled -> cancelled    (assessment cancelled before start)
--   in_progress -> cancelled  (assessment cancelled during)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enum: assessment type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assessment_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.assessment_type AS ENUM ('skills_test', 'psychometric', 'technical', 'situational', 'presentation');
  END IF;
END
$$;

-- Enum: candidate assessment status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'candidate_assessment_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.candidate_assessment_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
  END IF;
END
$$;

-- =============================================================================
-- Table: assessment_templates
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.assessment_templates (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Template details
    name varchar(255) NOT NULL,
    type app.assessment_type NOT NULL,
    description text,

    -- Content
    questions jsonb NOT NULL DEFAULT '[]'::jsonb,
    scoring_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Configuration
    time_limit_minutes int,
    pass_mark numeric(5,2),

    -- Status
    active boolean NOT NULL DEFAULT true,

    -- Audit
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE app.assessment_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY tenant_isolation ON app.assessment_templates
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.assessment_templates
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Indexes
CREATE INDEX idx_assessment_templates_tenant ON app.assessment_templates (tenant_id);
CREATE INDEX idx_assessment_templates_tenant_type ON app.assessment_templates (tenant_id, type);
CREATE INDEX idx_assessment_templates_tenant_active ON app.assessment_templates (tenant_id, active)
    WHERE active = true;

-- Auto-update updated_at timestamp
CREATE TRIGGER update_assessment_templates_updated_at
    BEFORE UPDATE ON app.assessment_templates
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Table: candidate_assessments
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.candidate_assessments (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- References
    candidate_id uuid NOT NULL REFERENCES app.candidates(id) ON DELETE CASCADE,
    template_id uuid NOT NULL REFERENCES app.assessment_templates(id) ON DELETE CASCADE,

    -- Schedule & completion
    scheduled_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,

    -- Results
    score numeric(7,2),
    passed boolean,
    answers jsonb,

    -- Assessor
    assessor_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,
    feedback text,

    -- Status
    status app.candidate_assessment_status NOT NULL DEFAULT 'scheduled',

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE app.candidate_assessments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY tenant_isolation ON app.candidate_assessments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.candidate_assessments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Indexes
CREATE INDEX idx_candidate_assessments_tenant_candidate ON app.candidate_assessments (tenant_id, candidate_id);
CREATE INDEX idx_candidate_assessments_tenant_template ON app.candidate_assessments (tenant_id, template_id);
CREATE INDEX idx_candidate_assessments_tenant_status ON app.candidate_assessments (tenant_id, status);
CREATE INDEX idx_candidate_assessments_scheduled ON app.candidate_assessments (tenant_id, scheduled_at)
    WHERE scheduled_at IS NOT NULL;
CREATE INDEX idx_candidate_assessments_tenant_created ON app.candidate_assessments (tenant_id, created_at DESC);

-- Unique constraint: prevent duplicate assessments of same type for same candidate
CREATE UNIQUE INDEX idx_candidate_assessments_unique
    ON app.candidate_assessments (tenant_id, candidate_id, template_id)
    WHERE status != 'cancelled';

-- Auto-update updated_at timestamp
CREATE TRIGGER update_candidate_assessments_updated_at
    BEFORE UPDATE ON app.candidate_assessments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- DOWN Migration (commented out -- run manually to rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_candidate_assessments_updated_at ON app.candidate_assessments;
-- DROP INDEX IF EXISTS app.idx_candidate_assessments_unique;
-- DROP INDEX IF EXISTS app.idx_candidate_assessments_tenant_created;
-- DROP INDEX IF EXISTS app.idx_candidate_assessments_scheduled;
-- DROP INDEX IF EXISTS app.idx_candidate_assessments_tenant_status;
-- DROP INDEX IF EXISTS app.idx_candidate_assessments_tenant_template;
-- DROP INDEX IF EXISTS app.idx_candidate_assessments_tenant_candidate;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.candidate_assessments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.candidate_assessments;
-- DROP TABLE IF EXISTS app.candidate_assessments;
--
-- DROP TRIGGER IF EXISTS update_assessment_templates_updated_at ON app.assessment_templates;
-- DROP INDEX IF EXISTS app.idx_assessment_templates_tenant_active;
-- DROP INDEX IF EXISTS app.idx_assessment_templates_tenant_type;
-- DROP INDEX IF EXISTS app.idx_assessment_templates_tenant;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.assessment_templates;
-- DROP POLICY IF EXISTS tenant_isolation ON app.assessment_templates;
-- DROP TABLE IF EXISTS app.assessment_templates;
--
-- DROP TYPE IF EXISTS app.candidate_assessment_status;
-- DROP TYPE IF EXISTS app.assessment_type;
