-- Migration: Fix onboarding_templates_single_default constraint
-- The original UNIQUE (tenant_id, is_default) constraint was too restrictive:
-- it only allowed 2 templates per tenant (one default, one non-default).
-- The partial unique index idx_onboarding_templates_default_unique already
-- correctly enforces at most one default template per tenant.

-- Drop the broken full unique constraint
ALTER TABLE app.onboarding_templates
    DROP CONSTRAINT IF EXISTS onboarding_templates_single_default;

-- The partial unique index already exists and is correct:
-- CREATE UNIQUE INDEX idx_onboarding_templates_default_unique
--     ON app.onboarding_templates (tenant_id) WHERE is_default = true;
