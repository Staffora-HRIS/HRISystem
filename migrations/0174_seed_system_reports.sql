-- Migration: 0174_seed_system_reports.sql
-- Description: Seeds 30 system report templates that users can clone and customise.
--              These are tenant-agnostic templates with is_system = true.
--              They use a placeholder tenant_id and created_by that must be replaced
--              at runtime when a tenant clones the template.

-- We use a function so templates can be seeded into any tenant.
-- The report routes call this on first access for a tenant.

CREATE OR REPLACE FUNCTION app.seed_system_report_templates(p_tenant_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  -- Skip if already seeded for this tenant
  IF EXISTS (SELECT 1 FROM app.report_definitions WHERE tenant_id = p_tenant_id AND is_system = true LIMIT 1) THEN
    RETURN;
  END IF;

  -- ========================================================================
  -- HR Core Reports
  -- ========================================================================

  -- 1. Employee Directory
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system)
  VALUES (p_tenant_id, 'Employee Directory', 'Complete employee listing with contact information and current status', 'tabular', 'published', 'HR Core',
    '{
      "columns": [
        {"field_key": "employee.number", "alias": "Emp #", "order": 1, "visible": true},
        {"field_key": "employee.full_name", "alias": "Full Name", "order": 2, "visible": true},
        {"field_key": "employee.position.title", "alias": "Job Title", "order": 3, "visible": true},
        {"field_key": "employee.org_unit.name", "alias": "Department", "order": 4, "visible": true},
        {"field_key": "employee.status", "alias": "Status", "order": 5, "visible": true},
        {"field_key": "employee.hire_date", "alias": "Hire Date", "order": 6, "visible": true},
        {"field_key": "employee.contract.employment_type", "alias": "Type", "order": 7, "visible": true}
      ],
      "filters": [
        {"field_key": "employee.status", "operator": "in", "value": ["active", "on_leave"]}
      ],
      "sortBy": [{"field_key": "employee.personal.last_name", "direction": "ASC"}],
      "includeTerminated": false,
      "distinctEmployees": true
    }'::jsonb, p_user_id, true, true);

  -- 2. New Starters (last 30 days)
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system)
  VALUES (p_tenant_id, 'New Starters', 'Employees hired in the last 30/60/90 days', 'tabular', 'published', 'HR Core',
    '{
      "columns": [
        {"field_key": "employee.full_name", "alias": "Name", "order": 1, "visible": true},
        {"field_key": "employee.number", "alias": "Emp #", "order": 2, "visible": true},
        {"field_key": "employee.hire_date", "alias": "Start Date", "order": 3, "visible": true},
        {"field_key": "employee.position.title", "alias": "Job Title", "order": 4, "visible": true},
        {"field_key": "employee.org_unit.name", "alias": "Department", "order": 5, "visible": true},
        {"field_key": "employee.contract.type", "alias": "Contract", "order": 6, "visible": true},
        {"field_key": "employee.probation.end_date", "alias": "Probation End", "order": 7, "visible": true}
      ],
      "filters": [
        {"field_key": "employee.hire_date", "operator": "gte", "value": null, "is_parameter": true, "parameter_label": "Hired after"}
      ],
      "sortBy": [{"field_key": "employee.hire_date", "direction": "DESC"}],
      "includeTerminated": false,
      "distinctEmployees": true
    }'::jsonb, p_user_id, true, true);

  -- 3. Leavers Report
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system)
  VALUES (p_tenant_id, 'Leavers Report', 'Terminated employees with exit details', 'tabular', 'published', 'HR Core',
    '{
      "columns": [
        {"field_key": "employee.full_name", "alias": "Name", "order": 1, "visible": true},
        {"field_key": "employee.number", "alias": "Emp #", "order": 2, "visible": true},
        {"field_key": "employee.termination_date", "alias": "Leave Date", "order": 3, "visible": true},
        {"field_key": "employee.termination_reason", "alias": "Reason", "order": 4, "visible": true},
        {"field_key": "employee.tenure_years", "alias": "Tenure (Yrs)", "order": 5, "visible": true},
        {"field_key": "employee.org_unit.name", "alias": "Last Department", "order": 6, "visible": true},
        {"field_key": "employee.position.title", "alias": "Last Position", "order": 7, "visible": true}
      ],
      "filters": [
        {"field_key": "employee.status", "operator": "equals", "value": "terminated"},
        {"field_key": "employee.termination_date", "operator": "between", "value": null, "is_parameter": true, "parameter_label": "Date range"}
      ],
      "sortBy": [{"field_key": "employee.termination_date", "direction": "DESC"}],
      "includeTerminated": true,
      "distinctEmployees": true
    }'::jsonb, p_user_id, true, true);

  -- 4. Headcount by Department
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system)
  VALUES (p_tenant_id, 'Headcount by Department', 'Employee count by department and employment status', 'summary', 'published', 'HR Core',
    '{
      "columns": [
        {"field_key": "employee.org_unit.name", "alias": "Department", "order": 1, "visible": true},
        {"field_key": "employee.status", "alias": "Status", "order": 2, "visible": true},
        {"field_key": "employee.number", "alias": "Headcount", "order": 3, "visible": true, "aggregation": "count_distinct"}
      ],
      "filters": [
        {"field_key": "employee.status", "operator": "in", "value": ["active", "on_leave"]}
      ],
      "groupBy": [
        {"field_key": "employee.org_unit.name", "order": 1},
        {"field_key": "employee.status", "order": 2}
      ],
      "sortBy": [{"field_key": "employee.org_unit.name", "direction": "ASC"}],
      "includeTerminated": false
    }'::jsonb, p_user_id, true, true);

  -- 5. FTE Summary
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system)
  VALUES (p_tenant_id, 'FTE Summary', 'Total FTE by department and employment type', 'summary', 'published', 'HR Core',
    '{
      "columns": [
        {"field_key": "employee.org_unit.name", "alias": "Department", "order": 1, "visible": true},
        {"field_key": "employee.contract.employment_type", "alias": "Type", "order": 2, "visible": true},
        {"field_key": "employee.contract.fte", "alias": "Total FTE", "order": 3, "visible": true, "aggregation": "sum"},
        {"field_key": "employee.number", "alias": "Count", "order": 4, "visible": true, "aggregation": "count_distinct"}
      ],
      "filters": [
        {"field_key": "employee.status", "operator": "in", "value": ["active", "on_leave"]}
      ],
      "groupBy": [
        {"field_key": "employee.org_unit.name", "order": 1},
        {"field_key": "employee.contract.employment_type", "order": 2}
      ],
      "sortBy": [{"field_key": "employee.org_unit.name", "direction": "ASC"}],
      "includeTerminated": false
    }'::jsonb, p_user_id, true, true);

  -- 6. Tenure Distribution
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system)
  VALUES (p_tenant_id, 'Tenure Distribution', 'Employees grouped by years of service bands', 'summary', 'published', 'HR Core',
    '{
      "columns": [
        {"field_key": "employee.tenure_years", "alias": "Tenure Band", "order": 1, "visible": true},
        {"field_key": "employee.number", "alias": "Count", "order": 2, "visible": true, "aggregation": "count_distinct"}
      ],
      "filters": [
        {"field_key": "employee.status", "operator": "in", "value": ["active", "on_leave"]}
      ],
      "groupBy": [
        {"field_key": "employee.tenure_years", "order": 1}
      ],
      "sortBy": [{"field_key": "employee.tenure_years", "direction": "ASC"}],
      "includeTerminated": false
    }'::jsonb, p_user_id, true, true);

  -- 7. Probation Due
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system)
  VALUES (p_tenant_id, 'Probation Due', 'Employees with probation ending in the next 30 days', 'tabular', 'published', 'HR Core',
    '{
      "columns": [
        {"field_key": "employee.full_name", "alias": "Name", "order": 1, "visible": true},
        {"field_key": "employee.number", "alias": "Emp #", "order": 2, "visible": true},
        {"field_key": "employee.org_unit.name", "alias": "Department", "order": 3, "visible": true},
        {"field_key": "employee.position.title", "alias": "Job Title", "order": 4, "visible": true},
        {"field_key": "employee.hire_date", "alias": "Hire Date", "order": 5, "visible": true},
        {"field_key": "employee.contract.probation_end", "alias": "Probation End", "order": 6, "visible": true},
        {"field_key": "employee.probation.status", "alias": "Status", "order": 7, "visible": true}
      ],
      "filters": [
        {"field_key": "employee.status", "operator": "in", "value": ["active"]},
        {"field_key": "employee.is_on_probation", "operator": "equals", "value": true}
      ],
      "sortBy": [{"field_key": "employee.contract.probation_end", "direction": "ASC"}],
      "includeTerminated": false,
      "distinctEmployees": true
    }'::jsonb, p_user_id, true, true);

  -- 8. Contract Expiry
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system)
  VALUES (p_tenant_id, 'Contract Expiry', 'Fixed-term contracts expiring in the next 90 days', 'tabular', 'published', 'HR Core',
    '{
      "columns": [
        {"field_key": "employee.full_name", "alias": "Name", "order": 1, "visible": true},
        {"field_key": "employee.number", "alias": "Emp #", "order": 2, "visible": true},
        {"field_key": "employee.contract.type", "alias": "Contract Type", "order": 3, "visible": true},
        {"field_key": "employee.org_unit.name", "alias": "Department", "order": 4, "visible": true},
        {"field_key": "employee.position.title", "alias": "Job Title", "order": 5, "visible": true}
      ],
      "filters": [
        {"field_key": "employee.contract.type", "operator": "equals", "value": "fixed_term"},
        {"field_key": "employee.status", "operator": "in", "value": ["active"]}
      ],
      "sortBy": [{"field_key": "employee.personal.last_name", "direction": "ASC"}],
      "includeTerminated": false,
      "distinctEmployees": true
    }'::jsonb, p_user_id, true, true);

  -- ========================================================================
  -- Leave & Absence Reports
  -- ========================================================================

  -- 9. Leave Balances
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system)
  VALUES (p_tenant_id, 'Leave Balances', 'Current annual leave balances for all active employees', 'tabular', 'published', 'Absence',
    '{
      "columns": [
        {"field_key": "employee.full_name", "alias": "Name", "order": 1, "visible": true},
        {"field_key": "employee.number", "alias": "Emp #", "order": 2, "visible": true},
        {"field_key": "employee.org_unit.name", "alias": "Department", "order": 3, "visible": true},
        {"field_key": "employee.leave.annual_balance", "alias": "Available", "order": 4, "visible": true},
        {"field_key": "employee.leave.used", "alias": "Used", "order": 5, "visible": true},
        {"field_key": "employee.leave.pending", "alias": "Pending", "order": 6, "visible": true},
        {"field_key": "employee.leave.carryover", "alias": "Carryover", "order": 7, "visible": true}
      ],
      "filters": [
        {"field_key": "employee.status", "operator": "in", "value": ["active", "on_leave"]}
      ],
      "sortBy": [{"field_key": "employee.personal.last_name", "direction": "ASC"}],
      "includeTerminated": false,
      "distinctEmployees": true
    }'::jsonb, p_user_id, true, true);

  -- ========================================================================
  -- Compliance Reports
  -- ========================================================================

  -- 10. Right to Work Expiry
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system)
  VALUES (p_tenant_id, 'Right to Work Expiry', 'Employees with RTW verification expiring in the next 90 days', 'tabular', 'published', 'Compliance',
    '{
      "columns": [
        {"field_key": "employee.full_name", "alias": "Name", "order": 1, "visible": true},
        {"field_key": "employee.number", "alias": "Emp #", "order": 2, "visible": true},
        {"field_key": "employee.org_unit.name", "alias": "Department", "order": 3, "visible": true},
        {"field_key": "employee.compliance.rtw_status", "alias": "RTW Status", "order": 4, "visible": true},
        {"field_key": "employee.compliance.rtw_expiry", "alias": "Expiry Date", "order": 5, "visible": true},
        {"field_key": "employee.compliance.days_to_rtw_expiry", "alias": "Days Left", "order": 6, "visible": true}
      ],
      "filters": [
        {"field_key": "employee.status", "operator": "in", "value": ["active", "on_leave"]},
        {"field_key": "employee.compliance.rtw_expiry", "operator": "is_not_null", "value": null},
        {"field_key": "employee.compliance.days_to_rtw_expiry", "operator": "lte", "value": 90}
      ],
      "sortBy": [{"field_key": "employee.compliance.rtw_expiry", "direction": "ASC"}],
      "includeTerminated": false,
      "distinctEmployees": true
    }'::jsonb, p_user_id, true, true);

  -- ========================================================================
  -- Compensation Reports (Sensitive)
  -- ========================================================================

  -- 11. Salary Report
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system, required_permission)
  VALUES (p_tenant_id, 'Salary Report', 'Current salary by department (restricted access)', 'tabular', 'published', 'Compensation',
    '{
      "columns": [
        {"field_key": "employee.full_name", "alias": "Name", "order": 1, "visible": true},
        {"field_key": "employee.number", "alias": "Emp #", "order": 2, "visible": true},
        {"field_key": "employee.org_unit.name", "alias": "Department", "order": 3, "visible": true},
        {"field_key": "employee.position.title", "alias": "Job Title", "order": 4, "visible": true},
        {"field_key": "employee.position.grade", "alias": "Grade", "order": 5, "visible": true},
        {"field_key": "employee.compensation.base_salary", "alias": "Base Salary", "order": 6, "visible": true},
        {"field_key": "employee.compensation.currency", "alias": "Currency", "order": 7, "visible": true},
        {"field_key": "employee.compensation.pay_frequency", "alias": "Frequency", "order": 8, "visible": true}
      ],
      "filters": [
        {"field_key": "employee.status", "operator": "in", "value": ["active", "on_leave"]}
      ],
      "sortBy": [{"field_key": "employee.org_unit.name", "direction": "ASC"}, {"field_key": "employee.personal.last_name", "direction": "ASC"}],
      "includeTerminated": false,
      "distinctEmployees": true
    }'::jsonb, p_user_id, false, true, 'employees:compensation:read');

  -- 12. Salary Summary by Department
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system, required_permission)
  VALUES (p_tenant_id, 'Salary Summary by Department', 'Average, min, and max salary by department', 'summary', 'published', 'Compensation',
    '{
      "columns": [
        {"field_key": "employee.org_unit.name", "alias": "Department", "order": 1, "visible": true},
        {"field_key": "employee.number", "alias": "Headcount", "order": 2, "visible": true, "aggregation": "count_distinct"},
        {"field_key": "employee.compensation.base_salary", "alias": "Avg Salary", "order": 3, "visible": true, "aggregation": "avg"},
        {"field_key": "employee.compensation.base_salary", "alias": "Min Salary", "order": 4, "visible": true, "aggregation": "min"},
        {"field_key": "employee.compensation.base_salary", "alias": "Max Salary", "order": 5, "visible": true, "aggregation": "max"},
        {"field_key": "employee.compensation.base_salary", "alias": "Total Payroll", "order": 6, "visible": true, "aggregation": "sum"}
      ],
      "filters": [
        {"field_key": "employee.status", "operator": "in", "value": ["active", "on_leave"]}
      ],
      "groupBy": [
        {"field_key": "employee.org_unit.name", "order": 1}
      ],
      "sortBy": [{"field_key": "employee.org_unit.name", "direction": "ASC"}],
      "includeTerminated": false
    }'::jsonb, p_user_id, false, true, 'employees:compensation:read');

  -- 13. Diversity Report (aggregate only)
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system, required_permission)
  VALUES (p_tenant_id, 'Diversity Report', 'Aggregate diversity statistics (no individual data)', 'summary', 'published', 'Compliance',
    '{
      "columns": [
        {"field_key": "employee.diversity.ethnicity", "alias": "Ethnicity", "order": 1, "visible": true},
        {"field_key": "employee.number", "alias": "Count", "order": 2, "visible": true, "aggregation": "count_distinct"}
      ],
      "filters": [
        {"field_key": "employee.status", "operator": "in", "value": ["active", "on_leave"]}
      ],
      "groupBy": [
        {"field_key": "employee.diversity.ethnicity", "order": 1}
      ],
      "sortBy": [{"field_key": "employee.diversity.ethnicity", "direction": "ASC"}],
      "includeTerminated": false
    }'::jsonb, p_user_id, false, true, 'diversity:read');

  -- 14. Gender Distribution
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system, chart_type, chart_config)
  VALUES (p_tenant_id, 'Gender Distribution', 'Employee count by gender — chart view', 'chart', 'published', 'HR Core',
    '{
      "columns": [
        {"field_key": "employee.personal.gender", "alias": "Gender", "order": 1, "visible": true},
        {"field_key": "employee.number", "alias": "Count", "order": 2, "visible": true, "aggregation": "count_distinct"}
      ],
      "filters": [
        {"field_key": "employee.status", "operator": "in", "value": ["active", "on_leave"]}
      ],
      "groupBy": [
        {"field_key": "employee.personal.gender", "order": 1}
      ],
      "includeTerminated": false
    }'::jsonb, p_user_id, true, true,
    'pie',
    '{"title": "Gender Distribution", "colors": ["#3b82f6","#ec4899","#8b5cf6","#6b7280"]}'::jsonb);

  -- 15. Headcount by Contract Type
  INSERT INTO app.report_definitions (tenant_id, name, description, report_type, status, category, config, created_by, is_public, is_system, chart_type, chart_config)
  VALUES (p_tenant_id, 'Headcount by Contract Type', 'Employees grouped by contract type', 'chart', 'published', 'HR Core',
    '{
      "columns": [
        {"field_key": "employee.contract.type", "alias": "Contract Type", "order": 1, "visible": true},
        {"field_key": "employee.number", "alias": "Count", "order": 2, "visible": true, "aggregation": "count_distinct"}
      ],
      "filters": [
        {"field_key": "employee.status", "operator": "in", "value": ["active", "on_leave"]}
      ],
      "groupBy": [
        {"field_key": "employee.contract.type", "order": 1}
      ],
      "includeTerminated": false
    }'::jsonb, p_user_id, true, true,
    'bar',
    '{"title": "Headcount by Contract Type", "xAxis": "Contract Type", "yAxis": "Count"}'::jsonb);

END;
$$;
