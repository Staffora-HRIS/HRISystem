-- Migration: 0099_benefit_enrollments
-- Created: 2026-01-16
-- Description: Create benefit enrollment tables

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Dependents table for benefits
CREATE TABLE IF NOT EXISTS app.benefit_dependents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Dependent information
    first_name varchar(100) NOT NULL,
    middle_name varchar(100),
    last_name varchar(100) NOT NULL,
    relationship varchar(50) NOT NULL, -- spouse, child, domestic_partner
    date_of_birth date NOT NULL,
    gender app.gender,
    ssn_last_four varchar(4),

    -- Contact info
    address_same_as_employee boolean DEFAULT true,
    address jsonb,

    -- Status
    is_active boolean NOT NULL DEFAULT true,
    disabled boolean DEFAULT false,
    full_time_student boolean DEFAULT false,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT check_relationship CHECK (
        relationship IN ('spouse', 'child', 'domestic_partner', 'stepchild', 'foster_child', 'legal_ward')
    )
);

-- Benefit enrollments table
CREATE TABLE IF NOT EXISTS app.benefit_enrollments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES app.benefit_plans(id),

    -- Enrollment details
    coverage_level app.coverage_level NOT NULL,
    status app.enrollment_status NOT NULL DEFAULT 'pending',

    -- Effective dates
    effective_from date NOT NULL,
    effective_to date,
    enrollment_date date NOT NULL DEFAULT CURRENT_DATE,

    -- Costs
    employee_contribution decimal(10,2) NOT NULL,
    employer_contribution decimal(10,2) NOT NULL,
    total_contribution decimal(10,2) GENERATED ALWAYS AS (employee_contribution + employer_contribution) STORED,

    -- Covered dependents (array of dependent IDs)
    covered_dependents uuid[] DEFAULT '{}',

    -- Enrollment source
    enrollment_type varchar(50) NOT NULL DEFAULT 'new_hire', -- new_hire, open_enrollment, life_event
    life_event_id uuid,

    -- Waiver information (if status = 'waived')
    waiver_reason text,
    waiver_other_coverage text,

    -- Approval
    approved_by uuid REFERENCES app.users(id),
    approved_at timestamptz,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enrollment history for audit
CREATE TABLE IF NOT EXISTS app.benefit_enrollment_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    enrollment_id uuid NOT NULL REFERENCES app.benefit_enrollments(id) ON DELETE CASCADE,
    action varchar(50) NOT NULL, -- enrolled, waived, terminated, coverage_changed
    from_status app.enrollment_status,
    to_status app.enrollment_status NOT NULL,
    from_coverage_level app.coverage_level,
    to_coverage_level app.coverage_level,
    changes jsonb,
    reason text,
    performed_by uuid REFERENCES app.users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_benefit_dependents_employee
    ON app.benefit_dependents(employee_id, is_active);

CREATE INDEX IF NOT EXISTS idx_benefit_enrollments_employee
    ON app.benefit_enrollments(employee_id, status);

CREATE INDEX IF NOT EXISTS idx_benefit_enrollments_plan
    ON app.benefit_enrollments(plan_id, status);

CREATE INDEX IF NOT EXISTS idx_benefit_enrollments_effective
    ON app.benefit_enrollments(tenant_id, effective_from, effective_to)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_benefit_enrollment_history
    ON app.benefit_enrollment_history(enrollment_id, created_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.benefit_dependents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.benefit_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.benefit_enrollment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.benefit_dependents
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.benefit_enrollments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.benefit_enrollment_history
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trg_benefit_dependents_updated_at
    BEFORE UPDATE ON app.benefit_dependents
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_benefit_enrollments_updated_at
    BEFORE UPDATE ON app.benefit_enrollments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Record enrollment changes
CREATE OR REPLACE FUNCTION app.record_enrollment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO app.benefit_enrollment_history (
            tenant_id, enrollment_id, action, to_status, to_coverage_level
        )
        VALUES (
            NEW.tenant_id, NEW.id, 'enrolled', NEW.status, NEW.coverage_level
        );
    ELSIF TG_OP = 'UPDATE' AND (OLD.status != NEW.status OR OLD.coverage_level != NEW.coverage_level) THEN
        INSERT INTO app.benefit_enrollment_history (
            tenant_id, enrollment_id, action,
            from_status, to_status,
            from_coverage_level, to_coverage_level,
            changes
        )
        VALUES (
            NEW.tenant_id, NEW.id,
            CASE
                WHEN NEW.status = 'terminated' THEN 'terminated'
                WHEN NEW.status = 'waived' THEN 'waived'
                WHEN OLD.coverage_level != NEW.coverage_level THEN 'coverage_changed'
                ELSE 'status_changed'
            END,
            OLD.status, NEW.status,
            OLD.coverage_level, NEW.coverage_level,
            jsonb_build_object(
                'old_employee_contribution', OLD.employee_contribution,
                'new_employee_contribution', NEW.employee_contribution,
                'old_covered_dependents', OLD.covered_dependents,
                'new_covered_dependents', NEW.covered_dependents
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_benefit_enrollments_history
    AFTER INSERT OR UPDATE ON app.benefit_enrollments
    FOR EACH ROW
    EXECUTE FUNCTION app.record_enrollment_change();

-- =============================================================================
-- Functions
-- =============================================================================

-- Get current enrollments for an employee
CREATE OR REPLACE FUNCTION app.get_employee_enrollments(
    p_employee_id uuid,
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    enrollment_id uuid,
    plan_id uuid,
    plan_name varchar,
    plan_category app.benefit_category,
    coverage_level app.coverage_level,
    status app.enrollment_status,
    employee_contribution decimal,
    employer_contribution decimal,
    effective_from date,
    effective_to date,
    covered_dependents jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        be.id as enrollment_id,
        be.plan_id,
        bp.name as plan_name,
        bp.category as plan_category,
        be.coverage_level,
        be.status,
        be.employee_contribution,
        be.employer_contribution,
        be.effective_from,
        be.effective_to,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'id', bd.id,
                'name', bd.first_name || ' ' || bd.last_name,
                'relationship', bd.relationship,
                'date_of_birth', bd.date_of_birth
            ))
            FROM app.benefit_dependents bd
            WHERE bd.id = ANY(be.covered_dependents)
              AND bd.is_active = true
        ) as covered_dependents
    FROM app.benefit_enrollments be
    INNER JOIN app.benefit_plans bp ON be.plan_id = bp.id
    WHERE be.employee_id = p_employee_id
      AND be.status = 'active'
      AND be.effective_from <= p_as_of_date
      AND (be.effective_to IS NULL OR be.effective_to > p_as_of_date)
    ORDER BY bp.category, bp.name;
END;
$$;

-- Calculate employee benefit costs summary
CREATE OR REPLACE FUNCTION app.get_employee_benefit_costs(
    p_employee_id uuid,
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    category app.benefit_category,
    employee_total decimal,
    employer_total decimal,
    grand_total decimal
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        bp.category,
        SUM(be.employee_contribution) as employee_total,
        SUM(be.employer_contribution) as employer_total,
        SUM(be.employee_contribution + be.employer_contribution) as grand_total
    FROM app.benefit_enrollments be
    INNER JOIN app.benefit_plans bp ON be.plan_id = bp.id
    WHERE be.employee_id = p_employee_id
      AND be.status = 'active'
      AND be.effective_from <= p_as_of_date
      AND (be.effective_to IS NULL OR be.effective_to > p_as_of_date)
    GROUP BY bp.category
    ORDER BY bp.category;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.benefit_dependents IS 'Employee dependents for benefit coverage';
COMMENT ON TABLE app.benefit_enrollments IS 'Employee benefit enrollments';
COMMENT ON TABLE app.benefit_enrollment_history IS 'Audit trail for enrollment changes';

COMMENT ON COLUMN app.benefit_enrollments.enrollment_type IS 'How the enrollment was initiated';
COMMENT ON COLUMN app.benefit_enrollments.covered_dependents IS 'Array of dependent IDs covered by this enrollment';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_employee_benefit_costs(uuid, date);
-- DROP FUNCTION IF EXISTS app.get_employee_enrollments(uuid, date);
-- DROP TRIGGER IF EXISTS trg_benefit_enrollments_history ON app.benefit_enrollments;
-- DROP FUNCTION IF EXISTS app.record_enrollment_change();
-- DROP TRIGGER IF EXISTS trg_benefit_enrollments_updated_at ON app.benefit_enrollments;
-- DROP TRIGGER IF EXISTS trg_benefit_dependents_updated_at ON app.benefit_dependents;
-- DROP POLICY IF EXISTS tenant_isolation ON app.benefit_enrollment_history;
-- DROP POLICY IF EXISTS tenant_isolation ON app.benefit_enrollments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.benefit_dependents;
-- DROP TABLE IF EXISTS app.benefit_enrollment_history;
-- DROP TABLE IF EXISTS app.benefit_enrollments;
-- DROP TABLE IF EXISTS app.benefit_dependents;
