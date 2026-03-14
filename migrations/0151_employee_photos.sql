-- Migration: 0151_employee_photos
-- Created: 2026-03-13
-- Description: Employee photo management.
--              Stores a file_key reference (e.g. S3 object key) for each
--              employee's profile photo, along with metadata (filename,
--              MIME type, file size).
--
--              One photo per employee enforced via UNIQUE constraint on
--              (tenant_id, employee_id).
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: employee_photos
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.employee_photos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  employee_id       uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

  -- File reference (e.g. S3 object key or storage path)
  file_key          varchar(500) NOT NULL,
  original_filename varchar(255),
  mime_type         varchar(100),
  file_size_bytes   bigint,

  -- Audit
  uploaded_by       uuid,
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- One photo per employee per tenant
  CONSTRAINT uq_employee_photos_employee UNIQUE (tenant_id, employee_id)
);

COMMENT ON TABLE app.employee_photos IS 'Profile photo metadata for employees. One photo per employee.';
COMMENT ON COLUMN app.employee_photos.file_key IS 'Storage key (e.g. S3 object key) for the actual photo file';
COMMENT ON COLUMN app.employee_photos.mime_type IS 'MIME type of the uploaded file (e.g. image/jpeg, image/png)';

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_employee_photos_tenant_employee
  ON app.employee_photos (tenant_id, employee_id);

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- -----------------------------------------------------------------------------

ALTER TABLE app.employee_photos ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: SELECT, UPDATE, DELETE
CREATE POLICY tenant_isolation ON app.employee_photos
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Tenant isolation: INSERT
CREATE POLICY tenant_isolation_insert ON app.employee_photos
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System bypass (used by administrative operations)
CREATE POLICY system_bypass ON app.employee_photos
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.employee_photos
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- -----------------------------------------------------------------------------
-- Trigger: updated_at auto-update
-- -----------------------------------------------------------------------------

CREATE OR REPLACE TRIGGER trg_employee_photos_updated_at
  BEFORE UPDATE ON app.employee_photos
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at();

-- =============================================================================
-- DOWN Migration
-- =============================================================================

-- DROP TABLE IF EXISTS app.employee_photos CASCADE;
