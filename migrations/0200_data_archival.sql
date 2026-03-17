-- Migration: 0200_data_archival.sql
-- Description: Create archived_records table for data archival system
-- Reversible: Yes (see DOWN section at bottom)

-- =============================================================================
-- UP
-- =============================================================================

-- Enum for archival status
CREATE TYPE app.archival_status AS ENUM ('archived', 'restored');

-- Enum for archival source categories (aligns with retention data categories)
CREATE TYPE app.archival_source_category AS ENUM (
  'employee_records',
  'payroll',
  'tax',
  'time_entries',
  'leave_records',
  'performance_reviews',
  'training_records',
  'recruitment',
  'cases',
  'audit_logs',
  'documents',
  'medical'
);

-- Main archived_records table
CREATE TABLE app.archived_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES app.tenants(id),
  source_table    text NOT NULL,
  source_id       uuid NOT NULL,
  source_category app.archival_source_category NOT NULL,
  archived_data   jsonb NOT NULL,
  archived_at     timestamptz NOT NULL DEFAULT now(),
  archived_by     uuid REFERENCES app.users(id),
  retention_until timestamptz,
  restore_reason  text,
  restored_at     timestamptz,
  restored_by     uuid REFERENCES app.users(id),
  status          app.archival_status NOT NULL DEFAULT 'archived',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_archived_records_tenant_id ON app.archived_records(tenant_id);
CREATE INDEX idx_archived_records_source_table ON app.archived_records(source_table);
CREATE INDEX idx_archived_records_source_id ON app.archived_records(source_id);
CREATE INDEX idx_archived_records_source_category ON app.archived_records(source_category);
CREATE INDEX idx_archived_records_status ON app.archived_records(status);
CREATE INDEX idx_archived_records_archived_at ON app.archived_records(archived_at);
CREATE INDEX idx_archived_records_retention_until ON app.archived_records(retention_until)
  WHERE retention_until IS NOT NULL;

-- Unique constraint: prevent archiving the same record twice (while still archived)
CREATE UNIQUE INDEX idx_archived_records_unique_source
  ON app.archived_records(tenant_id, source_table, source_id)
  WHERE status = 'archived';

-- Updated at trigger
CREATE TRIGGER trg_archived_records_updated_at
  BEFORE UPDATE ON app.archived_records
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at();

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.archived_records ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (SELECT, UPDATE, DELETE)
CREATE POLICY tenant_isolation ON app.archived_records
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

-- Tenant isolation policy (INSERT)
CREATE POLICY tenant_isolation_insert ON app.archived_records
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

-- Grant permissions to the application role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.archived_records TO hris_app;

-- =============================================================================
-- Archival rules configuration table
-- =============================================================================

CREATE TABLE app.archival_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES app.tenants(id),
  source_category   app.archival_source_category NOT NULL,
  source_table      text NOT NULL,
  status_column     text,
  status_value      text,
  date_column       text NOT NULL,
  retention_years   int NOT NULL CHECK (retention_years > 0),
  enabled           boolean NOT NULL DEFAULT true,
  description       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- One rule per source_category per tenant
CREATE UNIQUE INDEX idx_archival_rules_unique
  ON app.archival_rules(tenant_id, source_category)
  WHERE enabled = true;

CREATE INDEX idx_archival_rules_tenant_id ON app.archival_rules(tenant_id);

-- Updated at trigger
CREATE TRIGGER trg_archival_rules_updated_at
  BEFORE UPDATE ON app.archival_rules
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at();

-- RLS for archival_rules
ALTER TABLE app.archival_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.archival_rules
  USING (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert ON app.archival_rules
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON app.archival_rules TO hris_app;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- To rollback, run:
--   DROP TABLE IF EXISTS app.archival_rules CASCADE;
--   DROP TABLE IF EXISTS app.archived_records CASCADE;
--   DROP TYPE IF EXISTS app.archival_status CASCADE;
--   DROP TYPE IF EXISTS app.archival_source_category CASCADE;
