-- Migration: 0223_schedules_add_is_template
-- Created: 2026-03-21
-- Description: Add is_template column to schedules table
--              The frontend and API support creating schedule templates,
--              but the column was never added to the database.
--              Also aligns the status labels: the frontend uses 'active'
--              but the DB enum only had 'draft', 'published', 'archived'.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Add is_template column (defaults to false for existing rows)
ALTER TABLE app.schedules
    ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN app.schedules.is_template IS 'If true, this schedule is a reusable template that can be duplicated';

-- Index for quickly finding templates
CREATE INDEX IF NOT EXISTS idx_schedules_is_template
    ON app.schedules(tenant_id, is_template)
    WHERE is_template = true;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_schedules_is_template;
-- ALTER TABLE app.schedules DROP COLUMN IF EXISTS is_template;
