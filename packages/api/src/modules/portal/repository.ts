/**
 * Portal Module - Repository Layer
 *
 * Database operations for the self-service portal.
 * All queries respect RLS via tenant context.
 */

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

export class PortalRepository {
  constructor(private db: any) {}

  // ===========================================================================
  // Profile
  // ===========================================================================

  async getEmployeeProfile(ctx: TenantContext): Promise<any | null> {
    const [employee] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            e.*,
            ep.first_name,
            ep.last_name,
            p.title as position_title,
            o.name as org_unit_name
          FROM app.employees e
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = e.id
            AND ep.tenant_id = e.tenant_id
            AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa
            ON pa.employee_id = e.id
            AND pa.tenant_id = e.tenant_id
            AND pa.is_primary = true
            AND pa.effective_to IS NULL
          LEFT JOIN app.positions p ON p.id = pa.position_id
          LEFT JOIN app.org_units o ON o.id = pa.org_unit_id
          WHERE e.user_id = ${ctx.userId}::uuid AND e.tenant_id = ${ctx.tenantId}::uuid
          LIMIT 1
        `;
      }
    );

    return employee || null;
  }

  // ===========================================================================
  // Team
  // ===========================================================================

  async getDirectReports(ctx: TenantContext): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          WITH manager_employee AS (
            SELECT id
            FROM app.employees
            WHERE user_id = ${ctx.userId}::uuid
              AND tenant_id = ${ctx.tenantId}::uuid
            LIMIT 1
          )
          SELECT
            e.id,
            e.employee_number,
            ep.first_name,
            ep.last_name,
            e.status,
            p.title as position_title
          FROM app.reporting_lines rl
          INNER JOIN manager_employee me ON me.id = rl.manager_id
          INNER JOIN app.employees e ON e.id = rl.employee_id
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = e.id
            AND ep.tenant_id = e.tenant_id
            AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa
            ON pa.employee_id = e.id
            AND pa.tenant_id = e.tenant_id
            AND pa.is_primary = true
            AND pa.effective_to IS NULL
          LEFT JOIN app.positions p ON p.id = pa.position_id
          WHERE rl.tenant_id = ${ctx.tenantId}::uuid
            AND rl.effective_to IS NULL
            AND rl.is_primary = true
            AND e.tenant_id = ${ctx.tenantId}::uuid
            AND e.status = 'active'
          ORDER BY ep.last_name, ep.first_name
        `;
      }
    );
  }

  // ===========================================================================
  // Tasks
  // ===========================================================================

  async getPendingTasks(ctx: TenantContext): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT t.id, t.task_type, t.title, t.description, t.due_date,
                 t.priority, t.status, t.created_at
          FROM app.tasks t
          WHERE t.assignee_id = ${ctx.userId}::uuid
            AND t.tenant_id = ${ctx.tenantId}::uuid
            AND t.status IN ('pending', 'in_progress')
          ORDER BY t.priority DESC, t.due_date ASC
          LIMIT 50
        `;
      }
    );
  }

  // ===========================================================================
  // Approvals
  // ===========================================================================

  async getPendingLeaveApprovals(ctx: TenantContext): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          WITH manager_employee AS (
            SELECT id
            FROM app.employees
            WHERE user_id = ${ctx.userId}::uuid
              AND tenant_id = ${ctx.tenantId}::uuid
            LIMIT 1
          )
          SELECT
            lr.id,
            lr.employee_id,
            ep.first_name,
            ep.last_name,
            lt.name as leave_type,
            lr.start_date,
            lr.end_date,
            lr.duration as total_days,
            lr.reason,
            lr.created_at,
            'leave_request' as approval_type
          FROM app.leave_requests lr
          INNER JOIN app.employees e ON e.id = lr.employee_id
          INNER JOIN app.reporting_lines rl
            ON rl.employee_id = e.id
            AND rl.tenant_id = e.tenant_id
            AND rl.effective_to IS NULL
            AND rl.is_primary = true
          INNER JOIN manager_employee me ON me.id = rl.manager_id
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = e.id
            AND ep.tenant_id = e.tenant_id
            AND ep.effective_to IS NULL
          INNER JOIN app.leave_types lt ON lt.id = lr.leave_type_id
          WHERE lr.status = 'pending'
            AND lr.tenant_id = ${ctx.tenantId}::uuid
          ORDER BY lr.created_at ASC
          LIMIT 50
        `;
      }
    );
  }

  async getPendingTimesheetApprovals(ctx: TenantContext): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          WITH manager_employee AS (
            SELECT id
            FROM app.employees
            WHERE user_id = ${ctx.userId}::uuid
              AND tenant_id = ${ctx.tenantId}::uuid
            LIMIT 1
          )
          SELECT
            ts.id,
            ts.employee_id,
            ep.first_name,
            ep.last_name,
            ts.period_start,
            ts.period_end,
            ts.total_regular_hours,
            ts.submitted_at,
            'timesheet' as approval_type
          FROM app.timesheets ts
          INNER JOIN app.employees e ON e.id = ts.employee_id
          INNER JOIN app.reporting_lines rl
            ON rl.employee_id = e.id
            AND rl.tenant_id = e.tenant_id
            AND rl.effective_to IS NULL
            AND rl.is_primary = true
          INNER JOIN manager_employee me ON me.id = rl.manager_id
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = e.id
            AND ep.tenant_id = e.tenant_id
            AND ep.effective_to IS NULL
          WHERE ts.status = 'submitted'
            AND ts.tenant_id = ${ctx.tenantId}::uuid
          ORDER BY ts.submitted_at ASC
          LIMIT 50
        `;
      }
    );
  }

  // ===========================================================================
  // Dashboard Counts
  // ===========================================================================

  async getPendingTaskCount(ctx: TenantContext): Promise<number> {
    const [result] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT COUNT(*) as count FROM app.tasks
          WHERE assignee_id = ${ctx.userId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
            AND status IN ('pending', 'in_progress')
        `;
      }
    );

    return Number(result?.count || 0);
  }

  async getPendingApprovalCount(ctx: TenantContext): Promise<number> {
    const [result] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT COUNT(*) as count FROM app.leave_requests lr
          JOIN app.employees e ON e.id = lr.employee_id
          JOIN app.reporting_lines rl
            ON rl.employee_id = e.id
            AND rl.tenant_id = e.tenant_id
            AND rl.effective_to IS NULL
            AND rl.is_primary = true
          WHERE lr.status = 'pending'
            AND lr.tenant_id = ${ctx.tenantId}::uuid
            AND rl.manager_id = (SELECT id FROM app.employees WHERE user_id = ${ctx.userId}::uuid AND tenant_id = ${ctx.tenantId}::uuid)
        `;
      }
    );

    return Number(result?.count || 0);
  }

  async getTeamMemberCount(ctx: TenantContext): Promise<number> {
    const [result] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT COUNT(*) as count
          FROM app.reporting_lines rl
          JOIN app.employees e ON e.id = rl.employee_id
          WHERE rl.tenant_id = ${ctx.tenantId}::uuid
            AND rl.effective_to IS NULL
            AND rl.is_primary = true
            AND rl.manager_id = (SELECT id FROM app.employees WHERE user_id = ${ctx.userId}::uuid AND tenant_id = ${ctx.tenantId}::uuid)
            AND e.tenant_id = ${ctx.tenantId}::uuid
            AND e.status = 'active'
        `;
      }
    );

    return Number(result?.count || 0);
  }

  // ===========================================================================
  // Employee Directory
  // ===========================================================================

  async searchEmployeeDirectory(
    ctx: TenantContext,
    filters: {
      search?: string;
      departmentId?: string;
      locationId?: string;
    },
    pagination: { cursor?: string; limit?: number }
  ): Promise<{ items: any[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = Math.min(pagination.limit || 25, 100);

    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            e.id,
            e.employee_number,
            ep.first_name,
            ep.last_name,
            ep.preferred_name,
            p.title AS position_title,
            o.id AS department_id,
            o.name AS department_name,
            email_c.value AS work_email,
            phone_c.value AS work_phone,
            photo.file_key AS profile_photo_url,
            e.hire_date,
            COALESCE(dp.show_work_email, true) AS pref_show_work_email,
            COALESCE(dp.show_work_phone, true) AS pref_show_work_phone,
            COALESCE(dp.show_job_title, true) AS pref_show_job_title,
            COALESCE(dp.show_department, true) AS pref_show_department,
            COALESCE(dp.show_start_date, false) AS pref_show_start_date,
            COALESCE(dp.show_profile_photo, true) AS pref_show_profile_photo
          FROM app.employees e
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = e.id AND ep.tenant_id = e.tenant_id AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa
            ON pa.employee_id = e.id AND pa.tenant_id = e.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
          LEFT JOIN app.positions p ON p.id = pa.position_id
          LEFT JOIN app.org_units o ON o.id = pa.org_unit_id
          LEFT JOIN app.employee_contacts email_c
            ON email_c.employee_id = e.id AND email_c.tenant_id = e.tenant_id
            AND email_c.contact_type = 'email' AND email_c.is_primary = true AND email_c.effective_to IS NULL
          LEFT JOIN app.employee_contacts phone_c
            ON phone_c.employee_id = e.id AND phone_c.tenant_id = e.tenant_id
            AND phone_c.contact_type IN ('mobile', 'phone') AND phone_c.is_primary = true AND phone_c.effective_to IS NULL
          LEFT JOIN app.employee_photos photo
            ON photo.employee_id = e.id AND photo.tenant_id = e.tenant_id
          LEFT JOIN app.employee_directory_preferences dp
            ON dp.employee_id = e.id AND dp.tenant_id = e.tenant_id
          WHERE e.tenant_id = ${ctx.tenantId}::uuid
            AND e.status = 'active'
            AND COALESCE(dp.visible_in_directory, true) = true
            ${filters.search ? tx`
              AND (
                ep.first_name ILIKE ${"%" + filters.search + "%"}
                OR ep.last_name ILIKE ${"%" + filters.search + "%"}
                OR ep.preferred_name ILIKE ${"%" + filters.search + "%"}
                OR e.employee_number ILIKE ${"%" + filters.search + "%"}
                OR p.title ILIKE ${"%" + filters.search + "%"}
                OR o.name ILIKE ${"%" + filters.search + "%"}
              )
            ` : tx``}
            ${filters.departmentId ? tx`AND o.id = ${filters.departmentId}::uuid` : tx``}
            ${pagination.cursor ? tx`AND e.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY ep.last_name ASC, ep.first_name ASC, e.id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getDepartmentList(ctx: TenantContext): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT o.id, o.name, COUNT(DISTINCT pa.employee_id)::int AS employee_count
          FROM app.org_units o
          LEFT JOIN app.position_assignments pa
            ON pa.org_unit_id = o.id
            AND pa.tenant_id = o.tenant_id
            AND pa.is_primary = true
            AND pa.effective_to IS NULL
          LEFT JOIN app.employees e
            ON e.id = pa.employee_id
            AND e.tenant_id = pa.tenant_id
            AND e.status = 'active'
          WHERE o.tenant_id = ${ctx.tenantId}::uuid
            AND o.is_active = true
          GROUP BY o.id, o.name
          ORDER BY o.name
        `;
      }
    );
  }

  // ===========================================================================
  // Directory - Individual Profile & Preferences
  // ===========================================================================

  async getEmployeeDirectoryProfile(ctx: TenantContext, employeeId: string): Promise<any | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT e.id, e.employee_number, ep.first_name, ep.last_name, ep.preferred_name,
            p.title AS position_title, o.id AS department_id, o.name AS department_name,
            email_c.value AS work_email, phone_c.value AS work_phone,
            photo.file_key AS profile_photo_url, e.hire_date,
            mgr.id AS manager_id, mgr_ep.first_name AS manager_first_name,
            mgr_ep.last_name AS manager_last_name, mgr_p.title AS manager_position_title,
            COALESCE(dp.visible_in_directory, true) AS pref_visible_in_directory,
            COALESCE(dp.show_work_email, true) AS pref_show_work_email,
            COALESCE(dp.show_work_phone, true) AS pref_show_work_phone,
            COALESCE(dp.show_job_title, true) AS pref_show_job_title,
            COALESCE(dp.show_department, true) AS pref_show_department,
            COALESCE(dp.show_start_date, false) AS pref_show_start_date,
            COALESCE(dp.show_profile_photo, true) AS pref_show_profile_photo
          FROM app.employees e
          LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = e.tenant_id AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.tenant_id = e.tenant_id AND pa.is_primary = true AND pa.effective_to IS NULL
          LEFT JOIN app.positions p ON p.id = pa.position_id
          LEFT JOIN app.org_units o ON o.id = pa.org_unit_id
          LEFT JOIN app.employee_contacts email_c ON email_c.employee_id = e.id AND email_c.tenant_id = e.tenant_id AND email_c.contact_type = 'email' AND email_c.is_primary = true AND email_c.effective_to IS NULL
          LEFT JOIN app.employee_contacts phone_c ON phone_c.employee_id = e.id AND phone_c.tenant_id = e.tenant_id AND phone_c.contact_type IN ('mobile', 'phone') AND phone_c.is_primary = true AND phone_c.effective_to IS NULL
          LEFT JOIN app.employee_photos photo ON photo.employee_id = e.id AND photo.tenant_id = e.tenant_id
          LEFT JOIN app.employee_directory_preferences dp ON dp.employee_id = e.id AND dp.tenant_id = e.tenant_id
          LEFT JOIN app.reporting_lines rl ON rl.employee_id = e.id AND rl.tenant_id = e.tenant_id AND rl.is_primary = true AND rl.effective_to IS NULL
          LEFT JOIN app.employees mgr ON mgr.id = rl.manager_id AND mgr.tenant_id = e.tenant_id
          LEFT JOIN app.employee_personal mgr_ep ON mgr_ep.employee_id = mgr.id AND mgr_ep.tenant_id = mgr.tenant_id AND mgr_ep.effective_to IS NULL
          LEFT JOIN app.position_assignments mgr_pa ON mgr_pa.employee_id = mgr.id AND mgr_pa.tenant_id = mgr.tenant_id AND mgr_pa.is_primary = true AND mgr_pa.effective_to IS NULL
          LEFT JOIN app.positions mgr_p ON mgr_p.id = mgr_pa.position_id
          WHERE e.id = ${employeeId}::uuid AND e.tenant_id = ${ctx.tenantId}::uuid AND e.status = 'active'
          LIMIT 1
        `;
      }
    );
    return row || null;
  }

  async getEmployeeIdForUser(ctx: TenantContext): Promise<string | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`SELECT id FROM app.employees WHERE user_id = ${ctx.userId}::uuid AND tenant_id = ${ctx.tenantId}::uuid LIMIT 1`;
      }
    );
    return row?.id ?? null;
  }

  async getDirectoryPreferences(ctx: TenantContext, employeeId: string): Promise<any | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT visible_in_directory, show_work_email, show_work_phone,
                 show_job_title, show_department, show_start_date, show_profile_photo
          FROM app.employee_directory_preferences
          WHERE employee_id = ${employeeId}::uuid AND tenant_id = ${ctx.tenantId}::uuid LIMIT 1
        `;
      }
    );
    return row || null;
  }

  async upsertDirectoryPreferences(
    ctx: TenantContext, employeeId: string,
    prefs: { visibleInDirectory?: boolean; showWorkEmail?: boolean; showWorkPhone?: boolean; showJobTitle?: boolean; showDepartment?: boolean; showStartDate?: boolean; showProfilePhoto?: boolean }
  ): Promise<any> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          INSERT INTO app.employee_directory_preferences (
            tenant_id, employee_id, visible_in_directory, show_work_email, show_work_phone,
            show_job_title, show_department, show_start_date, show_profile_photo, updated_by
          ) VALUES (
            ${ctx.tenantId}::uuid, ${employeeId}::uuid,
            ${prefs.visibleInDirectory ?? true}, ${prefs.showWorkEmail ?? true}, ${prefs.showWorkPhone ?? true},
            ${prefs.showJobTitle ?? true}, ${prefs.showDepartment ?? true}, ${prefs.showStartDate ?? false},
            ${prefs.showProfilePhoto ?? true}, ${ctx.userId}::uuid
          )
          ON CONFLICT (tenant_id, employee_id) DO UPDATE SET
            visible_in_directory = COALESCE(${prefs.visibleInDirectory ?? null}::boolean, app.employee_directory_preferences.visible_in_directory),
            show_work_email = COALESCE(${prefs.showWorkEmail ?? null}::boolean, app.employee_directory_preferences.show_work_email),
            show_work_phone = COALESCE(${prefs.showWorkPhone ?? null}::boolean, app.employee_directory_preferences.show_work_phone),
            show_job_title = COALESCE(${prefs.showJobTitle ?? null}::boolean, app.employee_directory_preferences.show_job_title),
            show_department = COALESCE(${prefs.showDepartment ?? null}::boolean, app.employee_directory_preferences.show_department),
            show_start_date = COALESCE(${prefs.showStartDate ?? null}::boolean, app.employee_directory_preferences.show_start_date),
            show_profile_photo = COALESCE(${prefs.showProfilePhoto ?? null}::boolean, app.employee_directory_preferences.show_profile_photo),
            updated_by = ${ctx.userId}::uuid
          RETURNING visible_in_directory, show_work_email, show_work_phone,
                    show_job_title, show_department, show_start_date, show_profile_photo
        `;
      }
    );
    return row;
  }

  // ===========================================================================
  // Org Chart
  // ===========================================================================

  async getOrgChartFlat(
    ctx: TenantContext,
    rootEmployeeId: string | null,
    depth: number
  ): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          WITH RECURSIVE emp_tree AS (
            SELECT
              e.id AS employee_id,
              NULL::uuid AS manager_id,
              1 AS level
            FROM app.employees e
            WHERE e.tenant_id = ${ctx.tenantId}::uuid
              AND e.status IN ('active', 'on_leave')
              AND (
                ${rootEmployeeId !== null
                  ? tx`e.id = ${rootEmployeeId}::uuid`
                  : tx`NOT EXISTS (
                    SELECT 1 FROM app.reporting_lines rl
                    WHERE rl.employee_id = e.id
                      AND rl.is_primary = true
                      AND rl.effective_to IS NULL
                  )`}
              )

            UNION ALL

            SELECT
              e.id AS employee_id,
              rl.manager_id,
              et.level + 1
            FROM app.employees e
            INNER JOIN app.reporting_lines rl
              ON rl.employee_id = e.id
              AND rl.is_primary = true
              AND rl.effective_to IS NULL
            INNER JOIN emp_tree et ON rl.manager_id = et.employee_id
            WHERE e.tenant_id = ${ctx.tenantId}::uuid
              AND e.status IN ('active', 'on_leave')
              AND et.level < ${depth}
          )
          SELECT
            et.employee_id,
            et.manager_id,
            et.level,
            app.get_employee_display_name(et.employee_id) AS employee_name,
            (
              SELECT p.title
              FROM app.position_assignments pa
              INNER JOIN app.positions p ON pa.position_id = p.id
              WHERE pa.employee_id = et.employee_id
                AND pa.is_primary = true
                AND pa.effective_to IS NULL
              LIMIT 1
            ) AS position_title,
            (
              SELECT ou.name
              FROM app.position_assignments pa
              INNER JOIN app.org_units ou ON pa.org_unit_id = ou.id
              WHERE pa.employee_id = et.employee_id
                AND pa.is_primary = true
                AND pa.effective_to IS NULL
              LIMIT 1
            ) AS org_unit_name,
            (
              SELECT COUNT(*)
              FROM app.reporting_lines rl2
              INNER JOIN app.employees e2 ON rl2.employee_id = e2.id
              WHERE rl2.manager_id = et.employee_id
                AND rl2.is_primary = true
                AND rl2.effective_to IS NULL
                AND e2.status IN ('active', 'on_leave')
            ) AS direct_reports_count,
            (
              SELECT ep.file_key
              FROM app.employee_photos ep
              WHERE ep.employee_id = et.employee_id
                AND ep.tenant_id = ${ctx.tenantId}::uuid
              LIMIT 1
            ) AS photo_url
          FROM emp_tree et
          ORDER BY et.level, et.employee_id
        `;
      }
    );
  }

  async getOrgChartEmployee(
    ctx: TenantContext,
    employeeId: string
  ): Promise<any | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            e.id AS employee_id,
            app.get_employee_display_name(e.id) AS employee_name,
            (
              SELECT p.title
              FROM app.position_assignments pa
              INNER JOIN app.positions p ON pa.position_id = p.id
              WHERE pa.employee_id = e.id
                AND pa.is_primary = true
                AND pa.effective_to IS NULL
              LIMIT 1
            ) AS position_title,
            (
              SELECT ou.name
              FROM app.position_assignments pa
              INNER JOIN app.org_units ou ON pa.org_unit_id = ou.id
              WHERE pa.employee_id = e.id
                AND pa.is_primary = true
                AND pa.effective_to IS NULL
              LIMIT 1
            ) AS org_unit_name,
            (
              SELECT ep.file_key
              FROM app.employee_photos ep
              WHERE ep.employee_id = e.id
                AND ep.tenant_id = e.tenant_id
              LIMIT 1
            ) AS photo_url
          FROM app.employees e
          WHERE e.id = ${employeeId}::uuid
            AND e.tenant_id = ${ctx.tenantId}::uuid
            AND e.status IN ('active', 'on_leave')
          LIMIT 1
        `;
      }
    );

    return row || null;
  }

  async getDirectReportsForEmployee(
    ctx: TenantContext,
    employeeId: string
  ): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            e.id AS employee_id,
            app.get_employee_display_name(e.id) AS employee_name,
            (
              SELECT p.title
              FROM app.position_assignments pa
              INNER JOIN app.positions p ON pa.position_id = p.id
              WHERE pa.employee_id = e.id
                AND pa.is_primary = true
                AND pa.effective_to IS NULL
              LIMIT 1
            ) AS position_title,
            (
              SELECT ou.name
              FROM app.position_assignments pa
              INNER JOIN app.org_units ou ON pa.org_unit_id = ou.id
              WHERE pa.employee_id = e.id
                AND pa.is_primary = true
                AND pa.effective_to IS NULL
              LIMIT 1
            ) AS org_unit_name,
            (
              SELECT COUNT(*)
              FROM app.reporting_lines rl2
              INNER JOIN app.employees e2 ON rl2.employee_id = e2.id
              WHERE rl2.manager_id = e.id
                AND rl2.is_primary = true
                AND rl2.effective_to IS NULL
                AND e2.status IN ('active', 'on_leave')
            ) AS direct_reports_count,
            (
              SELECT ep.file_key
              FROM app.employee_photos ep
              WHERE ep.employee_id = e.id
                AND ep.tenant_id = e.tenant_id
              LIMIT 1
            ) AS photo_url
          FROM app.reporting_lines rl
          INNER JOIN app.employees e
            ON e.id = rl.employee_id
            AND e.tenant_id = ${ctx.tenantId}::uuid
            AND e.status IN ('active', 'on_leave')
          WHERE rl.manager_id = ${employeeId}::uuid
            AND rl.tenant_id = ${ctx.tenantId}::uuid
            AND rl.is_primary = true
            AND rl.effective_to IS NULL
          ORDER BY e.employee_number
        `;
      }
    );
  }

  // ===========================================================================
  // Portal Access
  // ===========================================================================

  async getUserRoles(ctx: TenantContext): Promise<any[]> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT r.id, r.name as role_name
          FROM app.user_roles ur
          JOIN app.roles r ON r.id = ur.role_id
          WHERE ur.user_id = ${ctx.userId}::uuid
            AND ur.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );
  }

  async hasDirectReports(ctx: TenantContext): Promise<boolean> {
    const [result] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT EXISTS(
            SELECT 1 FROM app.reporting_lines rl
            WHERE rl.tenant_id = ${ctx.tenantId}::uuid
              AND rl.effective_to IS NULL
              AND rl.is_primary = true
              AND rl.manager_id = (
                SELECT id FROM app.employees
                WHERE user_id = ${ctx.userId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
                LIMIT 1
              )
          ) as has_reports
        `;
      }
    );

    return result?.hasReports ?? false;
  }
}
