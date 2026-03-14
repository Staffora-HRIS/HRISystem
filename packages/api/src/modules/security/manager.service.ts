/**
 * Manager Service
 *
 * Manages team data access for the Manager Portal.
 * Handles subordinate hierarchy and team-scoped operations.
 */

import type { DatabaseClient } from "../../plugins/db";
import type {
  TeamMemberSummary,
  TeamOverview,
  PendingApproval,
  ApprovalType,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

export interface TenantContext {
  tenantId: string;
  userId: string;
}

interface TeamMemberRow {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  photo_url: string | null;
  job_title: string | null;
  department: string | null;
  status: string;
  email: string | null;
  hire_date: string;
  depth: number;
}

interface TeamOverviewRow {
  direct_reports_count: number;
  total_subordinates_count: number;
  pending_approvals_count: number;
  team_on_leave_count: number;
}

interface PendingApprovalRow {
  id: string;
  type: ApprovalType;
  employee_id: string;
  employee_name: string;
  employee_number: string;
  summary: string;
  submitted_at: string;
  due_date: string | null;
  priority: "high" | "medium" | "low";
  metadata: Record<string, unknown> | null;
}

// =============================================================================
// Manager Service
// =============================================================================

export class ManagerService {
  constructor(private db: DatabaseClient) {}

  /**
   * Get the current user's employee ID
   */
  async getCurrentEmployeeId(ctx: TenantContext): Promise<string | null> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        SELECT id
        FROM app.employees
        WHERE user_id = ${ctx.userId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND status IN ('active', 'on_leave')
        LIMIT 1
      `;
      return rows[0]?.id ?? null;
    });

    return result;
  }

  /**
   * Check if the current user is a manager (has any subordinates)
   */
  async isManager(ctx: TenantContext): Promise<boolean> {
    const employeeId = await this.getCurrentEmployeeId(ctx);
    if (!employeeId) return false;

    const result = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.manager_subordinates
          WHERE manager_id = ${employeeId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
        ) as exists
      `;
      return rows[0]?.exists === true;
    });

    return result;
  }

  /**
   * Get team overview for dashboard
   */
  async getTeamOverview(ctx: TenantContext): Promise<TeamOverview> {
    const employeeId = await this.getCurrentEmployeeId(ctx);
    if (!employeeId) {
      return {
        directReportsCount: 0,
        totalSubordinatesCount: 0,
        pendingApprovalsCount: 0,
        teamOnLeaveCount: 0,
      };
    }

    const result = await this.db.withTransaction(ctx, async (tx) => {
      // Get subordinate counts
      const subordinates = await tx<{ depth: number; count: number }[]>`
        SELECT depth, COUNT(*) as count
        FROM app.manager_subordinates ms
        JOIN app.employees e ON e.id = ms.subordinate_id
        WHERE ms.manager_id = ${employeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND e.status IN ('active', 'on_leave')
        GROUP BY depth
      `;

      const directCount = subordinates.find((s) => s.depth === 1)?.count ?? 0;
      const totalCount = subordinates.reduce((sum, s) => sum + Number(s.count), 0);

      // Get team on leave count
      const onLeaveResult = await tx<{ count: number }[]>`
        SELECT COUNT(*) as count
        FROM app.manager_subordinates ms
        JOIN app.employees e ON e.id = ms.subordinate_id
        WHERE ms.manager_id = ${employeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND e.status = 'on_leave'
      `;

      // Get pending approvals count
      const pendingResult = await tx<{ count: number }[]>`
        SELECT COUNT(*) as count
        FROM app.leave_requests lr
        JOIN app.manager_subordinates ms ON ms.subordinate_id = lr.employee_id
        WHERE ms.manager_id = ${employeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND lr.status = 'pending'
      `;

      return {
        directReportsCount: Number(directCount),
        totalSubordinatesCount: totalCount,
        pendingApprovalsCount: Number(pendingResult[0]?.count ?? 0),
        teamOnLeaveCount: Number(onLeaveResult[0]?.count ?? 0),
      };
    });

    return result;
  }

  /**
   * Get direct reports only
   */
  async getDirectReports(ctx: TenantContext): Promise<TeamMemberSummary[]> {
    const employeeId = await this.getCurrentEmployeeId(ctx);
    if (!employeeId) return [];

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<TeamMemberRow[]>`
        SELECT
          e.id,
          e.employee_number,
          ep.first_name,
          ep.last_name,
          ep.preferred_name,
          ep.photo_url,
          p.title as job_title,
          ou.name as department,
          e.status,
          ec.email,
          e.hire_date::text,
          ms.depth
        FROM app.manager_subordinates ms
        JOIN app.employees e ON e.id = ms.subordinate_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
        LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id
          AND pa.is_primary = true
          AND (pa.effective_to IS NULL OR pa.effective_to > now())
        LEFT JOIN app.positions p ON p.id = pa.position_id
        LEFT JOIN app.org_units ou ON ou.id = p.org_unit_id
        LEFT JOIN app.employee_contacts ec ON ec.employee_id = e.id
          AND ec.is_primary = true
        WHERE ms.manager_id = ${employeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND ms.depth = 1
          AND e.status IN ('active', 'on_leave')
        ORDER BY ep.last_name, ep.first_name
      `;
    });

    return rows.map(this.mapTeamMemberRow);
  }

  /**
   * Get all subordinates (direct and indirect)
   */
  async getAllSubordinates(
    ctx: TenantContext,
    maxDepth: number = 10
  ): Promise<TeamMemberSummary[]> {
    const employeeId = await this.getCurrentEmployeeId(ctx);
    if (!employeeId) return [];

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<TeamMemberRow[]>`
        SELECT
          e.id,
          e.employee_number,
          ep.first_name,
          ep.last_name,
          ep.preferred_name,
          ep.photo_url,
          p.title as job_title,
          ou.name as department,
          e.status,
          ec.email,
          e.hire_date::text,
          ms.depth
        FROM app.manager_subordinates ms
        JOIN app.employees e ON e.id = ms.subordinate_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
        LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id
          AND pa.is_primary = true
          AND (pa.effective_to IS NULL OR pa.effective_to > now())
        LEFT JOIN app.positions p ON p.id = pa.position_id
        LEFT JOIN app.org_units ou ON ou.id = p.org_unit_id
        LEFT JOIN app.employee_contacts ec ON ec.employee_id = e.id
          AND ec.is_primary = true
        WHERE ms.manager_id = ${employeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND ms.depth <= ${maxDepth}
          AND e.status IN ('active', 'on_leave')
        ORDER BY ms.depth, ep.last_name, ep.first_name
      `;
    });

    return rows.map(this.mapTeamMemberRow);
  }

  /**
   * Get a specific team member (must be a subordinate)
   */
  async getTeamMember(
    ctx: TenantContext,
    employeeId: string
  ): Promise<TeamMemberSummary | null> {
    const managerEmployeeId = await this.getCurrentEmployeeId(ctx);
    if (!managerEmployeeId) return null;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<TeamMemberRow[]>`
        SELECT
          e.id,
          e.employee_number,
          ep.first_name,
          ep.last_name,
          ep.preferred_name,
          ep.photo_url,
          p.title as job_title,
          ou.name as department,
          e.status,
          ec.email,
          e.hire_date::text,
          ms.depth
        FROM app.manager_subordinates ms
        JOIN app.employees e ON e.id = ms.subordinate_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
        LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id
          AND pa.is_primary = true
          AND (pa.effective_to IS NULL OR pa.effective_to > now())
        LEFT JOIN app.positions p ON p.id = pa.position_id
        LEFT JOIN app.org_units ou ON ou.id = p.org_unit_id
        LEFT JOIN app.employee_contacts ec ON ec.employee_id = e.id
          AND ec.is_primary = true
        WHERE ms.manager_id = ${managerEmployeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND ms.subordinate_id = ${employeeId}::uuid
        LIMIT 1
      `;
    });

    return rows.length > 0 ? this.mapTeamMemberRow(rows[0]) : null;
  }

  /**
   * Check if an employee is a subordinate of the current user
   */
  async isSubordinateOf(
    ctx: TenantContext,
    employeeId: string
  ): Promise<boolean> {
    const managerEmployeeId = await this.getCurrentEmployeeId(ctx);
    if (!managerEmployeeId) return false;

    const result = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ result: boolean }[]>`
        SELECT app.is_subordinate_of(
          ${employeeId}::uuid,
          ${managerEmployeeId}::uuid
        ) as result
      `;
      return rows[0]?.result ?? false;
    });

    return result;
  }

  /**
   * Get pending approvals for the manager
   */
  async getPendingApprovals(
    ctx: TenantContext,
    type?: ApprovalType
  ): Promise<PendingApproval[]> {
    const employeeId = await this.getCurrentEmployeeId(ctx);
    if (!employeeId) return [];

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      // Get pending leave requests
      const leaveRequests = await tx<PendingApprovalRow[]>`
        SELECT
          lr.id,
          'leave_request' as type,
          lr.employee_id,
          CONCAT(ep.first_name, ' ', ep.last_name) as employee_name,
          e.employee_number,
          CONCAT(lt.name, ': ', lr.start_date::text, ' to ', lr.end_date::text) as summary,
          lr.created_at::text as submitted_at,
          NULL as due_date,
          CASE
            WHEN lr.start_date <= CURRENT_DATE + INTERVAL '3 days' THEN 'high'
            WHEN lr.start_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'medium'
            ELSE 'low'
          END as priority,
          jsonb_build_object(
            'leaveType', lt.name,
            'startDate', lr.start_date,
            'endDate', lr.end_date,
            'durationDays', lr.duration_days,
            'notes', lr.notes
          ) as metadata
        FROM app.leave_requests lr
        JOIN app.manager_subordinates ms ON ms.subordinate_id = lr.employee_id
        JOIN app.employees e ON e.id = lr.employee_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
        LEFT JOIN app.leave_types lt ON lt.id = lr.leave_type_id
        WHERE ms.manager_id = ${employeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND lr.status = 'pending'
          ${type === "leave_request" ? tx`` : tx`AND ${type}::text IS NULL OR 'leave_request' = ${type}`}
        ORDER BY lr.start_date ASC
      `;

      // Add timesheet approvals, expense approvals, etc. here as needed
      // For now, just return leave requests

      return leaveRequests;
    });

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      employeeNumber: row.employee_number,
      summary: row.summary,
      submittedAt: row.submitted_at,
      dueDate: row.due_date,
      priority: row.priority,
      metadata: row.metadata ?? undefined,
    }));
  }

  /**
   * Approve a request
   */
  async approveRequest(
    ctx: TenantContext,
    requestId: string,
    type: ApprovalType,
    comment?: string
  ): Promise<void> {
    const employeeId = await this.getCurrentEmployeeId(ctx);
    if (!employeeId) {
      throw new ManagerAccessError("User is not an employee");
    }

    await this.db.withTransaction(ctx, async (tx) => {
      switch (type) {
        case "leave_request":
          // Verify the request is for a subordinate
          const verification = await tx<{ employee_id: string }[]>`
            SELECT lr.employee_id
            FROM app.leave_requests lr
            JOIN app.manager_subordinates ms ON ms.subordinate_id = lr.employee_id
            WHERE lr.id = ${requestId}::uuid
              AND ms.manager_id = ${employeeId}::uuid
              AND ms.tenant_id = ${ctx.tenantId}::uuid
              AND lr.status = 'pending'
          `;

          if (verification.length === 0) {
            throw new ManagerAccessError(
              "Request not found or not authorized"
            );
          }

          // Update the request status
          await tx`
            UPDATE app.leave_requests
            SET
              status = 'approved',
              updated_at = now()
            WHERE id = ${requestId}::uuid
          `;

          // Create approval record
          await tx`
            INSERT INTO app.leave_request_approvals (
              tenant_id,
              request_id,
              action,
              actor_id,
              actor_role,
              comment,
              previous_status,
              new_status,
              created_at
            )
            VALUES (
              ${ctx.tenantId}::uuid,
              ${requestId}::uuid,
              'approve',
              ${ctx.userId}::uuid,
              'manager',
              ${comment ?? null},
              'pending',
              'approved',
              now()
            )
          `;
          break;

        default:
          throw new ManagerAccessError(`Unsupported approval type: ${type}`);
      }
    });
  }

  /**
   * Reject a request
   */
  async rejectRequest(
    ctx: TenantContext,
    requestId: string,
    type: ApprovalType,
    comment?: string
  ): Promise<void> {
    const employeeId = await this.getCurrentEmployeeId(ctx);
    if (!employeeId) {
      throw new ManagerAccessError("User is not an employee");
    }

    await this.db.withTransaction(ctx, async (tx) => {
      switch (type) {
        case "leave_request":
          // Verify the request is for a subordinate
          const verification = await tx<{ employee_id: string }[]>`
            SELECT lr.employee_id
            FROM app.leave_requests lr
            JOIN app.manager_subordinates ms ON ms.subordinate_id = lr.employee_id
            WHERE lr.id = ${requestId}::uuid
              AND ms.manager_id = ${employeeId}::uuid
              AND ms.tenant_id = ${ctx.tenantId}::uuid
              AND lr.status = 'pending'
          `;

          if (verification.length === 0) {
            throw new ManagerAccessError(
              "Request not found or not authorized"
            );
          }

          // Update the request status
          await tx`
            UPDATE app.leave_requests
            SET
              status = 'rejected',
              rejection_reason = ${comment ?? 'Rejected by manager'},
              updated_at = now()
            WHERE id = ${requestId}::uuid
          `;

          // Create approval record
          await tx`
            INSERT INTO app.leave_request_approvals (
              tenant_id,
              request_id,
              action,
              actor_id,
              actor_role,
              comment,
              previous_status,
              new_status,
              created_at
            )
            VALUES (
              ${ctx.tenantId}::uuid,
              ${requestId}::uuid,
              'reject',
              ${ctx.userId}::uuid,
              'manager',
              ${comment ?? 'Rejected by manager'},
              'pending',
              'rejected',
              now()
            )
          `;
          break;

        default:
          throw new ManagerAccessError(`Unsupported approval type: ${type}`);
      }
    });
  }

  /**
   * Bulk approve/reject requests
   * Processes each item individually so partial success is possible.
   */
  async bulkApproveRequests(
    ctx: TenantContext,
    items: Array<{
      type: "leave_request" | "timesheet";
      id: string;
      action: "approve" | "reject";
      notes?: string;
    }>
  ): Promise<{ approved: string[]; failed: Array<{ id: string; reason: string }> }> {
    const employeeId = await this.getCurrentEmployeeId(ctx);
    if (!employeeId) {
      throw new ManagerAccessError("User is not an employee");
    }

    const approved: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    for (const item of items) {
      try {
        await this.db.withTransaction(ctx, async (tx) => {
          switch (item.type) {
            case "leave_request": {
              // Verify the request is for a subordinate and is pending
              const verification = await tx<{ employee_id: string }[]>`
                SELECT lr.employee_id
                FROM app.leave_requests lr
                JOIN app.manager_subordinates ms ON ms.subordinate_id = lr.employee_id
                WHERE lr.id = ${item.id}::uuid
                  AND ms.manager_id = ${employeeId}::uuid
                  AND ms.tenant_id = ${ctx.tenantId}::uuid
                  AND lr.status = 'pending'
              `;

              if (verification.length === 0) {
                throw new ManagerAccessError(
                  "Leave request not found, not pending, or not authorized"
                );
              }

              const newStatus = item.action === "approve" ? "approved" : "rejected";

              // Update the request status
              if (item.action === "approve") {
                await tx`
                  UPDATE app.leave_requests
                  SET status = 'approved', updated_at = now()
                  WHERE id = ${item.id}::uuid
                `;
              } else {
                await tx`
                  UPDATE app.leave_requests
                  SET status = 'rejected',
                      rejection_reason = ${item.notes ?? "Rejected by manager"},
                      updated_at = now()
                  WHERE id = ${item.id}::uuid
                `;
              }

              // Create approval audit record
              await tx`
                INSERT INTO app.leave_request_approvals (
                  tenant_id, request_id, action, actor_id, actor_role,
                  comment, previous_status, new_status, created_at
                )
                VALUES (
                  ${ctx.tenantId}::uuid, ${item.id}::uuid,
                  ${item.action}, ${ctx.userId}::uuid, 'manager',
                  ${item.notes ?? null}, 'pending', ${newStatus}, now()
                )
              `;

              // Emit outbox event
              await tx`
                INSERT INTO app.domain_outbox (
                  id, tenant_id, aggregate_type, aggregate_id,
                  event_type, payload, created_at
                )
                VALUES (
                  gen_random_uuid(), ${ctx.tenantId}::uuid,
                  'leave_request', ${item.id}::uuid,
                  ${`absence.leave_request.${newStatus}`},
                  ${JSON.stringify({
                    requestId: item.id,
                    action: item.action,
                    employeeId: verification[0]!.employee_id,
                    notes: item.notes,
                    actor: ctx.userId,
                  })}::jsonb,
                  now()
                )
              `;
              break;
            }

            case "timesheet": {
              // Verify the timesheet is for a subordinate and is submitted
              const verification = await tx<{ employee_id: string }[]>`
                SELECT ts.employee_id
                FROM app.timesheets ts
                JOIN app.manager_subordinates ms ON ms.subordinate_id = ts.employee_id
                WHERE ts.id = ${item.id}::uuid
                  AND ms.manager_id = ${employeeId}::uuid
                  AND ms.tenant_id = ${ctx.tenantId}::uuid
                  AND ts.status = 'submitted'
              `;

              if (verification.length === 0) {
                throw new ManagerAccessError(
                  "Timesheet not found, not submitted, or not authorized"
                );
              }

              if (item.action === "approve") {
                await tx`
                  UPDATE app.timesheets
                  SET status = 'approved',
                      approved_at = now(),
                      approved_by = ${ctx.userId}::uuid,
                      updated_at = now()
                  WHERE id = ${item.id}::uuid
                `;
              } else {
                await tx`
                  UPDATE app.timesheets
                  SET status = 'rejected',
                      rejected_at = now(),
                      rejected_by = ${ctx.userId}::uuid,
                      rejection_reason = ${item.notes ?? "Rejected by manager"},
                      updated_at = now()
                  WHERE id = ${item.id}::uuid
                `;
              }

              const newStatus = item.action === "approve" ? "approved" : "rejected";

              // Create timesheet approval audit record
              await tx`
                INSERT INTO app.timesheet_approvals (
                  tenant_id, timesheet_id, action, actor_id, comment, created_at
                )
                VALUES (
                  ${ctx.tenantId}::uuid, ${item.id}::uuid,
                  ${item.action}::app.timesheet_approval_action,
                  ${ctx.userId}::uuid,
                  ${item.notes ?? null},
                  now()
                )
              `;

              // Emit outbox event
              await tx`
                INSERT INTO app.domain_outbox (
                  id, tenant_id, aggregate_type, aggregate_id,
                  event_type, payload, created_at
                )
                VALUES (
                  gen_random_uuid(), ${ctx.tenantId}::uuid,
                  'timesheet', ${item.id}::uuid,
                  ${`time.timesheet.${newStatus}`},
                  ${JSON.stringify({
                    timesheetId: item.id,
                    action: item.action,
                    employeeId: verification[0]!.employee_id,
                    notes: item.notes,
                    actor: ctx.userId,
                  })}::jsonb,
                  now()
                )
              `;
              break;
            }

            default:
              throw new ManagerAccessError(
                `Unsupported approval type: ${item.type}`
              );
          }
        });

        approved.push(item.id);
      } catch (error: any) {
        failed.push({
          id: item.id,
          reason: error.message || "Unknown error",
        });
      }
    }

    return { approved, failed };
  }

  /**
   * Get team absence calendar
   */
  async getTeamAbsenceCalendar(
    ctx: TenantContext,
    startDate: string,
    endDate: string
  ): Promise<TeamAbsenceEntry[]> {
    const employeeId = await this.getCurrentEmployeeId(ctx);
    if (!employeeId) return [];

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<TeamAbsenceEntryRow[]>`
        SELECT
          lr.id,
          lr.employee_id,
          CONCAT(ep.first_name, ' ', ep.last_name) as employee_name,
          lt.name as leave_type,
          lt.color as leave_color,
          lr.start_date::text,
          lr.end_date::text,
          lr.duration_days,
          lr.status
        FROM app.leave_requests lr
        JOIN app.manager_subordinates ms ON ms.subordinate_id = lr.employee_id
        JOIN app.employees e ON e.id = lr.employee_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
        LEFT JOIN app.leave_types lt ON lt.id = lr.leave_type_id
        WHERE ms.manager_id = ${employeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND lr.status IN ('approved', 'pending')
          AND lr.start_date <= ${endDate}::date
          AND lr.end_date >= ${startDate}::date
        ORDER BY lr.start_date
      `;
    });

    return rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      leaveType: row.leave_type,
      leaveColor: row.leave_color,
      startDate: row.start_date,
      endDate: row.end_date,
      durationDays: row.duration_days,
      status: row.status,
    }));
  }

  // =============================================================================
  // Private Helpers
  // =============================================================================

  private mapTeamMemberRow(row: TeamMemberRow): TeamMemberSummary {
    return {
      id: row.id,
      employeeNumber: row.employee_number,
      firstName: row.first_name,
      lastName: row.last_name,
      preferredName: row.preferred_name,
      photoUrl: row.photo_url,
      jobTitle: row.job_title,
      department: row.department,
      status: row.status,
      email: row.email,
      hireDate: row.hire_date,
      depth: row.depth,
    };
  }
}

// =============================================================================
// Types
// =============================================================================

export interface TeamAbsenceEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: string;
  leaveColor: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  status: string;
}

interface TeamAbsenceEntryRow {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type: string;
  leave_color: string | null;
  start_date: string;
  end_date: string;
  duration_days: number;
  status: string;
}

// =============================================================================
// Custom Errors
// =============================================================================

export class ManagerAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagerAccessError";
  }
}
