-- =============================================================================
-- Migration 0212: Flexible Benefits Fund Allocation
-- =============================================================================
-- Adds tables for managing employee flex benefit funds (credit pools) and
-- individual allocations against available benefit plans.
--
-- Tables:
--   app.flex_benefit_funds       - Per-employee annual credit pool
--   app.flex_benefit_allocations - Individual allocations from a fund to a plan
--
-- RLS: Both tables enforce tenant isolation.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Allocation status enum
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flex_allocation_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.flex_allocation_status AS ENUM ('pending', 'confirmed', 'cancelled');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Flex Benefit Funds table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.flex_benefit_funds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES app.tenants(id),
  employee_id   uuid NOT NULL REFERENCES app.employees(id),

  -- Credit pool for this period
  annual_credits    decimal(12,2) NOT NULL CHECK (annual_credits >= 0),
  used_credits      decimal(12,2) NOT NULL DEFAULT 0 CHECK (used_credits >= 0),
  remaining_credits decimal(12,2) NOT NULL GENERATED ALWAYS AS (annual_credits - used_credits) STORED,

  -- Period window
  period_start  date NOT NULL,
  period_end    date NOT NULL,

  -- Metadata
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_by    uuid,

  -- Constraints
  CONSTRAINT chk_flex_fund_period CHECK (period_end > period_start),
  CONSTRAINT chk_flex_fund_used_credits CHECK (used_credits <= annual_credits)
);

-- Prevent overlapping fund periods per employee within a tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_flex_fund_employee_period
  ON app.flex_benefit_funds (tenant_id, employee_id, period_start, period_end);

-- Look-up indexes
CREATE INDEX IF NOT EXISTS idx_flex_fund_tenant     ON app.flex_benefit_funds (tenant_id);
CREATE INDEX IF NOT EXISTS idx_flex_fund_employee   ON app.flex_benefit_funds (employee_id);
CREATE INDEX IF NOT EXISTS idx_flex_fund_period     ON app.flex_benefit_funds (period_start, period_end);

-- RLS
ALTER TABLE app.flex_benefit_funds ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
  ON app.flex_benefit_funds
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert
  ON app.flex_benefit_funds
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- ---------------------------------------------------------------------------
-- 3. Flex Benefit Allocations table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.flex_benefit_allocations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES app.tenants(id),
  fund_id           uuid NOT NULL REFERENCES app.flex_benefit_funds(id),
  benefit_plan_id   uuid NOT NULL REFERENCES app.benefit_plans(id),

  -- Allocation amount
  credits_allocated decimal(12,2) NOT NULL CHECK (credits_allocated > 0),

  -- Status tracking
  status            app.flex_allocation_status NOT NULL DEFAULT 'pending',

  -- Metadata
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  confirmed_at      timestamptz,
  cancelled_at      timestamptz,
  cancelled_reason  text,
  created_by        uuid,

  -- No duplicate allocation of the same plan in the same fund while active
  CONSTRAINT uq_flex_alloc_fund_plan_active
    EXCLUDE USING btree (fund_id WITH =, benefit_plan_id WITH =)
    WHERE (status != 'cancelled')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_flex_alloc_tenant   ON app.flex_benefit_allocations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_flex_alloc_fund     ON app.flex_benefit_allocations (fund_id);
CREATE INDEX IF NOT EXISTS idx_flex_alloc_plan     ON app.flex_benefit_allocations (benefit_plan_id);
CREATE INDEX IF NOT EXISTS idx_flex_alloc_status   ON app.flex_benefit_allocations (status);

-- RLS
ALTER TABLE app.flex_benefit_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
  ON app.flex_benefit_allocations
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert
  ON app.flex_benefit_allocations
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- ---------------------------------------------------------------------------
-- 4. Benefit plan credit cost column
-- ---------------------------------------------------------------------------
-- Adds a credit_cost column to benefit_plans so administrators can assign a
-- credit price to each plan for flex-fund purposes.
-- Plans without a credit_cost are not eligible for flex-fund allocation.
-- ---------------------------------------------------------------------------
ALTER TABLE app.benefit_plans
  ADD COLUMN IF NOT EXISTS credit_cost decimal(12,2) DEFAULT NULL;

-- Index for querying flex-eligible plans
CREATE INDEX IF NOT EXISTS idx_benefit_plans_flex_eligible
  ON app.benefit_plans (tenant_id)
  WHERE credit_cost IS NOT NULL AND is_active = true;

-- ---------------------------------------------------------------------------
-- 5. Grant permissions to application role
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON app.flex_benefit_funds TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.flex_benefit_allocations TO hris_app;

-- ---------------------------------------------------------------------------
-- 6. Trigger: auto-update updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_flex_benefit_funds_updated_at
  BEFORE UPDATE ON app.flex_benefit_funds
  FOR EACH ROW
  EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE TRIGGER trg_flex_benefit_allocations_updated_at
  BEFORE UPDATE ON app.flex_benefit_allocations
  FOR EACH ROW
  EXECUTE FUNCTION app.set_updated_at();
