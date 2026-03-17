-- Migration: 0199_job_board_postings
-- Created: 2026-03-17
-- Description: Job board integration for recruitment module.
--              Tracks postings of requisitions (vacancies) to external job
--              boards such as Indeed, LinkedIn, Reed, and Totaljobs.
--
--              Table:
--              - job_board_postings: One row per requisition-board combination,
--                tracking posting lifecycle (draft -> posted -> expired/removed).
--
--              Tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- Job board posting status
DO $$ BEGIN
  CREATE TYPE app.job_board_posting_status AS ENUM (
    'draft',
    'posted',
    'expired',
    'removed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Supported job board names
DO $$ BEGIN
  CREATE TYPE app.job_board_name AS ENUM (
    'indeed',
    'linkedin',
    'reed',
    'totaljobs'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- job_board_postings - External job board posting records
-- -----------------------------------------------------------------------------
-- Each row represents a single posting of a requisition to a specific job board.
-- A requisition can be posted to multiple boards simultaneously.

CREATE TABLE IF NOT EXISTS app.job_board_postings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

  -- Link to the requisition being posted
  vacancy_id        uuid NOT NULL REFERENCES app.requisitions(id) ON DELETE CASCADE,

  -- Which job board
  board_name        app.job_board_name NOT NULL,

  -- External reference ID assigned by the job board (populated after posting)
  board_job_id      text,

  -- Posting lifecycle timestamps
  posted_at         timestamptz,
  expires_at        timestamptz,

  -- Current posting status
  status            app.job_board_posting_status NOT NULL DEFAULT 'draft',

  -- URL where candidates can apply on the board
  application_url   text,

  -- Audit fields
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate active postings of the same requisition to the same board
  -- (only one active posting per requisition per board at a time)
  CONSTRAINT uq_job_board_postings_active
    UNIQUE (tenant_id, vacancy_id, board_name)
    -- Note: if re-posting after removal is needed, delete the old row first
);

-- RLS
ALTER TABLE app.job_board_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.job_board_postings
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.job_board_postings
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY system_bypass ON app.job_board_postings
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.job_board_postings
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_board_postings_tenant_id
  ON app.job_board_postings (tenant_id);

CREATE INDEX IF NOT EXISTS idx_job_board_postings_vacancy_id
  ON app.job_board_postings (tenant_id, vacancy_id);

CREATE INDEX IF NOT EXISTS idx_job_board_postings_board_name
  ON app.job_board_postings (tenant_id, board_name);

CREATE INDEX IF NOT EXISTS idx_job_board_postings_status
  ON app.job_board_postings (tenant_id, status)
  WHERE status IN ('draft', 'posted');

CREATE INDEX IF NOT EXISTS idx_job_board_postings_expires_at
  ON app.job_board_postings (expires_at)
  WHERE status = 'posted' AND expires_at IS NOT NULL;

-- =============================================================================
-- GRANT permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.job_board_postings TO hris_app;

-- =============================================================================
-- DOWN Migration (reversible)
-- =============================================================================

-- To reverse:
-- DROP TABLE IF EXISTS app.job_board_postings;
-- DROP TYPE IF EXISTS app.job_board_posting_status;
-- DROP TYPE IF EXISTS app.job_board_name;
