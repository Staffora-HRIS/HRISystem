-- Migration: 0198_tenant_usage_stats
-- Created: 2026-03-17
-- Description: Per-tenant usage analytics table.
--              Tracks active users, API request counts, storage bytes,
--              employee counts, and module-level usage per period.
--              Aggregated daily by a scheduler job; monthly rollups
--              are computed on-the-fly from daily rows.
--
--              All rows are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- tenant_usage_stats - Per-tenant usage metrics
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.tenant_usage_stats (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  period_start    date        NOT NULL,
  period_end      date        NOT NULL,
  active_users    integer     NOT NULL DEFAULT 0,
  api_requests    integer     NOT NULL DEFAULT 0,
  storage_bytes   bigint      NOT NULL DEFAULT 0,
  employee_count  integer     NOT NULL DEFAULT 0,
  module_usage    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate stats for the same tenant and period
  CONSTRAINT uq_tenant_usage_stats_period UNIQUE (tenant_id, period_start, period_end),

  -- Sanity check: period_end must be >= period_start
  CONSTRAINT ck_tenant_usage_stats_period CHECK (period_end >= period_start),

  -- Non-negative counters
  CONSTRAINT ck_tenant_usage_stats_active_users CHECK (active_users >= 0),
  CONSTRAINT ck_tenant_usage_stats_api_requests CHECK (api_requests >= 0),
  CONSTRAINT ck_tenant_usage_stats_storage_bytes CHECK (storage_bytes >= 0),
  CONSTRAINT ck_tenant_usage_stats_employee_count CHECK (employee_count >= 0)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tenant_usage_stats_tenant_period
  ON app.tenant_usage_stats (tenant_id, period_start DESC, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_stats_period_start
  ON app.tenant_usage_stats (period_start DESC);

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- -----------------------------------------------------------------------------

ALTER TABLE app.tenant_usage_stats ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: SELECT, UPDATE, DELETE
CREATE POLICY tenant_isolation
  ON app.tenant_usage_stats
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Tenant isolation: INSERT
CREATE POLICY tenant_isolation_insert
  ON app.tenant_usage_stats
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Grant permissions to the application role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.tenant_usage_stats TO hris_app;

-- =============================================================================
-- DOWN Migration
-- =============================================================================
-- DROP TABLE IF EXISTS app.tenant_usage_stats CASCADE;
