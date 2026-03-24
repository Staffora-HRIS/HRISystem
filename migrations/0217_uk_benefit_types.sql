-- Migration: 0217_uk_benefit_types
-- Created: 2026-03-20
-- Description: Replace US-specific benefit categories (HSA, FSA) with UK salary
--              sacrifice schemes (childcare_vouchers, cycle_to_work) and replace
--              US medicare_eligibility life event with UK pension_commencement.
--              Also updates HIPAA references in JSONB comments to GDPR.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Replace US benefit categories with UK equivalents
ALTER TYPE app.benefit_category RENAME VALUE 'hsa' TO 'childcare_vouchers';
ALTER TYPE app.benefit_category RENAME VALUE 'fsa' TO 'cycle_to_work';

-- Replace US life event type with UK equivalent
ALTER TYPE app.life_event_type RENAME VALUE 'medicare_eligibility' TO 'pension_commencement';

-- Update any existing JSONB acknowledgements that reference hipaa_acknowledged
-- to use gdpr_health_data_acknowledged instead
UPDATE app.open_enrollment_elections
SET acknowledgements = (acknowledgements - 'hipaa_acknowledged') ||
    jsonb_build_object('gdpr_health_data_acknowledged', acknowledgements->'hipaa_acknowledged')
WHERE acknowledgements ? 'hipaa_acknowledged';

-- Update comments to reflect UK terminology
COMMENT ON TYPE app.benefit_category IS 'Categories of employee benefits (UK salary sacrifice schemes)';
COMMENT ON TYPE app.life_event_type IS 'Types of qualifying life events for benefit changes';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- ALTER TYPE app.benefit_category RENAME VALUE 'childcare_vouchers' TO 'hsa';
-- ALTER TYPE app.benefit_category RENAME VALUE 'cycle_to_work' TO 'fsa';
-- ALTER TYPE app.life_event_type RENAME VALUE 'pension_commencement' TO 'medicare_eligibility';
-- UPDATE app.open_enrollment_elections
-- SET acknowledgements = (acknowledgements - 'gdpr_health_data_acknowledged') ||
--     jsonb_build_object('hipaa_acknowledged', acknowledgements->'gdpr_health_data_acknowledged')
-- WHERE acknowledgements ? 'gdpr_health_data_acknowledged';
