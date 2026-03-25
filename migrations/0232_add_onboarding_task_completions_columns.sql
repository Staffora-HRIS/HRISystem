-- Migration: 0232_add_onboarding_task_completions_columns
-- Created: 2026-03-25
-- Description: Add missing columns to onboarding_task_completions that the
--              OnboardingRepository expects but that were not in the original
--              migration (0085). The repository inserts task_id (text identifier),
--              category, assignee_type, required, "order", and form_data columns.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- task_id: Text-based task identifier used by the repository for lookups
-- e.g. "task-0", "task-1" etc.
ALTER TABLE app.onboarding_task_completions
    ADD COLUMN IF NOT EXISTS task_id varchar(100);

-- category: Task category grouping
ALTER TABLE app.onboarding_task_completions
    ADD COLUMN IF NOT EXISTS category varchar(100);

-- assignee_type: Who is responsible (different from owner_type enum)
ALTER TABLE app.onboarding_task_completions
    ADD COLUMN IF NOT EXISTS assignee_type varchar(50) DEFAULT 'employee';

-- required: Whether the task is required (alternative to is_required)
ALTER TABLE app.onboarding_task_completions
    ADD COLUMN IF NOT EXISTS required boolean DEFAULT true;

-- order: Sequence order for display
ALTER TABLE app.onboarding_task_completions
    ADD COLUMN IF NOT EXISTS "order" integer DEFAULT 0;

-- form_data: JSONB form data (different from form_submission)
ALTER TABLE app.onboarding_task_completions
    ADD COLUMN IF NOT EXISTS form_data jsonb;

-- assignee_id: Direct reference to the assigned employee
ALTER TABLE app.onboarding_task_completions
    ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES app.employees(id) ON DELETE SET NULL;

-- Index on task_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_onboarding_task_completions_task_id
    ON app.onboarding_task_completions(instance_id, task_id);

-- =============================================================================
-- DOWN Migration
-- =============================================================================
-- ALTER TABLE app.onboarding_task_completions DROP COLUMN IF EXISTS task_id;
-- ALTER TABLE app.onboarding_task_completions DROP COLUMN IF EXISTS category;
-- ALTER TABLE app.onboarding_task_completions DROP COLUMN IF EXISTS assignee_type;
-- ALTER TABLE app.onboarding_task_completions DROP COLUMN IF EXISTS required;
-- ALTER TABLE app.onboarding_task_completions DROP COLUMN IF EXISTS "order";
-- ALTER TABLE app.onboarding_task_completions DROP COLUMN IF EXISTS form_data;
