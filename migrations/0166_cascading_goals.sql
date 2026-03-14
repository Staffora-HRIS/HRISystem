-- Migration: 0166_cascading_goals
-- Created: 2026-03-14
-- Description: Add alignment_type column to goals table for cascading goals feature

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Add alignment_type to goals (parent_goal_id already exists from 0064_goals.sql)
ALTER TABLE app.goals
    ADD COLUMN IF NOT EXISTS alignment_type varchar(20)
    DEFAULT 'supports'
    CHECK (alignment_type IN ('supports', 'contributes_to', 'required_for'));

-- Index for alignment queries
CREATE INDEX IF NOT EXISTS idx_goals_alignment_type
    ON app.goals(tenant_id, alignment_type)
    WHERE parent_goal_id IS NOT NULL;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON COLUMN app.goals.alignment_type IS 'How this goal relates to its parent: supports, contributes_to, or required_for';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_goals_alignment_type;
-- ALTER TABLE app.goals DROP COLUMN IF EXISTS alignment_type;
