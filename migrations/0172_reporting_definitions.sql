-- Migration: 0172_reporting_definitions.sql
-- Description: Report definitions, execution history, and favourites.
--              Supports tabular, summary, cross-tab, chart, and special report types.

-- ============================================================================
-- ENUMs
-- ============================================================================

CREATE TYPE app.report_type AS ENUM (
  'tabular',
  'summary',
  'cross_tab',
  'chart',
  'dashboard_widget',
  'headcount',
  'turnover',
  'compliance'
);

CREATE TYPE app.report_status AS ENUM (
  'draft', 'published', 'archived'
);

CREATE TYPE app.schedule_frequency AS ENUM (
  'daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'annually', 'custom_cron'
);

-- ============================================================================
-- Report Definitions
-- ============================================================================

CREATE TABLE app.report_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),

  -- Identity
  name varchar(200) NOT NULL,
  description text,
  report_type app.report_type NOT NULL DEFAULT 'tabular',
  status app.report_status NOT NULL DEFAULT 'draft',
  category varchar(100),
  tags jsonb DEFAULT '[]'::jsonb,

  -- Report Configuration (the core definition)
  config jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Visualization
  chart_type varchar(50),
  chart_config jsonb,

  -- Scheduling
  is_scheduled boolean DEFAULT false,
  schedule_frequency app.schedule_frequency,
  schedule_cron varchar(100),
  schedule_time time,
  schedule_day_of_week integer,
  schedule_day_of_month integer,
  schedule_recipients jsonb DEFAULT '[]'::jsonb,
  schedule_export_format varchar(20),
  last_scheduled_run timestamptz,
  next_scheduled_run timestamptz,

  -- Sharing & Permissions
  created_by uuid NOT NULL,
  is_public boolean DEFAULT false,
  is_system boolean DEFAULT false,
  shared_with jsonb DEFAULT '[]'::jsonb,
  required_permission varchar(100),

  -- Metadata
  version integer DEFAULT 1,
  last_run_at timestamptz,
  run_count integer DEFAULT 0,
  avg_execution_ms integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app.report_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.report_definitions
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_insert ON app.report_definitions
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_rd_tenant_status ON app.report_definitions(tenant_id, status);
CREATE INDEX idx_rd_created_by ON app.report_definitions(created_by);
CREATE INDEX idx_rd_scheduled ON app.report_definitions(is_scheduled, next_scheduled_run)
  WHERE is_scheduled = true;
CREATE INDEX idx_rd_system ON app.report_definitions(is_system) WHERE is_system = true;

CREATE TRIGGER update_report_definitions_updated_at
  BEFORE UPDATE ON app.report_definitions
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- ============================================================================
-- Report Executions (History)
-- ============================================================================

CREATE TABLE app.report_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  report_id uuid NOT NULL REFERENCES app.report_definitions(id) ON DELETE CASCADE,

  executed_by uuid NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  execution_ms integer,
  row_count integer,
  parameters jsonb,

  -- Result caching
  result_cache_key varchar(200),
  result_expires_at timestamptz,

  -- Export info
  export_format varchar(20),
  export_file_key varchar(500),

  -- Status
  status varchar(20) DEFAULT 'completed',
  error_message text,

  created_at timestamptz DEFAULT now()
);

ALTER TABLE app.report_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.report_executions
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_insert ON app.report_executions
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_re_report ON app.report_executions(report_id, executed_at DESC);
CREATE INDEX idx_re_user ON app.report_executions(executed_by, executed_at DESC);

-- ============================================================================
-- Report Favourites (per user)
-- ============================================================================

CREATE TABLE app.report_favourites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  user_id uuid NOT NULL,
  report_id uuid NOT NULL REFERENCES app.report_definitions(id) ON DELETE CASCADE,
  pinned_order integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, user_id, report_id)
);

ALTER TABLE app.report_favourites ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.report_favourites
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_insert ON app.report_favourites
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_rf_user ON app.report_favourites(tenant_id, user_id);
