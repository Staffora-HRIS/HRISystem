-- Migration: 0198_talent_pools
-- Created: 2026-03-17
-- Description: Talent pool management for proactive talent pipeline.
--              Talent pools group employees by skills, readiness, or
--              strategic focus (e.g., "Future Leaders", "Technical Experts").
--              Members are tracked with readiness levels and notes.
--
--              Tables:
--              - talent_pools: Pool definitions with status and metadata
--              - talent_pool_members: Employee membership with readiness
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- Talent pool status
DO $$ BEGIN
  CREATE TYPE app.talent_pool_status AS ENUM (
    'active',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Talent pool member readiness level (reuses succession concept)
DO $$ BEGIN
  CREATE TYPE app.talent_pool_readiness AS ENUM (
    'ready_now',
    'ready_1_year',
    'ready_2_years',
    'development_needed',
    'not_assessed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- talent_pools - Talent pool definitions
-- -----------------------------------------------------------------------------
-- Central register of talent pools for grouping employees by capability,
-- potential, or strategic focus area.

CREATE TABLE IF NOT EXISTS app.talent_pools (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,

  -- Pool definition
  name            text NOT NULL,
  description     text,
  category        text,           -- e.g. "Leadership", "Technical", "Graduate"

  -- Status
  status          app.talent_pool_status NOT NULL DEFAULT 'active',

  -- Metadata
  criteria        jsonb DEFAULT '{}'::jsonb,  -- Eligibility/selection criteria

  -- Audit fields
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Unique pool name per tenant
  CONSTRAINT uq_talent_pools_tenant_name UNIQUE (tenant_id, name)
);

-- RLS
ALTER TABLE app.talent_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.talent_pools
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.talent_pools
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY system_bypass ON app.talent_pools
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.talent_pools
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_talent_pools_tenant_id
  ON app.talent_pools (tenant_id);

CREATE INDEX IF NOT EXISTS idx_talent_pools_tenant_status
  ON app.talent_pools (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_talent_pools_tenant_category
  ON app.talent_pools (tenant_id, category)
  WHERE category IS NOT NULL;

-- -----------------------------------------------------------------------------
-- talent_pool_members - Employee membership in talent pools
-- -----------------------------------------------------------------------------
-- Links employees to talent pools with readiness assessment and notes.

CREATE TABLE IF NOT EXISTS app.talent_pool_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,

  -- Foreign keys
  pool_id         uuid NOT NULL REFERENCES app.talent_pools(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL,

  -- Assessment
  readiness       app.talent_pool_readiness NOT NULL DEFAULT 'not_assessed',
  notes           text,

  -- Active flag for soft deletes
  is_active       boolean NOT NULL DEFAULT true,

  -- Audit fields
  added_by        uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- An employee can only be in a pool once
  CONSTRAINT uq_talent_pool_members_pool_employee UNIQUE (pool_id, employee_id)
);

-- RLS
ALTER TABLE app.talent_pool_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.talent_pool_members
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.talent_pool_members
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY system_bypass ON app.talent_pool_members
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.talent_pool_members
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_talent_pool_members_tenant_id
  ON app.talent_pool_members (tenant_id);

CREATE INDEX IF NOT EXISTS idx_talent_pool_members_pool_id
  ON app.talent_pool_members (pool_id);

CREATE INDEX IF NOT EXISTS idx_talent_pool_members_employee_id
  ON app.talent_pool_members (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_talent_pool_members_readiness
  ON app.talent_pool_members (pool_id, readiness)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_talent_pool_members_active
  ON app.talent_pool_members (pool_id, is_active)
  WHERE is_active = true;

-- =============================================================================
-- GRANT permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.talent_pools TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.talent_pool_members TO hris_app;

-- =============================================================================
-- DOWN Migration (reversible)
-- =============================================================================

-- To reverse:
-- DROP TABLE IF EXISTS app.talent_pool_members;
-- DROP TABLE IF EXISTS app.talent_pools;
-- DROP TYPE IF EXISTS app.talent_pool_readiness;
-- DROP TYPE IF EXISTS app.talent_pool_status;
