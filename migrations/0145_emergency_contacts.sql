-- Migration: 0145_emergency_contacts
-- Created: 2026-03-13
-- Description: Emergency contact management for employees.
--              Stores emergency contact information (name, relationship,
--              phone, email, address) with support for marking a primary
--              contact per employee via a partial unique index.
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- emergency_contacts - Employee Emergency Contacts
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.emergency_contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  employee_id       uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

  -- Contact details
  contact_name      varchar(255) NOT NULL,
  relationship      varchar(100) NOT NULL,
  phone_primary     varchar(50) NOT NULL,
  phone_secondary   varchar(50),
  email             varchar(255),
  address           text,

  -- Priority and primary flag
  is_primary        boolean NOT NULL DEFAULT false,
  priority          int NOT NULL DEFAULT 1,

  -- Notes
  notes             text,

  -- Standard timestamps
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.emergency_contacts
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.emergency_contacts
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_tenant_employee
  ON app.emergency_contacts (tenant_id, employee_id);

-- Partial unique index: only one primary contact per employee per tenant
CREATE UNIQUE INDEX idx_emergency_contacts_primary
  ON app.emergency_contacts (tenant_id, employee_id) WHERE is_primary = true;

-- Updated_at trigger
CREATE TRIGGER set_emergency_contacts_updated_at
  BEFORE UPDATE ON app.emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- DOWN Migration
-- =============================================================================
-- To rollback:
--   DROP TABLE IF EXISTS app.emergency_contacts CASCADE;
