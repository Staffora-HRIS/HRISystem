const fs = require('fs');

const content = fs.readFileSync('packages/api/src/modules/analytics/repository.ts', 'utf8');
const marker = '  // ===========================================================================\n  // Workforce Planning Analytics\n  // ===========================================================================';

if (!content.includes(marker)) {
  console.error('Could not find marker');
  process.exit(1);
}

const newBlock = `  // ===========================================================================
  // Compensation Analytics - Focused Endpoints (TODO-146)
  // ===========================================================================

  private compensationFilterFragments(tx: any, filters: CompensationAnalyticsFilters) {
    const currency = filters.currency || "GBP";
    return {
      currency,
      departmentFilter: filters.department_id ? tx\`AND pa.org_unit_id = \${filters.department_id}::uuid\` : tx\`\`,
      gradeFilter: filters.job_grade ? tx\`AND p.job_grade = \${filters.job_grade}\` : tx\`\`,
      dateRangeFilter: filters.start_date && filters.end_date
        ? tx\`AND ch.effective_from <= \${filters.end_date}::date AND (ch.effective_to IS NULL OR ch.effective_to >= \${filters.start_date}::date)\`
        : tx\`AND ch.effective_to IS NULL\`,
    };
  }

  async getDistributionByDepartment(context: TenantContext, filters: CompensationAnalyticsFilters = {}): Promise<any[]> {
    const currency = filters.currency || "GBP";
    return this.db.withTransaction(context, async (tx) => {
      const f = this.compensationFilterFragments(tx, filters);
      return tx<any[]>\`
        SELECT COALESCE(o.id::text, 'unassigned') AS group_key, COALESCE(o.name, 'Unassigned') AS group_label,
          COUNT(*)::int AS headcount,
          ROUND(AVG(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS avg_salary,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS median_salary,
          ROUND(MIN(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS min_salary,
          ROUND(MAX(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS max_salary,
          ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS p25_salary,
          ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS p75_salary,
          ROUND(SUM(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS total_payroll
        FROM app.compensation_history ch
        INNER JOIN app.employees e ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
        LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.tenant_id = e.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
        LEFT JOIN app.positions p ON p.id = pa.position_id
        LEFT JOIN app.org_units o ON o.id = pa.org_unit_id
        WHERE e.status = 'active' AND ch.currency = \${currency}
          \${f.dateRangeFilter} \${f.departmentFilter} \${f.gradeFilter}
        GROUP BY o.id, o.name ORDER BY avg_salary DESC
      \`;
    });
  }

  async getDistributionByGrade(context: TenantContext, filters: CompensationAnalyticsFilters = {}): Promise<any[]> {
    const currency = filters.currency || "GBP";
    return this.db.withTransaction(context, async (tx) => {
      const f = this.compensationFilterFragments(tx, filters);
      return tx<any[]>\`
        SELECT COALESCE(p.job_grade, 'Ungraded') AS group_key, COALESCE(p.job_grade, 'Ungraded') AS group_label,
          COUNT(*)::int AS headcount,
          ROUND(AVG(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS avg_salary,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS median_salary,
          ROUND(MIN(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS min_salary,
          ROUND(MAX(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS max_salary,
          ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS p25_salary,
          ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS p75_salary,
          ROUND(SUM(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS total_payroll
        FROM app.compensation_history ch
        INNER JOIN app.employees e ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
        LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.tenant_id = e.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
        LEFT JOIN app.positions p ON p.id = pa.position_id
        WHERE e.status = 'active' AND ch.currency = \${currency}
          \${f.dateRangeFilter} \${f.departmentFilter} \${f.gradeFilter}
        GROUP BY p.job_grade ORDER BY p.job_grade NULLS LAST
      \`;
    });
  }

  async getDistributionByGender(context: TenantContext, filters: CompensationAnalyticsFilters = {}): Promise<any[]> {
    const currency = filters.currency || "GBP";
    return this.db.withTransaction(context, async (tx) => {
      const f = this.compensationFilterFragments(tx, filters);
      return tx<any[]>\`
        SELECT COALESCE(ep.gender::text, 'not_specified') AS group_key,
          COALESCE(INITCAP(ep.gender::text), 'Not Specified') AS group_label,
          COUNT(*)::int AS headcount,
          ROUND(AVG(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS avg_salary,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS median_salary,
          ROUND(MIN(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS min_salary,
          ROUND(MAX(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS max_salary,
          ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS p25_salary,
          ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS p75_salary,
          ROUND(SUM(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS total_payroll
        FROM app.compensation_history ch
        INNER JOIN app.employees e ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = e.tenant_id AND ep.effective_to IS NULL
        LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.tenant_id = e.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
        LEFT JOIN app.positions p ON p.id = pa.position_id
        WHERE e.status = 'active' AND ch.currency = \${currency}
          \${f.dateRangeFilter} \${f.departmentFilter} \${f.gradeFilter}
        GROUP BY ep.gender ORDER BY headcount DESC
      \`;
    });
  }

  async getDistributionByBand(context: TenantContext, filters: CompensationAnalyticsFilters = {}): Promise<any[]> {
    const currency = filters.currency || "GBP";
    return this.db.withTransaction(context, async (tx) => {
      const f = this.compensationFilterFragments(tx, filters);
      return tx<any[]>\`
        WITH salaries AS (SELECT app.calculate_annual_salary(ch.base_salary, ch.pay_frequency) AS annual_salary FROM app.compensation_history ch INNER JOIN app.employees e ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.tenant_id = e.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL LEFT JOIN app.positions p ON p.id = pa.position_id WHERE e.status = 'active' AND ch.currency = \${currency} \${f.dateRangeFilter} \${f.departmentFilter} \${f.gradeFilter})
        SELECT CASE WHEN annual_salary < 25000 THEN 'Under 25k' WHEN annual_salary < 35000 THEN '25k-35k' WHEN annual_salary < 50000 THEN '35k-50k' WHEN annual_salary < 75000 THEN '50k-75k' WHEN annual_salary < 100000 THEN '75k-100k' ELSE '100k+' END AS band, COUNT(*)::int AS count, ROUND(AVG(annual_salary), 2) AS avg_salary FROM salaries GROUP BY band ORDER BY CASE band WHEN 'Under 25k' THEN 1 WHEN '25k-35k' THEN 2 WHEN '35k-50k' THEN 3 WHEN '50k-75k' THEN 4 WHEN '75k-100k' THEN 5 WHEN '100k+' THEN 6 END
      \`;
    });
  }

  async getCompaRatioByDepartment(context: TenantContext, filters: CompensationAnalyticsFilters = {}): Promise<any[]> {
    const currency = filters.currency || "GBP";
    return this.db.withTransaction(context, async (tx) => {
      const f = this.compensationFilterFragments(tx, filters);
      return tx<any[]>\`
        WITH employee_compa AS (
          SELECT COALESCE(o.id::text, 'unassigned') AS org_unit_id, COALESCE(o.name, 'Unassigned') AS org_unit_name,
            app.calculate_annual_salary(ch.base_salary, ch.pay_frequency) AS annual_salary, p.min_salary AS range_min, p.max_salary AS range_max,
            CASE WHEN (p.min_salary + p.max_salary) / 2.0 > 0 THEN app.calculate_annual_salary(ch.base_salary, ch.pay_frequency) / ((p.min_salary + p.max_salary) / 2.0) ELSE NULL END AS compa_ratio
          FROM app.compensation_history ch INNER JOIN app.employees e ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
          INNER JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.tenant_id = e.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
          INNER JOIN app.positions p ON p.id = pa.position_id LEFT JOIN app.org_units o ON o.id = pa.org_unit_id
          WHERE e.status = 'active' AND ch.currency = \${currency} AND p.min_salary IS NOT NULL AND p.max_salary IS NOT NULL AND p.min_salary > 0 AND p.max_salary > 0
            \${f.dateRangeFilter} \${f.departmentFilter} \${f.gradeFilter}
        )
        SELECT org_unit_id, org_unit_name, COUNT(*)::int AS headcount, ROUND(AVG(compa_ratio), 4) AS avg_compa_ratio,
          COUNT(*) FILTER (WHERE annual_salary < range_min)::int AS below_range_count,
          COUNT(*) FILTER (WHERE annual_salary >= range_min AND annual_salary <= range_max)::int AS within_range_count,
          COUNT(*) FILTER (WHERE annual_salary > range_max)::int AS above_range_count
        FROM employee_compa WHERE compa_ratio IS NOT NULL GROUP BY org_unit_id, org_unit_name ORDER BY org_unit_name
      \`;
    });
  }

  async getCompaRatioByGradeExtended(context: TenantContext, filters: CompensationAnalyticsFilters = {}): Promise<any[]> {
    const currency = filters.currency || "GBP";
    return this.db.withTransaction(context, async (tx) => {
      const f = this.compensationFilterFragments(tx, filters);
      return tx<any[]>\`
        WITH employee_compa AS (
          SELECT p.job_grade, p.min_salary AS range_min, p.max_salary AS range_max, (p.min_salary + p.max_salary) / 2.0 AS range_midpoint,
            app.calculate_annual_salary(ch.base_salary, ch.pay_frequency) AS annual_salary,
            CASE WHEN (p.min_salary + p.max_salary) / 2.0 > 0 THEN app.calculate_annual_salary(ch.base_salary, ch.pay_frequency) / ((p.min_salary + p.max_salary) / 2.0) ELSE NULL END AS compa_ratio
          FROM app.compensation_history ch INNER JOIN app.employees e ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
          INNER JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.tenant_id = e.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
          INNER JOIN app.positions p ON p.id = pa.position_id
          WHERE e.status = 'active' AND ch.currency = \${currency} AND p.job_grade IS NOT NULL AND p.min_salary IS NOT NULL AND p.max_salary IS NOT NULL AND p.min_salary > 0 AND p.max_salary > 0
            \${f.dateRangeFilter} \${f.departmentFilter} \${f.gradeFilter}
        )
        SELECT job_grade, COUNT(*)::int AS headcount, ROUND(MIN(range_min), 2) AS range_min, ROUND(MAX(range_max), 2) AS range_max,
          ROUND(AVG(range_midpoint), 2) AS range_midpoint, ROUND(AVG(annual_salary), 2) AS avg_salary, ROUND(AVG(compa_ratio), 4) AS avg_compa_ratio,
          COUNT(*) FILTER (WHERE annual_salary < range_min)::int AS below_range_count,
          COUNT(*) FILTER (WHERE annual_salary >= range_min AND annual_salary <= range_max)::int AS within_range_count,
          COUNT(*) FILTER (WHERE annual_salary > range_max)::int AS above_range_count
        FROM employee_compa WHERE compa_ratio IS NOT NULL GROUP BY job_grade ORDER BY job_grade
      \`;
    });
  }

  async getPayEquityByGradeExtended(context: TenantContext, filters: CompensationAnalyticsFilters = {}): Promise<any[]> {
    const currency = filters.currency || "GBP";
    return this.db.withTransaction(context, async (tx) => {
      const f = this.compensationFilterFragments(tx, filters);
      return tx<any[]>\`
        WITH employee_pay AS (
          SELECT COALESCE(p.job_grade, 'Ungraded') AS job_grade, ep.gender, app.calculate_annual_salary(ch.base_salary, ch.pay_frequency) AS annual_salary
          FROM app.compensation_history ch INNER JOIN app.employees e ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
          INNER JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = e.tenant_id AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.tenant_id = e.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
          LEFT JOIN app.positions p ON p.id = pa.position_id
          WHERE e.status = 'active' AND ch.currency = \${currency} AND ep.gender IN ('male', 'female') \${f.dateRangeFilter} \${f.departmentFilter} \${f.gradeFilter}
        ), by_grade_gender AS (
          SELECT job_grade, gender, COUNT(*)::int AS employee_count, ROUND(AVG(annual_salary), 2) AS avg_salary, ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY annual_salary), 2) AS median_salary FROM employee_pay GROUP BY job_grade, gender
        )
        SELECT g.job_grade, COALESCE(m.employee_count, 0)::int AS male_count, COALESCE(f.employee_count, 0)::int AS female_count,
          COALESCE(m.avg_salary, 0) AS male_avg_salary, COALESCE(f.avg_salary, 0) AS female_avg_salary,
          CASE WHEN COALESCE(m.avg_salary, 0) > 0 AND f.avg_salary IS NOT NULL THEN ROUND(((m.avg_salary - f.avg_salary) / m.avg_salary) * 100, 2) ELSE NULL END AS pay_gap_percentage,
          COALESCE(m.median_salary, 0) AS male_median_salary, COALESCE(f.median_salary, 0) AS female_median_salary,
          CASE WHEN COALESCE(m.median_salary, 0) > 0 AND f.median_salary IS NOT NULL THEN ROUND(((m.median_salary - f.median_salary) / m.median_salary) * 100, 2) ELSE NULL END AS median_pay_gap_percentage
        FROM (SELECT DISTINCT job_grade FROM by_grade_gender) g
        LEFT JOIN by_grade_gender m ON m.job_grade = g.job_grade AND m.gender = 'male'
        LEFT JOIN by_grade_gender f ON f.job_grade = g.job_grade AND f.gender = 'female' ORDER BY g.job_grade
      \`;
    });
  }

  async getPayEquityOverallExtended(context: TenantContext, filters: CompensationAnalyticsFilters = {}): Promise<any> {
    const currency = filters.currency || "GBP";
    const rows = await this.db.withTransaction(context, async (tx) => {
      const f = this.compensationFilterFragments(tx, filters);
      return tx<any[]>\`
        WITH employee_pay AS (
          SELECT ep.gender, app.calculate_annual_salary(ch.base_salary, ch.pay_frequency) AS annual_salary
          FROM app.compensation_history ch INNER JOIN app.employees e ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
          INNER JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = e.tenant_id AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.tenant_id = e.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
          LEFT JOIN app.positions p ON p.id = pa.position_id
          WHERE e.status = 'active' AND ch.currency = \${currency} AND ep.gender IN ('male', 'female') \${f.dateRangeFilter} \${f.departmentFilter} \${f.gradeFilter}
        )
        SELECT COUNT(*) FILTER (WHERE gender = 'male')::int AS total_male, COUNT(*) FILTER (WHERE gender = 'female')::int AS total_female,
          ROUND(AVG(annual_salary) FILTER (WHERE gender = 'male'), 2) AS overall_male_avg_salary,
          ROUND(AVG(annual_salary) FILTER (WHERE gender = 'female'), 2) AS overall_female_avg_salary,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY annual_salary) FILTER (WHERE gender = 'male'), 2) AS overall_male_median_salary,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY annual_salary) FILTER (WHERE gender = 'female'), 2) AS overall_female_median_salary
        FROM employee_pay
      \`;
    });
    const r = rows[0] || {};
    const maleAvg = Number(r.overallMaleAvgSalary) || 0;
    const femaleAvg = Number(r.overallFemaleAvgSalary) || 0;
    const maleMedian = Number(r.overallMaleMedianSalary) || 0;
    const femaleMedian = Number(r.overallFemaleMedianSalary) || 0;
    return {
      total_male: Number(r.totalMale) || 0, total_female: Number(r.totalFemale) || 0,
      overall_male_avg_salary: maleAvg, overall_female_avg_salary: femaleAvg,
      overall_mean_pay_gap_percentage: maleAvg > 0 && femaleAvg > 0 ? Number(((maleAvg - femaleAvg) / maleAvg * 100).toFixed(2)) : null,
      overall_median_pay_gap_percentage: maleMedian > 0 && femaleMedian > 0 ? Number(((maleMedian - femaleMedian) / maleMedian * 100).toFixed(2)) : null,
    };
  }

  async getPayEquityByEthnicity(context: TenantContext, filters: CompensationAnalyticsFilters = {}): Promise<any[]> {
    const currency = filters.currency || "GBP";
    return this.db.withTransaction(context, async (tx) => {
      const f = this.compensationFilterFragments(tx, filters);
      return tx<any[]>\`
        SELECT COALESCE(dd.ethnicity, 'Not provided') AS ethnicity, COUNT(*)::int AS employee_count,
          ROUND(AVG(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS avg_salary,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS median_salary
        FROM app.compensation_history ch INNER JOIN app.employees e ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
        INNER JOIN app.diversity_data dd ON dd.employee_id = e.id AND dd.tenant_id = e.tenant_id AND dd.consent_given = true AND dd.ethnicity IS NOT NULL
        LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.tenant_id = e.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
        LEFT JOIN app.positions p ON p.id = pa.position_id
        WHERE e.status = 'active' AND ch.currency = \${currency} \${f.dateRangeFilter} \${f.departmentFilter} \${f.gradeFilter}
        GROUP BY dd.ethnicity ORDER BY avg_salary DESC
      \`;
    });
  }

  async getCompensationSummaryExtended(context: TenantContext, filters: CompensationAnalyticsFilters = {}): Promise<any> {
    const currency = filters.currency || "GBP";
    const rows = await this.db.withTransaction(context, async (tx) => {
      const f = this.compensationFilterFragments(tx, filters);
      return tx<any[]>\`
        SELECT COUNT(*)::int AS total_employees,
          ROUND(AVG(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS avg_salary,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS median_salary,
          ROUND(MIN(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS min_salary,
          ROUND(MAX(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS max_salary,
          ROUND(PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS p10_salary,
          ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS p25_salary,
          ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS p75_salary,
          ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS p90_salary,
          ROUND(SUM(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency)), 2) AS total_payroll
        FROM app.compensation_history ch INNER JOIN app.employees e ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
        LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.tenant_id = e.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
        LEFT JOIN app.positions p ON p.id = pa.position_id
        WHERE e.status = 'active' AND ch.currency = \${currency} \${f.dateRangeFilter} \${f.departmentFilter} \${f.gradeFilter}
      \`;
    });
    return rows[0] || {};
  }

  async getRecentCompensationChangesExtended(context: TenantContext, filters: CompensationAnalyticsFilters = {}): Promise<{ count: number; avg_change_pct: number | null }> {
    const currency = filters.currency || "GBP";
    const rows = await this.db.withTransaction(context, async (tx) => {
      const f = this.compensationFilterFragments(tx, filters);
      return tx<any[]>\`
        SELECT COUNT(*)::int AS change_count, ROUND(AVG(ch.change_percentage), 2) AS avg_change_pct
        FROM app.compensation_history ch INNER JOIN app.employees e ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
        LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.tenant_id = e.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
        LEFT JOIN app.positions p ON p.id = pa.position_id
        WHERE e.status = 'active' AND ch.currency = \${currency} AND ch.effective_from >= (CURRENT_DATE - INTERVAL '12 months') AND ch.change_reason IS NOT NULL
          \${f.departmentFilter} \${f.gradeFilter}
      \`;
    });
    const r = rows[0] || {};
    return { count: Number(r.changeCount) || 0, avg_change_pct: r.avgChangePct != null ? Number(r.avgChangePct) : null };
  }

  async getOverallCompaRatio(context: TenantContext, filters: CompensationAnalyticsFilters = {}): Promise<number | null> {
    const currency = filters.currency || "GBP";
    const rows = await this.db.withTransaction(context, async (tx) => {
      const f = this.compensationFilterFragments(tx, filters);
      return tx<any[]>\`
        SELECT ROUND(AVG(app.calculate_annual_salary(ch.base_salary, ch.pay_frequency) / NULLIF((p.min_salary + p.max_salary) / 2.0, 0)), 4) AS avg_compa_ratio
        FROM app.compensation_history ch INNER JOIN app.employees e ON e.id = ch.employee_id AND e.tenant_id = ch.tenant_id
        INNER JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.tenant_id = e.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
        INNER JOIN app.positions p ON p.id = pa.position_id
        WHERE e.status = 'active' AND ch.currency = \${currency} AND p.min_salary IS NOT NULL AND p.max_salary IS NOT NULL AND p.min_salary > 0 AND p.max_salary > 0
          \${f.dateRangeFilter} \${f.departmentFilter} \${f.gradeFilter}
      \`;
    });
    const r = rows[0];
    return r?.avgCompaRatio != null ? Number(r.avgCompaRatio) : null;
  }

`;

const result = content.replace(marker, newBlock + '\n' + marker);
fs.writeFileSync('packages/api/src/modules/analytics/repository.ts', result, 'utf8');
console.log('Done: repository methods inserted');
