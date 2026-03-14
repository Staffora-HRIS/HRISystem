-- =============================================================================
-- Migration 0125: Statutory Leave (Maternity/Paternity/Shared Parental)
--
-- UK statutory leave management for HRIS platform.
-- Covers maternity, paternity, shared parental, and adoption leave.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enum: statutory_leave_type
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statutory_leave_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.statutory_leave_type AS ENUM (
      'maternity',
      'paternity',
      'shared_parental',
      'adoption'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Enum: statutory_leave_status
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statutory_leave_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.statutory_leave_status AS ENUM (
      'planned',
      'active',
      'completed',
      'cancelled'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Enum: statutory_leave_pay_type
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statutory_leave_pay_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
    CREATE TYPE app.statutory_leave_pay_type AS ENUM (
      '90_percent',
      'flat_rate',
      'unpaid'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Table: statutory_leave_records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.statutory_leave_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  employee_id           uuid NOT NULL,
  leave_type            app.statutory_leave_type NOT NULL,
  expected_date         date NOT NULL,
  actual_date           date,
  start_date            date NOT NULL,
  end_date              date NOT NULL,
  total_weeks           integer NOT NULL,
  matb1_received        boolean NOT NULL DEFAULT false,
  matb1_date            date,
  partner_employee_id   uuid,
  curtailment_date      date,
  status                app.statutory_leave_status NOT NULL DEFAULT 'planned',
  average_weekly_earnings numeric(10,2),
  notes                 text,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Foreign keys
  CONSTRAINT fk_statutory_leave_tenant
    FOREIGN KEY (tenant_id) REFERENCES app.tenants(id),
  CONSTRAINT fk_statutory_leave_employee
    FOREIGN KEY (employee_id) REFERENCES app.employees(id),
  CONSTRAINT fk_statutory_leave_partner
    FOREIGN KEY (partner_employee_id) REFERENCES app.employees(id),

  -- Business constraints
  CONSTRAINT chk_statutory_leave_dates
    CHECK (end_date >= start_date),
  CONSTRAINT chk_statutory_leave_weeks
    CHECK (total_weeks > 0),
  CONSTRAINT chk_statutory_leave_matb1
    CHECK (
      CASE WHEN leave_type = 'maternity' AND matb1_received = true
           THEN matb1_date IS NOT NULL
           ELSE true
      END
    ),
  CONSTRAINT chk_statutory_leave_curtailment
    CHECK (
      CASE WHEN curtailment_date IS NOT NULL
           THEN curtailment_date >= start_date AND curtailment_date <= end_date
           ELSE true
      END
    )
);

-- ---------------------------------------------------------------------------
-- Table: statutory_leave_pay_periods
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.statutory_leave_pay_periods (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  leave_record_id   uuid NOT NULL,
  week_number       integer NOT NULL,
  start_date        date NOT NULL,
  end_date          date NOT NULL,
  pay_type          app.statutory_leave_pay_type NOT NULL,
  amount            numeric(10,2) NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Foreign keys
  CONSTRAINT fk_statutory_pay_tenant
    FOREIGN KEY (tenant_id) REFERENCES app.tenants(id),
  CONSTRAINT fk_statutory_pay_leave_record
    FOREIGN KEY (leave_record_id) REFERENCES app.statutory_leave_records(id) ON DELETE CASCADE,

  -- Business constraints
  CONSTRAINT chk_statutory_pay_week
    CHECK (week_number > 0),
  CONSTRAINT chk_statutory_pay_amount
    CHECK (amount >= 0),
  CONSTRAINT chk_statutory_pay_dates
    CHECK (end_date >= start_date),

  -- Unique constraint: one pay period per week per leave record
  CONSTRAINT uq_statutory_pay_week
    UNIQUE (leave_record_id, week_number)
);

-- ---------------------------------------------------------------------------
-- Table: statutory_leave_kit_days
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.statutory_leave_kit_days (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  leave_record_id   uuid NOT NULL,
  work_date         date NOT NULL,
  hours_worked      numeric(4,1) NOT NULL DEFAULT 0,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Foreign keys
  CONSTRAINT fk_statutory_kit_tenant
    FOREIGN KEY (tenant_id) REFERENCES app.tenants(id),
  CONSTRAINT fk_statutory_kit_leave_record
    FOREIGN KEY (leave_record_id) REFERENCES app.statutory_leave_records(id) ON DELETE CASCADE,

  -- Business constraints
  CONSTRAINT chk_statutory_kit_hours
    CHECK (hours_worked > 0 AND hours_worked <= 24),

  -- Unique constraint: one entry per date per leave record
  CONSTRAINT uq_statutory_kit_date
    UNIQUE (leave_record_id, work_date)
);

-- ---------------------------------------------------------------------------
-- RLS: statutory_leave_records
-- ---------------------------------------------------------------------------
ALTER TABLE app.statutory_leave_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.statutory_leave_records
  USING (
    tenant_id = current_setting('app.current_tenant')::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert ON app.statutory_leave_records
  FOR INSERT WITH CHECK (
    tenant_id = current_setting('app.current_tenant')::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

-- ---------------------------------------------------------------------------
-- RLS: statutory_leave_pay_periods
-- ---------------------------------------------------------------------------
ALTER TABLE app.statutory_leave_pay_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.statutory_leave_pay_periods
  USING (
    tenant_id = current_setting('app.current_tenant')::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert ON app.statutory_leave_pay_periods
  FOR INSERT WITH CHECK (
    tenant_id = current_setting('app.current_tenant')::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

-- ---------------------------------------------------------------------------
-- RLS: statutory_leave_kit_days
-- ---------------------------------------------------------------------------
ALTER TABLE app.statutory_leave_kit_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.statutory_leave_kit_days
  USING (
    tenant_id = current_setting('app.current_tenant')::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert ON app.statutory_leave_kit_days
  FOR INSERT WITH CHECK (
    tenant_id = current_setting('app.current_tenant')::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Main record lookups
CREATE INDEX IF NOT EXISTS idx_statutory_leave_tenant
  ON app.statutory_leave_records (tenant_id);

CREATE INDEX IF NOT EXISTS idx_statutory_leave_employee
  ON app.statutory_leave_records (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_statutory_leave_status
  ON app.statutory_leave_records (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_statutory_leave_type_status
  ON app.statutory_leave_records (tenant_id, leave_type, status);

CREATE INDEX IF NOT EXISTS idx_statutory_leave_dates
  ON app.statutory_leave_records (tenant_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_statutory_leave_partner
  ON app.statutory_leave_records (partner_employee_id)
  WHERE partner_employee_id IS NOT NULL;

-- Pay period lookups
CREATE INDEX IF NOT EXISTS idx_statutory_pay_tenant
  ON app.statutory_leave_pay_periods (tenant_id);

CREATE INDEX IF NOT EXISTS idx_statutory_pay_leave_record
  ON app.statutory_leave_pay_periods (leave_record_id);

-- KIT day lookups
CREATE INDEX IF NOT EXISTS idx_statutory_kit_tenant
  ON app.statutory_leave_kit_days (tenant_id);

CREATE INDEX IF NOT EXISTS idx_statutory_kit_leave_record
  ON app.statutory_leave_kit_days (leave_record_id);

-- ---------------------------------------------------------------------------
-- Grants for application role
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON app.statutory_leave_records TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.statutory_leave_pay_periods TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.statutory_leave_kit_days TO hris_app;

-- ---------------------------------------------------------------------------
-- Updated-at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER statutory_leave_records_updated_at
  BEFORE UPDATE ON app.statutory_leave_records
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at_column();
