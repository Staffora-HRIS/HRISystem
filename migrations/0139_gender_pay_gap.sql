-- Migration: 0139_gender_pay_gap
-- Created: 2026-03-13
-- Description: Create the gender_pay_gap_reports table for UK gender pay gap reporting
--              UK organisations with 250+ employees must publish annual gender pay gap data
--              Reports are calculated from employee compensation and personal data
--              Supports draft → calculated → published lifecycle

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Report Status Type
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE app.gpg_report_status AS ENUM ('draft', 'calculated', 'published');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Gender Pay Gap Reports Table
-- -----------------------------------------------------------------------------
-- Stores calculated gender pay gap data for annual reporting
-- Each row represents a complete report for a given reporting year
-- snapshot_date is typically April 5 (UK statutory snapshot date)
CREATE TABLE IF NOT EXISTS app.gender_pay_gap_reports (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this report
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Reporting parameters
    snapshot_date date NOT NULL,               -- Date employees are counted (typically April 5)
    reporting_year integer NOT NULL,           -- Calendar year of the report

    -- Population counts
    total_employees integer NOT NULL DEFAULT 0,
    male_count integer NOT NULL DEFAULT 0,
    female_count integer NOT NULL DEFAULT 0,

    -- Hourly pay gaps (percentage difference)
    -- Positive = men paid more, negative = women paid more
    mean_hourly_pay_gap numeric(5, 2),
    median_hourly_pay_gap numeric(5, 2),

    -- Bonus pay gaps (percentage difference)
    mean_bonus_gap numeric(5, 2),
    median_bonus_gap numeric(5, 2),

    -- Proportion receiving bonus pay (percentage)
    male_bonus_pct numeric(5, 2),
    female_bonus_pct numeric(5, 2),

    -- Pay quartile distribution (percentage of each gender in each quartile)
    lower_quartile_male_pct numeric(5, 2),
    lower_quartile_female_pct numeric(5, 2),
    lower_middle_quartile_male_pct numeric(5, 2),
    lower_middle_quartile_female_pct numeric(5, 2),
    upper_middle_quartile_male_pct numeric(5, 2),
    upper_middle_quartile_female_pct numeric(5, 2),
    upper_quartile_male_pct numeric(5, 2),
    upper_quartile_female_pct numeric(5, 2),

    -- Report lifecycle
    status app.gpg_report_status NOT NULL DEFAULT 'draft',
    published_at timestamptz,

    -- Who calculated/approved this report
    calculated_by uuid REFERENCES app.users(id),

    -- Optional notes (methodology, exclusions, narrative)
    notes text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- One report per tenant per reporting year
    CONSTRAINT gpg_reports_year_unique UNIQUE (tenant_id, reporting_year),

    -- Snapshot date must be a valid date
    CONSTRAINT gpg_reports_snapshot_valid CHECK (
        snapshot_date IS NOT NULL
    ),

    -- Reporting year must be reasonable (2017 = first UK GPG reporting year)
    CONSTRAINT gpg_reports_year_range CHECK (
        reporting_year >= 2017 AND reporting_year <= 2099
    ),

    -- Population counts must be non-negative
    CONSTRAINT gpg_reports_counts_non_negative CHECK (
        total_employees >= 0 AND male_count >= 0 AND female_count >= 0
    ),

    -- Male + female count should not exceed total (other/prefer_not_to_say excluded)
    CONSTRAINT gpg_reports_counts_consistent CHECK (
        male_count + female_count <= total_employees
    ),

    -- Published reports must have published_at timestamp
    CONSTRAINT gpg_reports_published_has_date CHECK (
        status != 'published' OR published_at IS NOT NULL
    ),

    -- Percentage values must be in valid range
    CONSTRAINT gpg_reports_bonus_pct_range CHECK (
        (male_bonus_pct IS NULL OR (male_bonus_pct >= 0 AND male_bonus_pct <= 100)) AND
        (female_bonus_pct IS NULL OR (female_bonus_pct >= 0 AND female_bonus_pct <= 100))
    ),

    -- Quartile percentages must be in valid range
    CONSTRAINT gpg_reports_quartile_range CHECK (
        (lower_quartile_male_pct IS NULL OR (lower_quartile_male_pct >= 0 AND lower_quartile_male_pct <= 100)) AND
        (lower_quartile_female_pct IS NULL OR (lower_quartile_female_pct >= 0 AND lower_quartile_female_pct <= 100)) AND
        (lower_middle_quartile_male_pct IS NULL OR (lower_middle_quartile_male_pct >= 0 AND lower_middle_quartile_male_pct <= 100)) AND
        (lower_middle_quartile_female_pct IS NULL OR (lower_middle_quartile_female_pct >= 0 AND lower_middle_quartile_female_pct <= 100)) AND
        (upper_middle_quartile_male_pct IS NULL OR (upper_middle_quartile_male_pct >= 0 AND upper_middle_quartile_male_pct <= 100)) AND
        (upper_middle_quartile_female_pct IS NULL OR (upper_middle_quartile_female_pct >= 0 AND upper_middle_quartile_female_pct <= 100)) AND
        (upper_quartile_male_pct IS NULL OR (upper_quartile_male_pct >= 0 AND upper_quartile_male_pct <= 100)) AND
        (upper_quartile_female_pct IS NULL OR (upper_quartile_female_pct >= 0 AND upper_quartile_female_pct <= 100))
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + reporting year
CREATE UNIQUE INDEX IF NOT EXISTS idx_gpg_reports_tenant_year
    ON app.gender_pay_gap_reports(tenant_id, reporting_year);

-- Find reports by status (e.g., all published reports)
CREATE INDEX IF NOT EXISTS idx_gpg_reports_tenant_status
    ON app.gender_pay_gap_reports(tenant_id, status);

-- Find reports by snapshot date
CREATE INDEX IF NOT EXISTS idx_gpg_reports_snapshot_date
    ON app.gender_pay_gap_reports(tenant_id, snapshot_date);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.gender_pay_gap_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see reports for their current tenant
CREATE POLICY tenant_isolation ON app.gender_pay_gap_reports
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.gender_pay_gap_reports
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_gpg_reports_updated_at
    BEFORE UPDATE ON app.gender_pay_gap_reports
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.gender_pay_gap_reports IS 'UK gender pay gap reports — annual statutory reporting for organisations with 250+ employees';
COMMENT ON COLUMN app.gender_pay_gap_reports.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.gender_pay_gap_reports.tenant_id IS 'Tenant that owns this report';
COMMENT ON COLUMN app.gender_pay_gap_reports.snapshot_date IS 'Date employees are counted (typically April 5 for UK reporting)';
COMMENT ON COLUMN app.gender_pay_gap_reports.reporting_year IS 'Calendar year of the report';
COMMENT ON COLUMN app.gender_pay_gap_reports.total_employees IS 'Total employees counted on snapshot date';
COMMENT ON COLUMN app.gender_pay_gap_reports.male_count IS 'Number of male employees counted';
COMMENT ON COLUMN app.gender_pay_gap_reports.female_count IS 'Number of female employees counted';
COMMENT ON COLUMN app.gender_pay_gap_reports.mean_hourly_pay_gap IS 'Mean hourly pay gap percentage (positive = men paid more)';
COMMENT ON COLUMN app.gender_pay_gap_reports.median_hourly_pay_gap IS 'Median hourly pay gap percentage';
COMMENT ON COLUMN app.gender_pay_gap_reports.mean_bonus_gap IS 'Mean bonus gap percentage';
COMMENT ON COLUMN app.gender_pay_gap_reports.median_bonus_gap IS 'Median bonus gap percentage';
COMMENT ON COLUMN app.gender_pay_gap_reports.male_bonus_pct IS 'Percentage of males receiving bonus pay';
COMMENT ON COLUMN app.gender_pay_gap_reports.female_bonus_pct IS 'Percentage of females receiving bonus pay';
COMMENT ON COLUMN app.gender_pay_gap_reports.status IS 'Report lifecycle status: draft, calculated, published';
COMMENT ON COLUMN app.gender_pay_gap_reports.published_at IS 'Timestamp when report was published';
COMMENT ON COLUMN app.gender_pay_gap_reports.calculated_by IS 'User who triggered the calculation';
COMMENT ON COLUMN app.gender_pay_gap_reports.notes IS 'Optional notes about methodology or exclusions';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_gpg_reports_updated_at ON app.gender_pay_gap_reports;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.gender_pay_gap_reports;
-- DROP POLICY IF EXISTS tenant_isolation ON app.gender_pay_gap_reports;
-- DROP INDEX IF EXISTS app.idx_gpg_reports_snapshot_date;
-- DROP INDEX IF EXISTS app.idx_gpg_reports_tenant_status;
-- DROP INDEX IF EXISTS app.idx_gpg_reports_tenant_year;
-- DROP TABLE IF EXISTS app.gender_pay_gap_reports;
-- DROP TYPE IF EXISTS app.gpg_report_status;
