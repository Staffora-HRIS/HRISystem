/**
 * Manager Approval Service
 *
 * Handles approval workflows: pending approvals listing, single approve/reject,
 * and bulk approve/reject operations for leave requests and timesheets.
 *
 * Extracted from manager.service.ts for reduced cognitive complexity.
 */

import type { DatabaseClient } from "../../plugins/db";
import type { ApprovalType, PendingApproval } from "./manager.schemas";
import { ManagerAccessError, type TenantContext } from "./manager.types";
import type { ManagerHierarchyService } from "./manager.hierarchy.service";

// =============================================================================
// Row Types
// =============================================================================

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
// Approval Service
// =============================================================================

export class ManagerApprovalService {
  constructor(
    private db: DatabaseClient,
    private hierarchy: ManagerHierarchyService
  ) {}

  /**
   * Get pending approvals for the manager
   */
  async getPendingApprovals(
    ctx: TenantContext,
    type?: ApprovalType
  ): Promise<PendingApproval[]> {
    const employeeId = await this.hierarchy.getCurrentEmployeeId(ctx);
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
    const employeeId = await this.hierarchy.getCurrentEmployeeId(ctx);
    if (!employeeId) {
      throw new ManagerAccessError("User is not an employee");
    }

    await this.db.withTransaction(ctx, async (tx) => {
      switch (type) {
        case "leave_request": {
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
        }

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
    const employeeId = await this.hierarchy.getCurrentEmployeeId(ctx);
    if (!employeeId) {
      throw new ManagerAccessError("User is not an employee");
    }

    await this.db.withTransaction(ctx, async (tx) => {
      switch (type) {
        case "leave_request": {
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
        }

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
    const employeeId = await this.hierarchy.getCurrentEmployeeId(ctx);
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
}
