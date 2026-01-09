-- Migration: 0026_employee_status_history
-- Created: 2026-01-07
-- Description: Create the employee_status_history table for immutable status transitions
--              Records all status changes for audit and compliance
--              Immutable - no updates or deletes allowed

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Employee Status History Table
-- -----------------------------------------------------------------------------
-- Immutable log of all employee status transitions
-- Used for audit trail, compliance reporting, and analytics
-- No updates or deletes allowed after insert
CREATE TABLE IF NOT EXISTS app.employee_status_history (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this data
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee whose status changed
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Status transition
    from_status app.employee_status, -- NULL for initial hire
    to_status app.employee_status NOT NULL,

    -- When the transition takes effect
    effective_date date NOT NULL,

    -- Reason for the transition
    reason text,

    -- Immutable audit fields (created_at only, no updated_at)
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id)

    -- Note: No updated_at column - this table is immutable
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: find status history for an employee
CREATE INDEX IF NOT EXISTS idx_employee_status_history_tenant_employee
    ON app.employee_status_history(tenant_id, employee_id, effective_date DESC);

-- Find transitions by date (for reports)
CREATE INDEX IF NOT EXISTS idx_employee_status_history_date
    ON app.employee_status_history(tenant_id, effective_date);

-- Find transitions by status (terminations, hires, etc.)
CREATE INDEX IF NOT EXISTS idx_employee_status_history_to_status
    ON app.employee_status_history(tenant_id, to_status, effective_date);

-- Find specific transitions (e.g., all terminations)
CREATE INDEX IF NOT EXISTS idx_employee_status_history_transition
    ON app.employee_status_history(tenant_id, from_status, to_status, effective_date);

-- Created by (audit trail)
CREATE INDEX IF NOT EXISTS idx_employee_status_history_created_by
    ON app.employee_status_history(tenant_id, created_by, created_at)
    WHERE created_by IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.employee_status_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see status history for their current tenant
CREATE POLICY tenant_isolation ON app.employee_status_history
    FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.employee_status_history
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Note: No UPDATE or DELETE policies - table is immutable

-- =============================================================================
-- Immutability Triggers
-- =============================================================================

-- Prevent updates on status history (immutable)
CREATE TRIGGER prevent_status_history_update
    BEFORE UPDATE ON app.employee_status_history
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_update();

-- Prevent deletes on status history (immutable)
CREATE TRIGGER prevent_status_history_delete
    BEFORE DELETE ON app.employee_status_history
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_delete();

-- =============================================================================
-- Auto-record Status Changes
-- =============================================================================

-- Trigger function to automatically record status changes from employees table
CREATE OR REPLACE FUNCTION app.record_employee_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Only record if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO app.employee_status_history (
            tenant_id, employee_id,
            from_status, to_status,
            effective_date, reason,
            created_by
        )
        VALUES (
            NEW.tenant_id, NEW.id,
            OLD.status, NEW.status,
            CURRENT_DATE, NEW.termination_reason,
            app.current_user_id()
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER record_employee_status_change
    AFTER UPDATE OF status ON app.employees
    FOR EACH ROW
    EXECUTE FUNCTION app.record_employee_status_change();

-- Trigger to record initial status on employee creation
CREATE OR REPLACE FUNCTION app.record_employee_initial_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    INSERT INTO app.employee_status_history (
        tenant_id, employee_id,
        from_status, to_status,
        effective_date, reason,
        created_by
    )
    VALUES (
        NEW.tenant_id, NEW.id,
        NULL, NEW.status,
        NEW.hire_date, 'New hire',
        app.current_user_id()
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER record_employee_initial_status
    AFTER INSERT ON app.employees
    FOR EACH ROW
    EXECUTE FUNCTION app.record_employee_initial_status();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get full status history for an employee
CREATE OR REPLACE FUNCTION app.get_employee_status_history(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    from_status app.employee_status,
    to_status app.employee_status,
    effective_date date,
    reason text,
    created_at timestamptz,
    created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT esh.id, esh.from_status, esh.to_status,
           esh.effective_date, esh.reason, esh.created_at, esh.created_by
    FROM app.employee_status_history esh
    WHERE esh.employee_id = p_employee_id
    ORDER BY esh.effective_date DESC, esh.created_at DESC;
END;
$$;

-- Function to get latest status transition
CREATE OR REPLACE FUNCTION app.get_latest_status_change(
    p_employee_id uuid
)
RETURNS TABLE (
    from_status app.employee_status,
    to_status app.employee_status,
    effective_date date,
    reason text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT esh.from_status, esh.to_status, esh.effective_date, esh.reason, esh.created_at
    FROM app.employee_status_history esh
    WHERE esh.employee_id = p_employee_id
    ORDER BY esh.effective_date DESC, esh.created_at DESC
    LIMIT 1;
END;
$$;

-- Function to get status transitions for a period (turnover analysis)
CREATE OR REPLACE FUNCTION app.get_status_transitions_in_period(
    p_tenant_id uuid,
    p_from_date date,
    p_to_date date,
    p_to_status app.employee_status DEFAULT NULL
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50),
    from_status app.employee_status,
    to_status app.employee_status,
    effective_date date,
    reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT esh.employee_id, e.employee_number,
           esh.from_status, esh.to_status, esh.effective_date, esh.reason
    FROM app.employee_status_history esh
    INNER JOIN app.employees e ON esh.employee_id = e.id
    WHERE esh.tenant_id = p_tenant_id
      AND esh.effective_date >= p_from_date
      AND esh.effective_date <= p_to_date
      AND (p_to_status IS NULL OR esh.to_status = p_to_status)
    ORDER BY esh.effective_date, e.employee_number;
END;
$$;

-- Function to get new hires in a period
CREATE OR REPLACE FUNCTION app.get_new_hires_in_period(
    p_tenant_id uuid,
    p_from_date date,
    p_to_date date
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50),
    hire_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT esh.employee_id, e.employee_number, esh.effective_date AS hire_date
    FROM app.employee_status_history esh
    INNER JOIN app.employees e ON esh.employee_id = e.id
    WHERE esh.tenant_id = p_tenant_id
      AND esh.from_status IS NULL -- Initial hire
      AND esh.effective_date >= p_from_date
      AND esh.effective_date <= p_to_date
    ORDER BY esh.effective_date, e.employee_number;
END;
$$;

-- Function to get terminations in a period
CREATE OR REPLACE FUNCTION app.get_terminations_in_period(
    p_tenant_id uuid,
    p_from_date date,
    p_to_date date
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50),
    termination_date date,
    from_status app.employee_status,
    reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT esh.employee_id, e.employee_number, esh.effective_date AS termination_date,
           esh.from_status, esh.reason
    FROM app.employee_status_history esh
    INNER JOIN app.employees e ON esh.employee_id = e.id
    WHERE esh.tenant_id = p_tenant_id
      AND esh.to_status = 'terminated'
      AND esh.effective_date >= p_from_date
      AND esh.effective_date <= p_to_date
    ORDER BY esh.effective_date, e.employee_number;
END;
$$;

-- Function to calculate turnover rate
CREATE OR REPLACE FUNCTION app.calculate_turnover_rate(
    p_tenant_id uuid,
    p_from_date date,
    p_to_date date
)
RETURNS TABLE (
    period_start date,
    period_end date,
    terminations bigint,
    average_headcount numeric(10, 2),
    turnover_rate numeric(5, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_terminations bigint;
    v_start_headcount bigint;
    v_end_headcount bigint;
    v_avg_headcount numeric(10, 2);
    v_turnover_rate numeric(5, 2);
BEGIN
    -- Count terminations in period
    SELECT COUNT(*) INTO v_terminations
    FROM app.employee_status_history esh
    WHERE esh.tenant_id = p_tenant_id
      AND esh.to_status = 'terminated'
      AND esh.effective_date >= p_from_date
      AND esh.effective_date <= p_to_date;

    -- Approximate headcount at start of period
    SELECT COUNT(*) INTO v_start_headcount
    FROM app.employees e
    WHERE e.tenant_id = p_tenant_id
      AND e.hire_date <= p_from_date
      AND (e.termination_date IS NULL OR e.termination_date > p_from_date);

    -- Approximate headcount at end of period
    SELECT COUNT(*) INTO v_end_headcount
    FROM app.employees e
    WHERE e.tenant_id = p_tenant_id
      AND e.hire_date <= p_to_date
      AND (e.termination_date IS NULL OR e.termination_date > p_to_date);

    -- Calculate average headcount
    v_avg_headcount := (v_start_headcount + v_end_headcount)::numeric / 2;

    -- Calculate turnover rate (avoid division by zero)
    IF v_avg_headcount > 0 THEN
        v_turnover_rate := ROUND((v_terminations::numeric / v_avg_headcount) * 100, 2);
    ELSE
        v_turnover_rate := 0;
    END IF;

    RETURN QUERY
    SELECT p_from_date, p_to_date, v_terminations, v_avg_headcount, v_turnover_rate;
END;
$$;

-- Function to get status distribution for a tenant
CREATE OR REPLACE FUNCTION app.get_employee_status_distribution(
    p_tenant_id uuid
)
RETURNS TABLE (
    status app.employee_status,
    count bigint,
    percentage numeric(5, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_total bigint;
BEGIN
    SELECT COUNT(*) INTO v_total
    FROM app.employees
    WHERE tenant_id = p_tenant_id;

    RETURN QUERY
    SELECT e.status,
           COUNT(*)::bigint AS count,
           CASE WHEN v_total > 0
               THEN ROUND((COUNT(*)::numeric / v_total) * 100, 2)
               ELSE 0
           END AS percentage
    FROM app.employees e
    WHERE e.tenant_id = p_tenant_id
    GROUP BY e.status
    ORDER BY count DESC;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.employee_status_history IS 'Immutable log of employee status transitions for audit and compliance';
COMMENT ON COLUMN app.employee_status_history.id IS 'Primary UUID identifier for this history record';
COMMENT ON COLUMN app.employee_status_history.tenant_id IS 'Tenant that owns this data';
COMMENT ON COLUMN app.employee_status_history.employee_id IS 'Employee whose status changed';
COMMENT ON COLUMN app.employee_status_history.from_status IS 'Previous status (NULL for initial hire)';
COMMENT ON COLUMN app.employee_status_history.to_status IS 'New status after transition';
COMMENT ON COLUMN app.employee_status_history.effective_date IS 'Date the transition takes effect';
COMMENT ON COLUMN app.employee_status_history.reason IS 'Reason for the status change';
COMMENT ON COLUMN app.employee_status_history.created_at IS 'When this record was created';
COMMENT ON COLUMN app.employee_status_history.created_by IS 'User who initiated the status change';
COMMENT ON FUNCTION app.record_employee_status_change IS 'Trigger function to auto-record status changes';
COMMENT ON FUNCTION app.record_employee_initial_status IS 'Trigger function to record initial status on hire';
COMMENT ON FUNCTION app.get_employee_status_history IS 'Returns full status history for an employee';
COMMENT ON FUNCTION app.get_latest_status_change IS 'Returns most recent status transition';
COMMENT ON FUNCTION app.get_status_transitions_in_period IS 'Returns status transitions in a date range';
COMMENT ON FUNCTION app.get_new_hires_in_period IS 'Returns new hires in a date range';
COMMENT ON FUNCTION app.get_terminations_in_period IS 'Returns terminations in a date range';
COMMENT ON FUNCTION app.calculate_turnover_rate IS 'Calculates turnover rate for a period';
COMMENT ON FUNCTION app.get_employee_status_distribution IS 'Returns current status distribution';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_employee_status_distribution(uuid);
-- DROP FUNCTION IF EXISTS app.calculate_turnover_rate(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.get_terminations_in_period(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.get_new_hires_in_period(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.get_status_transitions_in_period(uuid, date, date, app.employee_status);
-- DROP FUNCTION IF EXISTS app.get_latest_status_change(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_status_history(uuid);
-- DROP TRIGGER IF EXISTS record_employee_initial_status ON app.employees;
-- DROP FUNCTION IF EXISTS app.record_employee_initial_status();
-- DROP TRIGGER IF EXISTS record_employee_status_change ON app.employees;
-- DROP FUNCTION IF EXISTS app.record_employee_status_change();
-- DROP TRIGGER IF EXISTS prevent_status_history_delete ON app.employee_status_history;
-- DROP TRIGGER IF EXISTS prevent_status_history_update ON app.employee_status_history;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.employee_status_history;
-- DROP POLICY IF EXISTS tenant_isolation ON app.employee_status_history;
-- DROP INDEX IF EXISTS app.idx_employee_status_history_created_by;
-- DROP INDEX IF EXISTS app.idx_employee_status_history_transition;
-- DROP INDEX IF EXISTS app.idx_employee_status_history_to_status;
-- DROP INDEX IF EXISTS app.idx_employee_status_history_date;
-- DROP INDEX IF EXISTS app.idx_employee_status_history_tenant_employee;
-- DROP TABLE IF EXISTS app.employee_status_history;
