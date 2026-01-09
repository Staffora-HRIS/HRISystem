-- Migration: 0054_public_holidays
-- Created: 2026-01-07
-- Description: Create the public_holidays table - public holiday calendars
--              Supports country and region-specific holidays
--              Used for leave duration calculations (exclude holidays from working days)
--              Supports half-day holidays (e.g., Christmas Eve in some regions)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Public Holidays Table
-- -----------------------------------------------------------------------------
-- Stores public/bank holidays for different countries and regions
-- These are excluded from leave duration calculations
-- Organizations with global presence need country/region-specific holiday calendars
CREATE TABLE IF NOT EXISTS app.public_holidays (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this holiday calendar
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- ==========================================================================
    -- HOLIDAY DETAILS
    -- ==========================================================================

    -- Name of the holiday (e.g., 'Christmas Day', 'Independence Day')
    name varchar(255) NOT NULL,

    -- The date of the holiday
    date date NOT NULL,

    -- ==========================================================================
    -- GEOGRAPHIC SCOPE
    -- ==========================================================================

    -- Country code (ISO 3166-1 alpha-3)
    -- e.g., 'USA', 'GBR', 'DEU', 'JPN'
    -- NULL means applies to all countries for this tenant
    country_code varchar(3),

    -- Region/state code within the country
    -- e.g., 'CA' for California, 'BY' for Bavaria
    -- NULL means applies to entire country
    region_code varchar(10),

    -- ==========================================================================
    -- HOLIDAY PROPERTIES
    -- ==========================================================================

    -- Whether this is a half-day holiday
    -- Some holidays are observed as half-days (e.g., Christmas Eve, New Year's Eve)
    is_half_day boolean NOT NULL DEFAULT false,

    -- ==========================================================================
    -- COMPUTED FIELDS
    -- ==========================================================================

    -- Year extracted from date for efficient year-based queries
    year integer GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)::integer) STORED,

    -- ==========================================================================
    -- TIMESTAMPS
    -- ==========================================================================

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- ==========================================================================
    -- CONSTRAINTS
    -- ==========================================================================

    -- Unique holiday per date/country/region combination within tenant
    CONSTRAINT public_holidays_unique UNIQUE (tenant_id, date, country_code, region_code),

    -- Country code format (ISO 3166-1 alpha-3)
    CONSTRAINT public_holidays_country_format CHECK (
        country_code IS NULL OR country_code ~ '^[A-Z]{3}$'
    ),

    -- Region code format (alphanumeric)
    CONSTRAINT public_holidays_region_format CHECK (
        region_code IS NULL OR region_code ~ '^[A-Z0-9]{1,10}$'
    ),

    -- Region requires country
    CONSTRAINT public_holidays_region_requires_country CHECK (
        region_code IS NULL OR country_code IS NOT NULL
    ),

    -- Date must be reasonable
    CONSTRAINT public_holidays_date_check CHECK (
        date >= '1970-01-01' AND date <= '2100-12-31'
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: holidays for a tenant in a date range
CREATE INDEX IF NOT EXISTS idx_public_holidays_tenant_date
    ON app.public_holidays(tenant_id, date);

-- Year-based lookup (for fetching annual holiday calendar)
CREATE INDEX IF NOT EXISTS idx_public_holidays_tenant_year
    ON app.public_holidays(tenant_id, year);

-- Country-specific holidays
CREATE INDEX IF NOT EXISTS idx_public_holidays_country
    ON app.public_holidays(tenant_id, country_code, year)
    WHERE country_code IS NOT NULL;

-- Region-specific holidays
CREATE INDEX IF NOT EXISTS idx_public_holidays_region
    ON app.public_holidays(tenant_id, country_code, region_code, year)
    WHERE region_code IS NOT NULL;

-- Date lookup for leave calculations
CREATE INDEX IF NOT EXISTS idx_public_holidays_date_lookup
    ON app.public_holidays(tenant_id, date, country_code);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.public_holidays ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see holidays for their current tenant
CREATE POLICY tenant_isolation ON app.public_holidays
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.public_holidays
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_public_holidays_updated_at
    BEFORE UPDATE ON app.public_holidays
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to check if a specific date is a public holiday
CREATE OR REPLACE FUNCTION app.is_public_holiday(
    p_tenant_id uuid,
    p_date date,
    p_country_code varchar(3) DEFAULT NULL,
    p_region_code varchar(10) DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1
        FROM app.public_holidays
        WHERE tenant_id = p_tenant_id
          AND date = p_date
          -- Match country (NULL matches all, or specific country matches)
          AND (country_code IS NULL OR country_code = p_country_code OR p_country_code IS NULL)
          -- Match region (NULL matches all, or specific region matches)
          AND (region_code IS NULL OR region_code = p_region_code OR p_region_code IS NULL)
    );
END;
$$;

-- Function to get holiday details for a date
CREATE OR REPLACE FUNCTION app.get_holiday_info(
    p_tenant_id uuid,
    p_date date,
    p_country_code varchar(3) DEFAULT NULL,
    p_region_code varchar(10) DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    is_half_day boolean,
    country_code varchar(3),
    region_code varchar(10)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ph.id,
        ph.name,
        ph.is_half_day,
        ph.country_code,
        ph.region_code
    FROM app.public_holidays ph
    WHERE ph.tenant_id = p_tenant_id
      AND ph.date = p_date
      AND (ph.country_code IS NULL OR ph.country_code = p_country_code OR p_country_code IS NULL)
      AND (ph.region_code IS NULL OR ph.region_code = p_region_code OR p_region_code IS NULL)
    -- Prefer more specific match (region > country > global)
    ORDER BY
        CASE WHEN ph.region_code IS NOT NULL THEN 1
             WHEN ph.country_code IS NOT NULL THEN 2
             ELSE 3
        END
    LIMIT 1;
END;
$$;

-- Function to get holidays for a year
CREATE OR REPLACE FUNCTION app.get_holidays_for_year(
    p_tenant_id uuid,
    p_year integer,
    p_country_code varchar(3) DEFAULT NULL,
    p_region_code varchar(10) DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    date date,
    is_half_day boolean,
    country_code varchar(3),
    region_code varchar(10)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ph.id,
        ph.name,
        ph.date,
        ph.is_half_day,
        ph.country_code,
        ph.region_code
    FROM app.public_holidays ph
    WHERE ph.tenant_id = p_tenant_id
      AND ph.year = p_year
      AND (ph.country_code IS NULL OR ph.country_code = p_country_code OR p_country_code IS NULL)
      AND (ph.region_code IS NULL OR ph.region_code = p_region_code OR p_region_code IS NULL)
    ORDER BY ph.date;
END;
$$;

-- Function to get holidays in a date range
CREATE OR REPLACE FUNCTION app.get_holidays_in_range(
    p_tenant_id uuid,
    p_start_date date,
    p_end_date date,
    p_country_code varchar(3) DEFAULT NULL,
    p_region_code varchar(10) DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    date date,
    is_half_day boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (ph.date)
        ph.id,
        ph.name,
        ph.date,
        ph.is_half_day
    FROM app.public_holidays ph
    WHERE ph.tenant_id = p_tenant_id
      AND ph.date BETWEEN p_start_date AND p_end_date
      AND (ph.country_code IS NULL OR ph.country_code = p_country_code OR p_country_code IS NULL)
      AND (ph.region_code IS NULL OR ph.region_code = p_region_code OR p_region_code IS NULL)
    ORDER BY ph.date,
        CASE WHEN ph.region_code IS NOT NULL THEN 1
             WHEN ph.country_code IS NOT NULL THEN 2
             ELSE 3
        END;
END;
$$;

-- Function to count holidays in a date range
-- Used for leave duration calculations
CREATE OR REPLACE FUNCTION app.count_holidays_in_range(
    p_tenant_id uuid,
    p_start_date date,
    p_end_date date,
    p_country_code varchar(3) DEFAULT NULL,
    p_region_code varchar(10) DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_count numeric := 0;
BEGIN
    SELECT COALESCE(SUM(
        CASE WHEN is_half_day THEN 0.5 ELSE 1.0 END
    ), 0) INTO v_count
    FROM (
        SELECT DISTINCT ON (ph.date)
            ph.is_half_day
        FROM app.public_holidays ph
        WHERE ph.tenant_id = p_tenant_id
          AND ph.date BETWEEN p_start_date AND p_end_date
          AND (ph.country_code IS NULL OR ph.country_code = p_country_code OR p_country_code IS NULL)
          AND (ph.region_code IS NULL OR ph.region_code = p_region_code OR p_region_code IS NULL)
        ORDER BY ph.date,
            CASE WHEN ph.region_code IS NOT NULL THEN 1
                 WHEN ph.country_code IS NOT NULL THEN 2
                 ELSE 3
            END
    ) distinct_holidays;

    RETURN v_count;
END;
$$;

-- Function to copy holidays from previous year (for bulk setup)
CREATE OR REPLACE FUNCTION app.copy_holidays_to_year(
    p_tenant_id uuid,
    p_source_year integer,
    p_target_year integer,
    p_country_code varchar(3) DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    INSERT INTO app.public_holidays (
        tenant_id,
        name,
        date,
        country_code,
        region_code,
        is_half_day
    )
    SELECT
        tenant_id,
        name,
        -- Shift the date to target year
        make_date(p_target_year, EXTRACT(MONTH FROM date)::integer, EXTRACT(DAY FROM date)::integer),
        country_code,
        region_code,
        is_half_day
    FROM app.public_holidays
    WHERE tenant_id = p_tenant_id
      AND year = p_source_year
      AND (p_country_code IS NULL OR country_code = p_country_code)
    ON CONFLICT (tenant_id, date, country_code, region_code) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Function to get list of unique countries configured for a tenant
CREATE OR REPLACE FUNCTION app.get_holiday_countries(
    p_tenant_id uuid
)
RETURNS TABLE (
    country_code varchar(3),
    holiday_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ph.country_code,
        COUNT(*) AS holiday_count
    FROM app.public_holidays ph
    WHERE ph.tenant_id = p_tenant_id
      AND ph.country_code IS NOT NULL
    GROUP BY ph.country_code
    ORDER BY ph.country_code;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.public_holidays IS 'Public holiday calendars for leave duration calculations, with country/region specificity';
COMMENT ON COLUMN app.public_holidays.id IS 'Primary UUID identifier for the holiday';
COMMENT ON COLUMN app.public_holidays.tenant_id IS 'Tenant that owns this holiday calendar';
COMMENT ON COLUMN app.public_holidays.name IS 'Name of the holiday';
COMMENT ON COLUMN app.public_holidays.date IS 'Date of the holiday';
COMMENT ON COLUMN app.public_holidays.country_code IS 'Country code (ISO 3166-1 alpha-3), NULL = all countries';
COMMENT ON COLUMN app.public_holidays.region_code IS 'Region/state code within country, NULL = entire country';
COMMENT ON COLUMN app.public_holidays.is_half_day IS 'Whether this is a half-day holiday';
COMMENT ON COLUMN app.public_holidays.year IS 'Computed year for efficient queries';
COMMENT ON FUNCTION app.is_public_holiday IS 'Checks if a date is a public holiday';
COMMENT ON FUNCTION app.get_holiday_info IS 'Gets holiday details for a specific date';
COMMENT ON FUNCTION app.get_holidays_for_year IS 'Returns all holidays for a year';
COMMENT ON FUNCTION app.get_holidays_in_range IS 'Returns holidays in a date range';
COMMENT ON FUNCTION app.count_holidays_in_range IS 'Counts holidays in a range for leave calculations';
COMMENT ON FUNCTION app.copy_holidays_to_year IS 'Copies holidays from one year to another';
COMMENT ON FUNCTION app.get_holiday_countries IS 'Returns list of countries with configured holidays';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_holiday_countries(uuid);
-- DROP FUNCTION IF EXISTS app.copy_holidays_to_year(uuid, integer, integer, varchar);
-- DROP FUNCTION IF EXISTS app.count_holidays_in_range(uuid, date, date, varchar, varchar);
-- DROP FUNCTION IF EXISTS app.get_holidays_in_range(uuid, date, date, varchar, varchar);
-- DROP FUNCTION IF EXISTS app.get_holidays_for_year(uuid, integer, varchar, varchar);
-- DROP FUNCTION IF EXISTS app.get_holiday_info(uuid, date, varchar, varchar);
-- DROP FUNCTION IF EXISTS app.is_public_holiday(uuid, date, varchar, varchar);
-- DROP TRIGGER IF EXISTS update_public_holidays_updated_at ON app.public_holidays;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.public_holidays;
-- DROP POLICY IF EXISTS tenant_isolation ON app.public_holidays;
-- DROP INDEX IF EXISTS app.idx_public_holidays_date_lookup;
-- DROP INDEX IF EXISTS app.idx_public_holidays_region;
-- DROP INDEX IF EXISTS app.idx_public_holidays_country;
-- DROP INDEX IF EXISTS app.idx_public_holidays_tenant_year;
-- DROP INDEX IF EXISTS app.idx_public_holidays_tenant_date;
-- DROP TABLE IF EXISTS app.public_holidays;
