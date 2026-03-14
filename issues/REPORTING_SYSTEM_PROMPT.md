# AI Implementation Prompt: Staffora Enterprise Reporting Engine

## Context

You are building the **core reporting engine** for Staffora, a multi-tenant UK HRIS platform. This is a **key differentiating feature** — the system must allow HR professionals to build, save, schedule, and share reports on **every single field attached to a person** across the entire platform. No data silo. No "you can't report on that." Every field, every table, every relationship — queryable, filterable, groupable, exportable.

The platform has **70 backend API modules**, **100+ employee-linked database tables**, and **~480 business data columns**. All tables live in the `app` PostgreSQL schema with Row-Level Security enforced. The reporting engine must respect RLS, field-level permissions, and GDPR consent requirements.

---

## Tech Stack (Mandatory — Do Not Deviate)

- **Backend**: Bun + Elysia.js + postgres.js tagged template queries
- **Frontend**: React 18 + React Router v7 + React Query + Tailwind CSS
- **Database**: PostgreSQL 16 with RLS (all tables in `app` schema)
- **Cache**: Redis 7
- **Validation**: TypeBox (backend), Zod (frontend)
- **Auth**: BetterAuth sessions, RBAC via `requirePermission()`, field-level permissions
- **Export**: exceljs (Excel), pdf-lib (PDF), native CSV
- **Charts**: Recharts or Chart.js (frontend)
- **Background Jobs**: Redis Streams via the existing worker subsystem

Follow the existing module pattern: `schemas.ts` → `repository.ts` → `service.ts` → `routes.ts` → `index.ts`. Reference the `hr` module as the gold standard.

---

## Architecture Overview

The reporting engine has 5 layers:

```
┌─────────────────────────────────────────────────────┐
│  PRESENTATION LAYER (React)                         │
│  Report Builder UI → Live Preview → Saved Reports   │
│  Dashboard Widgets → Scheduled Delivery             │
├─────────────────────────────────────────────────────┤
│  API LAYER (Elysia.js)                              │
│  /api/v1/reports/*                                  │
│  Report CRUD, execution, export, scheduling         │
├─────────────────────────────────────────────────────┤
│  QUERY ENGINE (Service Layer)                       │
│  Field Catalog → Query Builder → SQL Generator      │
│  Permission Enforcement → Result Transformation     │
├─────────────────────────────────────────────────────┤
│  DATA CATALOG (Field Registry)                      │
│  Every table, every column, every relationship      │
│  Metadata: types, labels, formats, permissions      │
├─────────────────────────────────────────────────────┤
│  DATA LAYER (PostgreSQL + Redis)                    │
│  RLS-enforced queries → Result caching              │
│  Materialized views for expensive aggregations      │
└─────────────────────────────────────────────────────┘
```

---

## PART 1: DATA CATALOG (Field Registry)

### 1.1 Migration: `reporting_field_catalog`

Create a comprehensive field catalog that maps every reportable field in the system. This is the **foundation** — the report builder reads from this catalog to know what fields exist.

```sql
-- Migration: NNNN_reporting_field_catalog.sql

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

CREATE TABLE app.reporting_field_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  field_key varchar(200) NOT NULL UNIQUE,  -- e.g., 'employee.personal.first_name'
  display_name varchar(200) NOT NULL,       -- e.g., 'First Name'
  description text,                          -- e.g., 'Employee legal first name'
  category app.field_category NOT NULL,

  -- Source mapping
  source_table varchar(100) NOT NULL,        -- e.g., 'employee_personal'
  source_column varchar(100) NOT NULL,       -- e.g., 'first_name'
  source_schema varchar(50) DEFAULT 'app',

  -- Data type and formatting
  data_type app.field_data_type NOT NULL,
  enum_values jsonb,                         -- For enum fields: ["male","female","other","prefer_not_to_say"]
  format_pattern varchar(100),               -- e.g., 'dd/MM/yyyy', '£#,##0.00'
  currency_code varchar(3),                  -- For currency fields: 'GBP'
  decimal_places integer,                    -- For decimal fields: 2

  -- Relationships (how to JOIN to employees)
  join_path jsonb NOT NULL,                  -- Array of join steps from employees table
  -- Example: [{"table":"employee_personal","on":"employee_personal.employee_id = employees.id","type":"LEFT"}]
  -- Example: [{"table":"position_assignments","on":"position_assignments.employee_id = employees.id AND position_assignments.effective_to IS NULL","type":"LEFT"},
  --           {"table":"positions","on":"positions.id = position_assignments.position_id","type":"LEFT"}]

  -- Effective dating
  is_effective_dated boolean DEFAULT false,   -- If true, the table has effective_from/effective_to
  effective_date_column varchar(100),         -- Column name for effective_from

  -- Aggregation support
  is_aggregatable boolean DEFAULT true,       -- Can this field be used in GROUP BY?
  supported_aggregations jsonb,               -- ["count","count_distinct","sum","avg","min","max","median"]
  is_groupable boolean DEFAULT true,          -- Can this field be used as a dimension?

  -- Filtering support
  is_filterable boolean DEFAULT true,
  filter_operators jsonb,                     -- ["equals","not_equals","contains","starts_with","in","between","is_null","is_not_null"]
  default_filter_operator varchar(50),
  lookup_source varchar(200),                 -- For foreign key lookups: 'org_units.name' or API endpoint

  -- Sorting
  is_sortable boolean DEFAULT true,
  default_sort_direction varchar(4),          -- 'ASC' or 'DESC'

  -- Permissions
  required_permission varchar(100),           -- RBAC permission needed: 'employees:read'
  field_permission_key varchar(200),          -- Field-level permission key for sensitive fields
  is_pii boolean DEFAULT false,              -- Personal Identifiable Information flag
  is_sensitive boolean DEFAULT false,         -- Sensitive data (salary, bank details, etc.)
  gdpr_consent_required boolean DEFAULT false, -- Requires active GDPR consent to include

  -- Display
  display_order integer DEFAULT 0,
  is_default_visible boolean DEFAULT true,    -- Show by default in new reports
  column_width integer DEFAULT 150,           -- Default pixel width in tables
  text_alignment varchar(10) DEFAULT 'left',  -- 'left', 'center', 'right'

  -- Metadata
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rfc_category ON app.reporting_field_catalog(category);
CREATE INDEX idx_rfc_source ON app.reporting_field_catalog(source_table, source_column);
CREATE INDEX idx_rfc_active ON app.reporting_field_catalog(is_active) WHERE is_active = true;

-- Trigger for updated_at
CREATE TRIGGER update_reporting_field_catalog_updated_at
  BEFORE UPDATE ON app.reporting_field_catalog
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();
```

### 1.2 Seed the Field Catalog

Create a seed migration that populates **every single reportable field**. This is the most critical step. The catalog must cover ALL of these data domains:

#### Domain: Personal (employee_personal)
| field_key | display_name | source_table | source_column | data_type | is_pii | join_path |
|-----------|-------------|--------------|---------------|-----------|--------|-----------|
| `employee.personal.first_name` | First Name | employee_personal | first_name | string | true | `[{"table":"employee_personal","on":"employee_personal.employee_id = employees.id AND employee_personal.effective_to IS NULL","type":"LEFT"}]` |
| `employee.personal.last_name` | Last Name | employee_personal | last_name | string | true | (same) |
| `employee.personal.preferred_name` | Preferred Name | employee_personal | preferred_name | string | false | (same) |
| `employee.personal.date_of_birth` | Date of Birth | employee_personal | date_of_birth | date | true | (same) |
| `employee.personal.gender` | Gender | employee_personal | gender | enum | false | (same) |
| `employee.personal.marital_status` | Marital Status | employee_personal | marital_status | enum | false | (same) |
| `employee.personal.nationality` | Nationality | employee_personal | nationality | string | false | (same) |

#### Domain: Employment (employees, employment_contracts)
| field_key | display_name | source_table | source_column | data_type |
|-----------|-------------|--------------|---------------|-----------|
| `employee.number` | Employee Number | employees | employee_number | string |
| `employee.status` | Employment Status | employees | status | enum |
| `employee.hire_date` | Hire Date | employees | hire_date | date |
| `employee.termination_date` | Termination Date | employees | termination_date | date |
| `employee.termination_reason` | Termination Reason | employees | termination_reason | string |
| `employee.tenure_years` | Tenure (Years) | employees | (calculated) | decimal |
| `employee.contract.type` | Contract Type | employment_contracts | contract_type | enum |
| `employee.contract.employment_type` | Employment Type | employment_contracts | employment_type | enum |
| `employee.contract.fte` | FTE | employment_contracts | fte | decimal |
| `employee.contract.hours_per_week` | Hours Per Week | employment_contracts | working_hours_per_week | decimal |
| `employee.contract.notice_period` | Notice Period (Days) | employment_contracts | notice_period_days | integer |
| `employee.contract.probation_end` | Probation End Date | employment_contracts | probation_end_date | date |

#### Domain: Position & Organization (positions, org_units, reporting_lines)
| field_key | display_name | source_table | source_column | data_type |
|-----------|-------------|--------------|---------------|-----------|
| `employee.position.title` | Job Title | positions | title | string |
| `employee.position.grade` | Grade | positions | grade | string |
| `employee.position.code` | Position Code | positions | code | string |
| `employee.org_unit.name` | Department | org_units | name | string |
| `employee.org_unit.code` | Department Code | org_units | code | string |
| `employee.org_unit.type` | Org Unit Type | org_units | type | enum |
| `employee.manager.name` | Line Manager | (computed from reporting_lines → employees → employee_personal) | (computed) | string |
| `employee.manager.employee_number` | Manager Emp No | (computed) | (computed) | string |
| `employee.cost_center.name` | Cost Centre | cost_centers | name | string |
| `employee.cost_center.code` | Cost Centre Code | cost_centers | code | string |

#### Domain: Compensation (compensation_history)
| field_key | display_name | data_type | is_sensitive |
|-----------|-------------|-----------|-------------|
| `employee.compensation.base_salary` | Base Salary | currency | true |
| `employee.compensation.currency` | Pay Currency | string | false |
| `employee.compensation.pay_frequency` | Pay Frequency | enum | false |
| `employee.compensation.change_reason` | Last Change Reason | string | false |
| `employee.compensation.change_percentage` | Last Change % | percentage | true |

#### Domain: Leave & Absence
| field_key | display_name | data_type |
|-----------|-------------|-----------|
| `employee.leave.annual_balance` | Annual Leave Balance | decimal |
| `employee.leave.sick_days_ytd` | Sick Days (YTD) | decimal |
| `employee.leave.bradford_factor` | Bradford Factor Score | integer |
| `employee.leave.pending_requests` | Pending Leave Requests | integer |
| `employee.leave.last_absence_date` | Last Absence Date | date |
| `employee.ssp.status` | SSP Status | enum |
| `employee.ssp.days_paid` | SSP Days Paid | integer |
| `employee.statutory_leave.type` | Statutory Leave Type | enum |
| `employee.statutory_leave.start_date` | Statutory Leave Start | date |
| `employee.statutory_leave.end_date` | Statutory Leave End | date |

#### Domain: Time & Attendance
| field_key | display_name | data_type |
|-----------|-------------|-----------|
| `employee.time.avg_weekly_hours` | Avg Weekly Hours | decimal |
| `employee.time.overtime_hours_mtd` | Overtime Hours (MTD) | decimal |
| `employee.time.last_clock_in` | Last Clock In | datetime |
| `employee.time.wtr_opt_out` | WTR 48h Opt-Out | boolean |
| `employee.time.shift` | Assigned Shift | string |

#### Domain: Performance & Talent
| field_key | display_name | data_type |
|-----------|-------------|-----------|
| `employee.performance.last_rating` | Last Performance Rating | decimal |
| `employee.performance.goals_count` | Active Goals | integer |
| `employee.performance.goals_completed_pct` | Goals Completed % | percentage |
| `employee.performance.review_status` | Current Review Status | enum |
| `employee.succession.is_successor` | Named as Successor | boolean |
| `employee.succession.readiness_level` | Succession Readiness | enum |

#### Domain: Learning & Development
| field_key | display_name | data_type |
|-----------|-------------|-----------|
| `employee.learning.courses_completed` | Courses Completed | integer |
| `employee.learning.courses_in_progress` | Courses In Progress | integer |
| `employee.learning.mandatory_overdue` | Mandatory Training Overdue | integer |
| `employee.learning.cpd_hours_ytd` | CPD Hours (YTD) | decimal |
| `employee.learning.last_completion_date` | Last Course Completed | date |

#### Domain: Benefits
| field_key | display_name | data_type |
|-----------|-------------|-----------|
| `employee.benefits.enrolled_plans` | Enrolled Plans Count | integer |
| `employee.benefits.employee_contribution` | Total Employee Contribution | currency |
| `employee.benefits.employer_contribution` | Total Employer Contribution | currency |
| `employee.benefits.dependents_count` | Dependents | integer |
| `employee.pension.status` | Pension Status | enum |
| `employee.pension.contribution_pct` | Pension Contribution % | percentage |

#### Domain: Compliance
| field_key | display_name | data_type |
|-----------|-------------|-----------|
| `employee.compliance.rtw_status` | Right to Work Status | enum |
| `employee.compliance.rtw_expiry` | RTW Expiry Date | date |
| `employee.compliance.dbs_status` | DBS Check Status | enum |
| `employee.compliance.dbs_expiry` | DBS Expiry Date | date |
| `employee.compliance.gdpr_consent` | GDPR Consent Given | boolean |
| `employee.compliance.nmw_compliant` | NMW Compliant | boolean |
| `employee.compliance.wtr_compliant` | WTR Compliant | boolean |

#### Domain: Disciplinary & Cases
| field_key | display_name | data_type |
|-----------|-------------|-----------|
| `employee.warnings.active_count` | Active Warnings | integer |
| `employee.warnings.highest_level` | Highest Active Warning | enum |
| `employee.cases.open_count` | Open Cases | integer |
| `employee.cases.avg_resolution_days` | Avg Case Resolution (Days) | decimal |

#### Domain: Documents & Records
| field_key | display_name | data_type |
|-----------|-------------|-----------|
| `employee.documents.total_count` | Documents on File | integer |
| `employee.documents.contract_signed` | Contract Signed | boolean |
| `employee.documents.statement_issued` | Written Statement Issued | boolean |
| `employee.documents.statement_acknowledged` | Statement Acknowledged | boolean |

#### Domain: Contacts & Emergency
| field_key | display_name | data_type | is_pii |
|-----------|-------------|-----------|--------|
| `employee.contact.work_email` | Work Email | email | true |
| `employee.contact.personal_email` | Personal Email | email | true |
| `employee.contact.work_phone` | Work Phone | phone | true |
| `employee.contact.mobile` | Mobile Phone | phone | true |
| `employee.address.home.city` | Home City | string | true |
| `employee.address.home.postcode` | Home Postcode | string | true |
| `employee.address.home.country` | Home Country | string | false |
| `employee.emergency_contact.name` | Emergency Contact Name | string | true |
| `employee.emergency_contact.phone` | Emergency Contact Phone | phone | true |
| `employee.emergency_contact.relationship` | Emergency Contact Relationship | string | false |

#### Domain: Equipment & Facilities
| field_key | display_name | data_type |
|-----------|-------------|-----------|
| `employee.equipment.assigned_count` | Equipment Assigned | integer |
| `employee.equipment.last_assigned` | Last Equipment Assigned | date |

#### Domain: Payroll
| field_key | display_name | data_type | is_sensitive |
|-----------|-------------|-----------|-------------|
| `employee.payroll.tax_code` | Tax Code | string | true |
| `employee.payroll.ni_category` | NI Category | string | false |
| `employee.payroll.pay_schedule` | Pay Schedule | string | false |
| `employee.payroll.bank_name` | Bank Name | string | true |
| `employee.payroll.last_payslip_date` | Last Payslip Date | date | false |
| `employee.payroll.gross_ytd` | Gross Pay YTD | currency | true |
| `employee.payroll.net_ytd` | Net Pay YTD | currency | true |

#### Domain: Diversity (aggregate only — GDPR protected)
| field_key | display_name | data_type | gdpr_consent_required |
|-----------|-------------|-----------|----------------------|
| `employee.diversity.ethnicity` | Ethnicity | enum | true |
| `employee.diversity.disability_status` | Disability Status | enum | true |
| `employee.diversity.religion` | Religion/Belief | enum | true |
| `employee.diversity.sexual_orientation` | Sexual Orientation | enum | true |

**IMPORTANT**: Diversity fields MUST only be available in aggregate reports (no individual-level output). The query engine MUST enforce this by requiring `GROUP BY` when diversity fields are included and preventing row-level output that identifies individuals.

**TOTAL SEED: Approximately 150-200 field definitions** covering every person-linked data point in the system.

---

## PART 2: REPORT DEFINITION MODEL

### 2.1 Migration: `reporting_definitions`

```sql
-- Migration: NNNN_reporting_definitions.sql

CREATE TYPE app.report_type AS ENUM (
  'tabular',          -- Standard table/list report
  'summary',          -- Aggregated summary with groups
  'cross_tab',        -- Pivot/cross-tabulation
  'chart',            -- Visualization-only
  'dashboard_widget', -- Embeddable widget
  'headcount',        -- Headcount snapshot (special)
  'turnover',         -- Turnover analysis (special)
  'compliance',       -- Compliance status (special)
  'custom_sql'        -- Admin-only: raw SQL (restricted)
);

CREATE TYPE app.report_status AS ENUM (
  'draft', 'published', 'archived'
);

CREATE TYPE app.schedule_frequency AS ENUM (
  'daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'annually', 'custom_cron'
);

CREATE TABLE app.report_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),

  -- Identity
  name varchar(200) NOT NULL,
  description text,
  report_type app.report_type NOT NULL DEFAULT 'tabular',
  status app.report_status NOT NULL DEFAULT 'draft',
  category varchar(100),                    -- User-defined category/folder
  tags jsonb DEFAULT '[]',                  -- Searchable tags

  -- Report Configuration (the core definition)
  config jsonb NOT NULL,
  -- Structure of config:
  -- {
  --   "columns": [
  --     {
  --       "field_key": "employee.personal.first_name",
  --       "alias": "First Name",
  --       "width": 150,
  --       "visible": true,
  --       "order": 1,
  --       "aggregation": null,          -- or "count", "sum", "avg", "min", "max", "count_distinct"
  --       "format": null,               -- Override format pattern
  --       "conditional_formatting": [    -- Highlight rules
  --         {"condition": "equals", "value": "terminated", "style": {"backgroundColor": "#fee2e2"}}
  --       ]
  --     }
  --   ],
  --   "filters": [
  --     {
  --       "field_key": "employee.status",
  --       "operator": "in",              -- equals, not_equals, contains, starts_with, ends_with, in, not_in, between, gt, gte, lt, lte, is_null, is_not_null
  --       "value": ["active", "on_leave"],
  --       "is_parameter": false,         -- If true, user enters value at runtime
  --       "parameter_label": null
  --     }
  --   ],
  --   "groupBy": [                       -- For summary reports
  --     {"field_key": "employee.org_unit.name", "order": 1}
  --   ],
  --   "sortBy": [
  --     {"field_key": "employee.personal.last_name", "direction": "ASC"}
  --   ],
  --   "effectiveDate": "current",        -- "current" (NULL effective_to), "as_of" (specific date), "range" (date range)
  --   "effectiveDateValue": null,         -- ISO date string or {from, to} for range
  --   "includeTerminated": false,         -- Include terminated employees?
  --   "distinctEmployees": true,          -- Deduplicate by employee
  --   "limit": null,                      -- Row limit (null = unlimited)
  --   "chartConfig": null                 -- Chart type, axes, colors (for chart reports)
  -- }

  -- Visualization
  chart_type varchar(50),                  -- 'bar', 'line', 'pie', 'doughnut', 'scatter', 'area', 'stacked_bar', 'heatmap', 'treemap'
  chart_config jsonb,                      -- Chart-specific config (axes, colors, labels)

  -- Scheduling
  is_scheduled boolean DEFAULT false,
  schedule_frequency app.schedule_frequency,
  schedule_cron varchar(100),              -- For custom_cron frequency
  schedule_time time,                      -- Time of day to run (UTC)
  schedule_day_of_week integer,            -- 0=Sunday, for weekly
  schedule_day_of_month integer,           -- For monthly
  schedule_recipients jsonb DEFAULT '[]',  -- [{userId, email, deliveryMethod: "email"|"in_app"|"both"}]
  schedule_export_format varchar(20),      -- 'xlsx', 'csv', 'pdf'
  last_scheduled_run timestamptz,
  next_scheduled_run timestamptz,

  -- Sharing & Permissions
  created_by uuid NOT NULL,
  is_public boolean DEFAULT false,         -- Visible to all users in tenant
  is_system boolean DEFAULT false,         -- System-provided template (not editable)
  shared_with jsonb DEFAULT '[]',          -- [{userId: "...", permission: "view"|"edit"}]
  required_permission varchar(100),        -- Minimum RBAC permission to access

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
CREATE INDEX idx_rd_scheduled ON app.report_definitions(is_scheduled, next_scheduled_run) WHERE is_scheduled = true;

-- Saved report executions (for history and caching)
CREATE TABLE app.report_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id),
  report_id uuid NOT NULL REFERENCES app.report_definitions(id) ON DELETE CASCADE,

  executed_by uuid NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  execution_ms integer,
  row_count integer,
  parameters jsonb,                        -- Runtime parameter values used

  -- Result caching
  result_cache_key varchar(200),           -- Redis key for cached results
  result_expires_at timestamptz,

  -- Export info
  export_format varchar(20),               -- null if just viewed, 'xlsx'/'csv'/'pdf' if exported
  export_file_key varchar(500),            -- Storage key for exported file

  -- Status
  status varchar(20) DEFAULT 'completed',  -- 'running', 'completed', 'failed', 'cancelled'
  error_message text,

  created_at timestamptz DEFAULT now()
);

ALTER TABLE app.report_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.report_executions
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_insert ON app.report_executions
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Report favourites (per user)
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
```

---

## PART 3: QUERY ENGINE (Service Layer)

### 3.1 SQL Generation from Report Config

The query engine takes a report `config` JSON and generates a parameterized SQL query. This is the most complex and security-critical part.

**Algorithm:**

1. **Parse columns** → Look up each `field_key` in the field catalog → get `source_table`, `source_column`, `join_path`
2. **Check permissions** → For each field, verify the user has the `required_permission` AND passes field-level permission check. Strip any fields the user cannot see. If a field has `gdpr_consent_required`, verify the employee has active consent for diversity monitoring.
3. **Build FROM clause** → Start from `app.employees e`. Collect all unique `join_path` entries from selected columns + filters. Deduplicate joins.
4. **Handle effective dating** → For tables with `is_effective_dated = true`, add `AND table.effective_to IS NULL` (for current) or `AND table.effective_from <= $date AND (table.effective_to IS NULL OR table.effective_to > $date)` (for as-of-date reports).
5. **Build WHERE clause** → Apply all filters using parameterized values. Apply `tenant_id` filter (redundant with RLS but defense-in-depth). Apply terminated employee filter.
6. **Build GROUP BY** → For summary reports, group by the specified dimensions. Aggregate columns use the specified aggregation function.
7. **Build ORDER BY** → Apply sort rules.
8. **Build SELECT** → Select each column with its alias. Apply any computed/formatted expressions.
9. **Apply LIMIT** → If set.
10. **Execute** → Run via `db.withTransaction(ctx, ...)` to ensure RLS context is set.

**Critical Security Rules:**
- NEVER use `tx.unsafe()` or string concatenation for any user-supplied value
- ALL filter values must be parameterized ($1, $2, etc.)
- Table names and column names come from the field catalog (trusted data), not from user input
- Validate every `field_key` against the catalog before building SQL
- Enforce row-level output prohibition for diversity fields
- Strip PII fields if the user's role doesn't have `employees:read_pii` permission
- Strip sensitive fields (salary, bank details) if the user's role doesn't have the field-specific permission

### 3.2 Calculated Fields

Support these built-in calculated fields that don't map to a single column:

| field_key | Calculation | SQL Expression |
|-----------|------------|----------------|
| `employee.age` | Years since DOB | `EXTRACT(YEAR FROM AGE(ep.date_of_birth))` |
| `employee.tenure_years` | Years since hire | `EXTRACT(YEAR FROM AGE(e.hire_date))` |
| `employee.tenure_months` | Months since hire | `EXTRACT(YEAR FROM AGE(e.hire_date)) * 12 + EXTRACT(MONTH FROM AGE(e.hire_date))` |
| `employee.full_name` | First + Last | `CONCAT(ep.first_name, ' ', ep.last_name)` |
| `employee.is_on_probation` | Probation check | `ec.probation_end_date > CURRENT_DATE` |
| `employee.days_to_rtw_expiry` | Days until RTW expires | `rtw.expiry_date - CURRENT_DATE` |
| `employee.leave.days_remaining` | Annual leave remaining | `lb.opening_balance + lb.accrued - lb.used - lb.pending + lb.adjustments + lb.carryover - lb.forfeited` |

### 3.3 Cross-Tab / Pivot Reports

For `cross_tab` report type, support pivoting one dimension against another:

Example: "Headcount by Department × Employment Status"

```json
{
  "report_type": "cross_tab",
  "config": {
    "row_dimension": "employee.org_unit.name",
    "column_dimension": "employee.status",
    "value_field": "employee.number",
    "value_aggregation": "count_distinct"
  }
}
```

Generates a pivot table with departments as rows, statuses as columns, counts as values.

### 3.4 Result Caching

- Cache report results in Redis with key `report:{tenantId}:{reportId}:{paramHash}:{userId}`
- TTL: 5 minutes for standard reports, 1 hour for scheduled reports
- Invalidate cache when underlying data changes (via domain events)
- Store row count in execution record for display

---

## PART 4: API ENDPOINTS

### 4.1 Report CRUD

```
GET    /api/v1/reports                          -- List reports (my reports + shared + public)
POST   /api/v1/reports                          -- Create report definition
GET    /api/v1/reports/:id                      -- Get report definition
PUT    /api/v1/reports/:id                      -- Update report definition
DELETE /api/v1/reports/:id                      -- Delete report definition
POST   /api/v1/reports/:id/duplicate            -- Clone a report
POST   /api/v1/reports/:id/publish              -- Publish draft → published
POST   /api/v1/reports/:id/archive              -- Archive report
```

### 4.2 Report Execution

```
POST   /api/v1/reports/:id/execute              -- Execute report (returns JSON results)
POST   /api/v1/reports/:id/execute/preview      -- Execute with LIMIT 25 (for builder preview)
POST   /api/v1/reports/:id/export/:format       -- Export to xlsx/csv/pdf (returns file or job ID)
GET    /api/v1/reports/:id/executions            -- Execution history
GET    /api/v1/reports/executions/:executionId   -- Get specific execution result
```

### 4.3 Field Catalog

```
GET    /api/v1/reports/fields                   -- Get all available fields (filtered by user permissions)
GET    /api/v1/reports/fields/categories         -- Get field categories
GET    /api/v1/reports/fields/:fieldKey/values   -- Get distinct values for a field (for filter dropdowns)
```

### 4.4 Scheduling

```
POST   /api/v1/reports/:id/schedule             -- Set up scheduled delivery
DELETE /api/v1/reports/:id/schedule             -- Remove schedule
GET    /api/v1/reports/scheduled                -- List all scheduled reports
```

### 4.5 Favourites & Sharing

```
POST   /api/v1/reports/:id/favourite            -- Add to favourites
DELETE /api/v1/reports/:id/favourite            -- Remove from favourites
POST   /api/v1/reports/:id/share                -- Share with users
GET    /api/v1/reports/favourites               -- Get user's favourite reports
```

### 4.6 System Reports (Pre-built Templates)

```
GET    /api/v1/reports/templates                 -- List system report templates
POST   /api/v1/reports/templates/:templateId/create -- Create report from template
```

---

## PART 5: FRONTEND — REPORT BUILDER UI

### 5.1 Pages to Create

```
packages/web/app/routes/(admin)/reports/
├── index.tsx                    -- Report library (list all reports)
├── route.tsx                    -- Report library page
├── new/route.tsx                -- New report builder
├── [reportId]/route.tsx         -- View/run existing report
├── [reportId]/edit/route.tsx    -- Edit report builder
├── [reportId]/schedule/route.tsx -- Schedule configuration
├── templates/route.tsx          -- System report templates
└── favourites/route.tsx         -- User's favourite reports
```

### 5.2 Report Builder Component (`ReportBuilder.tsx`)

The report builder is a **drag-and-drop visual query builder** with these panels:

```
┌──────────────────────────────────────────────────────────────┐
│  Report Builder: [Report Name Input]          [Save] [Run]   │
├──────────────┬───────────────────────────────────────────────┤
│              │                                               │
│  FIELD       │  SELECTED COLUMNS                             │
│  CATALOG     │  ┌─────────┬──────────┬──────────┬────────┐  │
│              │  │ First   │ Last     │ Dept     │ Status │  │
│  ▸ Personal  │  │ Name    │ Name     │          │        │  │
│  ▸ Employment│  ├─────────┴──────────┴──────────┴────────┤  │
│  ▸ Position  │  │ Drag fields here or click + to add     │  │
│  ▸ Comp      │  └────────────────────────────────────────┘  │
│  ▸ Leave     │                                               │
│  ▸ Time      │  FILTERS                                      │
│  ▸ Perform.  │  ┌────────────────────────────────────────┐  │
│  ▸ Learning  │  │ Status IN [Active, On Leave]    [×]    │  │
│  ▸ Benefits  │  │ + Add Filter                           │  │
│  ▸ Compliance│  └────────────────────────────────────────┘  │
│  ▸ Cases     │                                               │
│  ▸ Payroll   │  GROUP BY (for summary reports)               │
│  ▸ Documents │  ┌────────────────────────────────────────┐  │
│  ▸ Equipment │  │ Department                       [×]   │  │
│  ▸ Diversity │  │ + Add Grouping                         │  │
│              │  └────────────────────────────────────────┘  │
│  [Search...] │                                               │
│              │  SORT BY                                       │
│              │  ┌────────────────────────────────────────┐  │
│              │  │ Last Name ▲                     [×]    │  │
│              │  │ + Add Sort                             │  │
│              │  └────────────────────────────────────────┘  │
├──────────────┴───────────────────────────────────────────────┤
│  LIVE PREVIEW (first 25 rows)                   [Full Run]   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ First Name │ Last Name │ Department │ Status          │  │
│  │ Jane       │ Smith     │ Engineering│ Active          │  │
│  │ John       │ Doe       │ Marketing  │ Active          │  │
│  │ Sarah      │ Wilson    │ HR         │ On Leave        │  │
│  │ ...        │           │            │                 │  │
│  └───────────────────────────────────────────────────────┘  │
│  Showing 25 of 847 employees │ Executed in 45ms              │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 Key UI Features

1. **Field Catalog Panel**: Collapsible tree grouped by category. Search box at top. Each field shows name, type icon, and a "+" button or drag handle. PII fields show a lock icon. Sensitive fields show an eye icon. Fields the user lacks permission for are hidden entirely.

2. **Column Configuration**: Each selected column has a popover/modal for:
   - Alias (rename column header)
   - Width
   - Aggregation (for summary reports): Count, Sum, Average, Min, Max, Count Distinct
   - Format override (date format, number format, currency format)
   - Conditional formatting rules (highlight cells based on value)
   - Sort direction
   - Visibility toggle (include in query but hide from output)

3. **Filter Builder**: Each filter row has:
   - Field selector (searchable dropdown)
   - Operator selector (context-sensitive based on field type: string gets contains/starts_with, date gets between/before/after, enum gets in/not_in)
   - Value input (text input, date picker, multi-select for enums, number input)
   - "Make runtime parameter" toggle (user enters value when running report)
   - AND/OR logic connector between filter rows
   - Filter groups (parenthesized conditions)

4. **Live Preview**: Auto-refreshes when columns/filters change (debounced 500ms). Shows first 25 rows. Shows total row count and execution time. Shows "Loading..." state during execution.

5. **Chart Builder**: For chart report type, show:
   - Chart type selector (bar, line, pie, doughnut, area, scatter, stacked bar)
   - X-axis field selector
   - Y-axis field selector (with aggregation)
   - Series/color dimension selector
   - Color palette selector
   - Legend position
   - Chart title and subtitle
   - Live chart preview updates as config changes

6. **Export Options**: Dropdown with:
   - Excel (.xlsx) with formatting, headers, and data validation
   - CSV (UTF-8 with BOM for Excel compatibility)
   - PDF with company header, date, page numbers
   - Share link (generates a URL that others can use to run the report)

7. **Schedule Dialog**: Modal for setting up recurring delivery:
   - Frequency selector (daily, weekly, monthly, quarterly, custom cron)
   - Time of day (UTC or tenant timezone)
   - Day of week/month selector
   - Recipients (multi-select from tenant users + manual email addresses)
   - Delivery method (email attachment, in-app notification with download link, both)
   - Export format for attachment
   - Active/inactive toggle

---

## PART 6: SYSTEM REPORT TEMPLATES

Seed these pre-built report templates that users can clone and customise:

### HR Core
1. **Employee Directory** — Full name, employee number, department, position, status, hire date, work email, work phone
2. **New Starters** — Employees hired in last 30/60/90 days with department, position, manager, onboarding status
3. **Leavers Report** — Terminated employees with termination date, reason, tenure, last department, last position
4. **Headcount by Department** — Cross-tab: department × status with count
5. **Headcount by Location** — Summary by work location
6. **FTE Summary** — Total FTE by department and employment type
7. **Tenure Distribution** — Grouped by tenure bands (0-1yr, 1-3yr, 3-5yr, 5-10yr, 10+yr)
8. **Birthday Report** — Upcoming birthdays in next 30 days
9. **Probation Due** — Employees with probation ending in next 30 days
10. **Contract Expiry** — Fixed-term contracts expiring in next 90 days

### Absence & Leave
11. **Leave Balances** — All employees with current annual leave balance, used, remaining
12. **Absence Summary** — Absence days by employee by type for a date range
13. **Bradford Factor Report** — All employees with Bradford Factor score, sorted descending
14. **Pending Leave Requests** — All pending leave requests awaiting approval
15. **Sickness Absence Triggers** — Employees exceeding X days sick absence in rolling 12 months
16. **SSP Records** — Current SSP records with days paid, status

### Compliance
17. **Right to Work Expiry** — Employees with RTW expiring in next 90 days
18. **DBS Check Due** — Employees with DBS checks expiring or not on file
19. **Mandatory Training Overdue** — Employees with overdue mandatory courses
20. **NMW Compliance** — Employees with hourly rate below applicable NMW band
21. **WTR Compliance** — Employees averaging >48hrs/week without opt-out
22. **Gender Pay Gap** — Summary statistics for GPG reporting
23. **Diversity Report** — Aggregate diversity statistics (no individual data)

### Payroll & Compensation
24. **Salary Report** — Employee salary, currency, pay frequency by department (sensitive — restricted)
25. **Pay Change Report** — Compensation changes in a date range with % change
26. **NI Category Summary** — Employee count by NI category
27. **Tax Code Report** — Current tax codes by employee

### Performance & Talent
28. **Performance Ratings Distribution** — Rating distribution by department/manager
29. **Goal Progress** — Active goals with completion percentage
30. **Succession Coverage** — Key roles with/without identified successors

---

## PART 7: BACKGROUND JOBS

### 7.1 Scheduled Report Runner

Add a new scheduled job to the worker:

```typescript
// In scheduler.ts, add:
{
  name: 'scheduled-report-runner',
  schedule: '*/5 * * * *', // Check every 5 minutes
  handler: async () => {
    // Query report_definitions WHERE is_scheduled = true AND next_scheduled_run <= now()
    // For each: execute report, generate export, deliver to recipients
    // Update last_scheduled_run and calculate next_scheduled_run
  }
}
```

### 7.2 Report Export Worker

Add a new processor to the export worker for large reports:

```typescript
// New stream: staffora:jobs:report-exports
// Handler: receives report_id + format + user_id
// Executes the report query, generates the file, stores in S3/local
// Creates a notification for the user with download link
```

### 7.3 Field Catalog Sync Job

Add a nightly job that:
- Validates field catalog entries against actual database schema
- Flags any fields where the source table/column no longer exists
- Logs warnings for schema drift

---

## PART 8: PERMISSIONS MODEL

### 8.1 Report-Level Permissions

| Permission | Description |
|-----------|-------------|
| `reports:read` | View and run reports shared with them |
| `reports:create` | Create new reports |
| `reports:edit` | Edit own reports |
| `reports:delete` | Delete own reports |
| `reports:admin` | Edit/delete any report, manage system templates |
| `reports:schedule` | Set up scheduled delivery |
| `reports:export` | Export reports to file |
| `reports:share` | Share reports with other users |

### 8.2 Field-Level Permission Enforcement

When building the field catalog response for a user:
1. Check each field's `required_permission` against the user's effective permissions
2. Check each field's `field_permission_key` against the field permission service
3. If `is_pii = true`, require `employees:read_pii` permission
4. If `is_sensitive = true`, require the field-specific sensitive permission
5. If `gdpr_consent_required = true`, only include in aggregate reports and verify consent exists
6. **NEVER show a field in the catalog that the user cannot access**
7. **NEVER include a field's data in query results if the user cannot access it**

### 8.3 Row-Level Permission Enforcement

For managers, apply constraint scoping:
- `scope = 'self'` → Only the employee's own data
- `scope = 'direct_reports'` → Only direct reports' data
- `scope = 'org_unit'` → Only employees in the manager's org unit(s)
- `scope = 'all'` → All employees (HR admin)

The query engine must inject these constraints into the WHERE clause based on the user's permission scope.

---

## PART 9: PERFORMANCE REQUIREMENTS

| Metric | Target |
|--------|--------|
| Field catalog load | < 200ms |
| Preview query (25 rows) | < 500ms |
| Full report (1,000 rows) | < 2 seconds |
| Full report (10,000 rows) | < 10 seconds |
| Export generation (10,000 rows, XLSX) | < 30 seconds (background job) |
| Chart render | < 300ms after data load |

### Performance Optimisations:
- Cache field catalog in Redis (15-minute TTL, invalidated on catalog changes)
- Cache report results in Redis (5-minute TTL, keyed by report+params+user)
- Use `EXPLAIN ANALYZE` on generated queries in development mode to log slow queries
- Create PostgreSQL indexes suggested by the query patterns (partial indexes for effective dating)
- For scheduled reports, pre-compute during off-peak hours
- Limit maximum columns to 50 per report
- Limit maximum rows to 100,000 per export (paginate for larger)

---

## PART 10: SEED SYSTEM REPORTS

After creating the field catalog and report definitions, seed the 30 system report templates listed in Part 6. Each should be created with `is_system = true` and fully configured with appropriate columns, filters, sort orders, and chart configs where applicable.

---

## IMPLEMENTATION ORDER

1. **Phase 1**: Field catalog migration + seed data (150-200 fields)
2. **Phase 2**: Report definitions migration + model
3. **Phase 3**: Query engine (SQL generator + permission enforcement)
4. **Phase 4**: API endpoints (CRUD + execution + export)
5. **Phase 5**: Frontend — Report library page
6. **Phase 6**: Frontend — Report builder UI
7. **Phase 7**: Frontend — Chart builder
8. **Phase 8**: Export worker (XLSX/CSV/PDF generation)
9. **Phase 9**: Scheduled report runner
10. **Phase 10**: System report templates seed
11. **Phase 11**: Performance tuning + caching
12. **Phase 12**: Field catalog admin UI (for adding custom fields)

---

## CRITICAL RULES

1. **NEVER use `tx.unsafe()`** — All generated SQL must use postgres.js tagged templates with parameterized values
2. **NEVER bypass RLS** — All report queries run through `db.withTransaction(ctx, ...)` with tenant context set
3. **NEVER expose fields the user cannot access** — Permission check happens BEFORE query generation
4. **NEVER allow individual-level diversity data** — Enforce GROUP BY for diversity fields
5. **NEVER store report results permanently** — Results are ephemeral (Redis cache + export files with TTL)
6. **ALWAYS write outbox events** — Report creation, execution, export, and schedule changes emit domain events
7. **ALWAYS audit report access** — Every report execution is logged in `report_executions` with user, time, parameters
8. **ALWAYS validate field_key against catalog** — Reject any field_key not found in `reporting_field_catalog`
9. **ALWAYS respect effective dating** — Default to current snapshot; support as-of-date and date range queries
10. **ALWAYS use cursor-based pagination** — For report results returned via API (not exports)
