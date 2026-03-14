-- Migration: 0146_unpaid_parental_leave
-- Created: 2026-03-13
-- Description: Unpaid parental leave tracking for UK compliance (TODO-112).
--
--              UK Employment Rights Act 1996, Part VIII & Maternity and
--              Parental Leave etc. Regulations 1999:
--              - 18 weeks per child (up to age 18)
--              - Minimum 1-week blocks
--              - Maximum 4 weeks per year per child
--
--              Tables:
--              - parental_leave_entitlements: tracks per-child entitlements
--              - parental_leave_bookings: individual booking records
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- parental_leave_entitlements
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.parental_leave_entitlements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES app.tenants(id),
  employee_id           uuid NOT NULL REFERENCES app.employees(id),
  child_name            varchar(255) NOT NULL,
  child_date_of_birth   date NOT NULL,
  total_weeks_entitled  numeric(4,1) NOT NULL DEFAULT 18,
  weeks_used            numeric(4,1) NOT NULL DEFAULT 0,
  weeks_remaining       numeric(4,1) GENERATED ALWAYS AS (total_weeks_entitled - weeks_used) STORED,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Business constraint: weeks_used cannot exceed total entitlement
  CONSTRAINT chk_weeks_used_not_negative CHECK (weeks_used >= 0),
  CONSTRAINT chk_weeks_used_within_entitlement CHECK (weeks_used <= total_weeks_entitled)
);

-- Enable RLS
ALTER TABLE app.parental_leave_entitlements ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY tenant_isolation ON app.parental_leave_entitlements
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.parental_leave_entitlements
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass (for admin/migration use)
CREATE POLICY system_bypass ON app.parental_leave_entitlements
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.parental_leave_entitlements
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Indexes
CREATE INDEX idx_parental_leave_entitlements_tenant_employee
  ON app.parental_leave_entitlements (tenant_id, employee_id);

CREATE INDEX idx_parental_leave_entitlements_child_dob
  ON app.parental_leave_entitlements (tenant_id, employee_id, child_date_of_birth);

-- Prevent duplicate entitlements for same child (same employee, same DOB, same name)
CREATE UNIQUE INDEX idx_parental_leave_entitlements_unique_child
  ON app.parental_leave_entitlements (tenant_id, employee_id, child_name, child_date_of_birth);

-- Updated-at trigger
CREATE TRIGGER set_parental_leave_entitlements_updated_at
  BEFORE UPDATE ON app.parental_leave_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at_column();


-- -----------------------------------------------------------------------------
-- parental_leave_bookings
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.parental_leave_bookings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES app.tenants(id),
  employee_id       uuid NOT NULL REFERENCES app.employees(id),
  entitlement_id    uuid NOT NULL REFERENCES app.parental_leave_entitlements(id),
  leave_year_start  date NOT NULL,
  weeks_booked      numeric(4,1) NOT NULL,
  start_date        date NOT NULL,
  end_date          date NOT NULL,
  status            varchar(20) NOT NULL DEFAULT 'requested',
  approved_by       uuid,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Minimum 1 week blocks (UK regulation)
  CONSTRAINT chk_weeks_booked_minimum CHECK (weeks_booked >= 1),
  -- Status must be one of the allowed values
  CONSTRAINT chk_booking_status CHECK (status IN ('requested', 'approved', 'rejected', 'cancelled')),
  -- end_date must be after start_date
  CONSTRAINT chk_booking_dates CHECK (end_date >= start_date)
);

-- Enable RLS
ALTER TABLE app.parental_leave_bookings ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY tenant_isolation ON app.parental_leave_bookings
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.parental_leave_bookings
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass (for admin/migration use)
CREATE POLICY system_bypass ON app.parental_leave_bookings
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.parental_leave_bookings
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- Indexes
CREATE INDEX idx_parental_leave_bookings_tenant_employee
  ON app.parental_leave_bookings (tenant_id, employee_id);

CREATE INDEX idx_parental_leave_bookings_entitlement
  ON app.parental_leave_bookings (entitlement_id);

CREATE INDEX idx_parental_leave_bookings_status
  ON app.parental_leave_bookings (tenant_id, status);

CREATE INDEX idx_parental_leave_bookings_dates
  ON app.parental_leave_bookings (tenant_id, start_date, end_date);

-- Index for year-per-child queries (max 4 weeks per year per child)
CREATE INDEX idx_parental_leave_bookings_year_child
  ON app.parental_leave_bookings (entitlement_id, leave_year_start, status);

-- Updated-at trigger
CREATE TRIGGER set_parental_leave_bookings_updated_at
  BEFORE UPDATE ON app.parental_leave_bookings
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at_column();


-- =============================================================================
-- DOWN Migration
-- =============================================================================
-- DROP TABLE IF EXISTS app.parental_leave_bookings;
-- DROP TABLE IF EXISTS app.parental_leave_entitlements;
