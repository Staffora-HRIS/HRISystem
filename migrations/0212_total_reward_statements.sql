-- =============================================================================
-- Migration 0212: Total Reward Statements
-- =============================================================================
-- Caches generated total reward statements for employees.
-- Each statement captures a point-in-time snapshot of the employee's total
-- compensation package including salary, bonuses, pension, benefits, and
-- holiday entitlement.
--
-- Reversible: DROP TABLE app.total_reward_statements;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enum: statement status
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE app.total_reward_statement_status AS ENUM (
    'draft',
    'generated',
    'pdf_requested',
    'pdf_generated',
    'published'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Table: total_reward_statements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.total_reward_statements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  employee_id       uuid NOT NULL,

  -- Statement period
  statement_date    date NOT NULL DEFAULT CURRENT_DATE,
  period_start      date NOT NULL,
  period_end        date NOT NULL,

  -- Compensation breakdown (stored as numeric for precision, in GBP)
  base_salary            numeric(12,2) NOT NULL DEFAULT 0,
  bonus_pay              numeric(12,2) NOT NULL DEFAULT 0,
  overtime_pay           numeric(12,2) NOT NULL DEFAULT 0,
  pension_employer       numeric(12,2) NOT NULL DEFAULT 0,
  pension_employee       numeric(12,2) NOT NULL DEFAULT 0,
  benefits_employer      numeric(12,2) NOT NULL DEFAULT 0,
  benefits_employee      numeric(12,2) NOT NULL DEFAULT 0,
  holiday_entitlement_value numeric(12,2) NOT NULL DEFAULT 0,
  total_package_value    numeric(12,2) NOT NULL DEFAULT 0,

  -- Currency
  currency          text NOT NULL DEFAULT 'GBP',

  -- Detailed breakdown stored as JSONB for flexibility
  -- Contains arrays of individual benefit items, pension details, etc.
  breakdown_detail  jsonb NOT NULL DEFAULT '{}',

  -- PDF generation
  status            app.total_reward_statement_status NOT NULL DEFAULT 'draft',
  pdf_document_id   uuid,  -- FK to documents table if PDF generated

  -- Metadata
  generated_by      uuid,
  published_at      timestamptz,
  notes             text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT fk_trs_tenant FOREIGN KEY (tenant_id)
    REFERENCES app.tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_trs_employee FOREIGN KEY (employee_id)
    REFERENCES app.employees(id) ON DELETE CASCADE,
  CONSTRAINT chk_trs_period CHECK (period_end >= period_start)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_trs_tenant_employee
  ON app.total_reward_statements (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_trs_employee_date
  ON app.total_reward_statements (employee_id, statement_date DESC);

CREATE INDEX IF NOT EXISTS idx_trs_status
  ON app.total_reward_statements (tenant_id, status);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE app.total_reward_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
  ON app.total_reward_statements
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert
  ON app.total_reward_statements
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- ---------------------------------------------------------------------------
-- Updated-at trigger
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON app.total_reward_statements
  FOR EACH ROW
  EXECUTE FUNCTION app.set_updated_at();
