/**
 * Outbox Processor Worker
 *
 * Processes domain events from the outbox table and dispatches them
 * to appropriate handlers (webhooks, notifications, integrations).
 */

import postgres from "postgres";
import Redis from "ioredis";
import { getDatabaseUrl, getRedisUrl } from "../config/database";

// FIX: Using centralized configuration to prevent password mismatch issues
// All database defaults are now managed in src/config/database.ts
const DB_URL = getDatabaseUrl();
const REDIS_URL = getRedisUrl();
const BATCH_SIZE = 100;
const BASE_POLL_INTERVAL_MS = 5000;
const MAX_POLL_INTERVAL_MS = 30000;
const EMPTY_POLLS_BEFORE_BACKOFF = 3;
const MAX_RETRIES = 5;
const MAX_RETRY_BACKOFF_MS = 300000; // 5 minutes cap for failed event retry

// Stream keys for notifications
const NOTIFICATIONS_STREAM = "staffora:notifications";
const ANALYTICS_STREAM = "staffora:analytics";

interface OutboxEvent {
  id: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  retryCount: number;
  createdAt: Date;
}

class OutboxProcessor {
  private sql: postgres.Sql;
  private redis: Redis;
  private ownsConnections: boolean;
  private running = false;
  private handlers: Map<string, (event: OutboxEvent) => Promise<void>> = new Map();
  private consecutiveEmptyPolls = 0;
  private currentPollIntervalMs = BASE_POLL_INTERVAL_MS;

  constructor(injectedSql?: postgres.Sql, injectedRedis?: Redis) {
    // Reuse injected connections if provided; otherwise create our own
    this.ownsConnections = !injectedSql || !injectedRedis;
    this.sql = injectedSql ?? postgres(DB_URL, { transform: postgres.toCamel });
    this.redis = injectedRedis ?? new Redis(REDIS_URL);
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers() {
    // HR Events
    this.handlers.set("hr.employee.created", this.handleEmployeeCreated.bind(this));
    this.handlers.set("hr.employee.updated", this.handleEmployeeUpdated.bind(this));
    this.handlers.set("hr.employee.terminated", this.handleEmployeeTerminated.bind(this));

    // Time Events
    this.handlers.set("time.event.recorded", this.handleTimeEvent.bind(this));
    this.handlers.set("time.timesheet.submitted", this.handleTimesheetSubmitted.bind(this));
    this.handlers.set("time.timesheet.approved", this.handleTimesheetApproved.bind(this));

    // Absence Events
    this.handlers.set("absence.request.submitted", this.handleLeaveRequestSubmitted.bind(this));
    this.handlers.set("absence.request.approved", this.handleLeaveRequestApproved.bind(this));
    this.handlers.set("absence.request.rejected", this.handleLeaveRequestRejected.bind(this));

    // Workflow Events
    this.handlers.set("workflows.instance.started", this.handleWorkflowStarted.bind(this));
    this.handlers.set("workflows.instance.completed", this.handleWorkflowCompleted.bind(this));
    this.handlers.set("workflows.step.processed", this.handleWorkflowStepProcessed.bind(this));
  }

  async start() {
    console.log("[OutboxProcessor] Starting...");
    this.running = true;

    while (this.running) {
      try {
        const eventsFound = await this.processBatch();
        this.adjustPollingInterval(eventsFound);
      } catch (error) {
        console.error("[OutboxProcessor] Error processing batch:", error instanceof Error ? error.message : String(error));
      }

      await this.sleep(this.currentPollIntervalMs);
    }
  }

  async stop() {
    console.log("[OutboxProcessor] Stopping...");
    this.running = false;
    // Only close connections we created ourselves
    if (this.ownsConnections) {
      await this.redis.quit();
      await this.sql.end();
    }
  }

  private async processBatch(): Promise<boolean> {
    // Fetch unprocessed events, skipping those whose retry time hasn't passed yet
    const events = await this.sql<OutboxEvent[]>`
      SELECT id, tenant_id, aggregate_type, aggregate_id, event_type, payload, retry_count, created_at
      FROM app.domain_outbox
      WHERE processed_at IS NULL
        AND retry_count < ${MAX_RETRIES}
        AND (next_retry_at IS NULL OR next_retry_at <= now())
      ORDER BY created_at ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;

    if (events.length === 0) return false;

    console.log(`[OutboxProcessor] Processing ${events.length} events`);

    for (const event of events) {
      await this.processEvent(event);
    }

    return true;
  }

  private async processEvent(event: OutboxEvent) {
    const handler = this.handlers.get(event.eventType);

    if (!handler) {
      // Mark as processed if no handler (log and skip)
      console.log(`[OutboxProcessor] No handler for event type: ${event.eventType}`);
      await this.markProcessed(event.id);
      return;
    }

    try {
      // Process the event
      await handler(event);

      // Mark as processed
      await this.markProcessed(event.id);
      console.log(`[OutboxProcessor] Processed event: ${event.eventType} (${event.id})`);
    } catch (error: unknown) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const errorMessage = rawMessage.substring(0, 500).replace(/password|secret|token|key/gi, "[REDACTED]");
      console.error(`[OutboxProcessor] Failed to process event ${event.id}:`, errorMessage);

      // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 5 minutes
      const backoffMs = Math.min(1000 * Math.pow(2, event.retryCount || 0), MAX_RETRY_BACKOFF_MS);
      const nextRetryAt = new Date(Date.now() + backoffMs);

      // Increment retry count and schedule next retry
      await this.sql`
        UPDATE app.domain_outbox
        SET retry_count = retry_count + 1,
            error_message = ${errorMessage},
            next_retry_at = ${nextRetryAt}
        WHERE id = ${event.id}::uuid
      `;

      console.log(`[OutboxProcessor] Event ${event.id} scheduled for retry in ${backoffMs}ms (attempt ${(event.retryCount || 0) + 1}/${MAX_RETRIES})`);
    }
  }

  private async markProcessed(eventId: string) {
    await this.sql`
      UPDATE app.domain_outbox
      SET processed_at = now(),
          next_retry_at = NULL,
          error_message = NULL
      WHERE id = ${eventId}::uuid
    `;
  }

  // Helper: Queue email notification
  private async queueEmailNotification(tenantId: string, to: string, subject: string, template: string, templateData: Record<string, unknown>) {
    await this.redis.xadd(
      NOTIFICATIONS_STREAM,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "notification.email",
        tenantId,
        data: { to, subject, template, templateData },
      }),
      "attempt",
      "1"
    );
  }

  // Helper: Queue in-app notification
  private async queueInAppNotification(
    tenantId: string,
    userId: string,
    title: string,
    message: string,
    type: string,
    actionUrl?: string,
    actionText?: string,
    data?: Record<string, unknown>
  ) {
    await this.redis.xadd(
      NOTIFICATIONS_STREAM,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "notification.in_app",
        tenantId,
        data: { userId, title, message, type, actionUrl, actionText, data },
      }),
      "attempt",
      "1"
    );
  }

  // Helper: Queue analytics event
  private async queueAnalyticsEvent(tenantId: string, eventType: string, eventData: Record<string, unknown>) {
    await this.redis.xadd(
      ANALYTICS_STREAM,
      "*",
      "payload",
      JSON.stringify({
        id: crypto.randomUUID(),
        type: "analytics.event",
        tenantId,
        data: { eventType, eventData, timestamp: new Date().toISOString() },
      }),
      "attempt",
      "1"
    );
  }

  // Event Handlers

  private async handleEmployeeCreated(event: OutboxEvent) {
    const employeeId = event.payload["employeeId"] as string;
    const email = event.payload["email"] as string | undefined;
    const firstName = event.payload["firstName"] as string | undefined;
    console.log(`[Handler] Employee created: ${employeeId}`);

    // Get employee details if not in payload
    const employees = await this.sql<Array<{
      userId: string | null;
      email: string | null;
      firstName: string | null;
    }>>`
      SELECT e.user_id, u.email, ep.first_name
      FROM app.employees e
      LEFT JOIN app.users u ON u.id = e.user_id
      LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
      WHERE e.id = ${employeeId}::uuid
    `;

    const emp = employees[0];
    const empEmail = email || emp?.email;
    const empFirstName = firstName || emp?.firstName || "Team Member";

    // 1. Send welcome email
    if (empEmail) {
      await this.queueEmailNotification(
        event.tenantId,
        empEmail,
        "Welcome to the Team!",
        "welcome",
        {
          firstName: empFirstName,
          companyName: "Staffora",
          loginUrl: process.env["APP_URL"] || "https://app.staffora.co.uk",
        }
      );
    }

    // 2. Create user account if needed (check if user exists)
    if (!emp?.userId && empEmail) {
      // User creation is typically handled during onboarding or by admin
      // Log that account needs to be created
      console.log(`[Handler] User account needed for employee ${employeeId}`);
    }

    // 3. Start onboarding workflow
    const templates = await this.sql<Array<{ id: string }>>`
      SELECT id FROM app.onboarding_templates
      WHERE tenant_id = ${event.tenantId}::uuid
        AND is_active = true
        AND is_default = true
        AND template_type = 'onboarding'
      LIMIT 1
    `;

    if (templates.length > 0) {
      const templateId = templates[0]!.id;
      console.log(`[Handler] Starting onboarding workflow for employee ${employeeId}`);

      await this.sql`
        INSERT INTO app.onboarding_instances (
          tenant_id, employee_id, template_id, status, started_at
        )
        VALUES (
          ${event.tenantId}::uuid, ${employeeId}::uuid, ${templateId}::uuid,
          'in_progress', now()
        )
        ON CONFLICT (tenant_id, employee_id, template_id) DO NOTHING
      `;
    }

    // Track analytics
    await this.queueAnalyticsEvent(event.tenantId, "employee.created", {
      employeeId,
      timestamp: new Date().toISOString(),
    });
  }

  private async handleEmployeeUpdated(event: OutboxEvent) {
    const employeeId = event.payload["employeeId"] as string;
    const changes = event.payload["changes"] as Record<string, unknown> | undefined;
    console.log(`[Handler] Employee updated: ${employeeId}`);

    // Sync with external systems - log the sync request
    // In production, this would call external APIs (benefits providers, identity providers, etc.)
    if (changes) {
      console.log(`[Handler] Syncing changes to external systems: ${Object.keys(changes).join(", ")}`);

      // Track the sync request in analytics
      await this.queueAnalyticsEvent(event.tenantId, "employee.synced", {
        employeeId,
        changedFields: Object.keys(changes),
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async handleEmployeeTerminated(event: OutboxEvent) {
    const employeeId = event.payload["employeeId"] as string;
    const reason = event.payload["reason"] as string | undefined;
    console.log(`[Handler] Employee terminated: ${employeeId}`);

    // 1. Trigger offboarding workflow
    const templates = await this.sql<Array<{ id: string }>>`
      SELECT id FROM app.onboarding_templates
      WHERE tenant_id = ${event.tenantId}::uuid
        AND is_active = true
        AND template_type = 'offboarding'
      LIMIT 1
    `;

    if (templates.length > 0) {
      const templateId = templates[0]!.id;
      await this.sql`
        INSERT INTO app.onboarding_instances (
          tenant_id, employee_id, template_id, status, started_at
        )
        VALUES (
          ${event.tenantId}::uuid, ${employeeId}::uuid, ${templateId}::uuid,
          'in_progress', now()
        )
        ON CONFLICT (tenant_id, employee_id, template_id) DO NOTHING
      `;
    }

    // 2. Revoke access - disable user account and invalidate sessions
    await this.sql`
      UPDATE app.users
      SET status = 'inactive', updated_at = now()
      WHERE id IN (
        SELECT user_id FROM app.employees
        WHERE id = ${employeeId}::uuid AND user_id IS NOT NULL
      )
    `;

    await this.sql`
      UPDATE app.sessions
      SET invalidated_at = now()
      WHERE user_id IN (
        SELECT user_id FROM app.employees
        WHERE id = ${employeeId}::uuid AND user_id IS NOT NULL
      )
      AND invalidated_at IS NULL
    `;

    // 3. Notify relevant departments (HR admins)
    const hrAdmins = await this.sql<Array<{ userId: string; email: string }>>`
      SELECT DISTINCT u.id as user_id, u.email
      FROM app.users u
      JOIN app.role_assignments ra ON ra.user_id = u.id
      JOIN app.roles r ON r.id = ra.role_id
      WHERE ra.tenant_id = ${event.tenantId}::uuid
        AND r.name IN ('HR Admin', 'HR Manager')
        AND u.status = 'active'
    `;

    for (const admin of hrAdmins) {
      await this.queueInAppNotification(
        event.tenantId,
        admin.userId,
        "Employee Termination",
        `An employee has been terminated${reason ? `: ${reason}` : "."}`,
        "employee_terminated",
        `/admin/employees/${employeeId}`,
        "View Details",
        { employeeId, reason }
      );
    }
  }

  private async handleTimeEvent(event: OutboxEvent) {
    const eventId = event.payload["eventId"] as string;
    const employeeId = event.payload["employeeId"] as string;
    const eventType = event.payload["eventType"] as string;
    const recordedAt = event.payload["recordedAt"] as string;
    console.log(`[Handler] Time event recorded: ${eventId}`);

    // 1. Track for real-time dashboard updates via analytics
    await this.queueAnalyticsEvent(event.tenantId, "time.clock_event", {
      eventId,
      employeeId,
      eventType,
      recordedAt,
    });

    // 2. Check for attendance alerts (late arrivals, missed punches)
    const hour = new Date(recordedAt).getHours();

    // Alert for late clock-in (after 9 AM)
    if (eventType === "clock_in" && hour >= 9) {
      const lateMinutes = (hour - 9) * 60 + new Date(recordedAt).getMinutes();

      // Get employee's manager
      const managers = await this.sql<Array<{ managerId: string; managerUserId: string }>>`
        SELECT rl.manager_id, m.user_id as manager_user_id
        FROM app.reporting_lines rl
        JOIN app.employees m ON m.id = rl.manager_id
        WHERE rl.employee_id = ${employeeId}::uuid
          AND rl.tenant_id = ${event.tenantId}::uuid
          AND rl.is_primary = true
          AND (rl.effective_to IS NULL OR rl.effective_to > now())
      `;

      if (managers.length > 0 && managers[0]!.managerUserId) {
        await this.queueInAppNotification(
          event.tenantId,
          managers[0]!.managerUserId,
          "Late Arrival Alert",
          `An employee arrived ${lateMinutes} minutes late.`,
          "attendance_alert",
          `/manager/team/attendance`,
          "View Attendance",
          { employeeId, lateMinutes }
        );
      }
    }
  }

  private async handleTimesheetSubmitted(event: OutboxEvent) {
    const timesheetId = event.payload["timesheetId"] as string;
    const employeeId = event.payload["employeeId"] as string;
    const periodStart = event.payload["periodStart"] as string;
    const periodEnd = event.payload["periodEnd"] as string;
    console.log(`[Handler] Timesheet submitted: ${timesheetId}`);

    // 1. Find manager for approval
    const managers = await this.sql<Array<{
      managerId: string;
      managerUserId: string;
      managerEmail: string;
      employeeName: string;
    }>>`
      SELECT
        rl.manager_id,
        m.user_id as manager_user_id,
        u.email as manager_email,
        CONCAT(ep.first_name, ' ', ep.last_name) as employee_name
      FROM app.reporting_lines rl
      JOIN app.employees m ON m.id = rl.manager_id
      LEFT JOIN app.users u ON u.id = m.user_id
      LEFT JOIN app.employees e ON e.id = rl.employee_id
      LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
      WHERE rl.employee_id = ${employeeId}::uuid
        AND rl.tenant_id = ${event.tenantId}::uuid
        AND rl.is_primary = true
        AND (rl.effective_to IS NULL OR rl.effective_to > now())
    `;

    if (managers.length > 0) {
      const mgr = managers[0]!;
      const employeeName = mgr.employeeName || "An employee";

      // Notify manager for approval
      if (mgr.managerUserId) {
        await this.queueInAppNotification(
          event.tenantId,
          mgr.managerUserId,
          "Timesheet Pending Approval",
          `${employeeName} submitted a timesheet for ${periodStart} - ${periodEnd}.`,
          "timesheet_approval",
          `/manager/approvals/timesheets/${timesheetId}`,
          "Review Timesheet",
          { timesheetId, employeeId }
        );
      }

      // Send email notification
      if (mgr.managerEmail) {
        await this.queueEmailNotification(
          event.tenantId,
          mgr.managerEmail,
          `Timesheet Pending Approval - ${employeeName}`,
          "approval_required",
          {
            requestType: "Timesheet",
            requesterName: employeeName,
            details: `Period: ${periodStart} - ${periodEnd}`,
            actionUrl: `${process.env["APP_URL"] || "https://app.staffora.co.uk"}/manager/approvals/timesheets/${timesheetId}`,
          }
        );
      }
    }

    // 2. Start approval workflow if configured
    const workflows = await this.sql<Array<{ id: string }>>`
      SELECT id FROM app.workflow_definitions
      WHERE tenant_id = ${event.tenantId}::uuid
        AND trigger_type = 'timesheet_submitted'
        AND is_active = true
      LIMIT 1
    `;

    if (workflows.length > 0) {
      console.log(`[Handler] Would start workflow ${workflows[0]!.id} for timesheet ${timesheetId}`);
    }
  }

  private async handleTimesheetApproved(event: OutboxEvent) {
    const timesheetId = event.payload["timesheetId"] as string;
    const employeeId = event.payload["employeeId"] as string;
    const approverId = event.payload["approverId"] as string;
    console.log(`[Handler] Timesheet approved: ${timesheetId}`);

    // Get employee details
    const employees = await this.sql<Array<{ userId: string; email: string }>>`
      SELECT e.user_id, u.email
      FROM app.employees e
      LEFT JOIN app.users u ON u.id = e.user_id
      WHERE e.id = ${employeeId}::uuid
    `;

    const emp = employees[0];

    // 1. Log for downstream export/processing
    await this.queueAnalyticsEvent(event.tenantId, "timesheet.approved_finalized", {
      timesheetId,
      employeeId,
      approverId,
      approvedAt: new Date().toISOString(),
    });

    // 2. Notify employee
    if (emp?.userId) {
      await this.queueInAppNotification(
        event.tenantId,
        emp.userId,
        "Timesheet Approved",
        "Your timesheet has been approved.",
        "timesheet_approved",
        `/employee/time`,
        "View Timesheet",
        { timesheetId }
      );
    }

    if (emp?.email) {
      await this.queueEmailNotification(
        event.tenantId,
        emp.email,
        "Your Timesheet Has Been Approved",
        "notification",
        {
          title: "Timesheet Approved",
          message: "Your timesheet has been approved and submitted for processing.",
          actionUrl: `${process.env["APP_URL"] || "https://app.staffora.co.uk"}/employee/time`,
          actionText: "View Timesheet",
        }
      );
    }
  }

  private async handleLeaveRequestSubmitted(event: OutboxEvent) {
    const requestId = event.payload["requestId"] as string;
    const employeeId = event.payload["employeeId"] as string;
    const leaveTypeId = event.payload["leaveTypeId"] as string;
    const startDate = event.payload["startDate"] as string;
    const endDate = event.payload["endDate"] as string;
    const totalDays = event.payload["totalDays"] as number;
    console.log(`[Handler] Leave request submitted: ${requestId}`);

    // Get leave type name
    const leaveTypes = await this.sql<Array<{ name: string }>>`
      SELECT name FROM app.leave_types WHERE id = ${leaveTypeId}::uuid
    `;
    const leaveTypeName = leaveTypes[0]?.name || "Leave";

    // Get employee and manager info
    const info = await this.sql<Array<{
      employeeName: string;
      managerUserId: string;
      managerEmail: string;
    }>>`
      SELECT
        CONCAT(ep.first_name, ' ', ep.last_name) as employee_name,
        m.user_id as manager_user_id,
        mu.email as manager_email
      FROM app.employees e
      LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
      LEFT JOIN app.reporting_lines rl ON rl.employee_id = e.id AND rl.is_primary = true
        AND (rl.effective_to IS NULL OR rl.effective_to > now())
      LEFT JOIN app.employees m ON m.id = rl.manager_id
      LEFT JOIN app.users mu ON mu.id = m.user_id
      WHERE e.id = ${employeeId}::uuid
    `;

    const empInfo = info[0];
    const employeeName = empInfo?.employeeName || "An employee";

    // 1. Notify approver(s)
    if (empInfo?.managerUserId) {
      await this.queueInAppNotification(
        event.tenantId,
        empInfo.managerUserId,
        "Leave Request Pending Approval",
        `${employeeName} requested ${totalDays} day(s) of ${leaveTypeName}.`,
        "leave_approval",
        `/manager/approvals/leave/${requestId}`,
        "Review Request",
        { requestId, employeeId }
      );
    }

    if (empInfo?.managerEmail) {
      await this.queueEmailNotification(
        event.tenantId,
        empInfo.managerEmail,
        `Leave Request: ${employeeName} - ${leaveTypeName}`,
        "leave_request",
        {
          employeeName,
          leaveType: leaveTypeName,
          startDate,
          endDate,
          totalDays,
          actionUrl: `${process.env["APP_URL"] || "https://app.staffora.co.uk"}/manager/approvals/leave/${requestId}`,
        }
      );
    }

    // 2. Start approval workflow if configured
    const workflows = await this.sql<Array<{ id: string }>>`
      SELECT id FROM app.workflow_definitions
      WHERE tenant_id = ${event.tenantId}::uuid
        AND trigger_type = 'leave_request_submitted'
        AND is_active = true
      LIMIT 1
    `;

    if (workflows.length > 0) {
      console.log(`[Handler] Would start workflow ${workflows[0]!.id} for leave request ${requestId}`);
    }
  }

  private async handleLeaveRequestApproved(event: OutboxEvent) {
    const requestId = event.payload["requestId"] as string;
    const employeeId = event.payload["employeeId"] as string;
    const startDate = event.payload["startDate"] as string;
    const endDate = event.payload["endDate"] as string;
    console.log(`[Handler] Leave request approved: ${requestId}`);

    // Get employee details
    const employees = await this.sql<Array<{ userId: string; email: string }>>`
      SELECT e.user_id, u.email
      FROM app.employees e
      LEFT JOIN app.users u ON u.id = e.user_id
      WHERE e.id = ${employeeId}::uuid
    `;

    const emp = employees[0];

    // 1. Track calendar update (would integrate with calendar service in production)
    await this.queueAnalyticsEvent(event.tenantId, "leave.calendar_updated", {
      requestId,
      employeeId,
      startDate,
      endDate,
    });

    // 2. Notify employee
    if (emp?.userId) {
      await this.queueInAppNotification(
        event.tenantId,
        emp.userId,
        "Leave Request Approved",
        `Your leave request for ${startDate} - ${endDate} has been approved.`,
        "leave_approved",
        `/employee/leave`,
        "View Leave",
        { requestId }
      );
    }

    if (emp?.email) {
      await this.queueEmailNotification(
        event.tenantId,
        emp.email,
        "Your Leave Request Has Been Approved",
        "notification",
        {
          title: "Leave Request Approved",
          message: `Your leave request for ${startDate} - ${endDate} has been approved.`,
          actionUrl: `${process.env["APP_URL"] || "https://app.staffora.co.uk"}/employee/leave`,
          actionText: "View Leave Balance",
        }
      );
    }

    // 3. Leave balance is updated via ledger in the absence service (already handled)
    console.log(`[Handler] Leave balance updated via ledger for request ${requestId}`);
  }

  private async handleLeaveRequestRejected(event: OutboxEvent) {
    const requestId = event.payload["requestId"] as string;
    const employeeId = event.payload["employeeId"] as string;
    const reason = event.payload["reason"] as string | undefined;
    console.log(`[Handler] Leave request rejected: ${requestId}`);

    // Get employee details
    const employees = await this.sql<Array<{ userId: string; email: string }>>`
      SELECT e.user_id, u.email
      FROM app.employees e
      LEFT JOIN app.users u ON u.id = e.user_id
      WHERE e.id = ${employeeId}::uuid
    `;

    const emp = employees[0];

    // Notify employee with reason
    const message = reason
      ? `Your leave request was declined: ${reason}`
      : "Your leave request was declined.";

    if (emp?.userId) {
      await this.queueInAppNotification(
        event.tenantId,
        emp.userId,
        "Leave Request Declined",
        message,
        "leave_rejected",
        `/employee/leave`,
        "View Details",
        { requestId, reason }
      );
    }

    if (emp?.email) {
      await this.queueEmailNotification(
        event.tenantId,
        emp.email,
        "Your Leave Request Has Been Declined",
        "notification",
        {
          title: "Leave Request Declined",
          message,
          actionUrl: `${process.env["APP_URL"] || "https://app.staffora.co.uk"}/employee/leave`,
          actionText: "View Details",
        }
      );
    }
  }

  private async handleWorkflowStarted(event: OutboxEvent) {
    const instanceId = event.payload["instanceId"] as string;
    console.log(`[Handler] Workflow started: ${instanceId}`);

    // Get first pending task and notify assignee
    const tasks = await this.sql<Array<{
      taskId: string;
      assigneeUserId: string;
      taskName: string;
    }>>`
      SELECT
        wt.id as task_id,
        e.user_id as assignee_user_id,
        wt.name as task_name
      FROM app.workflow_tasks wt
      LEFT JOIN app.employees e ON e.id = wt.assignee_id
      WHERE wt.instance_id = ${instanceId}::uuid
        AND wt.status = 'pending'
      ORDER BY wt.sequence
      LIMIT 1
    `;

    if (tasks.length > 0 && tasks[0]!.assigneeUserId) {
      const task = tasks[0]!;
      await this.queueInAppNotification(
        event.tenantId,
        task.assigneeUserId,
        "New Task Assigned",
        `You have been assigned a new task: ${task.taskName}`,
        "workflow_task",
        `/tasks/${task.taskId}`,
        "View Task",
        { taskId: task.taskId, instanceId }
      );
    }
  }

  private async handleWorkflowCompleted(event: OutboxEvent) {
    const instanceId = event.payload["instanceId"] as string;
    const initiatorId = event.payload["initiatorId"] as string;
    console.log(`[Handler] Workflow completed: ${instanceId}`);

    // Execute completion actions - get workflow definition
    const instances = await this.sql<Array<{
      definitionId: string;
      completionActions: Record<string, unknown>;
    }>>`
      SELECT
        wi.definition_id,
        wd.completion_actions
      FROM app.workflow_instances wi
      JOIN app.workflow_definitions wd ON wd.id = wi.definition_id
      WHERE wi.id = ${instanceId}::uuid
    `;

    if (instances.length > 0 && instances[0]!.completionActions) {
      console.log(`[Handler] Executing completion actions for workflow ${instanceId}`);
      // Completion actions would be executed here based on the definition
    }

    // Get initiator's user ID and notify
    const initiators = await this.sql<Array<{ userId: string }>>`
      SELECT user_id FROM app.employees WHERE id = ${initiatorId}::uuid
    `;

    if (initiators.length > 0 && initiators[0]!.userId) {
      await this.queueInAppNotification(
        event.tenantId,
        initiators[0]!.userId,
        "Workflow Completed",
        "Your workflow request has been completed.",
        "workflow_completed",
        `/workflows/instances/${instanceId}`,
        "View Details",
        { instanceId }
      );
    }
  }

  private async handleWorkflowStepProcessed(event: OutboxEvent) {
    const stepId = event.payload["stepId"] as string;
    const instanceId = event.payload["instanceId"] as string;
    console.log(`[Handler] Workflow step processed: ${stepId}`);

    // Get next pending task and notify assignee
    const nextTasks = await this.sql<Array<{
      taskId: string;
      assigneeUserId: string;
      taskName: string;
    }>>`
      SELECT
        wt.id as task_id,
        e.user_id as assignee_user_id,
        wt.name as task_name
      FROM app.workflow_tasks wt
      LEFT JOIN app.employees e ON e.id = wt.assignee_id
      WHERE wt.instance_id = ${instanceId}::uuid
        AND wt.status = 'pending'
      ORDER BY wt.sequence
      LIMIT 1
    `;

    if (nextTasks.length > 0 && nextTasks[0]!.assigneeUserId) {
      const task = nextTasks[0]!;
      await this.queueInAppNotification(
        event.tenantId,
        task.assigneeUserId,
        "Task Ready for Action",
        `Task "${task.taskName}" is now ready for your action.`,
        "workflow_task",
        `/tasks/${task.taskId}`,
        "View Task",
        { taskId: task.taskId, instanceId }
      );
    } else {
      // No more pending tasks - workflow may be completing
      console.log(`[Handler] No more pending tasks for workflow ${instanceId}`);
    }
  }

  private adjustPollingInterval(eventsFound: boolean) {
    if (eventsFound) {
      // Reset to base interval when events are found
      this.consecutiveEmptyPolls = 0;
      if (this.currentPollIntervalMs !== BASE_POLL_INTERVAL_MS) {
        this.currentPollIntervalMs = BASE_POLL_INTERVAL_MS;
        console.log(`[OutboxProcessor] Events found, polling interval reset to ${BASE_POLL_INTERVAL_MS}ms`);
      }
    } else {
      this.consecutiveEmptyPolls++;

      if (this.consecutiveEmptyPolls >= EMPTY_POLLS_BEFORE_BACKOFF) {
        // Increase interval: 5s -> 10s -> 15s -> 20s -> 25s -> 30s (capped)
        const newInterval = Math.min(
          BASE_POLL_INTERVAL_MS + (this.consecutiveEmptyPolls - EMPTY_POLLS_BEFORE_BACKOFF + 1) * BASE_POLL_INTERVAL_MS,
          MAX_POLL_INTERVAL_MS
        );

        if (newInterval !== this.currentPollIntervalMs) {
          this.currentPollIntervalMs = newInterval;
          console.log(`[OutboxProcessor] No events for ${this.consecutiveEmptyPolls} polls, interval increased to ${this.currentPollIntervalMs}ms`);
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Main entry point
const processor = new OutboxProcessor();

// Graceful shutdown
process.on("SIGINT", async () => {
  await processor.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await processor.stop();
  process.exit(0);
});

// Start processing
processor.start().catch((error) => {
  console.error("[OutboxProcessor] Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

export { OutboxProcessor };
