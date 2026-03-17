-- Migration: 0199_data_import_jobs.sql
-- Description: Create import_jobs table for structured CSV/Excel bulk data loading
-- Author: TODO-141
-- Date: 2026-03-17

-- =============================================================================
-- Import Jobs Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.import_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES app.tenants(id),

  -- Import metadata
  import_type   text NOT NULL CHECK (import_type IN (
    'employees', 'leave', 'time', 'departments', 'positions', 'compensation',
    'emergency_contacts', 'bank_details', 'training', 'equipment'
  )),
  file_name     text NOT NULL,

  -- Status tracking
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'validating', 'validated', 'importing', 'completed', 'failed'
  )),

  -- Progress counters
  total_rows    integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  error_rows    integer NOT NULL DEFAULT 0,

  -- Validation and import errors (per-row detail)
  errors        jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Parsed and validated rows ready for import (stored after validation phase)
  validated_data jsonb,

  -- Audit
  created_by    uuid REFERENCES app.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_import_jobs_tenant_id ON app.import_jobs(tenant_id);
CREATE INDEX idx_import_jobs_status ON app.import_jobs(status);
CREATE INDEX idx_import_jobs_created_at ON app.import_jobs(created_at DESC);
CREATE INDEX idx_import_jobs_tenant_status ON app.import_jobs(tenant_id, status);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.import_jobs ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: read/update/delete
CREATE POLICY tenant_isolation ON app.import_jobs
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Tenant isolation: insert
CREATE POLICY tenant_isolation_insert ON app.import_jobs
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- =============================================================================
-- Rollback
-- =============================================================================
-- DROP TABLE IF EXISTS app.import_jobs;
