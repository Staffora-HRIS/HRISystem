-- Migration: 0221_audit_log_default_partition
-- Created: 2026-03-21
-- Description: Add a DEFAULT partition to the audit_log table so that
--              INSERT operations never fail due to missing monthly partitions.
--              Also ensures partitions exist for the current and next 6 months,
--              and updates the ensure_audit_log_partition() function to create
--              partitions 6 months ahead instead of just 1.
--
-- Why: The original migration (0010) created monthly partitions only for the
--      current date + 3 months. Once those expire, inserts fail with
--      "no partition of relation audit_log found for row" — silently
--      breaking audit logging across the entire application.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- 1. Create a DEFAULT partition to catch any rows that don't match a
--    monthly range partition. This guarantees inserts never fail.
CREATE TABLE IF NOT EXISTS app.audit_log_default PARTITION OF app.audit_log DEFAULT;

-- 2. Create partitions for the current month and the next 6 months
DO $$
DECLARE
    v_current_date date := CURRENT_DATE;
    v_year integer;
    v_month integer;
    i integer;
BEGIN
    FOR i IN 0..6 LOOP
        v_year := EXTRACT(YEAR FROM (v_current_date + (i || ' months')::interval));
        v_month := EXTRACT(MONTH FROM (v_current_date + (i || ' months')::interval));
        PERFORM app.create_audit_log_partition(v_year, v_month);
    END LOOP;
END;
$$;

-- 3. Update ensure_audit_log_partition() to create partitions 6 months ahead
CREATE OR REPLACE FUNCTION app.ensure_audit_log_partition()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_date date := CURRENT_DATE;
    v_year integer;
    v_month integer;
    i integer;
BEGIN
    -- Create partitions for current month + next 6 months
    FOR i IN 0..6 LOOP
        v_year := EXTRACT(YEAR FROM (v_current_date + (i || ' months')::interval));
        v_month := EXTRACT(MONTH FROM (v_current_date + (i || ' months')::interval));
        PERFORM app.create_audit_log_partition(v_year, v_month);
    END LOOP;
END;
$$;

-- Grant execute to both roles
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hris') THEN
    GRANT EXECUTE ON FUNCTION app.ensure_audit_log_partition() TO hris;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hris_app') THEN
    GRANT EXECUTE ON FUNCTION app.ensure_audit_log_partition() TO hris_app;
  END IF;
END $$;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TABLE IF EXISTS app.audit_log_default;
-- (Restore the original ensure_audit_log_partition from 0010_audit_log.sql)
