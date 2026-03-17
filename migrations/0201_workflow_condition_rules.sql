-- Migration: 0201_workflow_condition_rules
-- Created: 2026-03-17
-- Description: Add condition_rules JSONB column to workflow_tasks table
--              to support conditional workflow branching at runtime.
--              When a workflow step completes, the engine evaluates condition_rules
--              on the next candidate steps to determine which branch to follow.
--              Condition rules are defined per step in workflow_versions.steps JSONB,
--              and copied to the workflow_task record for audit.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Add condition_rules column to workflow_tasks
-- This column stores the condition rules that were evaluated for this task.
-- Structure:
-- {
--   "match": "all" | "any",
--   "conditions": [
--     {
--       "field": "context.amount",
--       "operator": "field_greater_than",
--       "value": 1000
--     },
--     {
--       "field": "context.department",
--       "operator": "field_equals",
--       "value": "engineering"
--     }
--   ]
-- }
-- Operators: field_equals, field_not_equals, field_greater_than,
--            field_less_than, field_greater_than_or_equal,
--            field_less_than_or_equal, field_contains, field_not_contains,
--            field_in, field_not_in, field_is_empty, field_is_not_empty
ALTER TABLE app.workflow_tasks
    ADD COLUMN IF NOT EXISTS condition_rules jsonb DEFAULT NULL;

-- Add condition_result column to record whether condition was met
-- NULL = no conditions (unconditional step), true = conditions met, false = conditions not met (skipped)
ALTER TABLE app.workflow_tasks
    ADD COLUMN IF NOT EXISTS condition_result boolean DEFAULT NULL;

-- GIN index for condition_rules queries
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_condition_rules
    ON app.workflow_tasks USING gin(condition_rules)
    WHERE condition_rules IS NOT NULL;

-- Index for condition_result filtering (useful for analytics on skipped vs executed steps)
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_condition_result
    ON app.workflow_tasks(instance_id, condition_result)
    WHERE condition_result IS NOT NULL;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON COLUMN app.workflow_tasks.condition_rules IS 'Condition rules evaluated for this task. Copied from step definition for audit trail.';
COMMENT ON COLUMN app.workflow_tasks.condition_result IS 'Result of condition evaluation: NULL=unconditional, true=conditions met, false=skipped.';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_workflow_tasks_condition_result;
-- DROP INDEX IF EXISTS app.idx_workflow_tasks_condition_rules;
-- ALTER TABLE app.workflow_tasks DROP COLUMN IF EXISTS condition_result;
-- ALTER TABLE app.workflow_tasks DROP COLUMN IF EXISTS condition_rules;
