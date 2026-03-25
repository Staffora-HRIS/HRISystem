/**
 * Script to apply TODO-158 changes to the LMS module files.
 * Run with: bun scripts/apply-todo-158.js
 */

const fs = require("fs");
const path = require("path");

const BASE = path.resolve(__dirname, "..");
const LMS = path.join(BASE, "packages/api/src/modules/lms");

function readFile(name) {
  return fs.readFileSync(path.join(LMS, name), "utf8");
}

function writeFile(name, content) {
  fs.writeFileSync(path.join(LMS, name), content);
  console.log(`  Written ${name} (${content.length} chars)`);
}

// =====================================================================
// 1. SCHEMAS
// =====================================================================
console.log("\n=== Updating schemas.ts ===");
let schemas = readFile("schemas.ts");

if (!schemas.includes("ComplianceFiltersQuerySchema")) {
  const newSchemas = `
// =============================================================================
// Compliance Endpoint Schemas (TODO-158)
// =============================================================================

export const ComplianceFiltersQuerySchema = t.Object({
  departmentId: t.Optional(UuidSchema),
  courseId: t.Optional(UuidSchema),
  dateFrom: t.Optional(DateSchema),
  dateTo: t.Optional(DateSchema),
  includeArchived: t.Optional(t.String()),
});

export const ComplianceOverviewResponseSchema = t.Object({
  generatedAt: t.String(),
  totalMandatoryCourses: t.Number(),
  totalAssignments: t.Number(),
  totalCompleted: t.Number(),
  totalInProgress: t.Number(),
  totalNotStarted: t.Number(),
  totalOverdue: t.Number(),
  overallCompletionRate: t.Number(),
  upcomingDeadlines: t.Array(
    t.Object({
      assignmentId: UuidSchema,
      employeeId: UuidSchema,
      employeeName: t.String(),
      employeeNumber: t.String(),
      courseId: UuidSchema,
      courseName: t.String(),
      dueDate: t.String(),
      daysUntilDue: t.Number(),
    })
  ),
});

export const ComplianceByCourseResponseSchema = t.Object({
  generatedAt: t.String(),
  courses: t.Array(MandatoryCourseComplianceSchema),
});

export const ComplianceByDepartmentResponseSchema = t.Object({
  generatedAt: t.String(),
  departments: t.Array(DepartmentComplianceSchema),
});

export const OverdueAssignmentSchema = t.Object({
  assignmentId: UuidSchema,
  employeeId: UuidSchema,
  employeeName: t.String(),
  employeeNumber: t.String(),
  departmentId: t.Union([UuidSchema, t.Null()]),
  departmentName: t.Union([t.String(), t.Null()]),
  courseId: UuidSchema,
  courseName: t.String(),
  category: t.Union([t.String(), t.Null()]),
  assignedAt: t.String(),
  dueDate: t.String(),
  daysOverdue: t.Number(),
  status: t.String(),
  progressPercent: t.Number(),
});

export const ComplianceOverdueQuerySchema = t.Object({
  departmentId: t.Optional(UuidSchema),
  courseId: t.Optional(UuidSchema),
  dateFrom: t.Optional(DateSchema),
  dateTo: t.Optional(DateSchema),
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.String()),
});

export const ComplianceOverdueResponseSchema = t.Object({
  generatedAt: t.String(),
  items: t.Array(OverdueAssignmentSchema),
  totalOverdue: t.Number(),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

`;

  schemas = schemas.replace("// Export types", newSchemas + "// Export types");

  const newTypes = `
export type ComplianceOverview = typeof ComplianceOverviewResponseSchema.static;
export type ComplianceByCourse = typeof ComplianceByCourseResponseSchema.static;
export type ComplianceByDepartment = typeof ComplianceByDepartmentResponseSchema.static;
export type OverdueAssignment = typeof OverdueAssignmentSchema.static;
export type ComplianceOverdueResponse = typeof ComplianceOverdueResponseSchema.static;
`;

  schemas = schemas.trimEnd() + "\n" + newTypes;
  writeFile("schemas.ts", schemas);
} else {
  console.log("  Already has compliance schemas");
}

// =====================================================================
// 2. REPOSITORY
// =====================================================================
console.log("\n=== Updating repository.ts ===");
let repo = readFile("repository.ts");

if (!repo.includes("getComplianceOverview")) {
  // Read the separate file with repo methods
  const repoMethodsPath = path.join(BASE, "scripts/todo-158-repo-methods.ts.txt");

  // Write repo methods file first
  const repoMethods = `
  // ===========================================================================
  // Compliance Endpoints (TODO-158)
  // ===========================================================================

  async getComplianceOverview(
    ctx: TenantContext,
    filters: { courseId?: string; departmentId?: string; dateFrom?: string; dateTo?: string; includeArchived?: boolean }
  ): Promise<{ summary: any; upcomingDeadlines: any[] }> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        const courseFilter = filters.courseId ? tx\`AND c.id = \${filters.courseId}::uuid\` : tx\`\`;
        const archivedFilter = !filters.includeArchived ? tx\`AND c.status != 'archived'\` : tx\`\`;
        const dateFromFilter = filters.dateFrom ? tx\`AND a.due_date >= \${filters.dateFrom}::date\` : tx\`\`;
        const dateToFilter = filters.dateTo ? tx\`AND a.due_date <= \${filters.dateTo}::date\` : tx\`\`;

        let summaryQuery;
        if (filters.departmentId) {
          const deptFilter = tx\`AND ou.id = \${filters.departmentId}::uuid\`;
          [summaryQuery] = await tx\`
            SELECT
              COUNT(DISTINCT c.id) AS total_mandatory_courses,
              COUNT(a.id) AS total_assignments,
              COUNT(a.id) FILTER (WHERE a.status = 'completed') AS total_completed,
              COUNT(a.id) FILTER (WHERE a.status = 'in_progress') AS total_in_progress,
              COUNT(a.id) FILTER (WHERE a.status = 'not_started') AS total_not_started,
              COUNT(a.id) FILTER (WHERE a.due_date < CURRENT_DATE AND a.status NOT IN ('completed', 'expired')) AS total_overdue
            FROM app.courses c
            LEFT JOIN app.assignments a ON a.course_id = c.id AND a.tenant_id = c.tenant_id AND a.assignment_type = 'required'
            LEFT JOIN app.position_assignments pa ON pa.employee_id = a.employee_id AND pa.tenant_id = a.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
            LEFT JOIN app.org_units ou ON ou.id = pa.org_unit_id AND ou.tenant_id = a.tenant_id
            WHERE c.tenant_id = \${ctx.tenantId}::uuid AND c.is_mandatory = true
              \${courseFilter} \${archivedFilter} \${deptFilter} \${dateFromFilter} \${dateToFilter}
          \`;
        } else {
          [summaryQuery] = await tx\`
            SELECT
              COUNT(DISTINCT c.id) AS total_mandatory_courses,
              COUNT(a.id) AS total_assignments,
              COUNT(a.id) FILTER (WHERE a.status = 'completed') AS total_completed,
              COUNT(a.id) FILTER (WHERE a.status = 'in_progress') AS total_in_progress,
              COUNT(a.id) FILTER (WHERE a.status = 'not_started') AS total_not_started,
              COUNT(a.id) FILTER (WHERE a.due_date < CURRENT_DATE AND a.status NOT IN ('completed', 'expired')) AS total_overdue
            FROM app.courses c
            LEFT JOIN app.assignments a ON a.course_id = c.id AND a.tenant_id = c.tenant_id AND a.assignment_type = 'required'
            WHERE c.tenant_id = \${ctx.tenantId}::uuid AND c.is_mandatory = true
              \${courseFilter} \${archivedFilter} \${dateFromFilter} \${dateToFilter}
          \`;
        }

        const upcomingDeadlines = await tx\`
          SELECT a.id AS assignment_id, a.employee_id,
            CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name,
            e.employee_number, a.course_id, COALESCE(c.name, c.code) AS course_name,
            a.due_date::text AS due_date, (a.due_date - CURRENT_DATE)::integer AS days_until_due
          FROM app.assignments a
          JOIN app.courses c ON c.id = a.course_id AND c.tenant_id = a.tenant_id AND c.is_mandatory = true
          JOIN app.employees e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id AND e.status IN ('active', 'on_leave')
          LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = e.tenant_id AND ep.effective_to IS NULL
          WHERE a.tenant_id = \${ctx.tenantId}::uuid AND a.assignment_type = 'required'
            AND a.due_date IS NOT NULL AND a.due_date >= CURRENT_DATE AND a.due_date <= CURRENT_DATE + INTERVAL '30 days'
            AND a.status NOT IN ('completed', 'expired')
            \${courseFilter} \${archivedFilter}
          ORDER BY a.due_date ASC LIMIT 50
        \`;

        return { summary: summaryQuery, upcomingDeadlines };
      }
    );
  }

  async getComplianceByCourse(
    ctx: TenantContext,
    filters: { courseId?: string; departmentId?: string; dateFrom?: string; dateTo?: string; includeArchived?: boolean }
  ): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        const courseFilter = filters.courseId ? tx\`AND c.id = \${filters.courseId}::uuid\` : tx\`\`;
        const archivedFilter = !filters.includeArchived ? tx\`AND c.status != 'archived'\` : tx\`\`;
        const dateFromFilter = filters.dateFrom ? tx\`AND a.due_date >= \${filters.dateFrom}::date\` : tx\`\`;
        const dateToFilter = filters.dateTo ? tx\`AND a.due_date <= \${filters.dateTo}::date\` : tx\`\`;

        if (filters.departmentId) {
          const deptFilter = tx\`AND ou.id = \${filters.departmentId}::uuid\`;
          return tx\`
            SELECT c.id AS course_id, COALESCE(c.name, c.code) AS course_name, c.category,
              c.is_mandatory, c.mandatory_due_days,
              COUNT(a.id) AS total_assigned,
              COUNT(a.id) FILTER (WHERE a.status = 'completed') AS completed_count,
              COUNT(a.id) FILTER (WHERE a.status = 'in_progress') AS in_progress_count,
              COUNT(a.id) FILTER (WHERE a.status = 'not_started') AS not_started_count,
              COUNT(a.id) FILTER (WHERE a.due_date < CURRENT_DATE AND a.status NOT IN ('completed', 'expired')) AS overdue_count
            FROM app.courses c
            LEFT JOIN app.assignments a ON a.course_id = c.id AND a.tenant_id = c.tenant_id AND a.assignment_type = 'required'
            LEFT JOIN app.position_assignments pa ON pa.employee_id = a.employee_id AND pa.tenant_id = a.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
            LEFT JOIN app.org_units ou ON ou.id = pa.org_unit_id AND ou.tenant_id = a.tenant_id
            WHERE c.tenant_id = \${ctx.tenantId}::uuid AND c.is_mandatory = true
              \${courseFilter} \${archivedFilter} \${deptFilter} \${dateFromFilter} \${dateToFilter}
            GROUP BY c.id, c.name, c.code, c.category, c.is_mandatory, c.mandatory_due_days
            ORDER BY c.name ASC
          \`;
        }

        return tx\`
          SELECT c.id AS course_id, COALESCE(c.name, c.code) AS course_name, c.category,
            c.is_mandatory, c.mandatory_due_days,
            COUNT(a.id) AS total_assigned,
            COUNT(a.id) FILTER (WHERE a.status = 'completed') AS completed_count,
            COUNT(a.id) FILTER (WHERE a.status = 'in_progress') AS in_progress_count,
            COUNT(a.id) FILTER (WHERE a.status = 'not_started') AS not_started_count,
            COUNT(a.id) FILTER (WHERE a.due_date < CURRENT_DATE AND a.status NOT IN ('completed', 'expired')) AS overdue_count
          FROM app.courses c
          LEFT JOIN app.assignments a ON a.course_id = c.id AND a.tenant_id = c.tenant_id AND a.assignment_type = 'required'
          WHERE c.tenant_id = \${ctx.tenantId}::uuid AND c.is_mandatory = true
            \${courseFilter} \${archivedFilter} \${dateFromFilter} \${dateToFilter}
          GROUP BY c.id, c.name, c.code, c.category, c.is_mandatory, c.mandatory_due_days
          ORDER BY c.name ASC
        \`;
      }
    );
  }

  async getComplianceByDepartment(
    ctx: TenantContext,
    filters: { courseId?: string; departmentId?: string; dateFrom?: string; dateTo?: string; includeArchived?: boolean }
  ): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        const courseFilter = filters.courseId ? tx\`AND c.id = \${filters.courseId}::uuid\` : tx\`\`;
        const archivedFilter = !filters.includeArchived ? tx\`AND c.status != 'archived'\` : tx\`\`;
        const deptFilter = filters.departmentId ? tx\`AND ou.id = \${filters.departmentId}::uuid\` : tx\`\`;
        const dateFromFilter = filters.dateFrom ? tx\`AND a.due_date >= \${filters.dateFrom}::date\` : tx\`\`;
        const dateToFilter = filters.dateTo ? tx\`AND a.due_date <= \${filters.dateTo}::date\` : tx\`\`;

        return tx\`
          SELECT ou.id AS org_unit_id, ou.name AS org_unit_name,
            COUNT(a.id) AS total_assigned,
            COUNT(a.id) FILTER (WHERE a.status = 'completed') AS completed_count,
            COUNT(a.id) FILTER (WHERE a.status = 'in_progress') AS in_progress_count,
            COUNT(a.id) FILTER (WHERE a.status = 'not_started') AS not_started_count,
            COUNT(a.id) FILTER (WHERE a.due_date < CURRENT_DATE AND a.status NOT IN ('completed', 'expired')) AS overdue_count
          FROM app.assignments a
          JOIN app.courses c ON c.id = a.course_id AND c.tenant_id = a.tenant_id AND c.is_mandatory = true
          JOIN app.position_assignments pa ON pa.employee_id = a.employee_id AND pa.tenant_id = a.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
          JOIN app.org_units ou ON ou.id = pa.org_unit_id AND ou.tenant_id = a.tenant_id
          WHERE a.tenant_id = \${ctx.tenantId}::uuid AND a.assignment_type = 'required'
            \${courseFilter} \${deptFilter} \${archivedFilter} \${dateFromFilter} \${dateToFilter}
          GROUP BY ou.id, ou.name ORDER BY ou.name ASC
        \`;
      }
    );
  }

  async getOverdueComplianceAssignments(
    ctx: TenantContext,
    filters: { courseId?: string; departmentId?: string; dateFrom?: string; dateTo?: string },
    pagination: PaginationOptions
  ): Promise<{ items: any[]; totalOverdue: number }> {
    const limit = pagination.limit ?? 20;
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        const courseFilter = filters.courseId ? tx\`AND c.id = \${filters.courseId}::uuid\` : tx\`\`;
        const deptFilter = filters.departmentId ? tx\`AND ou.id = \${filters.departmentId}::uuid\` : tx\`\`;
        const dateFromFilter = filters.dateFrom ? tx\`AND a.due_date >= \${filters.dateFrom}::date\` : tx\`\`;
        const dateToFilter = filters.dateTo ? tx\`AND a.due_date <= \${filters.dateTo}::date\` : tx\`\`;
        const cursorFilter = pagination.cursor ? tx\`AND a.id > \${pagination.cursor}::uuid\` : tx\`\`;

        const [countResult] = await tx\`
          SELECT COUNT(*)::integer AS total_overdue
          FROM app.assignments a
          JOIN app.courses c ON c.id = a.course_id AND c.tenant_id = a.tenant_id AND c.is_mandatory = true
          JOIN app.employees e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id AND e.status IN ('active', 'on_leave')
          LEFT JOIN app.position_assignments pa ON pa.employee_id = a.employee_id AND pa.tenant_id = a.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
          LEFT JOIN app.org_units ou ON ou.id = pa.org_unit_id AND ou.tenant_id = a.tenant_id
          WHERE a.tenant_id = \${ctx.tenantId}::uuid AND a.assignment_type = 'required'
            AND a.due_date < CURRENT_DATE AND a.status NOT IN ('completed', 'expired')
            \${courseFilter} \${deptFilter} \${dateFromFilter} \${dateToFilter}
        \`;

        const items = await tx\`
          SELECT a.id AS assignment_id, a.employee_id,
            CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name,
            e.employee_number, ou.id AS department_id, ou.name AS department_name,
            a.course_id, COALESCE(c.name, c.code) AS course_name, c.category,
            a.assigned_at::text AS assigned_at, a.due_date::text AS due_date,
            (CURRENT_DATE - a.due_date)::integer AS days_overdue,
            a.status::text AS status, a.progress_percent
          FROM app.assignments a
          JOIN app.courses c ON c.id = a.course_id AND c.tenant_id = a.tenant_id AND c.is_mandatory = true
          JOIN app.employees e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id AND e.status IN ('active', 'on_leave')
          LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = e.tenant_id AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa ON pa.employee_id = a.employee_id AND pa.tenant_id = a.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
          LEFT JOIN app.org_units ou ON ou.id = pa.org_unit_id AND ou.tenant_id = a.tenant_id
          WHERE a.tenant_id = \${ctx.tenantId}::uuid AND a.assignment_type = 'required'
            AND a.due_date < CURRENT_DATE AND a.status NOT IN ('completed', 'expired')
            \${courseFilter} \${deptFilter} \${dateFromFilter} \${dateToFilter} \${cursorFilter}
          ORDER BY a.due_date ASC, a.id ASC LIMIT \${limit + 1}
        \`;

        return { items, totalOverdue: countResult?.totalOverdue ?? 0 };
      }
    );
  }

`;

  repo = repo.replace(
    "  // ===========================================================================\n  // Helper Methods",
    repoMethods +
      "  // ===========================================================================\n  // Helper Methods"
  );
  writeFile("repository.ts", repo);
} else {
  console.log("  Already has compliance methods");
}

// =====================================================================
// 3. SERVICE
// =====================================================================
console.log("\n=== Updating service.ts ===");
let service = readFile("service.ts");

if (!service.includes("getComplianceOverview")) {
  const serviceMethods = fs.readFileSync(
    path.join(BASE, "scripts/todo-158-service-methods.ts.txt"),
    "utf8"
  );
  service = service.replace(
    "  // ===========================================================================\n  // Helper Methods",
    serviceMethods +
      "\n  // ===========================================================================\n  // Helper Methods"
  );
  writeFile("service.ts", service);
} else {
  console.log("  Already has compliance methods");
}

// =====================================================================
// 4. ROUTES
// =====================================================================
console.log("\n=== Updating routes.ts ===");
let routes = readFile("routes.ts");

if (!routes.includes("compliance/overview")) {
  // Update imports
  routes = routes.replace(
    'import { CreateLearningPathSchema, ComplianceReportQuerySchema } from "./schemas";',
    'import {\n  CreateLearningPathSchema,\n  ComplianceReportQuerySchema,\n  ComplianceFiltersQuerySchema,\n  ComplianceOverdueQuerySchema,\n} from "./schemas";'
  );

  // Insert compliance routes before My Learning
  const routesMethods = fs.readFileSync(
    path.join(BASE, "scripts/todo-158-routes.ts.txt"),
    "utf8"
  );
  routes = routes.replace("  // My Learning", routesMethods + "\n  // My Learning");
  writeFile("routes.ts", routes);
} else {
  console.log("  Already has compliance routes");
}

console.log("\n=== Done ===");
