-- Migration: 0155_uk_holiday_entitlement
-- Created: 2026-03-14
-- Description: UK holiday entitlement enforcement and bank holiday seed data.
--
--              Implements Working Time Regulations 1998 requirements:
--              1. Adds contracted_days_per_week to leave_policies for pro-rata
--                 statutory minimum calculation
--              2. Seeds default UK bank holidays for existing tenants
--              3. Adds a reusable function to seed bank holidays for new tenants
--              4. Adds leave_year_start column to tenants for configurable leave
--                 year boundaries (Jan-Dec or Apr-Mar)
--
--              The bank_holidays table was created in migration 0134 and the
--              bank_holidays_additional column on leave_policies was added there.
--              This migration adds the missing pieces for full compliance.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add contracted_days_per_week to leave_policies
-- -----------------------------------------------------------------------------
-- Used for pro-rata statutory minimum validation. When creating a leave policy,
-- the contracted days per week determines the minimum entitlement that must be
-- met under UK law (5.6 x days per week, capped at 28).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'leave_policies'
      AND column_name = 'contracted_days_per_week'
  ) THEN
    ALTER TABLE app.leave_policies
      ADD COLUMN contracted_days_per_week numeric(3,1) DEFAULT 5 NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN app.leave_policies.contracted_days_per_week IS
  'Working days per week for employees covered by this policy. Used for pro-rata statutory minimum calculation. Default 5 (full-time).';

ALTER TABLE app.leave_policies
  DROP CONSTRAINT IF EXISTS leave_policies_contracted_days_check;

ALTER TABLE app.leave_policies
  ADD CONSTRAINT leave_policies_contracted_days_check CHECK (
    contracted_days_per_week > 0 AND contracted_days_per_week <= 7
  );

-- -----------------------------------------------------------------------------
-- 2. Add leave_year_start to tenants
-- -----------------------------------------------------------------------------
-- UK leave years can start on any date. Common configurations:
-- - 1 January (calendar year)
-- - 1 April (UK tax year / government)
-- - Employee hire date anniversary
-- This column stores the default month+day for the tenant. Format: MM-DD.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'tenants'
      AND column_name = 'leave_year_start'
  ) THEN
    ALTER TABLE app.tenants
      ADD COLUMN leave_year_start varchar(5) DEFAULT '01-01' NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN app.tenants.leave_year_start IS
  'Default leave year start as MM-DD (e.g., 01-01 for calendar year, 04-01 for UK tax year). Used for pro-rata and carryover calculations.';

ALTER TABLE app.tenants
  DROP CONSTRAINT IF EXISTS tenants_leave_year_start_format;

ALTER TABLE app.tenants
  ADD CONSTRAINT tenants_leave_year_start_format CHECK (
    leave_year_start ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
  );

-- -----------------------------------------------------------------------------
-- 3. Function to seed default UK bank holidays for a tenant
-- -----------------------------------------------------------------------------
-- This function populates the bank_holidays table (from migration 0134) with
-- the standard England & Wales bank holidays for a given year. Tenants can
-- then add Scotland/NI-specific holidays or remove any that don't apply.

CREATE OR REPLACE FUNCTION app.seed_uk_bank_holidays(
    p_tenant_id uuid,
    p_year integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_count integer := 0;
    v_easter date;
    v_a integer;
    v_b integer;
    v_c integer;
    v_d integer;
    v_e integer;
    v_f integer;
    v_g integer;
    v_h integer;
    v_i integer;
    v_k integer;
    v_l integer;
    v_m integer;
    v_month integer;
    v_day integer;
BEGIN
    -- Calculate Easter using Anonymous Gregorian algorithm
    v_a := p_year % 19;
    v_b := p_year / 100;
    v_c := p_year % 100;
    v_d := v_b / 4;
    v_e := v_b % 4;
    v_f := (v_b + 8) / 25;
    v_g := (v_b - v_f + 1) / 3;
    v_h := (19 * v_a + v_b - v_d - v_g + 15) % 30;
    v_i := v_c / 4;
    v_k := v_c % 4;
    v_l := (32 + 2 * v_e + 2 * v_i - v_h - v_k) % 7;
    v_m := (v_a + 11 * v_h + 22 * v_l) / 451;
    v_month := (v_h + v_l - 7 * v_m + 114) / 31;
    v_day := ((v_h + v_l - 7 * v_m + 114) % 31) + 1;

    v_easter := make_date(p_year, v_month, v_day);

    -- Insert standard England & Wales bank holidays
    -- Using ON CONFLICT to make this idempotent

    -- New Year's Day
    INSERT INTO app.bank_holidays (tenant_id, name, date, country_code, region)
    VALUES (p_tenant_id, 'New Year''s Day',
            app.substitute_if_weekend(make_date(p_year, 1, 1)),
            'GB', NULL)
    ON CONFLICT (tenant_id, date, country_code, COALESCE(region, '')) DO NOTHING;
    GET DIAGNOSTICS v_count = v_count + ROW_COUNT;

    -- Good Friday
    INSERT INTO app.bank_holidays (tenant_id, name, date, country_code, region)
    VALUES (p_tenant_id, 'Good Friday', v_easter - 2, 'GB', NULL)
    ON CONFLICT (tenant_id, date, country_code, COALESCE(region, '')) DO NOTHING;

    -- Easter Monday
    INSERT INTO app.bank_holidays (tenant_id, name, date, country_code, region)
    VALUES (p_tenant_id, 'Easter Monday', v_easter + 1, 'GB', NULL)
    ON CONFLICT (tenant_id, date, country_code, COALESCE(region, '')) DO NOTHING;

    -- Early May Bank Holiday (first Monday in May)
    INSERT INTO app.bank_holidays (tenant_id, name, date, country_code, region)
    VALUES (p_tenant_id, 'Early May Bank Holiday',
            app.first_monday_in_month(p_year, 5),
            'GB', NULL)
    ON CONFLICT (tenant_id, date, country_code, COALESCE(region, '')) DO NOTHING;

    -- Spring Bank Holiday (last Monday in May)
    INSERT INTO app.bank_holidays (tenant_id, name, date, country_code, region)
    VALUES (p_tenant_id, 'Spring Bank Holiday',
            app.last_monday_in_month(p_year, 5),
            'GB', NULL)
    ON CONFLICT (tenant_id, date, country_code, COALESCE(region, '')) DO NOTHING;

    -- Summer Bank Holiday (last Monday in August)
    INSERT INTO app.bank_holidays (tenant_id, name, date, country_code, region)
    VALUES (p_tenant_id, 'Summer Bank Holiday',
            app.last_monday_in_month(p_year, 8),
            'GB', NULL)
    ON CONFLICT (tenant_id, date, country_code, COALESCE(region, '')) DO NOTHING;

    -- Christmas Day
    INSERT INTO app.bank_holidays (tenant_id, name, date, country_code, region)
    VALUES (p_tenant_id, 'Christmas Day',
            app.substitute_christmas(p_year, 25),
            'GB', NULL)
    ON CONFLICT (tenant_id, date, country_code, COALESCE(region, '')) DO NOTHING;

    -- Boxing Day
    INSERT INTO app.bank_holidays (tenant_id, name, date, country_code, region)
    VALUES (p_tenant_id, 'Boxing Day',
            app.substitute_christmas(p_year, 26),
            'GB', NULL)
    ON CONFLICT (tenant_id, date, country_code, COALESCE(region, '')) DO NOTHING;

    -- Return total holidays inserted
    SELECT count(*) INTO v_count
    FROM app.bank_holidays
    WHERE tenant_id = p_tenant_id
      AND EXTRACT(YEAR FROM date) = p_year;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION app.seed_uk_bank_holidays IS
  'Seeds default England & Wales bank holidays for a tenant and year. Idempotent via ON CONFLICT.';

-- -----------------------------------------------------------------------------
-- 4. Helper functions for date calculations
-- -----------------------------------------------------------------------------

-- Substitute weekend date to next Monday
CREATE OR REPLACE FUNCTION app.substitute_if_weekend(p_date date)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- 0 = Sunday, 6 = Saturday
    IF EXTRACT(DOW FROM p_date) = 6 THEN
        RETURN p_date + 2; -- Saturday -> Monday
    ELSIF EXTRACT(DOW FROM p_date) = 0 THEN
        RETURN p_date + 1; -- Sunday -> Monday
    END IF;
    RETURN p_date;
END;
$$;

-- First Monday of a month
CREATE OR REPLACE FUNCTION app.first_monday_in_month(p_year integer, p_month integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_date date;
    v_dow integer;
BEGIN
    v_date := make_date(p_year, p_month, 1);
    v_dow := EXTRACT(DOW FROM v_date)::integer;
    -- DOW: 0=Sun, 1=Mon, ..., 6=Sat
    IF v_dow = 1 THEN
        RETURN v_date;
    ELSIF v_dow = 0 THEN
        RETURN v_date + 1;
    ELSE
        RETURN v_date + (8 - v_dow);
    END IF;
END;
$$;

-- Last Monday of a month
CREATE OR REPLACE FUNCTION app.last_monday_in_month(p_year integer, p_month integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_last_day date;
    v_dow integer;
BEGIN
    -- Last day of month
    v_last_day := (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::date;
    v_dow := EXTRACT(DOW FROM v_last_day)::integer;
    -- DOW: 0=Sun, 1=Mon, ..., 6=Sat
    IF v_dow = 1 THEN
        RETURN v_last_day;
    ELSIF v_dow = 0 THEN
        RETURN v_last_day - 6;
    ELSE
        RETURN v_last_day - (v_dow - 1);
    END IF;
END;
$$;

-- Christmas/Boxing Day substitution
CREATE OR REPLACE FUNCTION app.substitute_christmas(p_year integer, p_day integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_christmas date;
    v_christmas_dow integer;
    v_target date;
    v_target_dow integer;
BEGIN
    v_christmas := make_date(p_year, 12, 25);
    v_christmas_dow := EXTRACT(DOW FROM v_christmas)::integer;

    IF p_day = 25 THEN
        -- Christmas Day substitution
        IF v_christmas_dow = 6 THEN RETURN make_date(p_year, 12, 27); -- Sat -> Mon
        ELSIF v_christmas_dow = 0 THEN RETURN make_date(p_year, 12, 27); -- Sun -> Tue
        ELSE RETURN v_christmas;
        END IF;
    ELSE
        -- Boxing Day substitution
        IF v_christmas_dow = 5 THEN RETURN make_date(p_year, 12, 28); -- Fri (Christmas) -> Boxing Sat -> Mon
        ELSIF v_christmas_dow = 6 THEN RETURN make_date(p_year, 12, 28); -- Sat (Christmas on Mon) -> Boxing Tue
        ELSIF v_christmas_dow = 0 THEN RETURN make_date(p_year, 12, 26); -- Sun (Christmas on Tue) -> Boxing stays Mon
        END IF;

        -- Default: check Boxing Day itself
        v_target := make_date(p_year, 12, 26);
        v_target_dow := EXTRACT(DOW FROM v_target)::integer;
        IF v_target_dow = 6 THEN RETURN make_date(p_year, 12, 28); -- Sat -> Mon
        ELSIF v_target_dow = 0 THEN RETURN make_date(p_year, 12, 28); -- Sun -> Mon
        ELSE RETURN v_target;
        END IF;
    END IF;
END;
$$;

-- =============================================================================
-- Grants
-- =============================================================================

GRANT EXECUTE ON FUNCTION app.seed_uk_bank_holidays(uuid, integer) TO hris_app;
GRANT EXECUTE ON FUNCTION app.substitute_if_weekend(date) TO hris_app;
GRANT EXECUTE ON FUNCTION app.first_monday_in_month(integer, integer) TO hris_app;
GRANT EXECUTE ON FUNCTION app.last_monday_in_month(integer, integer) TO hris_app;
GRANT EXECUTE ON FUNCTION app.substitute_christmas(integer, integer) TO hris_app;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- REVOKE EXECUTE ON FUNCTION app.substitute_christmas(integer, integer) FROM hris_app;
-- REVOKE EXECUTE ON FUNCTION app.last_monday_in_month(integer, integer) FROM hris_app;
-- REVOKE EXECUTE ON FUNCTION app.first_monday_in_month(integer, integer) FROM hris_app;
-- REVOKE EXECUTE ON FUNCTION app.substitute_if_weekend(date) FROM hris_app;
-- REVOKE EXECUTE ON FUNCTION app.seed_uk_bank_holidays(uuid, integer) FROM hris_app;
-- DROP FUNCTION IF EXISTS app.substitute_christmas(integer, integer);
-- DROP FUNCTION IF EXISTS app.last_monday_in_month(integer, integer);
-- DROP FUNCTION IF EXISTS app.first_monday_in_month(integer, integer);
-- DROP FUNCTION IF EXISTS app.substitute_if_weekend(date);
-- DROP FUNCTION IF EXISTS app.seed_uk_bank_holidays(uuid, integer);
-- ALTER TABLE app.tenants DROP CONSTRAINT IF EXISTS tenants_leave_year_start_format;
-- ALTER TABLE app.tenants DROP COLUMN IF EXISTS leave_year_start;
-- ALTER TABLE app.leave_policies DROP CONSTRAINT IF EXISTS leave_policies_contracted_days_check;
-- ALTER TABLE app.leave_policies DROP COLUMN IF EXISTS contracted_days_per_week;
