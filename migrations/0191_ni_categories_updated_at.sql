-- Migration: 0191_ni_categories_updated_at
-- Created: 2026-03-17
-- Description: Add updated_at column and trigger to ni_categories table for
--              complete audit trail and support for NI category record updates.
--              Also fixes the incorrect ni_category enum from migration 0175
--              by dropping the unused enum (column was replaced by the proper
--              ni_categories table in migration 0149).

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Add updated_at column to ni_categories (matches pay_schedules pattern)
ALTER TABLE app.ni_categories
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Auto-update trigger for updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_ni_categories_updated_at'
      AND tgrelid = 'app.ni_categories'::regclass
  ) THEN
    CREATE TRIGGER trg_ni_categories_updated_at
      BEFORE UPDATE ON app.ni_categories
      FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();
  END IF;
END $$;

COMMENT ON COLUMN app.ni_categories.updated_at IS 'Timestamp of last update to this NI category record';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_ni_categories_updated_at ON app.ni_categories;
-- ALTER TABLE app.ni_categories DROP COLUMN IF EXISTS updated_at;
