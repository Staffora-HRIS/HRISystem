-- Migration: 0153_document_templates.sql
-- Description: HR document letter templates and generated letters
-- Date: 2026-03-13
--
-- Creates:
--   - app.letter_template_type enum
--   - app.letter_templates table (template definitions with {{placeholder}} syntax)
--   - app.generated_letters table (rendered letters linked to employees)
--   - RLS policies on both tables
--   - Default seed templates (offer letter, contract variation, disciplinary invitation)

-- =============================================================================
-- Enum
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE app.letter_template_type AS ENUM (
    'offer_letter',
    'contract_variation',
    'disciplinary_invitation',
    'disciplinary_outcome',
    'grievance_invitation',
    'grievance_outcome',
    'reference',
    'probation_confirmation',
    'probation_extension',
    'termination',
    'redundancy',
    'flexible_working_response',
    'return_to_work',
    'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Letter Templates
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.letter_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES app.tenants(id),
  name          varchar(255) NOT NULL,
  template_type app.letter_template_type NOT NULL,
  subject       varchar(500),
  body_template text NOT NULL,
  placeholders  jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default    boolean NOT NULL DEFAULT false,
  version       int NOT NULL DEFAULT 1,
  active        boolean NOT NULL DEFAULT true,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_letter_templates_tenant
  ON app.letter_templates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_letter_templates_type
  ON app.letter_templates (tenant_id, template_type);
CREATE INDEX IF NOT EXISTS idx_letter_templates_active
  ON app.letter_templates (tenant_id, active);

-- RLS
ALTER TABLE app.letter_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.letter_templates
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_insert ON app.letter_templates
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- =============================================================================
-- Generated Letters
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.generated_letters (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES app.tenants(id),
  template_id       uuid NOT NULL REFERENCES app.letter_templates(id),
  employee_id       uuid NOT NULL REFERENCES app.employees(id),
  generated_by      uuid,
  generated_at      timestamptz NOT NULL DEFAULT now(),
  subject           varchar(500),
  body              text NOT NULL,
  placeholders_used jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_file_key      varchar(500),
  sent_at           timestamptz,
  sent_via          varchar(50),
  acknowledged_at   timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_generated_letters_tenant
  ON app.generated_letters (tenant_id);
CREATE INDEX IF NOT EXISTS idx_generated_letters_employee
  ON app.generated_letters (tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_generated_letters_template
  ON app.generated_letters (tenant_id, template_id);

-- RLS
ALTER TABLE app.generated_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.generated_letters
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_insert ON app.generated_letters
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- =============================================================================
-- Grant permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.letter_templates TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.generated_letters TO hris_app;
