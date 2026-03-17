-- Migration: 0199_employee_positions_fte
-- Created: 2026-03-17
-- Description: Add FTE percentage tracking to position_assignments for concurrent employment support.
--              Enables employees to hold multiple positions with fractional FTE allocations.
--              Total FTE across all active positions must not exceed a configurable maximum.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Add fte_percentage column to position_assignments
-- -----------------------------------------------------------------------------
-- Tracks what percentage of FTE this position assignment represents.
-- Default 100 for backwards compatibility with existing single-position employees.
ALTER TABLE app.position_assignments
    ADD COLUMN IF NOT EXISTS fte_percentage numeric(5,2) NOT NULL DEFAULT 100.00;

-- Validate fte_percentage is between 0.01 and 100.00
ALTER TABLE app.position_assignments
    ADD CONSTRAINT position_assignments_fte_percentage_range
    CHECK (fte_percentage > 0 AND fte_percentage <= 100);

-- -----------------------------------------------------------------------------
-- Index for FTE queries
-- -----------------------------------------------------------------------------
-- Efficiently query total FTE for an employee across active assignments
CREATE INDEX IF NOT EXISTS idx_position_assignments_employee_fte
    ON app.position_assignments(tenant_id, employee_id, fte_percentage)
    WHERE effective_to IS NULL;

-- -----------------------------------------------------------------------------
-- Function: Get total FTE for an employee across all active positions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.get_employee_total_fte(
    p_employee_id uuid,
    p_exclude_assignment_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_total_fte numeric;
BEGIN
    SELECT COALESCE(SUM(pa.fte_percentage), 0)
    INTO v_total_fte
    FROM app.position_assignments pa
    INNER JOIN app.employees e ON pa.employee_id = e.id
    WHERE pa.employee_id = p_employee_id
      AND pa.effective_to IS NULL
      AND e.status IN ('active', 'on_leave', 'pending')
      AND (p_exclude_assignment_id IS NULL OR pa.id != p_exclude_assignment_id);

    RETURN v_total_fte;
END;
$$;

-- -----------------------------------------------------------------------------
-- Function: Get all active position assignments for an employee with FTE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.get_employee_positions_with_fte(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    position_id uuid,
    position_code varchar(50),
    position_title varchar(255),
    org_unit_id uuid,
    org_unit_name varchar(255),
    is_primary boolean,
    fte_percentage numeric,
    assignment_reason varchar(100),
    effective_from date,
    effective_to date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT pa.id, pa.position_id, p.code AS position_code, p.title AS position_title,
           pa.org_unit_id, ou.name AS org_unit_name, pa.is_primary,
           pa.fte_percentage, pa.assignment_reason, pa.effective_from, pa.effective_to
    FROM app.position_assignments pa
    INNER JOIN app.positions p ON pa.position_id = p.id
    INNER JOIN app.org_units ou ON pa.org_unit_id = ou.id
    WHERE pa.employee_id = p_employee_id
      AND pa.effective_to IS NULL
    ORDER BY pa.is_primary DESC, pa.effective_from DESC;
END;
$$;

-- -----------------------------------------------------------------------------
-- Comments
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN app.position_assignments.fte_percentage IS 'Percentage of full-time equivalent this assignment represents (0.01-100.00). For concurrent employment, total across all active assignments should not exceed configured max.';
COMMENT ON FUNCTION app.get_employee_total_fte IS 'Returns the sum of fte_percentage across all active position assignments for an employee. Optionally excludes a specific assignment ID (useful for update validation).';
COMMENT ON FUNCTION app.get_employee_positions_with_fte IS 'Returns all active position assignments for an employee including FTE percentages.';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_employee_positions_with_fte(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_total_fte(uuid, uuid);
-- DROP INDEX IF EXISTS app.idx_position_assignments_employee_fte;
-- ALTER TABLE app.position_assignments DROP CONSTRAINT IF EXISTS position_assignments_fte_percentage_range;
-- ALTER TABLE app.position_assignments DROP COLUMN IF EXISTS fte_percentage;
