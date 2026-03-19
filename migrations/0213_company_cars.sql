-- Migration: 0213_company_cars
-- Created: 2026-03-19
-- Description: Create company_cars and car_allowances tables for vehicle benefit tracking with BIK calculation (TODO-201)
--   - company_cars: tracks company car assignments including list price, CO2, fuel type for BIK
--   - car_allowances: tracks car allowance payments with effective dating
--   - UK HMRC: BIK = list_price x appropriate_percentage (based on CO2 emissions and fuel type)
--   - RLS enforced for multi-tenant isolation
--   - Effective dating on car_allowances with overlap prevention

-- =============================================================================
-- 1. Create fuel_type enum
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'car_fuel_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
        CREATE TYPE app.car_fuel_type AS ENUM ('petrol', 'diesel', 'hybrid', 'electric');
    END IF;
END
$$;

-- =============================================================================
-- 2. Create company_cars table
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.company_cars (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    employee_id               uuid NOT NULL REFERENCES app.employees(id),

    -- Vehicle details
    registration              varchar(20) NOT NULL,
    make                      varchar(100) NOT NULL,
    model                     varchar(100) NOT NULL,

    -- BIK-relevant financial details (HMRC)
    list_price                numeric(12, 2) NOT NULL CHECK (list_price > 0),
    co2_emissions             integer NOT NULL CHECK (co2_emissions >= 0),
    fuel_type                 app.car_fuel_type NOT NULL,

    -- Dates
    date_available            date NOT NULL,
    date_returned             date,

    -- Fuel benefit
    private_fuel_provided     boolean NOT NULL DEFAULT false,

    -- Audit columns
    created_by                uuid,
    updated_by                uuid,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT cc_valid_dates CHECK (date_returned IS NULL OR date_returned >= date_available)
);

-- =============================================================================
-- 3. Create car_allowances table (with effective dating)
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.car_allowances (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 uuid NOT NULL,
    employee_id               uuid NOT NULL REFERENCES app.employees(id),

    -- Financial details
    monthly_amount            numeric(10, 2) NOT NULL CHECK (monthly_amount > 0),

    -- Effective dating
    effective_from            date NOT NULL,
    effective_to              date,

    -- Audit columns
    created_by                uuid,
    updated_by                uuid,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT ca_valid_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- =============================================================================
-- 4. Enable RLS on company_cars
-- =============================================================================

ALTER TABLE app.company_cars ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_cars_tenant_isolation ON app.company_cars
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY company_cars_tenant_isolation_insert ON app.company_cars
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- 5. Enable RLS on car_allowances
-- =============================================================================

ALTER TABLE app.car_allowances ENABLE ROW LEVEL SECURITY;

CREATE POLICY car_allowances_tenant_isolation ON app.car_allowances
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY car_allowances_tenant_isolation_insert ON app.car_allowances
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- 6. Indexes for company_cars
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_company_cars_tenant_employee
    ON app.company_cars(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_company_cars_active
    ON app.company_cars(tenant_id, employee_id)
    WHERE date_returned IS NULL;

CREATE INDEX IF NOT EXISTS idx_company_cars_registration
    ON app.company_cars(tenant_id, registration);

CREATE INDEX IF NOT EXISTS idx_company_cars_fuel_type
    ON app.company_cars(tenant_id, fuel_type);

-- =============================================================================
-- 7. Indexes for car_allowances
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_car_allowances_tenant_employee
    ON app.car_allowances(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_car_allowances_current
    ON app.car_allowances(tenant_id, employee_id)
    WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_car_allowances_date_range
    ON app.car_allowances(tenant_id, employee_id, effective_from, effective_to);

-- =============================================================================
-- 8. Overlap prevention exclusion constraint for car_allowances
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE app.car_allowances
    ADD CONSTRAINT car_allowances_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        employee_id WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    );

-- =============================================================================
-- 9. Auto-update updated_at triggers
-- =============================================================================

CREATE OR REPLACE TRIGGER update_company_cars_updated_at
    BEFORE UPDATE ON app.company_cars
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_car_allowances_updated_at
    BEFORE UPDATE ON app.car_allowances
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- 10. Grant permissions to app role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.company_cars TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.car_allowances TO hris_app;

-- =============================================================================
-- 11. Comments
-- =============================================================================

COMMENT ON TABLE app.company_cars IS 'Company car assignments for employees, tracking vehicle details and HMRC BIK-relevant data (list price, CO2 emissions, fuel type).';
COMMENT ON COLUMN app.company_cars.registration IS 'UK vehicle registration number.';
COMMENT ON COLUMN app.company_cars.list_price IS 'P11D list price of the vehicle in GBP, used for BIK calculation per HMRC rules.';
COMMENT ON COLUMN app.company_cars.co2_emissions IS 'CO2 emissions in g/km, used to determine the BIK appropriate percentage per HMRC tables.';
COMMENT ON COLUMN app.company_cars.fuel_type IS 'Fuel type of the vehicle: petrol, diesel, hybrid, or electric. Affects BIK appropriate percentage.';
COMMENT ON COLUMN app.company_cars.date_available IS 'Date the company car was first made available to the employee.';
COMMENT ON COLUMN app.company_cars.date_returned IS 'Date the company car was returned. NULL means the car is still assigned.';
COMMENT ON COLUMN app.company_cars.private_fuel_provided IS 'Whether the employer provides fuel for private use. Triggers additional fuel BIK charge.';

COMMENT ON TABLE app.car_allowances IS 'Car allowance payments to employees as an alternative to a company car, with effective dating.';
COMMENT ON COLUMN app.car_allowances.monthly_amount IS 'Monthly car allowance amount in GBP.';
COMMENT ON COLUMN app.car_allowances.effective_from IS 'Date from which this car allowance rate applies.';
COMMENT ON COLUMN app.car_allowances.effective_to IS 'Date until which this car allowance rate applies. NULL means currently active.';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_car_allowances_updated_at ON app.car_allowances;
-- DROP TRIGGER IF EXISTS update_company_cars_updated_at ON app.company_cars;
-- DROP TABLE IF EXISTS app.car_allowances;
-- DROP TABLE IF EXISTS app.company_cars;
-- DROP TYPE IF EXISTS app.car_fuel_type;
