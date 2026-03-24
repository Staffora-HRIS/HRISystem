-- Migration: 0191_report_schedule_history.sql
-- Description: Adds report_schedule_history table for audit trail of schedule changes,
--              and a next_scheduled_run calculation trigger on report_definitions.

-- ============================================================================
-- Report Schedule History (audit trail)
-- ============================================================================

CREATE TABLE app.report_schedule_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  report_id uuid NOT NULL REFERENCES app.report_definitions(id) ON DELETE CASCADE,

  -- What changed
  action varchar(20) NOT NULL CHECK (action IN ('created', 'updated', 'removed')),

  -- Schedule snapshot at time of change
  frequency varchar(50),
  cron_expression varchar(100),
  schedule_time time,
  day_of_week integer,
  day_of_month integer,
  recipients jsonb DEFAULT '[]'::jsonb,
  export_format varchar(20),

  -- Who & when
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz DEFAULT now()
);

ALTER TABLE app.report_schedule_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.report_schedule_history
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_insert ON app.report_schedule_history
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_rsh_report ON app.report_schedule_history(report_id, changed_at DESC);
CREATE INDEX idx_rsh_tenant ON app.report_schedule_history(tenant_id, changed_at DESC);

-- ============================================================================
-- Add scheduling columns to report_definitions (if missing)
-- ============================================================================

ALTER TABLE app.report_definitions ADD COLUMN IF NOT EXISTS is_scheduled boolean NOT NULL DEFAULT false;
ALTER TABLE app.report_definitions ADD COLUMN IF NOT EXISTS schedule_frequency varchar(50);
ALTER TABLE app.report_definitions ADD COLUMN IF NOT EXISTS schedule_time time;
ALTER TABLE app.report_definitions ADD COLUMN IF NOT EXISTS schedule_day_of_week integer;
ALTER TABLE app.report_definitions ADD COLUMN IF NOT EXISTS schedule_day_of_month integer;
ALTER TABLE app.report_definitions ADD COLUMN IF NOT EXISTS schedule_cron_expression varchar(100);
ALTER TABLE app.report_definitions ADD COLUMN IF NOT EXISTS schedule_recipients jsonb DEFAULT '[]'::jsonb;
ALTER TABLE app.report_definitions ADD COLUMN IF NOT EXISTS schedule_export_format varchar(20) DEFAULT 'csv';
ALTER TABLE app.report_definitions ADD COLUMN IF NOT EXISTS next_scheduled_run timestamptz;
ALTER TABLE app.report_definitions ADD COLUMN IF NOT EXISTS last_scheduled_run timestamptz;

-- ============================================================================
-- Function: Calculate next_scheduled_run based on schedule settings
-- ============================================================================

CREATE OR REPLACE FUNCTION app.calculate_next_scheduled_run()
RETURNS TRIGGER AS $$
DECLARE
  next_run timestamptz;
  base_time time;
  run_date date;
BEGIN
  -- Only calculate if scheduling is enabled
  IF NOT NEW.is_scheduled OR NEW.schedule_frequency IS NULL THEN
    NEW.next_scheduled_run := NULL;
    RETURN NEW;
  END IF;

  base_time := COALESCE(NEW.schedule_time, '08:00:00'::time);

  CASE NEW.schedule_frequency
    WHEN 'daily' THEN
      -- Next occurrence: tomorrow at the scheduled time
      run_date := (CURRENT_DATE + interval '1 day')::date;
      next_run := (run_date + base_time)::timestamptz;

    WHEN 'weekly' THEN
      -- Next occurrence of the specified day of week
      run_date := CURRENT_DATE;
      WHILE EXTRACT(DOW FROM run_date)::integer != COALESCE(NEW.schedule_day_of_week, 1) OR run_date <= CURRENT_DATE LOOP
        run_date := run_date + interval '1 day';
      END LOOP;
      next_run := (run_date + base_time)::timestamptz;

    WHEN 'fortnightly' THEN
      -- Next occurrence of the specified day of week, at least 7 days from now
      run_date := CURRENT_DATE + interval '7 days';
      WHILE EXTRACT(DOW FROM run_date)::integer != COALESCE(NEW.schedule_day_of_week, 1) LOOP
        run_date := run_date + interval '1 day';
      END LOOP;
      next_run := (run_date + base_time)::timestamptz;

    WHEN 'monthly' THEN
      -- Next month on the specified day
      run_date := (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
                  + (COALESCE(NEW.schedule_day_of_month, 1) - 1) * interval '1 day';
      -- Cap to end of month
      IF EXTRACT(DAY FROM run_date) != COALESCE(NEW.schedule_day_of_month, 1) THEN
        run_date := (date_trunc('month', run_date + interval '1 month') - interval '1 day')::date;
      END IF;
      next_run := (run_date + base_time)::timestamptz;

    WHEN 'quarterly' THEN
      -- Next quarter start + specified day
      run_date := (date_trunc('quarter', CURRENT_DATE) + interval '3 months')::date
                  + (COALESCE(NEW.schedule_day_of_month, 1) - 1) * interval '1 day';
      next_run := (run_date + base_time)::timestamptz;

    WHEN 'annually' THEN
      -- Next year, same month/day
      run_date := (date_trunc('year', CURRENT_DATE) + interval '1 year')::date
                  + (COALESCE(NEW.schedule_day_of_month, 1) - 1) * interval '1 day';
      next_run := (run_date + base_time)::timestamptz;

    ELSE
      -- custom_cron or unknown: leave NULL for external scheduler to handle
      next_run := NULL;
  END CASE;

  NEW.next_scheduled_run := next_run;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate next_scheduled_run on schedule changes
CREATE TRIGGER calculate_next_run_trigger
  BEFORE INSERT OR UPDATE OF is_scheduled, schedule_frequency, schedule_time,
    schedule_day_of_week, schedule_day_of_month
  ON app.report_definitions
  FOR EACH ROW
  EXECUTE FUNCTION app.calculate_next_scheduled_run();

-- Grant permissions to application role
GRANT SELECT, INSERT ON app.report_schedule_history TO hris_app;
