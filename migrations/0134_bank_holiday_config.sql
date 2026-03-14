-- Migration: 0134_bank_holiday_config
-- Created: 2026-03-13
-- Description: Bank holiday treatment configuration for UK compliance.
--              Allows tenants to manage bank holiday calendars by country and
--              region (e.g., Scotland-specific holidays like St Andrew's Day).
--
--              Supports:
--              - Per-tenant bank holiday definitions
--              - Country-level (default GB) and region-level granularity
--              - Configuration flag on leave policies for whether bank holidays
--                are additional to annual leave entitlement
--
--              Bank holidays in the UK are not a statutory right to time off;
--              they are a matter of contract. This table allows tenants to
--              configure which days they recognise as bank holidays.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- bank_holidays - Tenant-specific bank holiday calendar
-- -----------------------------------------------------------------------------
-- Stores the bank holidays recognised by each tenant. Different regions
-- of the UK observe different bank holidays (e.g., Scotland has
-- 2 January and St Andrew's Day; Northern Ireland has St Patrick's Day
-- and the Battle of the Boyne).

CREATE TABLE IF NOT EXISTS app.bank_holidays (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Holiday details
    name varchar(255) NOT NULL,
    date date NOT NULL,

    -- Country code (ISO 3166-1 alpha-2, default GB for United Kingdom)
    country_code varchar(2) NOT NULL DEFAULT 'GB',

    -- Region for sub-national holidays (e.g., 'SCT' for Scotland,
    -- 'NIR' for Northern Ireland, 'ENG' for England, 'WLS' for Wales)
    -- NULL means the holiday applies to the whole country
    region varchar(10),

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Unique constraint: one entry per tenant, date, country, and region
    CONSTRAINT uq_bank_holidays_tenant_date_country_region
        UNIQUE (tenant_id, date, country_code, COALESCE(region, ''))
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_bank_holidays_tenant
    ON app.bank_holidays(tenant_id);

CREATE INDEX IF NOT EXISTS idx_bank_holidays_tenant_date
    ON app.bank_holidays(tenant_id, date);

CREATE INDEX IF NOT EXISTS idx_bank_holidays_tenant_country
    ON app.bank_holidays(tenant_id, country_code);

CREATE INDEX IF NOT EXISTS idx_bank_holidays_tenant_country_region
    ON app.bank_holidays(tenant_id, country_code, region)
    WHERE region IS NOT NULL;

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.bank_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.bank_holidays
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.bank_holidays
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Leave Policy: bank_holidays_additional column
-- =============================================================================
-- Indicates whether bank holidays are given as additional days on top of
-- annual leave entitlement (true, the common UK default) or included within
-- the stated annual leave allowance (false).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'leave_policies'
      AND column_name = 'bank_holidays_additional'
  ) THEN
    ALTER TABLE app.leave_policies
      ADD COLUMN bank_holidays_additional boolean NOT NULL DEFAULT true;
  END IF;
END $$;

COMMENT ON COLUMN app.leave_policies.bank_holidays_additional IS 'Whether bank holidays are additional to the annual leave entitlement (true) or included within it (false). Default true, which is the most common UK arrangement.';

-- =============================================================================
-- Table Comments
-- =============================================================================

COMMENT ON TABLE app.bank_holidays IS 'Tenant-specific bank holiday calendar. UK bank holidays vary by region (England, Scotland, Wales, Northern Ireland). Supports per-country and per-region configuration.';

-- =============================================================================
-- GRANT access to the application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.bank_holidays TO hris_app;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- ALTER TABLE app.leave_policies DROP COLUMN IF EXISTS bank_holidays_additional;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.bank_holidays;
-- DROP POLICY IF EXISTS tenant_isolation ON app.bank_holidays;
-- DROP INDEX IF EXISTS app.idx_bank_holidays_tenant_country_region;
-- DROP INDEX IF EXISTS app.idx_bank_holidays_tenant_country;
-- DROP INDEX IF EXISTS app.idx_bank_holidays_tenant_date;
-- DROP INDEX IF EXISTS app.idx_bank_holidays_tenant;
-- DROP TABLE IF EXISTS app.bank_holidays;
