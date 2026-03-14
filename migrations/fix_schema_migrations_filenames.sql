-- =============================================================================
-- ARCHIVED — One-Time Schema Migrations Filename Update Script
-- =============================================================================
-- STATUS: ARCHIVED. This script was run once during the migration renumbering
-- event. It is kept for historical reference only. Do NOT run it again.
--
-- Purpose: Updated the schema_migrations tracking table after migration files
-- were renumbered to fix duplicate numbering (0076-0080 range).
--
-- Original usage: psql -U hris -d hris -f migrations/fix_schema_migrations_filenames.sql
-- =============================================================================

BEGIN;

-- === Duplicate files that were renumbered ===
UPDATE public.schema_migrations SET filename = '0081_notifications.sql'          WHERE filename = '0076_notifications.sql';
UPDATE public.schema_migrations SET filename = '0082_exports.sql'               WHERE filename = '0077_exports.sql';
UPDATE public.schema_migrations SET filename = '0083_documents.sql'             WHERE filename = '0078_documents.sql';
UPDATE public.schema_migrations SET filename = '0084_analytics.sql'             WHERE filename = '0079_analytics.sql';
UPDATE public.schema_migrations SET filename = '0106_jobs.sql'                  WHERE filename = '0101b_jobs.sql';
UPDATE public.schema_migrations SET filename = '0116_link_admin_to_demo_data.sql' WHERE filename = '0110_link_admin_to_demo_data.sql';

-- === Files shifted +4 (0081-0100 -> 0085-0104) ===
-- Must be done in reverse order to avoid unique constraint violations
UPDATE public.schema_migrations SET filename = '0104_life_events.sql'                       WHERE filename = '0100_life_events.sql';
UPDATE public.schema_migrations SET filename = '0103_benefit_enrollments.sql'                WHERE filename = '0099_benefit_enrollments.sql';
UPDATE public.schema_migrations SET filename = '0102_benefit_plans.sql'                      WHERE filename = '0098_benefit_plans.sql';
UPDATE public.schema_migrations SET filename = '0101_benefits_types.sql'                     WHERE filename = '0097_benefits_types.sql';
UPDATE public.schema_migrations SET filename = '0100_documents_enhanced.sql'                 WHERE filename = '0096_documents_enhanced.sql';
UPDATE public.schema_migrations SET filename = '0099_org_chart_functions.sql'                WHERE filename = '0095_org_chart_functions.sql';
UPDATE public.schema_migrations SET filename = '0098_portal_tasks.sql'                       WHERE filename = '0094_portal_tasks.sql';
UPDATE public.schema_migrations SET filename = '0097_better_auth_session_current_tenant.sql' WHERE filename = '0093_better_auth_session_current_tenant.sql';
UPDATE public.schema_migrations SET filename = '0096_better_auth_twofactor_columns.sql'      WHERE filename = '0092_better_auth_twofactor_columns.sql';
UPDATE public.schema_migrations SET filename = '0095_migrate_users_to_better_auth.sql'       WHERE filename = '0091_migrate_users_to_better_auth.sql';
UPDATE public.schema_migrations SET filename = '0094_seed_admin_user.sql'                    WHERE filename = '0090_seed_admin_user.sql';
UPDATE public.schema_migrations SET filename = '0093_better_auth_core_tables.sql'            WHERE filename = '0089_better_auth_core_tables.sql';
UPDATE public.schema_migrations SET filename = '0092_better_auth_tables.sql'                 WHERE filename = '0088_better_auth_tables.sql';
UPDATE public.schema_migrations SET filename = '0091_fix_employee_status_history_triggers.sql' WHERE filename = '0087_fix_employee_status_history_triggers.sql';
UPDATE public.schema_migrations SET filename = '0090_fix_immutable_system_context.sql'       WHERE filename = '0086_fix_immutable_system_context.sql';
UPDATE public.schema_migrations SET filename = '0089_onboarding_task_completions.sql'        WHERE filename = '0085_onboarding_task_completions.sql';
UPDATE public.schema_migrations SET filename = '0088_onboarding_instances.sql'               WHERE filename = '0084_onboarding_instances.sql';
UPDATE public.schema_migrations SET filename = '0087_onboarding_template_tasks.sql'          WHERE filename = '0083_onboarding_template_tasks.sql';
UPDATE public.schema_migrations SET filename = '0086_onboarding_templates.sql'               WHERE filename = '0082_onboarding_templates.sql';
UPDATE public.schema_migrations SET filename = '0085_onboarding_enums.sql'                   WHERE filename = '0081_onboarding_enums.sql';

-- === 0101 shift +4 ===
UPDATE public.schema_migrations SET filename = '0105_succession_planning.sql'    WHERE filename = '0101_succession_planning.sql';

-- === Files shifted +5 (0102-0109 -> 0107-0114) ===
UPDATE public.schema_migrations SET filename = '0114_seed_demo_position_assignments.sql' WHERE filename = '0109_seed_demo_position_assignments.sql';
UPDATE public.schema_migrations SET filename = '0113_seed_demo_employees_data.sql'       WHERE filename = '0108_seed_demo_employees_data.sql';
UPDATE public.schema_migrations SET filename = '0112_seed_demo_employees.sql'            WHERE filename = '0107_seed_demo_employees.sql';
UPDATE public.schema_migrations SET filename = '0111_analytics.sql'                      WHERE filename = '0106_analytics.sql';
UPDATE public.schema_migrations SET filename = '0110_delegation.sql'                     WHERE filename = '0105_delegation.sql';
UPDATE public.schema_migrations SET filename = '0109_geofence.sql'                       WHERE filename = '0104_geofence.sql';
UPDATE public.schema_migrations SET filename = '0108_equipment.sql'                      WHERE filename = '0103_equipment.sql';
UPDATE public.schema_migrations SET filename = '0107_competencies.sql'                   WHERE filename = '0102_competencies.sql';

-- === 0110_field_registry shift +5 ===
UPDATE public.schema_migrations SET filename = '0115_field_registry.sql'         WHERE filename = '0110_field_registry.sql';

-- === Files shifted +6 (0111-0116 -> 0117-0122) ===
UPDATE public.schema_migrations SET filename = '0122_better_auth_organization.sql'       WHERE filename = '0116_better_auth_organization.sql';
UPDATE public.schema_migrations SET filename = '0121_seed_default_role_permissions.sql'  WHERE filename = '0115_seed_default_role_permissions.sql';
UPDATE public.schema_migrations SET filename = '0120_seed_field_registry.sql'            WHERE filename = '0114_seed_field_registry.sql';
UPDATE public.schema_migrations SET filename = '0119_manager_hierarchy.sql'              WHERE filename = '0113_manager_hierarchy.sql';
UPDATE public.schema_migrations SET filename = '0118_portal_system.sql'                  WHERE filename = '0112_portal_system.sql';
UPDATE public.schema_migrations SET filename = '0117_role_field_permissions.sql'          WHERE filename = '0111_role_field_permissions.sql';

COMMIT;

-- Verify: should show 0 rows if no old filenames remain
SELECT filename FROM public.schema_migrations
WHERE filename LIKE '0076_n%'
   OR filename LIKE '0077_e%'
   OR filename LIKE '0078_d%'
   OR filename LIKE '0079_a%'
   OR filename LIKE '0101b%'
   OR filename = '0081_onboarding_enums.sql'
   OR filename = '0110_link_admin_to_demo_data.sql'
   OR filename = '0110_field_registry.sql'
ORDER BY filename;
