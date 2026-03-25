#!/usr/bin/env python3
"""
Apply TODO-156 changes: Auto-escalation on workflow timeout.
Writes to schemas, repository, service, routes, and domain event handlers.
"""

import os
import sys

base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def apply_schemas():
    path = os.path.join(base, 'packages/api/src/modules/workflows/schemas.ts')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'EscalationHistoryQuerySchema' in content:
        print("  schemas: already has escalation schemas")
        return

    content += '''
// =============================================================================
// Escalation Schemas (TODO-156: Auto-escalation on workflow timeout)
// =============================================================================

/** Query parameters for listing escalation history */
export const EscalationHistoryQuerySchema = t.Object({
  entityType: t.Optional(t.Union([t.Literal("workflow_task"), t.Literal("case")])),
  entityId: t.Optional(UuidSchema),
  slaId: t.Optional(UuidSchema),
  fromDate: t.Optional(t.String({ description: "ISO 8601 datetime filter start" })),
  toDate: t.Optional(t.String({ description: "ISO 8601 datetime filter end" })),
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type EscalationHistoryQuery = Static<typeof EscalationHistoryQuerySchema>;

/** Shape of a single escalation log entry in the API response */
export const EscalationLogEntrySchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  entityType: t.String(),
  entityId: UuidSchema,
  actionTaken: t.String(),
  previousAssigneeId: t.Nullable(UuidSchema),
  previousAssigneeName: t.Nullable(t.String()),
  newAssigneeId: t.Nullable(UuidSchema),
  newAssigneeName: t.Nullable(t.String()),
  previousLevel: t.Nullable(t.String()),
  newLevel: t.Nullable(t.String()),
  escalationLevel: t.Nullable(t.Number()),
  reason: t.String(),
  slaId: t.Nullable(UuidSchema),
  slaEventId: t.Nullable(UuidSchema),
  escalationRuleId: t.Nullable(UuidSchema),
  createdAt: t.String(),
});
export type EscalationLogEntry = Static<typeof EscalationLogEntrySchema>;

/** Response shape for the escalation history endpoint */
export const EscalationHistoryResponseSchema = t.Object({
  data: t.Array(EscalationLogEntrySchema),
  cursor: t.Nullable(t.String()),
  hasMore: t.Boolean(),
});
export type EscalationHistoryResponse = Static<typeof EscalationHistoryResponseSchema>;
'''

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("  schemas: updated")


def apply_repository():
    path = os.path.join(base, 'packages/api/src/modules/workflows/repository.ts')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'EscalationLogRow' in content:
        print("  repository: already has escalation code")
        return

    iface = '''export interface EscalationLogRow {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  actionTaken: string;
  previousAssigneeId: string | null;
  previousAssigneeName: string | null;
  newAssigneeId: string | null;
  newAssigneeName: string | null;
  previousLevel: string | null;
  newLevel: string | null;
  escalationLevelNum: number | null;
  reason: string;
  slaId: string | null;
  slaEventId: string | null;
  escalationRuleId: string | null;
  createdAt: Date;
}

export class WorkflowRepository {'''
    content = content.replace('export class WorkflowRepository {', iface, 1)

    method = '''  // ===========================================================================
  // Escalation History (TODO-156)
  // ===========================================================================

  async getEscalationHistory(ctx: TenantContext, filters: {
    entityType?: string;
    entityId?: string;
    slaId?: string;
    fromDate?: string;
    toDate?: string;
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedResult<EscalationLogRow>> {
    const limit = filters.limit || 20;
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<EscalationLogRow[]>`
        SELECT
          sel.id,
          sel.tenant_id,
          sel.entity_type,
          sel.entity_id,
          sel.action_taken,
          sel.previous_assignee_id,
          u_prev.name AS previous_assignee_name,
          sel.new_assignee_id,
          u_new.name AS new_assignee_name,
          sel.previous_level,
          sel.new_level,
          sel.escalation_level_num,
          sel.reason,
          sel.sla_id,
          sel.sla_event_id,
          sel.escalation_rule_id,
          sel.created_at
        FROM sla_escalation_log sel
        LEFT JOIN users u_prev ON u_prev.id = sel.previous_assignee_id
        LEFT JOIN users u_new ON u_new.id = sel.new_assignee_id
        WHERE sel.tenant_id = ${ctx.tenantId}::uuid
        ${filters.entityType ? tx`AND sel.entity_type = ${filters.entityType}` : tx``}
        ${filters.entityId ? tx`AND sel.entity_id = ${filters.entityId}::uuid` : tx``}
        ${filters.slaId ? tx`AND sel.sla_id = ${filters.slaId}::uuid` : tx``}
        ${filters.fromDate ? tx`AND sel.created_at >= ${filters.fromDate}::timestamptz` : tx``}
        ${filters.toDate ? tx`AND sel.created_at <= ${filters.toDate}::timestamptz` : tx``}
        ${filters.cursor ? tx`AND sel.id < ${filters.cursor}::uuid` : tx``}
        ORDER BY sel.created_at DESC, sel.id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor = hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data: data as EscalationLogRow[], cursor, hasMore };
  }

  // ===========================================================================
  // Outbox Helper
  // ==========================================================================='''
    old_outbox = '  // ===========================================================================\n  // Outbox Helper\n  // ==========================================================================='
    content = content.replace(old_outbox, method, 1)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("  repository: updated")


def apply_service():
    path = os.path.join(base, 'packages/api/src/modules/workflows/service.ts')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'getEscalationHistory' in content:
        print("  service: already has escalation code")
        return

    content = content.replace(
        'import { WorkflowRepository, type TenantContext, type WorkflowDefinitionRow, type WorkflowInstanceRow, type StepInstanceRow } from "./repository";',
        'import { WorkflowRepository, type TenantContext, type WorkflowDefinitionRow, type WorkflowInstanceRow, type StepInstanceRow, type EscalationLogRow } from "./repository";'
    )
    content = content.replace(
        'import type { CreateWorkflowDefinition, UpdateWorkflowDefinition, CreateWorkflowInstance, ProcessStepAction, ReassignStep, WorkflowInstanceFilters } from "./schemas";',
        'import type { CreateWorkflowDefinition, UpdateWorkflowDefinition, CreateWorkflowInstance, ProcessStepAction, ReassignStep, WorkflowInstanceFilters, EscalationHistoryQuery } from "./schemas";'
    )

    method = '''  // Escalation History (TODO-156)
  async getEscalationHistory(ctx: TenantContext, filters: EscalationHistoryQuery) {
    const result = await this.repository.getEscalationHistory(ctx, {
      entityType: filters.entityType,
      entityId: filters.entityId,
      slaId: filters.slaId,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      cursor: filters.cursor,
      limit: filters.limit,
    });

    return {
      data: result.data.map((e: EscalationLogRow) => this.formatEscalationLog(e)),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  }

  // Formatters
  private formatDefinition'''
    content = content.replace('  // Formatters\n  private formatDefinition', method, 1)

    formatter = '''
  private formatEscalationLog(row: EscalationLogRow) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      entityType: row.entityType,
      entityId: row.entityId,
      actionTaken: row.actionTaken,
      previousAssigneeId: row.previousAssigneeId,
      previousAssigneeName: row.previousAssigneeName || null,
      newAssigneeId: row.newAssigneeId,
      newAssigneeName: row.newAssigneeName || null,
      previousLevel: row.previousLevel || null,
      newLevel: row.newLevel || null,
      escalationLevel: row.escalationLevelNum ?? null,
      reason: row.reason,
      slaId: row.slaId,
      slaEventId: row.slaEventId || null,
      escalationRuleId: row.escalationRuleId || null,
      createdAt: row.createdAt?.toISOString?.() || row.createdAt,
    };
  }
}
'''
    last_brace = content.rfind('}')
    content = content[:last_brace] + formatter

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("  service: updated")


def apply_routes():
    path = os.path.join(base, 'packages/api/src/modules/workflows/routes.ts')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    if '"/escalations"' in content:
        print("  routes: already has escalation endpoint")
        return

    route = '''  // Escalation History (TODO-156)
  .get("/escalations", async (ctx) => {
    const { tenant, user, workflowService, query, set } = ctx as any;

    try {
      const result = await workflowService.getEscalationHistory(
        { tenantId: tenant.id, userId: user.id },
        {
          entityType: query.entityType,
          entityId: query.entityId,
          slaId: query.slaId,
          fromDate: query.fromDate,
          toDate: query.toDate,
          cursor: query.cursor,
          limit: query.limit !== undefined && query.limit !== null ? Number(query.limit) : undefined,
        }
      );
      return result;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    query: schemas.EscalationHistoryQuerySchema,
    beforeHandle: [requirePermission("workflows", "read")],
    detail: {
      tags: ["Workflows"],
      summary: "List SLA escalation history",
      description: "Returns paginated escalation history for workflow tasks and cases.",
    }
  })

  // My Approvals
  .get("/my-approvals"'''
    content = content.replace('  // My Approvals\n  .get("/my-approvals"', route, 1)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("  routes: updated")


def apply_event_handlers():
    path = os.path.join(base, 'packages/api/src/jobs/domain-event-handlers.ts')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'handleWorkflowSlaBreached' in content:
        print("  event-handlers: already has SLA breach handler")
        return

    handler = '''// =============================================================================
// Workflow SLA Breach Event Handlers (TODO-156)
// =============================================================================

/**
 * Handle workflow SLA breach events emitted by the auto-escalation scheduler.
 * Sends email notifications to affected users.
 */
async function handleWorkflowSlaBreached(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  const {
    taskId, instanceId, slaId, action,
    previousAssignee, newAssignee, reason, escalationLevel,
  } = event.payload as {
    taskId: string; instanceId: string; slaId: string;
    ruleId?: string; escalationLevel?: number;
    action: string; previousAssignee: string | null;
    newAssignee: string | null; reason: string; eventType?: string;
  };

  ctx.log.info("Processing workflow SLA breach event", {
    taskId, instanceId, slaId, action, escalationLevel,
  });

  const taskDetails = await ctx.db.withSystemContext(async (tx) => {
    return await tx<Array<{
      stepName: string; assigneeEmail: string | null;
      assigneeFirstName: string | null;
      previousAssigneeEmail: string | null;
      previousAssigneeFirstName: string | null;
      definitionName: string | null;
    }>>`
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

  if (action === "reassign" && newAssignee && details.assigneeEmail) {
    await ctx.redis.xadd(StreamKeys.NOTIFICATIONS, "*", "payload", JSON.stringify({
      id: crypto.randomUUID(), type: "notification.email",
      tenantId: event.tenantId,
      data: {
        to: details.assigneeEmail,
        subject: "SLA Breach" + levelLabel + ": Task Escalated to You - " + workflowLabel,
        template: "notification",
        templateData: {
          title: "SLA Breach" + levelLabel + ": Task Escalated to You",
          message: "Hi " + (details.assigneeFirstName || "Team Member") + ", the task \\"" + (details.stepName || "Workflow task") + "\\" in \\"" + workflowLabel + "\\" has been escalated to you after an SLA breach. Reason: " + reason + ".",
          actionUrl: (process.env["APP_URL"] || "http://localhost:3000") + "/admin/workflows/instances/" + instanceId,
          actionText: "View Workflow",
        },
      },
    }), "attempt", "1");
  }

  if (previousAssignee && details.previousAssigneeEmail) {
    const subject = action === "reassign" ? "SLA Breach" + levelLabel + ": Task Reassigned - " + workflowLabel
      : action === "auto_approve" ? "SLA Breach" + levelLabel + ": Task Auto-Approved - " + workflowLabel
      : action === "auto_reject" ? "SLA Breach" + levelLabel + ": Task Auto-Rejected - " + workflowLabel
      : "SLA Breach" + levelLabel + ": Action Required - " + workflowLabel;

    await ctx.redis.xadd(StreamKeys.NOTIFICATIONS, "*", "payload", JSON.stringify({
      id: crypto.randomUUID(), type: "notification.email",
      tenantId: event.tenantId,
      data: {
        to: details.previousAssigneeEmail, subject, template: "notification",
        templateData: {
          title: "SLA Breach Notification" + levelLabel,
          message: "Hi " + (details.previousAssigneeFirstName || "Team Member") + ", the task \\"" + (details.stepName || "Workflow task") + "\\" in \\"" + workflowLabel + "\\" has breached its SLA deadline. " + reason,
          actionUrl: (process.env["APP_URL"] || "http://localhost:3000") + "/admin/workflows/instances/" + instanceId,
          actionText: "View Workflow",
        },
      },
    }), "attempt", "1");
  }
}

// =============================================================================
// GDPR Event Handlers
// ============================================================================='''

    content = content.replace(
        '// =============================================================================\n// GDPR Event Handlers\n// =============================================================================',
        handler, 1
    )

    content = content.replace(
        '  registerHandler("workflow.task.completed", handleWorkflowTaskCompleted);\n\n  // GDPR Events',
        '  registerHandler("workflow.task.completed", handleWorkflowTaskCompleted);\n\n  // Workflow SLA Breach Events (TODO-156)\n  registerHandler("workflow.sla.breached", handleWorkflowSlaBreached);\n  registerHandler("workflow.task.sla.breached", handleWorkflowSlaBreached);\n\n  // GDPR Events',
        1
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("  event-handlers: updated")


if __name__ == '__main__':
    print("Applying TODO-156 changes...")
    apply_schemas()
    apply_repository()
    apply_service()
    apply_routes()
    apply_event_handlers()
    print("Done!")
