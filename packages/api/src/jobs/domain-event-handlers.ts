/**
 * Domain Event Handlers
 *
 * Processes domain events from Redis Streams and triggers appropriate actions:
 * - Email notifications
 * - Workflow triggers
 * - External system integrations
 * - Analytics tracking
 */

import type { DomainEvent } from "./outbox-processor";
import { StreamKeys } from "./base";
import { getCacheClient, CacheKeys, type CacheClient } from "../plugins/cache";
import { handleWebhookDelivery } from "./webhook-worker";

// =============================================================================
// Types
// =============================================================================

export interface EventHandlerContext {
  db: import("../plugins/db").DatabaseClient;
  redis: import("ioredis").default;
  cache?: CacheClient;
  log: {
    info: (msg: string, data?: Record<string, unknown>) => void;
    warn: (msg: string, data?: Record<string, unknown>) => void;
    error: (msg: string, error?: unknown) => void;
    debug: (msg: string, data?: Record<string, unknown>) => void;
  };
}

export type EventHandler = (
  event: DomainEvent,
  context: EventHandlerContext
) => Promise<void>;

// =============================================================================
// Event Handler Registry
// =============================================================================

const handlers: Map<string, EventHandler[]> = new Map();

/**
 * Register an event handler for a specific event type
 */
export function registerHandler(eventType: string, handler: EventHandler): void {
  const existing = handlers.get(eventType) || [];
  existing.push(handler);
  handlers.set(eventType, existing);
}

/**
 * Get handlers for an event type (supports wildcards)
 */
function getHandlers(eventType: string): EventHandler[] {
  const result: EventHandler[] = [];

  // Exact match
  const exact = handlers.get(eventType);
  if (exact) result.push(...exact);

  // Wildcard matches (e.g., "hr.employee.*" matches "hr.employee.created")
  for (const [pattern, patternHandlers] of handlers.entries()) {
    if (pattern.endsWith(".*")) {
      const prefix = pattern.slice(0, -2);
      if (eventType.startsWith(prefix + ".")) {
        result.push(...patternHandlers);
      }
    }
  }

  // Global handler
  const global = handlers.get("*");
  if (global) result.push(...global);

  return result;
}

// =============================================================================
// HR Event Handlers
// =============================================================================

/**
 * Handle employee created event
 */
async function handleEmployeeCreated(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const { employee, actor } = event.payload as {
    employee: { id: string; email?: string; firstName?: string };
    actor: string;
  };

  ctx.log.info("Processing employee created event", {
    employeeId: employee.id,
    actor,
  });

  // Queue welcome email
  if (employee.email) {
    await ctx.redis.xadd(
      StreamKeys.NOTIFICATIONS,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "notification.email",
        tenantId: event.tenantId,
        data: {
          to: employee.email,
          subject: "Welcome to the Team!",
          template: "welcome",
          templateData: {
            firstName: employee.firstName || "Team Member",
            companyName: "Staffora",
            loginUrl: process.env["APP_URL"] || "https://app.staffora.co.uk",
          },
        },
      }),
      "attempt",
      "1"
    );
  }

  // Create user account if email provided
  if (employee.email) {
    ctx.log.debug("Creating user account for employee", { employeeId: employee.id });
    // User creation is handled by the auth service during onboarding
  }

  // Start onboarding workflow
  await ctx.db.withSystemContext(async (tx) => {
    // Check for auto-start onboarding template
    const templates = await tx<Array<{ id: string }>>`
      SELECT id FROM app.onboarding_templates
      WHERE tenant_id = ${event.tenantId}::uuid
        AND is_active = true
        AND is_default = true
      LIMIT 1
    `;

    if (templates.length > 0) {
      const templateId = templates[0]!.id;
      ctx.log.info("Auto-starting onboarding workflow", {
        employeeId: employee.id,
        templateId,
      });

      // Create onboarding instance
      await tx`
        INSERT INTO app.onboarding_instances (
          tenant_id, employee_id, template_id, status, started_at
        )
        VALUES (
          ${event.tenantId}::uuid, ${employee.id}::uuid, ${templateId}::uuid,
          'in_progress', now()
        )
      `;
    }
  });
}

/**
 * Handle employee status changed event (termination, leave, etc.)
 */
async function handleEmployeeStatusChanged(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const { employeeId, fromStatus, toStatus, reason, actor } = event.payload as {
    employeeId: string;
    fromStatus: string;
    toStatus: string;
    reason?: string;
    actor: string;
  };

  ctx.log.info("Processing employee status change", {
    employeeId,
    fromStatus,
    toStatus,
  });

  if (toStatus === "terminated") {
    // Trigger offboarding workflow
    await ctx.db.withSystemContext(async (tx) => {
      // Find offboarding template
      const templates = await tx<Array<{ id: string }>>`
        SELECT id FROM app.onboarding_templates
        WHERE tenant_id = ${event.tenantId}::uuid
          AND template_type = 'offboarding'
          AND is_active = true
        LIMIT 1
      `;

      if (templates.length > 0) {
        const templateId = templates[0]!.id;
        await tx`
          INSERT INTO app.onboarding_instances (
            tenant_id, employee_id, template_id, status, started_at
          )
          VALUES (
            ${event.tenantId}::uuid, ${employeeId}::uuid, ${templateId}::uuid,
            'in_progress', now()
          )
        `;
      }
    });

    // Revoke user access
    await ctx.db.withSystemContext(async (tx) => {
      await tx`
        UPDATE app.users
        SET status = 'inactive', updated_at = now()
        WHERE id IN (
          SELECT user_id FROM app.employees
          WHERE id = ${employeeId}::uuid AND user_id IS NOT NULL
        )
      `;

      // Invalidate all sessions
      await tx`
        UPDATE app.sessions
        SET invalidated_at = now()
        WHERE user_id IN (
          SELECT user_id FROM app.employees
          WHERE id = ${employeeId}::uuid AND user_id IS NOT NULL
        )
      `;
    });

    // Terminate active benefit enrollments
    await ctx.db.withSystemContext(async (tx) => {
      const terminated = await tx<Array<{ id: string; plan_name: string }>>`
        UPDATE app.benefit_enrollments be
        SET
          status = 'terminated'::app.enrollment_status,
          effective_to = CURRENT_DATE,
          updated_at = now()
        FROM app.benefit_plans bp
        WHERE be.plan_id = bp.id
          AND be.employee_id = ${employeeId}::uuid
          AND be.tenant_id = ${event.tenantId}::uuid
          AND be.status = 'active'::app.enrollment_status
        RETURNING be.id, bp.name as plan_name
      `;

      if (terminated.length > 0) {
        ctx.log.info("Terminated active benefit enrollments on employee termination", {
          employeeId,
          enrollmentsTerminated: terminated.length,
          plans: terminated.map((e) => e.plan_name),
        });
      }
    });

    // Notify HR department
    await ctx.redis.xadd(
      StreamKeys.NOTIFICATIONS,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "notification.in_app",
        tenantId: event.tenantId,
        data: {
          userId: actor,
          title: "Employee Termination Processed",
          message: `Employee termination has been processed. Offboarding workflow started.`,
          type: "employee_terminated",
          data: { employeeId, reason },
        },
      }),
      "attempt",
      "1"
    );
  }
}

// =============================================================================
// Time & Attendance Event Handlers
// =============================================================================

/**
 * Handle time event recorded
 */
async function handleTimeEventRecorded(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const { timeEvent } = event.payload as {
    timeEvent: {
      id: string;
      employeeId: string;
      eventType: string;
      recordedAt: string;
    };
  };

  ctx.log.debug("Processing time event", { timeEventId: timeEvent.id });

  // Check for attendance anomalies
  const eventTime = new Date(timeEvent.recordedAt);
  const hour = eventTime.getHours();

  // Flag late arrivals (after 9 AM)
  if (timeEvent.eventType === "clock_in" && hour >= 9) {
    ctx.log.warn("Late arrival detected", {
      employeeId: timeEvent.employeeId,
      recordedAt: timeEvent.recordedAt,
      lateByMinutes: (hour - 9) * 60 + eventTime.getMinutes(),
    });
  }
}

/**
 * Handle timesheet submitted
 */
async function handleTimesheetSubmitted(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const { timesheet } = event.payload as {
    timesheet: {
      id: string;
      employeeId: string;
      periodStart: string;
      periodEnd: string;
    };
  };

  ctx.log.info("Processing timesheet submission", { timesheetId: timesheet.id });

  // Find manager for approval
  const managers = await ctx.db.withSystemContext(async (tx) => {
    return await tx<Array<{ managerId: string; managerEmail: string }>>`
      SELECT
        m.id as "managerId",
        u.email as "managerEmail"
      FROM app.reporting_lines rl
      JOIN app.employees m ON m.id = rl.manager_id
      LEFT JOIN app.users u ON u.id = m.user_id
      WHERE rl.employee_id = ${timesheet.employeeId}::uuid
        AND rl.tenant_id = ${event.tenantId}::uuid
        AND rl.is_primary = true
        AND (rl.effective_to IS NULL OR rl.effective_to > now())
    `;
  });

  if (managers.length > 0) {
    const manager = managers[0]!;

    // Notify manager for approval
    await ctx.redis.xadd(
      StreamKeys.NOTIFICATIONS,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "notification.in_app",
        tenantId: event.tenantId,
        data: {
          userId: manager.managerId,
          title: "Timesheet Pending Approval",
          message: `A timesheet for ${timesheet.periodStart} - ${timesheet.periodEnd} requires your approval.`,
          type: "timesheet_approval",
          actionUrl: `/manager/approvals/timesheets/${timesheet.id}`,
          actionText: "Review Timesheet",
          data: { timesheetId: timesheet.id },
        },
      }),
      "attempt",
      "1"
    );

    // Send email if manager has email
    if (manager.managerEmail) {
      await ctx.redis.xadd(
        StreamKeys.NOTIFICATIONS,
        "*",
        "payload",
        JSON.stringify({
          id: crypto.randomUUID(),
          type: "notification.email",
          tenantId: event.tenantId,
          data: {
            to: manager.managerEmail,
            subject: "Timesheet Pending Approval",
            template: "approval_required",
            templateData: {
              requestType: "Timesheet",
              requesterName: "Employee",
              details: `Period: ${timesheet.periodStart} - ${timesheet.periodEnd}`,
              actionUrl: `${process.env["APP_URL"]}/manager/approvals/timesheets/${timesheet.id}`,
            },
          },
        }),
        "attempt",
        "1"
      );
    }
  }
}

/**
 * Handle timesheet approved
 */
async function handleTimesheetApproved(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const { timesheet, approver } = event.payload as {
    timesheet: { id: string; employeeId: string };
    approver: string;
  };

  ctx.log.info("Processing timesheet approval", { timesheetId: timesheet.id });

  // Get employee details
  const employees = await ctx.db.withSystemContext(async (tx) => {
    return await tx<Array<{ userId: string; email: string }>>`
      SELECT e.user_id as "userId", u.email
      FROM app.employees e
      LEFT JOIN app.users u ON u.id = e.user_id
      WHERE e.id = ${timesheet.employeeId}::uuid
    `;
  });

  if (employees.length > 0 && employees[0]!.userId) {
    // Notify employee
    await ctx.redis.xadd(
      StreamKeys.NOTIFICATIONS,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "notification.in_app",
        tenantId: event.tenantId,
        data: {
          userId: employees[0]!.userId,
          title: "Timesheet Approved",
          message: "Your timesheet has been approved.",
          type: "timesheet_approved",
          data: { timesheetId: timesheet.id },
        },
      }),
      "attempt",
      "1"
    );
  }
}

// =============================================================================
// Absence Event Handlers
// =============================================================================

/**
 * Handle leave request submitted
 */
async function handleLeaveRequestSubmitted(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const { request } = event.payload as {
    request: {
      id: string;
      employeeId: string;
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      totalDays: number;
      reason?: string;
    };
  };

  ctx.log.info("Processing leave request submission", { requestId: request.id });

  // Get leave type name
  const leaveTypes = await ctx.db.withSystemContext(async (tx) => {
    return await tx<Array<{ name: string }>>`
      SELECT name FROM app.leave_types
      WHERE id = ${request.leaveTypeId}::uuid
    `;
  });

  const leaveTypeName = leaveTypes[0]?.name || "Leave";

  // Get employee and manager info
  const employeeInfo = await ctx.db.withSystemContext(async (tx) => {
    return await tx<
      Array<{
        employeeName: string;
        managerId: string;
        managerUserId: string;
        managerEmail: string;
      }>
    >`
      SELECT
        CONCAT(ep.first_name, ' ', ep.last_name) as "employeeName",
        rl.manager_id as "managerId",
        m.user_id as "managerUserId",
        mu.email as "managerEmail"
      FROM app.employees e
      LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = e.tenant_id
      LEFT JOIN app.reporting_lines rl ON rl.employee_id = e.id AND rl.is_primary = true
        AND (rl.effective_to IS NULL OR rl.effective_to > now())
      LEFT JOIN app.employees m ON m.id = rl.manager_id
      LEFT JOIN app.users mu ON mu.id = m.user_id
      WHERE e.id = ${request.employeeId}::uuid
    `;
  });

  if (employeeInfo.length > 0 && employeeInfo[0]!.managerUserId) {
    const info = employeeInfo[0]!;

    // Notify manager
    await ctx.redis.xadd(
      StreamKeys.NOTIFICATIONS,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "notification.in_app",
        tenantId: event.tenantId,
        data: {
          userId: info.managerUserId,
          title: "Leave Request Pending Approval",
          message: `${info.employeeName} has requested ${request.totalDays} day(s) of ${leaveTypeName}.`,
          type: "leave_approval",
          actionUrl: `/manager/approvals/leave/${request.id}`,
          actionText: "Review Request",
          data: { requestId: request.id },
        },
      }),
      "attempt",
      "1"
    );

    // Send email
    if (info.managerEmail) {
      await ctx.redis.xadd(
        StreamKeys.NOTIFICATIONS,
        "*",
        "payload",
        JSON.stringify({
          id: crypto.randomUUID(),
          type: "notification.email",
          tenantId: event.tenantId,
          data: {
            to: info.managerEmail,
            subject: `Leave Request: ${info.employeeName} - ${leaveTypeName}`,
            template: "leave_request",
            templateData: {
              employeeName: info.employeeName,
              leaveType: leaveTypeName,
              startDate: request.startDate,
              endDate: request.endDate,
              totalDays: request.totalDays,
              reason: request.reason || "Not specified",
              actionUrl: `${process.env["APP_URL"]}/manager/approvals/leave/${request.id}`,
            },
          },
        }),
        "attempt",
        "1"
      );
    }
  }
}

/**
 * Handle leave request approved
 */
async function handleLeaveRequestApproved(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const { request, approver } = event.payload as {
    request: {
      id: string;
      employeeId: string;
      startDate: string;
      endDate: string;
      totalDays: number;
    };
    approver: string;
  };

  ctx.log.info("Processing leave approval", { requestId: request.id });

  // Get employee user ID
  const employees = await ctx.db.withSystemContext(async (tx) => {
    return await tx<Array<{ userId: string; email: string }>>`
      SELECT e.user_id as "userId", u.email
      FROM app.employees e
      LEFT JOIN app.users u ON u.id = e.user_id
      WHERE e.id = ${request.employeeId}::uuid
    `;
  });

  if (employees.length > 0 && employees[0]!.userId) {
    const emp = employees[0]!;

    // Notify employee
    await ctx.redis.xadd(
      StreamKeys.NOTIFICATIONS,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "notification.in_app",
        tenantId: event.tenantId,
        data: {
          userId: emp.userId,
          title: "Leave Request Approved",
          message: `Your leave request for ${request.startDate} - ${request.endDate} has been approved.`,
          type: "leave_approved",
          data: { requestId: request.id },
        },
      }),
      "attempt",
      "1"
    );

    // Update calendar (if calendar integration exists)
    ctx.log.debug("Would update calendar for approved leave", {
      requestId: request.id,
    });
  }

  // Update leave balance via ledger entry (handled by absence service)
  ctx.log.debug("Leave balance will be updated by ledger entry", {
    requestId: request.id,
  });
}

/**
 * Handle leave request rejected
 */
async function handleLeaveRequestRejected(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const { request, rejector, reason } = event.payload as {
    request: { id: string; employeeId: string };
    rejector: string;
    reason?: string;
  };

  ctx.log.info("Processing leave rejection", { requestId: request.id });

  // Get employee user ID
  const employees = await ctx.db.withSystemContext(async (tx) => {
    return await tx<Array<{ userId: string }>>`
      SELECT user_id as "userId" FROM app.employees
      WHERE id = ${request.employeeId}::uuid
    `;
  });

  if (employees.length > 0 && employees[0]!.userId) {
    // Notify employee with reason
    await ctx.redis.xadd(
      StreamKeys.NOTIFICATIONS,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "notification.in_app",
        tenantId: event.tenantId,
        data: {
          userId: employees[0]!.userId,
          title: "Leave Request Declined",
          message: reason
            ? `Your leave request was declined: ${reason}`
            : "Your leave request was declined.",
          type: "leave_rejected",
          data: { requestId: request.id, reason },
        },
      }),
      "attempt",
      "1"
    );
  }
}

// =============================================================================
// Workflow Event Handlers
// =============================================================================

/**
 * Handle workflow instance started
 */
async function handleWorkflowStarted(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const { instance } = event.payload as {
    instance: { id: string; workflowId: string; initiatorId: string };
  };

  ctx.log.info("Processing workflow start", { instanceId: instance.id });

  // Get first pending task and notify assignee
  const tasks = await ctx.db.withSystemContext(async (tx) => {
    return await tx<
      Array<{
        taskId: string;
        assigneeId: string;
        assigneeUserId: string;
        taskName: string;
      }>
    >`
      SELECT
        wt.id as "taskId",
        wt.assignee_id as "assigneeId",
        e.user_id as "assigneeUserId",
        wt.name as "taskName"
      FROM app.workflow_tasks wt
      LEFT JOIN app.employees e ON e.id = wt.assignee_id
      WHERE wt.instance_id = ${instance.id}::uuid
        AND wt.status = 'pending'
      ORDER BY wt.sequence
      LIMIT 1
    `;
  });

  if (tasks.length > 0 && tasks[0]!.assigneeUserId) {
    const task = tasks[0]!;
    await ctx.redis.xadd(
      StreamKeys.NOTIFICATIONS,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "notification.in_app",
        tenantId: event.tenantId,
        data: {
          userId: task.assigneeUserId,
          title: "New Task Assigned",
          message: `You have been assigned a new task: ${task.taskName}`,
          type: "workflow_task",
          actionUrl: `/tasks/${task.taskId}`,
          actionText: "View Task",
          data: { taskId: task.taskId, instanceId: instance.id },
        },
      }),
      "attempt",
      "1"
    );
  }
}

/**
 * Handle workflow instance completed
 */
async function handleWorkflowCompleted(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const { instance } = event.payload as {
    instance: { id: string; initiatorId: string };
  };

  ctx.log.info("Processing workflow completion", { instanceId: instance.id });

  // Get initiator's user ID
  const initiators = await ctx.db.withSystemContext(async (tx) => {
    return await tx<Array<{ userId: string }>>`
      SELECT user_id as "userId" FROM app.employees
      WHERE id = ${instance.initiatorId}::uuid
    `;
  });

  if (initiators.length > 0 && initiators[0]!.userId) {
    // Notify initiator
    await ctx.redis.xadd(
      StreamKeys.NOTIFICATIONS,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "notification.in_app",
        tenantId: event.tenantId,
        data: {
          userId: initiators[0]!.userId,
          title: "Workflow Completed",
          message: "Your workflow request has been completed.",
          type: "workflow_completed",
          data: { instanceId: instance.id },
        },
      }),
      "attempt",
      "1"
    );
  }
}

/**
 * Handle workflow task completed - notify next assignee
 */
async function handleWorkflowTaskCompleted(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const { task, instance } = event.payload as {
    task: { id: string; name: string };
    instance: { id: string };
  };

  ctx.log.info("Processing workflow task completion", { taskId: task.id });

  // Get next pending task
  const nextTasks = await ctx.db.withSystemContext(async (tx) => {
    return await tx<
      Array<{
        taskId: string;
        assigneeUserId: string;
        taskName: string;
      }>
    >`
      SELECT
        wt.id as "taskId",
        e.user_id as "assigneeUserId",
        wt.name as "taskName"
      FROM app.workflow_tasks wt
      LEFT JOIN app.employees e ON e.id = wt.assignee_id
      WHERE wt.instance_id = ${instance.id}::uuid
        AND wt.status = 'pending'
      ORDER BY wt.sequence
      LIMIT 1
    `;
  });

  if (nextTasks.length > 0 && nextTasks[0]!.assigneeUserId) {
    const nextTask = nextTasks[0]!;
    await ctx.redis.xadd(
      StreamKeys.NOTIFICATIONS,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "notification.in_app",
        tenantId: event.tenantId,
        data: {
          userId: nextTask.assigneeUserId,
          title: "Task Ready for Action",
          message: `Task "${nextTask.taskName}" is now ready for your action.`,
          type: "workflow_task",
          actionUrl: `/tasks/${nextTask.taskId}`,
          actionText: "View Task",
          data: { taskId: nextTask.taskId },
        },
      }),
      "attempt",
      "1"
    );
  }
}

// =============================================================================
// Workflow SLA Breach Event Handlers (TODO-156)
// =============================================================================

/**
 * Handle workflow SLA breach events emitted by the auto-escalation scheduler.
 *
 * Processes both basic SLA breach events (workflow.task.sla.breached) and
 * multi-level escalation events (workflow.sla.breached). Sends email
 * notifications to affected users, complementing the in-app notifications
 * already sent by the scheduler.
 */
async function handleWorkflowSlaBreached(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const {
    taskId,
    instanceId,
    slaId,
    action,
    previousAssignee,
    newAssignee,
    reason,
    escalationLevel,
  } = event.payload as {
    taskId: string;
    instanceId: string;
    slaId: string;
    ruleId?: string;
    escalationLevel?: number;
    action: string;
    previousAssignee: string | null;
    newAssignee: string | null;
    reason: string;
    eventType?: string;
  };

  ctx.log.info("Processing workflow SLA breach event", {
    taskId,
    instanceId,
    slaId,
    action,
    escalationLevel,
  });

  // Look up the task details and affected user emails for email notification
  const taskDetails = await ctx.db.withSystemContext(async (tx) => {
    return await tx<
      Array<{
        stepName: string;
        assigneeEmail: string | null;
        assigneeFirstName: string | null;
        previousAssigneeEmail: string | null;
        previousAssigneeFirstName: string | null;
        definitionName: string | null;
      }>
    >`
      SELECT
        wt.step_name AS "stepName",
        u_new.email AS "assigneeEmail",
        ep_new.first_name AS "assigneeFirstName",
        u_prev.email AS "previousAssigneeEmail",
        ep_prev.first_name AS "previousAssigneeFirstName",
        wd.name AS "definitionName"
      FROM app.workflow_tasks wt
      JOIN app.workflow_instances wi ON wi.id = wt.instance_id
      JOIN app.workflow_definitions wd ON wd.id = wi.definition_id
      LEFT JOIN app.users u_new ON u_new.id = ${newAssignee}::uuid
      LEFT JOIN app.employees e_new ON e_new.user_id = u_new.id
      LEFT JOIN app.employee_personal ep_new ON ep_new.employee_id = e_new.id
      LEFT JOIN app.users u_prev ON u_prev.id = ${previousAssignee}::uuid
      LEFT JOIN app.employees e_prev ON e_prev.user_id = u_prev.id
      LEFT JOIN app.employee_personal ep_prev ON ep_prev.employee_id = e_prev.id
      WHERE wt.id = ${taskId}::uuid
      LIMIT 1
    `;
  });

  if (!taskDetails || taskDetails.length === 0) {
    ctx.log.warn("Could not find task details for SLA breach notification", { taskId });
    return;
  }

  const details = taskDetails[0]!;
  const levelLabel = escalationLevel ? ` (Level ${escalationLevel})` : "";
  const workflowLabel = details.definitionName || "Workflow";

  // Send email to the new assignee (if reassigned)
  if (action === "reassign" && newAssignee && details.assigneeEmail) {
    await ctx.redis.xadd(
      StreamKeys.NOTIFICATIONS,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "notification.email",
        tenantId: event.tenantId,
        data: {
          to: details.assigneeEmail,
          subject: `SLA Breach${levelLabel}: Task Escalated to You - ${workflowLabel}`,
          template: "notification",
          templateData: {
            title: `SLA Breach${levelLabel}: Task Escalated to You`,
            message: `Hi ${details.assigneeFirstName || "Team Member"}, the task "${details.stepName || "Workflow task"}" in "${workflowLabel}" has been escalated to you after an SLA breach. Reason: ${reason}. Please take action as soon as possible.`,
            actionUrl: `${process.env["APP_URL"] || "http://localhost:3000"}/admin/workflows/instances/${instanceId}`,
            actionText: "View Workflow",
          },
        },
      }),
      "attempt",
      "1"
    );
  }

  // Send email to the previous assignee (notify them of the breach/escalation)
  if (previousAssignee && details.previousAssigneeEmail) {
    const subject =
      action === "reassign"
        ? `SLA Breach${levelLabel}: Task Reassigned - ${workflowLabel}`
        : action === "auto_approve"
        ? `SLA Breach${levelLabel}: Task Auto-Approved - ${workflowLabel}`
        : action === "auto_reject"
        ? `SLA Breach${levelLabel}: Task Auto-Rejected - ${workflowLabel}`
        : `SLA Breach${levelLabel}: Action Required - ${workflowLabel}`;

    await ctx.redis.xadd(
      StreamKeys.NOTIFICATIONS,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "notification.email",
        tenantId: event.tenantId,
        data: {
          to: details.previousAssigneeEmail,
          subject,
          template: "notification",
          templateData: {
            title: `SLA Breach Notification${levelLabel}`,
            message: `Hi ${details.previousAssigneeFirstName || "Team Member"}, the task "${details.stepName || "Workflow task"}" in "${workflowLabel}" has breached its SLA deadline. ${reason}`,
            actionUrl: `${process.env["APP_URL"] || "http://localhost:3000"}/admin/workflows/instances/${instanceId}`,
            actionText: "View Workflow",
          },
        },
      }),
      "attempt",
      "1"
    );
  }
}

// =============================================================================
// GDPR Event Handlers
// =============================================================================

/**
 * Handle erasure certificate requested — routes to the PDF worker stream
 * so it can generate a GDPR erasure certificate PDF asynchronously.
 */
async function handleErasureCertificateRequested(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const { requestId, employeeId, completedAt, tablesAnonymised } = event.payload as {
    requestId: string;
    employeeId: string;
    completedAt: string;
    tablesAnonymised: string[];
  };

  ctx.log.info("Processing erasure certificate generation request", {
    requestId,
    employeeId,
  });

  // Route to the PDF worker stream for async certificate generation
  await ctx.redis.xadd(
    StreamKeys.PDF_GENERATION,
    "*",
    "payload",
    JSON.stringify({
      id: crypto.randomUUID(),
      type: "pdf.generate",
      tenantId: event.tenantId,
      data: {
        documentType: "certificate",
        template: "erasure_certificate",
        notifyUserId: event.payload.actor,
        data: {
          requestId,
          employeeId,
          completedAt,
          tablesAnonymised,
          tenantId: event.tenantId,
          issuedAt: new Date().toISOString(),
          statement:
            "Personal data has been anonymized in accordance with GDPR Article 17 (Right to Erasure).",
        },
      },
    }),
    "attempt",
    "1"
  );
}

// =============================================================================
// Bulk Document Generation Event Handlers
// =============================================================================

/**
 * Handle bulk document generation item queued event.
 *
 * When a bulk generation batch is created, each employee item emits a
 * 'documents.bulk_generation.item_queued' event. This handler routes the
 * item to the PDF generation stream for async processing by the pdf-worker.
 */
async function handleBulkDocGenItemQueued(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const {
    batchId,
    batchItemId,
    templateId,
    templateName,
    employeeId,
    variables,
    actor,
  } = event.payload as {
    batchId: string;
    batchItemId: string;
    templateId: string;
    templateName: string;
    employeeId: string;
    variables: Record<string, string>;
    actor: string;
  };

  ctx.log.info("Processing bulk document generation item", {
    batchId,
    batchItemId,
    employeeId,
  });

  // Route to the PDF generation stream for the pdf-worker to pick up
  await ctx.redis.xadd(
    StreamKeys.PDF_GENERATION,
    "*",
    "payload",
    JSON.stringify({
      id: crypto.randomUUID(),
      type: "pdf.bulk_document_item",
      tenantId: event.tenantId,
      userId: actor,
      data: {
        batchId,
        batchItemId,
        templateId,
        templateName,
        employeeId,
        variables: variables || {},
      },
      metadata: {
        createdAt: new Date().toISOString(),
        correlationId: batchId,
      },
    }),
    "attempt",
    "1"
  );
}

// =============================================================================
// Cache Invalidation Handlers
// =============================================================================

/**
 * Resolve the cache client from context or fall back to the singleton.
 * Returns null if cache is unavailable (cache invalidation is best-effort).
 */
function resolveCache(ctx: EventHandlerContext): CacheClient | null {
  if (ctx.cache) return ctx.cache;
  try {
    return getCacheClient();
  } catch {
    return null;
  }
}

/**
 * Invalidate employee-related caches when employee data changes.
 *
 * Handles: hr.employee.created, hr.employee.updated, hr.employee.transferred,
 *          hr.employee.promoted, hr.employee.status_changed, hr.employee.terminated
 */
async function handleEmployeeCacheInvalidation(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const cache = resolveCache(ctx);
  if (!cache) return;

  const employeeId =
    (event.payload.employee as { id?: string })?.id ||
    (event.payload.employeeId as string);

  if (!employeeId) {
    ctx.log.debug("Cache invalidation skipped: no employeeId in event payload", {
      eventType: event.eventType,
    });
    return;
  }

  // Invalidate the employee basic data cache
  const empKey = CacheKeys.employeeBasic(event.tenantId, employeeId);
  await cache.del(empKey);

  ctx.log.debug("Invalidated employee cache", {
    eventType: event.eventType,
    employeeId,
    cacheKey: empKey,
  });

  // On termination or status change, also invalidate the user's permissions/roles
  // cache so access revocation takes effect immediately
  if (
    event.eventType === "hr.employee.terminated" ||
    event.eventType === "hr.employee.status_changed"
  ) {
    // Look up the user_id for this employee so we can invalidate their permissions
    try {
      const users = await ctx.db.withSystemContext(async (tx) => {
        return await tx<Array<{ userId: string }>>`
          SELECT user_id as "userId" FROM app.employees
          WHERE id = ${employeeId}::uuid AND user_id IS NOT NULL
        `;
      });

      if (users.length > 0 && users[0]!.userId) {
        const userId = users[0]!.userId;
        await cache.del(CacheKeys.permissions(event.tenantId, userId));
        await cache.del(CacheKeys.roles(event.tenantId, userId));
        ctx.log.debug("Invalidated permissions cache for employee user", {
          employeeId,
          userId,
        });
      }
    } catch (err) {
      ctx.log.error("Failed to invalidate permissions cache for employee", err);
    }
  }

  // Org tree cache may be stale after transfers, promotions, or terminations
  if (
    event.eventType === "hr.employee.transferred" ||
    event.eventType === "hr.employee.promoted" ||
    event.eventType === "hr.employee.terminated" ||
    event.eventType === "hr.employee.created"
  ) {
    await cache.del(CacheKeys.orgTree(event.tenantId));
    ctx.log.debug("Invalidated org tree cache", { tenantId: event.tenantId });
  }
}

/**
 * Invalidate permission/role caches when security settings change.
 *
 * Handles: security.role.updated, security.permissions.updated
 *
 * NOTE: These events are not yet emitted by the security module, but this
 * handler is registered so invalidation will work as soon as the events
 * are wired up in the security service.
 */
async function handleSecurityCacheInvalidation(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const cache = resolveCache(ctx);
  if (!cache) return;

  const userId = event.payload.userId as string | undefined;

  if (userId) {
    // Invalidate specific user's permissions and roles
    await cache.del(CacheKeys.permissions(event.tenantId, userId));
    await cache.del(CacheKeys.roles(event.tenantId, userId));
    ctx.log.debug("Invalidated permissions cache for user", {
      eventType: event.eventType,
      userId,
    });
  } else {
    // If no specific userId, invalidate the whole tenant's cache
    // (e.g., a role definition changed affecting all users with that role)
    const deleted = await cache.invalidateTenantCache(event.tenantId);
    ctx.log.debug("Invalidated tenant-wide cache", {
      eventType: event.eventType,
      tenantId: event.tenantId,
      keysDeleted: deleted,
    });
  }
}

/**
 * Invalidate tenant settings cache when tenant configuration changes.
 *
 * Handles: tenant.settings.updated
 *
 * NOTE: This event is not yet emitted by the tenant module, but this
 * handler is registered so invalidation will work once the event is
 * wired up in the tenant service.
 */
async function handleTenantCacheInvalidation(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const cache = resolveCache(ctx);
  if (!cache) return;

  await cache.del(CacheKeys.tenantSettings(event.tenantId));
  ctx.log.debug("Invalidated tenant settings cache", {
    eventType: event.eventType,
    tenantId: event.tenantId,
  });
}

// =============================================================================
// Register All Handlers
// =============================================================================

export function registerAllHandlers(): void {
  // HR Events
  registerHandler("hr.employee.created", handleEmployeeCreated);
  registerHandler("hr.employee.status_changed", handleEmployeeStatusChanged);

  // Time & Attendance Events
  registerHandler("time.event.recorded", handleTimeEventRecorded);
  registerHandler("time.timesheet.submitted", handleTimesheetSubmitted);
  registerHandler("time.timesheet.approved", handleTimesheetApproved);

  // Absence Events
  registerHandler("absence.request.submitted", handleLeaveRequestSubmitted);
  registerHandler("absence.request.approved", handleLeaveRequestApproved);
  registerHandler("absence.request.rejected", handleLeaveRequestRejected);

  // Workflow Events
  registerHandler("workflow.instance.started", handleWorkflowStarted);
  registerHandler("workflow.instance.completed", handleWorkflowCompleted);
  registerHandler("workflow.task.completed", handleWorkflowTaskCompleted);

  // Workflow SLA Breach Events (from scheduler auto-escalation, TODO-156)
  registerHandler("workflow.sla.breached", handleWorkflowSlaBreached);
  registerHandler("workflow.task.sla.breached", handleWorkflowSlaBreached);

  // GDPR Events
  registerHandler("gdpr.erasure.certificate_requested", handleErasureCertificateRequested);

  // Bulk Document Generation Events
  registerHandler("documents.bulk_generation.item_queued", handleBulkDocGenItemQueued);

  // Cache Invalidation Handlers
  // Employee data changes - use wildcard to catch all hr.employee.* events
  registerHandler("hr.employee.*", handleEmployeeCacheInvalidation);

  // Security/permission changes (events not yet emitted, but ready for when they are)
  registerHandler("security.role.updated", handleSecurityCacheInvalidation);
  registerHandler("security.permissions.updated", handleSecurityCacheInvalidation);

  // Tenant settings changes (event not yet emitted, but ready for when it is)
  registerHandler("tenant.settings.updated", handleTenantCacheInvalidation);

  // Outbound Webhook Delivery (global handler - receives all domain events)
  // Creates delivery records for any webhook subscriptions matching the event type
  registerHandler("*", handleWebhookDelivery);
}

// =============================================================================
// Event Consumer
// =============================================================================

/**
 * Start consuming domain events from Redis Streams
 */
export async function startEventConsumer(
  context: EventHandlerContext,
  options: {
    consumerGroup?: string;
    consumerName?: string;
    blockMs?: number;
    batchSize?: number;
  } = {}
): Promise<{ stop: () => void }> {
  const {
    consumerGroup = "event-handlers",
    consumerName = `handler-${process.pid}`,
    blockMs = 5000,
    batchSize = 10,
  } = options;

  const { redis, log } = context;
  let isRunning = true;

  // Ensure consumer group exists
  try {
    await redis.xgroup("CREATE", StreamKeys.DOMAIN_EVENTS, consumerGroup, "0", "MKSTREAM");
    log.info(`Created consumer group: ${consumerGroup}`);
  } catch (error: unknown) {
    // Group already exists
    if (!(error instanceof Error && error.message.includes("BUSYGROUP"))) {
      throw error;
    }
  }

  // Register all handlers
  registerAllHandlers();

  async function consume(): Promise<void> {
    while (isRunning) {
      try {
        // Read from stream
        const results = await redis.xreadgroup(
          "GROUP",
          consumerGroup,
          consumerName,
          "COUNT",
          batchSize,
          "BLOCK",
          blockMs,
          "STREAMS",
          StreamKeys.DOMAIN_EVENTS,
          ">"
        );

        if (!results || results.length === 0) continue;

        for (const [_streamKey, messages] of results as Array<[string, Array<[string, string[]]>]>) {
          for (const [messageId, fields] of messages) {
            try {
              // Parse event
              const payloadIdx = fields.indexOf("payload");
              if (payloadIdx === -1 || payloadIdx + 1 >= fields.length) continue;

              const event: DomainEvent = JSON.parse(fields[payloadIdx + 1]!);

              // Get handlers
              const eventHandlers = getHandlers(event.eventType);

              if (eventHandlers.length === 0) {
                log.debug(`No handlers for event type: ${event.eventType}`);
              } else {
                // Execute handlers
                for (const handler of eventHandlers) {
                  try {
                    await handler(event, context);
                  } catch (handlerError) {
                    log.error(`Handler failed for ${event.eventType}`, handlerError);
                  }
                }
              }

              // Acknowledge message
              await redis.xack(StreamKeys.DOMAIN_EVENTS, consumerGroup, messageId);
            } catch (parseError) {
              log.error(`Failed to parse message ${messageId}`, parseError);
              // Still acknowledge to avoid blocking
              await redis.xack(StreamKeys.DOMAIN_EVENTS, consumerGroup, messageId);
            }
          }
        }
      } catch (error) {
        log.error("Event consumer error", error);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  // Start consuming
  consume();

  return {
    stop: () => {
      isRunning = false;
    },
  };
}

export default { registerAllHandlers, startEventConsumer };
