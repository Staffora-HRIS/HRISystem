-- Migration: 0101_succession_planning
-- Created: 2026-01-16
-- Description: Create succession planning tables

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Readiness level enum
DO $$ BEGIN
    CREATE TYPE app.succession_readiness AS ENUM (
        'ready_now',
        'ready_1_year',
        'ready_2_years',
        'development_needed',
        'not_ready'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Succession plans table (for positions)
CREATE TABLE IF NOT EXISTS app.succession_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    position_id uuid NOT NULL REFERENCES app.positions(id) ON DELETE CASCADE,

    -- Position criticality
    is_critical_role boolean NOT NULL DEFAULT false,
    criticality_reason text,
    risk_level varchar(20) DEFAULT 'medium', -- low, medium, high, critical

    -- Risk factors
    incumbent_retirement_risk boolean DEFAULT false,
    incumbent_flight_risk boolean DEFAULT false,
    market_scarcity boolean DEFAULT false,

    -- Plan details
    notes text,
    last_reviewed_at timestamptz,
    last_reviewed_by uuid REFERENCES app.users(id),
    next_review_date date,

    -- Status
    is_active boolean NOT NULL DEFAULT true,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_position_plan UNIQUE (position_id)
);

-- Succession candidates
CREATE TABLE IF NOT EXISTS app.succession_candidates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES app.succession_plans(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Ranking
    ranking integer NOT NULL DEFAULT 1,
    readiness app.succession_readiness NOT NULL,

    -- Assessment
    assessment_notes text,
    strengths text[],
    development_areas text[],

    -- Development plan reference
    development_plan_id uuid, -- Reference to future development plans table

    -- Status
    is_active boolean NOT NULL DEFAULT true,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_plan_candidate UNIQUE (plan_id, employee_id)
);

-- Succession candidate history
CREATE TABLE IF NOT EXISTS app.succession_candidate_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    candidate_id uuid NOT NULL REFERENCES app.succession_candidates(id) ON DELETE CASCADE,
    from_readiness app.succession_readiness,
    to_readiness app.succession_readiness NOT NULL,
    from_ranking integer,
    to_ranking integer,
    notes text,
    changed_by uuid REFERENCES app.users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_succession_plans_tenant
    ON app.succession_plans(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_succession_plans_critical
    ON app.succession_plans(tenant_id, is_critical_role)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_succession_candidates_plan
    ON app.succession_candidates(plan_id, ranking)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_succession_candidates_employee
    ON app.succession_candidates(employee_id, is_active);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.succession_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.succession_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.succession_candidate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.succession_plans
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.succession_candidates
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.succession_candidate_history
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trg_succession_plans_updated_at
    BEFORE UPDATE ON app.succession_plans
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_succession_candidates_updated_at
    BEFORE UPDATE ON app.succession_candidates
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Record candidate readiness changes
CREATE OR REPLACE FUNCTION app.record_succession_candidate_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        OLD.readiness != NEW.readiness OR OLD.ranking != NEW.ranking
    ) THEN
        INSERT INTO app.succession_candidate_history (
            tenant_id, candidate_id,
            from_readiness, to_readiness,
            from_ranking, to_ranking
        )
        VALUES (
            NEW.tenant_id, NEW.id,
            OLD.readiness, NEW.readiness,
            OLD.ranking, NEW.ranking
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_succession_candidates_history
    AFTER UPDATE ON app.succession_candidates
    FOR EACH ROW
    EXECUTE FUNCTION app.record_succession_candidate_change();

-- =============================================================================
-- Functions
-- =============================================================================

-- Get succession pipeline overview
CREATE OR REPLACE FUNCTION app.get_succession_pipeline(
    p_tenant_id uuid
)
RETURNS TABLE (
    position_id uuid,
    position_title varchar,
    org_unit_name varchar,
    is_critical boolean,
    risk_level varchar,
    incumbent_name text,
    candidate_count bigint,
    ready_now_count bigint,
    ready_1_year_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sp.position_id,
        p.title as position_title,
        ou.name as org_unit_name,
        sp.is_critical_role as is_critical,
        sp.risk_level,
        (
            SELECT app.get_employee_display_name(pa.employee_id)
            FROM app.position_assignments pa
            INNER JOIN app.employees e ON pa.employee_id = e.id
            WHERE pa.position_id = sp.position_id
              AND pa.is_primary = true
              AND pa.effective_to IS NULL
              AND e.status IN ('active', 'on_leave')
            LIMIT 1
        ) as incumbent_name,
        COUNT(sc.id) as candidate_count,
        COUNT(sc.id) FILTER (WHERE sc.readiness = 'ready_now') as ready_now_count,
        COUNT(sc.id) FILTER (WHERE sc.readiness = 'ready_1_year') as ready_1_year_count
    FROM app.succession_plans sp
    INNER JOIN app.positions p ON sp.position_id = p.id
    LEFT JOIN app.org_units ou ON p.org_unit_id = ou.id
    LEFT JOIN app.succession_candidates sc ON sc.plan_id = sp.id AND sc.is_active = true
    WHERE sp.tenant_id = p_tenant_id
      AND sp.is_active = true
    GROUP BY sp.position_id, p.title, ou.name, sp.is_critical_role, sp.risk_level, sp.id
    ORDER BY sp.is_critical_role DESC, sp.risk_level DESC;
END;
$$;

-- Get candidates for a position
CREATE OR REPLACE FUNCTION app.get_succession_candidates(
    p_plan_id uuid
)
RETURNS TABLE (
    candidate_id uuid,
    employee_id uuid,
    employee_name text,
    current_position varchar,
    readiness app.succession_readiness,
    ranking integer,
    strengths text[],
    development_areas text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sc.id as candidate_id,
        sc.employee_id,
        app.get_employee_display_name(sc.employee_id) as employee_name,
        (
            SELECT p.title
            FROM app.position_assignments pa
            INNER JOIN app.positions p ON pa.position_id = p.id
            WHERE pa.employee_id = sc.employee_id
              AND pa.is_primary = true
              AND pa.effective_to IS NULL
            LIMIT 1
        ) as current_position,
        sc.readiness,
        sc.ranking,
        sc.strengths,
        sc.development_areas
    FROM app.succession_candidates sc
    WHERE sc.plan_id = p_plan_id
      AND sc.is_active = true
    ORDER BY sc.ranking;
END;
$$;

-- Get succession gaps (critical positions without ready successors)
CREATE OR REPLACE FUNCTION app.get_succession_gaps(
    p_tenant_id uuid
)
RETURNS TABLE (
    position_id uuid,
    position_title varchar,
    org_unit_name varchar,
    risk_level varchar,
    gap_severity varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sp.position_id,
        p.title as position_title,
        ou.name as org_unit_name,
        sp.risk_level,
        CASE
            WHEN COUNT(sc.id) = 0 THEN 'critical'
            WHEN COUNT(sc.id) FILTER (WHERE sc.readiness IN ('ready_now', 'ready_1_year')) = 0 THEN 'high'
            WHEN COUNT(sc.id) FILTER (WHERE sc.readiness = 'ready_now') = 0 THEN 'medium'
            ELSE 'low'
        END as gap_severity
    FROM app.succession_plans sp
    INNER JOIN app.positions p ON sp.position_id = p.id
    LEFT JOIN app.org_units ou ON p.org_unit_id = ou.id
    LEFT JOIN app.succession_candidates sc ON sc.plan_id = sp.id AND sc.is_active = true
    WHERE sp.tenant_id = p_tenant_id
      AND sp.is_active = true
      AND sp.is_critical_role = true
    GROUP BY sp.position_id, p.title, ou.name, sp.risk_level, sp.id
    HAVING COUNT(sc.id) FILTER (WHERE sc.readiness = 'ready_now') = 0
    ORDER BY
        CASE sp.risk_level
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            ELSE 4
        END;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.succession_plans IS 'Succession plans for positions';
COMMENT ON TABLE app.succession_candidates IS 'Candidates identified for succession';
COMMENT ON TABLE app.succession_candidate_history IS 'History of candidate readiness changes';

COMMENT ON COLUMN app.succession_plans.is_critical_role IS 'Whether this position is critical to operations';
COMMENT ON COLUMN app.succession_candidates.readiness IS 'How ready the candidate is to assume the role';
COMMENT ON COLUMN app.succession_candidates.ranking IS 'Priority ranking among candidates (1 = highest)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_succession_gaps(uuid);
-- DROP FUNCTION IF EXISTS app.get_succession_candidates(uuid);
-- DROP FUNCTION IF EXISTS app.get_succession_pipeline(uuid);
-- DROP TRIGGER IF EXISTS trg_succession_candidates_history ON app.succession_candidates;
-- DROP FUNCTION IF EXISTS app.record_succession_candidate_change();
-- DROP TRIGGER IF EXISTS trg_succession_candidates_updated_at ON app.succession_candidates;
-- DROP TRIGGER IF EXISTS trg_succession_plans_updated_at ON app.succession_plans;
-- DROP POLICY IF EXISTS tenant_isolation ON app.succession_candidate_history;
-- DROP POLICY IF EXISTS tenant_isolation ON app.succession_candidates;
-- DROP POLICY IF EXISTS tenant_isolation ON app.succession_plans;
-- DROP TABLE IF EXISTS app.succession_candidate_history;
-- DROP TABLE IF EXISTS app.succession_candidates;
-- DROP TABLE IF EXISTS app.succession_plans;
-- DROP TYPE IF EXISTS app.succession_readiness;
