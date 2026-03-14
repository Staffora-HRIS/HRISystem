-- Migration: 0171_reporting_field_catalog.sql
-- Description: Creates the reporting field catalog — the foundation of the report builder.
--              Every reportable field in the system is registered here with metadata
--              for joins, permissions, formatting, and aggregation.

-- ============================================================================
-- ENUMs
-- ============================================================================

CREATE TYPE app.field_data_type AS ENUM (
  'string', 'text', 'integer', 'decimal', 'boolean',
  'date', 'datetime', 'time', 'enum', 'uuid',
  'currency', 'percentage', 'duration', 'json',
  'email', 'phone', 'url'
);

CREATE TYPE app.field_category AS ENUM (
  'personal', 'employment', 'position', 'organization',
  'compensation', 'time_attendance', 'leave_absence',
  'performance', 'learning', 'benefits', 'compliance',
  'recruitment', 'onboarding', 'documents', 'cases',
  'payroll', 'succession', 'equipment', 'health_safety',
  'gdpr', 'disciplinary', 'workflow'
);

-- ============================================================================
-- Field Catalog Table
-- ============================================================================

CREATE TABLE app.reporting_field_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  field_key varchar(200) NOT NULL UNIQUE,
  display_name varchar(200) NOT NULL,
  description text,
  category app.field_category NOT NULL,

  -- Source mapping
  source_table varchar(100) NOT NULL,
  source_column varchar(100) NOT NULL,
  source_schema varchar(50) DEFAULT 'app',

  -- Data type and formatting
  data_type app.field_data_type NOT NULL,
  enum_values jsonb,
  format_pattern varchar(100),
  currency_code varchar(3),
  decimal_places integer,

  -- Relationships (how to JOIN to employees)
  join_path jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Effective dating
  is_effective_dated boolean DEFAULT false,
  effective_date_column varchar(100),

  -- Aggregation support
  is_aggregatable boolean DEFAULT true,
  supported_aggregations jsonb DEFAULT '["count","count_distinct"]'::jsonb,
  is_groupable boolean DEFAULT true,

  -- Filtering support
  is_filterable boolean DEFAULT true,
  filter_operators jsonb,
  default_filter_operator varchar(50),
  lookup_source varchar(200),

  -- Sorting
  is_sortable boolean DEFAULT true,
  default_sort_direction varchar(4),

  -- Permissions
  required_permission varchar(100),
  field_permission_key varchar(200),
  is_pii boolean DEFAULT false,
  is_sensitive boolean DEFAULT false,
  gdpr_consent_required boolean DEFAULT false,

  -- Display
  display_order integer DEFAULT 0,
  is_default_visible boolean DEFAULT true,
  column_width integer DEFAULT 150,
  text_alignment varchar(10) DEFAULT 'left',

  -- Calculated field support
  is_calculated boolean DEFAULT false,
  calculation_expression text,

  -- Metadata
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rfc_category ON app.reporting_field_catalog(category);
CREATE INDEX idx_rfc_source ON app.reporting_field_catalog(source_table, source_column);
CREATE INDEX idx_rfc_active ON app.reporting_field_catalog(is_active) WHERE is_active = true;
CREATE INDEX idx_rfc_field_key ON app.reporting_field_catalog(field_key);

-- Trigger for updated_at
CREATE TRIGGER update_reporting_field_catalog_updated_at
  BEFORE UPDATE ON app.reporting_field_catalog
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();
