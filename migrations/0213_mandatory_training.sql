-- Migration: 0213_mandatory_training
-- Created: 2026-03-19
-- Description: Create mandatory_training_rules and mandatory_training_assignments tables

-- =============================================================================
-- UP Migration
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE app.mandatory_training_status AS ENUM (
    'assigned', 'in_progress', 'completed', 'overdue'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE app.mandatory_training_applies_to AS ENUM (
    'all', 'department', 'role'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS app.mandatory_training_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    course_id uuid NOT NULL REFERENCES app.courses(id) ON DELETE CASCADE,
    applies_to app.mandatory_training_applies_to NOT NULL DEFAULT 'all',
    department_id uuid REFERENCES app.org_units(id) ON DELETE SET NULL,
    role varchar(255),
    deadline_days integer NOT NULL DEFAULT 30,
    recurrence_months integer,
    escalation_days integer NOT NULL DEFAULT 7,
    is_active boolean NOT NULL DEFAULT true,
    name varchar(255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    CONSTRAINT mtr_deadline_days_positive CHECK (deadline_days > 0),
    CONSTRAINT mtr_recurrence_months_positive CHECK (recurrence_months IS NULL OR recurrence_months > 0),
    CONSTRAINT mtr_escalation_days_valid CHECK (escalation_days >= 0 AND escalation_days < deadline_days),
    CONSTRAINT mtr_department_required CHECK (applies_to != 'department' OR department_id IS NOT NULL),
    CONSTRAINT mtr_role_required CHECK (applies_to != 'role' OR role IS NOT NULL),
    CONSTRAINT mtr_unique_course_scope UNIQUE (tenant_id, course_id, applies_to, department_id, role)
);

CREATE TABLE IF NOT EXISTS app.mandatory_training_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    rule_id uuid NOT NULL REFERENCES app.mandatory_training_rules(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
    course_id uuid NOT NULL REFERENCES app.courses(id) ON DELETE CASCADE,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    deadline_at timestamptz NOT NULL,
    completed_at timestamptz,
    status app.mandatory_training_status NOT NULL DEFAULT 'assigned',
    reminder_sent boolean NOT NULL DEFAULT false,
    reminder_sent_at timestamptz,
    escalation_sent boolean NOT NULL DEFAULT false,
    escalation_sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mta_unique_active_assignment UNIQUE (tenant_id, rule_id, employee_id, assigned_at),
    CONSTRAINT mta_completed_has_date CHECK (status != 'completed' OR completed_at IS NOT NULL),
    CONSTRAINT mta_deadline_after_assignment CHECK (deadline_at > assigned_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mtr_tenant_course ON app.mandatory_training_rules(tenant_id, course_id);
CREATE INDEX IF NOT EXISTS idx_mtr_tenant_active ON app.mandatory_training_rules(tenant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_mtr_tenant_department ON app.mandatory_training_rules(tenant_id, department_id) WHERE applies_to = 'department';
CREATE INDEX IF NOT EXISTS idx_mtr_tenant_role ON app.mandatory_training_rules(tenant_id, role) WHERE applies_to = 'role';
CREATE INDEX IF NOT EXISTS idx_mta_tenant_employee_status ON app.mandatory_training_assignments(tenant_id, employee_id, status);
CREATE INDEX IF NOT EXISTS idx_mta_tenant_rule ON app.mandatory_training_assignments(tenant_id, rule_id);
CREATE INDEX IF NOT EXISTS idx_mta_overdue_detection ON app.mandatory_training_assignments(deadline_at, status) WHERE status IN ('assigned', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_mta_reminder_pending ON app.mandatory_training_assignments(deadline_at, reminder_sent) WHERE status IN ('assigned', 'in_progress') AND reminder_sent = false;
CREATE INDEX IF NOT EXISTS idx_mta_escalation_pending ON app.mandatory_training_assignments(deadline_at, escalation_sent) WHERE status IN ('assigned', 'in_progress') AND escalation_sent = false;
CREATE INDEX IF NOT EXISTS idx_mta_tenant_course_status ON app.mandatory_training_assignments(tenant_id, course_id, status);

-- Row Level Security
ALTER TABLE app.mandatory_training_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.mandatory_training_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.mandatory_training_rules
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::uuid OR app.is_system_context());
CREATE POLICY tenant_isolation_insert ON app.mandatory_training_rules
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid OR app.is_system_context());

CREATE POLICY tenant_isolation ON app.mandatory_training_assignments
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::uuid OR app.is_system_context());
CREATE POLICY tenant_isolation_insert ON app.mandatory_training_assignments
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid OR app.is_system_context());

-- Triggers
CREATE TRIGGER update_mandatory_training_rules_updated_at
    BEFORE UPDATE ON app.mandatory_training_rules FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();
CREATE TRIGGER update_mandatory_training_assignments_updated_at
    BEFORE UPDATE ON app.mandatory_training_assignments FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- Comments
COMMENT ON TABLE app.mandatory_training_rules IS 'Rules defining mandatory courses for employee groups with deadlines and recurrence.';
COMMENT ON TABLE app.mandatory_training_assignments IS 'Individual employee assignments generated from mandatory training rules.';

-- DOWN Migration (for rollback)
-- DROP TRIGGER IF EXISTS update_mandatory_training_assignments_updated_at ON app.mandatory_training_assignments;
-- DROP TRIGGER IF EXISTS update_mandatory_training_rules_updated_at ON app.mandatory_training_rules;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.mandatory_training_assignments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.mandatory_training_assignments;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.mandatory_training_rules;
-- DROP POLICY IF EXISTS tenant_isolation ON app.mandatory_training_rules;
-- DROP TABLE IF EXISTS app.mandatory_training_assignments;
-- DROP TABLE IF EXISTS app.mandatory_training_rules;
-- DROP TYPE IF EXISTS app.mandatory_training_applies_to;
-- DROP TYPE IF EXISTS app.mandatory_training_status;
