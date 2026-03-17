-- Migration: 0182_fix_missing_insert_rls_policies
-- Created: 2026-03-16
-- Description: Add explicit FOR INSERT WITH CHECK RLS policies to tables that only
--              have FOR ALL USING policies. While PostgreSQL implicitly uses USING as
--              WITH CHECK for INSERT when no explicit WITH CHECK is given, the project
--              standard requires separate tenant_isolation_insert policies for clarity
--              and defence-in-depth.
--
--              This covers tables from migrations 0076-0181 that were created with
--              FOR ALL USING(...) but without a dedicated INSERT policy.
--
--              Tables without a tenant_id column (push_tokens, analytics_widgets) are
--              excluded -- analytics_widgets is addressed in migration 0183.
--
--              Each policy creation is wrapped in a DO/EXCEPTION block to be idempotent.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Benefits module (0098, 0099, 0100, 0102, 0103, 0104)
-- ---------------------------------------------------------------------------

-- benefit_carriers
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.benefit_carriers
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- benefit_plans
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.benefit_plans
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- benefit_plan_costs
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.benefit_plan_costs
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- benefit_dependents
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.benefit_dependents
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- benefit_enrollments
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.benefit_enrollments
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- benefit_enrollment_history
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.benefit_enrollment_history
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- life_events
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.life_events
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- open_enrollment_periods
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.open_enrollment_periods
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- open_enrollment_elections
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.open_enrollment_elections
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Succession Planning module (0101, 0105)
-- ---------------------------------------------------------------------------

-- succession_plans
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.succession_plans
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- succession_candidates
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.succession_candidates
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- succession_candidate_history
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.succession_candidate_history
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Competencies module (0102, 0107)
-- ---------------------------------------------------------------------------

-- competencies
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.competencies
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- job_competencies
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.job_competencies
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- position_competencies
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.position_competencies
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- employee_competencies
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.employee_competencies
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- employee_competency_history
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.employee_competency_history
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Equipment module (0103, 0108)
-- ---------------------------------------------------------------------------

-- equipment_catalog
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.equipment_catalog
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- equipment_requests
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.equipment_requests
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- equipment_request_history
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.equipment_request_history
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Geofence module (0104, 0109)
-- ---------------------------------------------------------------------------

-- geofence_locations
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.geofence_locations
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- geofence_violations
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.geofence_violations
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Delegation module (0105, 0110)
-- ---------------------------------------------------------------------------

-- approval_delegations
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.approval_delegations
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- delegation_log
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.delegation_log
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Analytics / Reports module (0106, 0111)
-- ---------------------------------------------------------------------------

-- report_definitions
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.report_definitions
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- saved_reports
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.saved_reports
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- scheduled_reports
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.scheduled_reports
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- report_executions
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.report_executions
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- analytics_headcount
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.analytics_headcount
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- analytics_turnover
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.analytics_turnover
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Jobs module (0101b, 0106)
-- Matches existing policy pattern: system context OR tenant check
-- ---------------------------------------------------------------------------

-- jobs
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.jobs
    FOR INSERT WITH CHECK (
      COALESCE(current_setting('app.system_context', true), 'false')::boolean = true
      OR tenant_id = COALESCE(current_setting('app.current_tenant', true), '')::uuid
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Documents module (0078, 0083, 0096, 0100)
-- ---------------------------------------------------------------------------

-- documents
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.documents
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- document_templates
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.document_templates
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- document_versions
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.document_versions
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- document_access_log
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.document_access_log
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- document_shares
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.document_shares
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Notifications module (0076, 0081)
-- Note: push_tokens excluded -- no tenant_id column (uses user_id-based RLS)
-- ---------------------------------------------------------------------------

-- notifications
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.notifications
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- notification_deliveries
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.notification_deliveries
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Exports module (0077, 0082)
-- ---------------------------------------------------------------------------

-- exports
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.exports
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Analytics worker tables (0079, 0084)
-- Note: analytics_widgets excluded -- no tenant_id column (addressed in 0183)
-- These tables include system context bypass for the analytics worker
-- ---------------------------------------------------------------------------

-- analytics_aggregates
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.analytics_aggregates
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- analytics_snapshots
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.analytics_snapshots
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- analytics_dashboards
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.analytics_dashboards
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Field Registry & Role Field Permissions (0110, 0111, 0115, 0117)
-- ---------------------------------------------------------------------------

-- field_registry (tenant_id can be NULL for system-wide field definitions)
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.field_registry
    FOR INSERT WITH CHECK (
      tenant_id IS NULL
      OR tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- role_field_permissions
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.role_field_permissions
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Portal System (0112, 0118)
-- ---------------------------------------------------------------------------

-- user_portal_access
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.user_portal_access
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Security module (0178 - Data Scopes, Conditions, Approval Chains, SoD, Reviews, Alerts)
-- ---------------------------------------------------------------------------

-- data_scopes
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.data_scopes
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- data_scope_members
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.data_scope_members
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- permission_conditions (tenant_id can be NULL for system-wide conditions)
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.permission_conditions
    FOR INSERT WITH CHECK (
      tenant_id IS NULL
      OR tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- approval_chain_definitions
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.approval_chain_definitions
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- separation_of_duties_rules (tenant_id can be NULL for system-wide rules)
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.separation_of_duties_rules
    FOR INSERT WITH CHECK (
      tenant_id IS NULL
      OR tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- access_review_campaigns
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.access_review_campaigns
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- access_review_items
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.access_review_items
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- security_alerts
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.security_alerts
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Case Appeals (0180)
-- ---------------------------------------------------------------------------

-- case_appeals
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.case_appeals
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Approval Instances & Permission Change Log (0181)
-- ---------------------------------------------------------------------------

-- approval_instances
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.approval_instances
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- approval_step_decisions
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.approval_step_decisions
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- permission_change_log
DO $$ BEGIN
  CREATE POLICY tenant_isolation_insert ON app.permission_change_log
    FOR INSERT WITH CHECK (
      tenant_id = current_setting('app.current_tenant', true)::uuid
      OR app.is_system_context()
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- To rollback, drop all the INSERT policies added above:
--
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.benefit_carriers;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.benefit_plans;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.benefit_plan_costs;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.benefit_dependents;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.benefit_enrollments;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.benefit_enrollment_history;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.life_events;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.open_enrollment_periods;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.open_enrollment_elections;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.succession_plans;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.succession_candidates;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.succession_candidate_history;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.competencies;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.job_competencies;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.position_competencies;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.employee_competencies;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.employee_competency_history;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.equipment_catalog;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.equipment_requests;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.equipment_request_history;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.geofence_locations;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.geofence_violations;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.approval_delegations;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.delegation_log;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.report_definitions;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.saved_reports;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.scheduled_reports;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.report_executions;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.analytics_headcount;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.analytics_turnover;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.jobs;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.documents;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.document_templates;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.document_versions;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.document_access_log;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.document_shares;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.notifications;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.notification_deliveries;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.exports;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.analytics_aggregates;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.analytics_snapshots;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.analytics_dashboards;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.field_registry;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.role_field_permissions;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.user_portal_access;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.data_scopes;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.data_scope_members;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.permission_conditions;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.approval_chain_definitions;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.separation_of_duties_rules;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.access_review_campaigns;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.access_review_items;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.security_alerts;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.case_appeals;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.approval_instances;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.approval_step_decisions;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.permission_change_log;
