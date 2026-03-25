-- Migration: 0227_add_employee_name_columns
-- Created: 2026-03-25
-- Description: Add first_name and last_name columns to employees table.
--              Many modules and tests reference employees.first_name/last_name
--              directly for convenience alongside the effective-dated
--              employee_personal table. These columns store the current
--              legal name and are updated when employee_personal changes.

-- =============================================================================
-- UP Migration
-- =============================================================================

ALTER TABLE app.employees
  ADD COLUMN IF NOT EXISTS first_name varchar(100),
  ADD COLUMN IF NOT EXISTS last_name varchar(100),
  ADD COLUMN IF NOT EXISTS email varchar(255),
  ADD COLUMN IF NOT EXISTS date_of_birth date;

-- Backfill from employee_personal (use the latest effective record)
UPDATE app.employees e
SET
  first_name = ep.first_name,
  last_name = ep.last_name
FROM (
  SELECT DISTINCT ON (employee_id)
    employee_id, first_name, last_name
  FROM app.employee_personal
  ORDER BY employee_id, effective_from DESC
) ep
WHERE e.id = ep.employee_id
  AND e.first_name IS NULL;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- ALTER TABLE app.employees DROP COLUMN IF EXISTS first_name;
-- ALTER TABLE app.employees DROP COLUMN IF EXISTS last_name;
