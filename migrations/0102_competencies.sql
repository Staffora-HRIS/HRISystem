-- Migration: 0102_competencies
-- Created: 2026-01-16
-- Description: Create competency management tables

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Competency category enum
DO $$ BEGIN
    CREATE TYPE app.competency_category AS ENUM (
        'technical',
        'leadership',
        'core',
        'functional',
        'behavioral',
        'management'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Competency library
CREATE TABLE IF NOT EXISTS app.competencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Competency identification
    code varchar(50) NOT NULL,
    name varchar(100) NOT NULL,
    category app.competency_category NOT NULL,
    description text,

    -- Proficiency levels (typically 1-5)
    levels jsonb NOT NULL DEFAULT '[
        {"level": 1, "name": "Novice", "description": "Basic awareness, requires guidance"},
        {"level": 2, "name": "Beginner", "description": "Limited experience, developing skills"},
        {"level": 3, "name": "Competent", "description": "Working knowledge, applies independently"},
        {"level": 4, "name": "Proficient", "description": "Deep understanding, guides others"},
        {"level": 5, "name": "Expert", "description": "Mastery level, shapes strategy"}
    ]',

    -- Assessment criteria
    assessment_criteria jsonb DEFAULT '[]',
    behavioral_indicators jsonb DEFAULT '[]',

    -- Status
    is_active boolean NOT NULL DEFAULT true,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_competency_code UNIQUE (tenant_id, code)
);

-- Job-competency mapping
CREATE TABLE IF NOT EXISTS app.job_competencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    job_id uuid NOT NULL REFERENCES app.jobs(id) ON DELETE CASCADE,
    competency_id uuid NOT NULL REFERENCES app.competencies(id) ON DELETE CASCADE,

    -- Requirements
    required_level integer NOT NULL CHECK (required_level BETWEEN 1 AND 5),
    is_required boolean NOT NULL DEFAULT true, -- Required vs preferred
    weight integer DEFAULT 1, -- Relative importance (1-10)

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_job_competency UNIQUE (job_id, competency_id)
);

-- Position-competency mapping (overrides job competencies if needed)
CREATE TABLE IF NOT EXISTS app.position_competencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    position_id uuid NOT NULL REFERENCES app.positions(id) ON DELETE CASCADE,
    competency_id uuid NOT NULL REFERENCES app.competencies(id) ON DELETE CASCADE,

    -- Requirements
    required_level integer NOT NULL CHECK (required_level BETWEEN 1 AND 5),
    is_required boolean NOT NULL DEFAULT true,
    weight integer DEFAULT 1,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_position_competency UNIQUE (position_id, competency_id)
);

-- Employee competency assessments
CREATE TABLE IF NOT EXISTS app.employee_competencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
    competency_id uuid NOT NULL REFERENCES app.competencies(id) ON DELETE CASCADE,

    -- Current assessment
    current_level integer CHECK (current_level BETWEEN 1 AND 5),
    target_level integer CHECK (target_level BETWEEN 1 AND 5),

    -- Assessment details
    self_assessment_level integer CHECK (self_assessment_level BETWEEN 1 AND 5),
    manager_assessment_level integer CHECK (manager_assessment_level BETWEEN 1 AND 5),
    assessment_notes text,

    -- Assessment metadata
    assessed_at timestamptz,
    assessed_by uuid REFERENCES app.users(id),
    assessment_source varchar(50), -- self, manager, 360, certification

    -- Next assessment
    next_assessment_due date,

    -- Evidence/certifications
    evidence jsonb DEFAULT '[]',

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_employee_competency UNIQUE (employee_id, competency_id)
);

-- Competency assessment history
CREATE TABLE IF NOT EXISTS app.employee_competency_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    employee_competency_id uuid NOT NULL REFERENCES app.employee_competencies(id) ON DELETE CASCADE,

    -- Previous and new levels
    from_level integer,
    to_level integer NOT NULL,
    assessment_source varchar(50),
    notes text,

    -- Assessor
    assessed_by uuid REFERENCES app.users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_competencies_tenant_category
    ON app.competencies(tenant_id, category, is_active);

CREATE INDEX IF NOT EXISTS idx_job_competencies_job
    ON app.job_competencies(job_id);

CREATE INDEX IF NOT EXISTS idx_position_competencies_position
    ON app.position_competencies(position_id);

CREATE INDEX IF NOT EXISTS idx_employee_competencies_employee
    ON app.employee_competencies(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_competencies_due
    ON app.employee_competencies(next_assessment_due)
    WHERE next_assessment_due IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.job_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.position_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.employee_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.employee_competency_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.competencies
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.job_competencies
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.position_competencies
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.employee_competencies
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.employee_competency_history
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trg_competencies_updated_at
    BEFORE UPDATE ON app.competencies
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_job_competencies_updated_at
    BEFORE UPDATE ON app.job_competencies
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_position_competencies_updated_at
    BEFORE UPDATE ON app.position_competencies
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_employee_competencies_updated_at
    BEFORE UPDATE ON app.employee_competencies
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Record competency level changes
CREATE OR REPLACE FUNCTION app.record_competency_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.current_level IS DISTINCT FROM NEW.current_level THEN
        INSERT INTO app.employee_competency_history (
            tenant_id, employee_competency_id,
            from_level, to_level,
            assessment_source, assessed_by
        )
        VALUES (
            NEW.tenant_id, NEW.id,
            OLD.current_level, NEW.current_level,
            NEW.assessment_source, NEW.assessed_by
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_employee_competencies_history
    AFTER UPDATE ON app.employee_competencies
    FOR EACH ROW
    EXECUTE FUNCTION app.record_competency_change();

-- =============================================================================
-- Functions
-- =============================================================================

-- Get competency gap analysis for an employee
CREATE OR REPLACE FUNCTION app.get_competency_gaps(
    p_employee_id uuid
)
RETURNS TABLE (
    competency_id uuid,
    competency_name varchar,
    competency_category app.competency_category,
    required_level integer,
    current_level integer,
    gap integer,
    is_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH employee_position AS (
        SELECT pa.position_id
        FROM app.position_assignments pa
        WHERE pa.employee_id = p_employee_id
          AND pa.is_primary = true
          AND pa.effective_to IS NULL
        LIMIT 1
    ),
    required_competencies AS (
        -- Get from position first, fall back to job
        SELECT DISTINCT ON (c.id)
            c.id as competency_id,
            c.name as competency_name,
            c.category as competency_category,
            COALESCE(pc.required_level, jc.required_level) as required_level,
            COALESCE(pc.is_required, jc.is_required, true) as is_required
        FROM app.competencies c
        LEFT JOIN app.position_competencies pc ON c.id = pc.competency_id
            AND pc.position_id = (SELECT position_id FROM employee_position)
        LEFT JOIN app.positions p ON p.id = (SELECT position_id FROM employee_position)
        LEFT JOIN app.job_competencies jc ON c.id = jc.competency_id
            AND jc.job_id = p.job_id
        WHERE pc.id IS NOT NULL OR jc.id IS NOT NULL
    )
    SELECT
        rc.competency_id,
        rc.competency_name,
        rc.competency_category,
        rc.required_level,
        COALESCE(ec.current_level, 0) as current_level,
        rc.required_level - COALESCE(ec.current_level, 0) as gap,
        rc.is_required
    FROM required_competencies rc
    LEFT JOIN app.employee_competencies ec ON ec.competency_id = rc.competency_id
        AND ec.employee_id = p_employee_id
    WHERE rc.required_level > COALESCE(ec.current_level, 0)
    ORDER BY rc.is_required DESC, (rc.required_level - COALESCE(ec.current_level, 0)) DESC;
END;
$$;

-- Get team competency overview for a manager
CREATE OR REPLACE FUNCTION app.get_team_competency_overview(
    p_manager_id uuid
)
RETURNS TABLE (
    competency_id uuid,
    competency_name varchar,
    team_size bigint,
    avg_level numeric,
    min_level integer,
    max_level integer,
    gap_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH team_members AS (
        SELECT rl.employee_id
        FROM app.reporting_lines rl
        INNER JOIN app.employees e ON rl.employee_id = e.id
        WHERE rl.manager_id = p_manager_id
          AND rl.is_primary = true
          AND rl.effective_to IS NULL
          AND e.status IN ('active', 'on_leave')
    )
    SELECT
        c.id as competency_id,
        c.name as competency_name,
        COUNT(DISTINCT tm.employee_id) as team_size,
        ROUND(AVG(ec.current_level), 1) as avg_level,
        MIN(ec.current_level) as min_level,
        MAX(ec.current_level) as max_level,
        COUNT(*) FILTER (
            WHERE ec.current_level < ec.target_level
        ) as gap_count
    FROM app.competencies c
    CROSS JOIN team_members tm
    LEFT JOIN app.employee_competencies ec ON ec.competency_id = c.id
        AND ec.employee_id = tm.employee_id
    WHERE ec.id IS NOT NULL
    GROUP BY c.id, c.name
    ORDER BY c.name;
END;
$$;

-- Get competencies due for assessment
CREATE OR REPLACE FUNCTION app.get_competencies_due_assessment(
    p_tenant_id uuid,
    p_days_ahead integer DEFAULT 30
)
RETURNS TABLE (
    employee_id uuid,
    employee_name text,
    competency_name varchar,
    current_level integer,
    next_assessment_due date,
    days_until_due integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ec.employee_id,
        app.get_employee_display_name(ec.employee_id) as employee_name,
        c.name as competency_name,
        ec.current_level,
        ec.next_assessment_due,
        EXTRACT(DAY FROM ec.next_assessment_due - CURRENT_DATE)::integer as days_until_due
    FROM app.employee_competencies ec
    INNER JOIN app.competencies c ON ec.competency_id = c.id
    INNER JOIN app.employees e ON ec.employee_id = e.id
    WHERE ec.tenant_id = p_tenant_id
      AND ec.next_assessment_due IS NOT NULL
      AND ec.next_assessment_due <= CURRENT_DATE + (p_days_ahead || ' days')::interval
      AND e.status IN ('active', 'on_leave')
    ORDER BY ec.next_assessment_due;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.competencies IS 'Competency library for the organization';
COMMENT ON TABLE app.job_competencies IS 'Competencies required for each job';
COMMENT ON TABLE app.position_competencies IS 'Competencies required for specific positions (overrides job)';
COMMENT ON TABLE app.employee_competencies IS 'Employee competency assessments';
COMMENT ON TABLE app.employee_competency_history IS 'History of competency level changes';

COMMENT ON COLUMN app.competencies.levels IS 'JSON array defining proficiency levels';
COMMENT ON COLUMN app.employee_competencies.evidence IS 'JSON array of evidence/certifications';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_competencies_due_assessment(uuid, integer);
-- DROP FUNCTION IF EXISTS app.get_team_competency_overview(uuid);
-- DROP FUNCTION IF EXISTS app.get_competency_gaps(uuid);
-- DROP TRIGGER IF EXISTS trg_employee_competencies_history ON app.employee_competencies;
-- DROP FUNCTION IF EXISTS app.record_competency_change();
-- DROP TRIGGER IF EXISTS trg_employee_competencies_updated_at ON app.employee_competencies;
-- DROP TRIGGER IF EXISTS trg_position_competencies_updated_at ON app.position_competencies;
-- DROP TRIGGER IF EXISTS trg_job_competencies_updated_at ON app.job_competencies;
-- DROP TRIGGER IF EXISTS trg_competencies_updated_at ON app.competencies;
-- DROP POLICY IF EXISTS tenant_isolation ON app.employee_competency_history;
-- DROP POLICY IF EXISTS tenant_isolation ON app.employee_competencies;
-- DROP POLICY IF EXISTS tenant_isolation ON app.position_competencies;
-- DROP POLICY IF EXISTS tenant_isolation ON app.job_competencies;
-- DROP POLICY IF EXISTS tenant_isolation ON app.competencies;
-- DROP TABLE IF EXISTS app.employee_competency_history;
-- DROP TABLE IF EXISTS app.employee_competencies;
-- DROP TABLE IF EXISTS app.position_competencies;
-- DROP TABLE IF EXISTS app.job_competencies;
-- DROP TABLE IF EXISTS app.competencies;
-- DROP TYPE IF EXISTS app.competency_category;
