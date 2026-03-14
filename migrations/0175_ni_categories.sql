-- Migration: 0175_ni_categories
-- Created: 2026-03-14
-- Description: Add NI category tracking to employees table
--              NI categories determine National Insurance contribution rates for payroll

-- =============================================================================
-- UP Migration
-- =============================================================================

-- NI Category enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ni_category') THEN
    CREATE TYPE app.ni_category AS ENUM (
      'A', 'B', 'C', 'D', 'E', 'F', 'H', 'J', 'L', 'M', 'N', 'S', 'V', 'X', 'Z'
    );
  END IF;
END $$;

-- Add NI category column to employees table
ALTER TABLE app.employees
  ADD COLUMN IF NOT EXISTS ni_category app.ni_category DEFAULT 'A';

-- Index for payroll queries filtering by NI category within a tenant
CREATE INDEX IF NOT EXISTS idx_employees_ni_category
  ON app.employees (tenant_id, ni_category);

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON COLUMN app.employees.ni_category IS
  'National Insurance category determining contribution rates. A=Standard, B=Married women reduced rate, C=Over pension age, D=Deferment (primary), E=Deferment (under 21), F=Freeport, H=Under 21, J=Deferred, L=Deferment (over pension age), M=Under 21, N=Under 21, S=Standard (Scottish), V=Veterans, X=Exempt, Z=Under 21 deferment';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- ALTER TABLE app.employees DROP COLUMN IF EXISTS ni_category;
-- DROP INDEX IF EXISTS app.idx_employees_ni_category;
-- DROP TYPE IF EXISTS app.ni_category;
