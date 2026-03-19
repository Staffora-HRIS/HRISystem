/**
 * Mandatory Training - Repository Layer
 *
 * Database operations for mandatory training rules and assignments.
 * All queries respect RLS via tenant context.
 */

import type { TenantContext } from "../../types/service-result";
import type {
  CreateMandatoryTrainingRule,
  UpdateMandatoryTrainingRule,
  MandatoryTrainingRuleResponse,
  MandatoryTrainingAssignmentResponse,
} from "./mandatory-training.schemas";

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class MandatoryTrainingRepository {
  constructor(private db: any) {}

  // ===========================================================================
  // Rule Operations
  // ===========================================================================

  async listRules(
    ctx: TenantContext,
    filters: {
      courseId?: string;
      appliesTo?: string;
      isActive?: boolean;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<MandatoryTrainingRuleResponse>> {
    const limit = pagination.limit ?? 20;

    const rules = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            r.*,
            c.name AS course_name,
            ou.name AS department_name
          FROM app.mandatory_training_rules r
          JOIN app.courses c ON c.id = r.course_id AND c.tenant_id = r.tenant_id
          LEFT JOIN app.org_units ou ON ou.id = r.department_id AND ou.tenant_id = r.tenant_id
          WHERE r.tenant_id = ${ctx.tenantId}::uuid
          ${filters.courseId ? tx`AND r.course_id = ${filters.courseId}::uuid` : tx``}
          ${filters.appliesTo ? tx`AND r.applies_to = ${filters.appliesTo}` : tx``}
          ${filters.isActive !== undefined ? tx`AND r.is_active = ${filters.isActive}` : tx``}
          ${pagination.cursor ? tx`AND r.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY r.created_at DESC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = rules.length > limit;
    const items = hasMore ? rules.slice(0, limit) : rules;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapRuleRow),
      nextCursor,
      hasMore,
    };
  }

  async getRuleById(
    ctx: TenantContext,
    id: string
  ): Promise<MandatoryTrainingRuleResponse | null> {
    const [rule] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            r.*,
            c.name AS course_name,
            ou.name AS department_name
          FROM app.mandatory_training_rules r
          JOIN app.courses c ON c.id = r.course_id AND c.tenant_id = r.tenant_id
          LEFT JOIN app.org_units ou ON ou.id = r.department_id AND ou.tenant_id = r.tenant_id
          WHERE r.id = ${id}::uuid AND r.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return rule ? this.mapRuleRow(rule) : null;
  }

  async createRule(
    ctx: TenantContext,
    data: CreateMandatoryTrainingRule,
    txOverride?: any
  ): Promise<MandatoryTrainingRuleResponse> {
    const exec = async (tx: any) => {
      const [rule] = await tx`
        INSERT INTO app.mandatory_training_rules (
          id, tenant_id, course_id, applies_to, department_id, role,
          deadline_days, recurrence_months, escalation_days, is_active, name, created_by
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.courseId}::uuid,
          ${data.appliesTo}, ${data.departmentId || null}::uuid,
          ${data.role || null}, ${data.deadlineDays},
          ${data.recurrenceMonths ?? null}, ${data.escalationDays},
          ${data.isActive ?? true}, ${data.name || null},
          ${ctx.userId}::uuid
        )
        RETURNING *
      `;

      // Fetch with joins to get course/department names
      const [enriched] = await tx`
        SELECT
          r.*,
          c.name AS course_name,
          ou.name AS department_name
        FROM app.mandatory_training_rules r
        JOIN app.courses c ON c.id = r.course_id AND c.tenant_id = r.tenant_id
        LEFT JOIN app.org_units ou ON ou.id = r.department_id AND ou.tenant_id = r.tenant_id
        WHERE r.id = ${rule.id}::uuid
      `;

      return enriched;
    };

    const result = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return this.mapRuleRow(result);
  }

  async updateRule(
    ctx: TenantContext,
    id: string,
    data: UpdateMandatoryTrainingRule,
    txOverride?: any
  ): Promise<MandatoryTrainingRuleResponse | null> {
    const exec = async (tx: any) => {
      const [rule] = await tx`
        UPDATE app.mandatory_training_rules SET
          deadline_days = COALESCE(${data.deadlineDays}, deadline_days),
          recurrence_months = CASE
            WHEN ${data.recurrenceMonths !== undefined} THEN ${data.recurrenceMonths ?? null}::integer
            ELSE recurrence_months
          END,
          escalation_days = COALESCE(${data.escalationDays}, escalation_days),
          is_active = COALESCE(${data.isActive}, is_active),
          name = COALESCE(${data.name}, name),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;

      if (!rule) return null;

      // Fetch with joins
      const [enriched] = await tx`
        SELECT
          r.*,
          c.name AS course_name,
          ou.name AS department_name
        FROM app.mandatory_training_rules r
        JOIN app.courses c ON c.id = r.course_id AND c.tenant_id = r.tenant_id
        LEFT JOIN app.org_units ou ON ou.id = r.department_id AND ou.tenant_id = r.tenant_id
        WHERE r.id = ${rule.id}::uuid
      `;

      return enriched;
    };

    const result = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return result ? this.mapRuleRow(result) : null;
  }

  async deleteRule(
    ctx: TenantContext,
    id: string,
    txOverride?: any
  ): Promise<boolean> {
    const exec = async (tx: any) => {
      return tx`
        DELETE FROM app.mandatory_training_rules
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING id
      `;
    };

    const result = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return result.length > 0;
  }

  // ===========================================================================
  // Assignment Operations
  // ===========================================================================

  async listAssignments(
    ctx: TenantContext,
    filters: {
      ruleId?: string;
      employeeId?: string;
      courseId?: string;
      status?: string;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<MandatoryTrainingAssignmentResponse>> {
    const limit = pagination.limit ?? 20;

    const assignments = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            a.*,
            c.name AS course_name,
            CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name
          FROM app.mandatory_training_assignments a
          JOIN app.courses c ON c.id = a.course_id AND c.tenant_id = a.tenant_id
          JOIN app.employees e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id
          LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = a.tenant_id
          WHERE a.tenant_id = ${ctx.tenantId}::uuid
          ${filters.ruleId ? tx`AND a.rule_id = ${filters.ruleId}::uuid` : tx``}
          ${filters.employeeId ? tx`AND a.employee_id = ${filters.employeeId}::uuid` : tx``}
          ${filters.courseId ? tx`AND a.course_id = ${filters.courseId}::uuid` : tx``}
          ${filters.status ? tx`AND a.status = ${filters.status}` : tx``}
          ${pagination.cursor ? tx`AND a.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY a.deadline_at ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = assignments.length > limit;
    const items = hasMore ? assignments.slice(0, limit) : assignments;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapAssignmentRow),
      nextCursor,
      hasMore,
    };
  }

  async getAssignmentById(
    ctx: TenantContext,
    id: string
  ): Promise<MandatoryTrainingAssignmentResponse | null> {
    const [assignment] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            a.*,
            c.name AS course_name,
            CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name
          FROM app.mandatory_training_assignments a
          JOIN app.courses c ON c.id = a.course_id AND c.tenant_id = a.tenant_id
          JOIN app.employees e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id
          LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = a.tenant_id
          WHERE a.id = ${id}::uuid AND a.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return assignment ? this.mapAssignmentRow(assignment) : null;
  }

  /**
   * Find matching employees for a rule based on its scope (all/department/role).
   */
  async findMatchingEmployees(
    ctx: TenantContext,
    rule: { appliesTo: string; departmentId?: string | null; role?: string | null },
    txOverride?: any
  ): Promise<Array<{ id: string; userId: string | null }>> {
    const exec = async (tx: any) => {
      if (rule.appliesTo === "all") {
        return tx`
          SELECT e.id, e.user_id
          FROM app.employees e
          WHERE e.tenant_id = ${ctx.tenantId}::uuid
            AND e.status IN ('active', 'on_leave')
        `;
      }

      if (rule.appliesTo === "department" && rule.departmentId) {
        return tx`
          SELECT DISTINCT e.id, e.user_id
          FROM app.employees e
          JOIN app.position_assignments pa ON pa.employee_id = e.id
            AND pa.tenant_id = e.tenant_id
            AND pa.effective_to IS NULL
          WHERE e.tenant_id = ${ctx.tenantId}::uuid
            AND e.status IN ('active', 'on_leave')
            AND pa.org_unit_id = ${rule.departmentId}::uuid
        `;
      }

      if (rule.appliesTo === "role" && rule.role) {
        return tx`
          SELECT DISTINCT e.id, e.user_id
          FROM app.employees e
          JOIN app.position_assignments pa ON pa.employee_id = e.id
            AND pa.tenant_id = e.tenant_id
            AND pa.effective_to IS NULL
          JOIN app.positions p ON p.id = pa.position_id
            AND p.tenant_id = e.tenant_id
          WHERE e.tenant_id = ${ctx.tenantId}::uuid
            AND e.status IN ('active', 'on_leave')
            AND p.title ILIKE ${rule.role}
        `;
      }

      return [];
    };

    return txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );
  }

  /**
   * Check if an employee already has an active (non-completed) assignment for a rule.
   */
  async hasActiveAssignment(
    ctx: TenantContext,
    ruleId: string,
    employeeId: string,
    txOverride?: any
  ): Promise<boolean> {
    const exec = async (tx: any) => {
      const [result] = await tx`
        SELECT COUNT(*)::integer AS count
        FROM app.mandatory_training_assignments
        WHERE tenant_id = ${ctx.tenantId}::uuid
          AND rule_id = ${ruleId}::uuid
          AND employee_id = ${employeeId}::uuid
          AND status IN ('assigned', 'in_progress')
      `;
      return result;
    };

    const result = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return (result?.count || 0) > 0;
  }

  /**
   * Create a mandatory training assignment.
   */
  async createAssignment(
    ctx: TenantContext,
    data: {
      ruleId: string;
      employeeId: string;
      courseId: string;
      deadlineAt: Date;
    },
    txOverride?: any
  ): Promise<MandatoryTrainingAssignmentResponse> {
    const exec = async (tx: any) => {
      const [assignment] = await tx`
        INSERT INTO app.mandatory_training_assignments (
          id, tenant_id, rule_id, employee_id, course_id,
          assigned_at, deadline_at, status
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.ruleId}::uuid,
          ${data.employeeId}::uuid, ${data.courseId}::uuid,
          now(), ${data.deadlineAt.toISOString()}::timestamptz, 'assigned'
        )
        RETURNING *
      `;

      // Fetch with joins
      const [enriched] = await tx`
        SELECT
          a.*,
          c.name AS course_name,
          CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name
        FROM app.mandatory_training_assignments a
        JOIN app.courses c ON c.id = a.course_id AND c.tenant_id = a.tenant_id
        JOIN app.employees e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = a.tenant_id
        WHERE a.id = ${assignment.id}::uuid
      `;

      return enriched;
    };

    const result = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return this.mapAssignmentRow(result);
  }

  /**
   * Mark an assignment as completed.
   */
  async completeAssignment(
    ctx: TenantContext,
    id: string,
    txOverride?: any
  ): Promise<MandatoryTrainingAssignmentResponse | null> {
    const exec = async (tx: any) => {
      const [assignment] = await tx`
        UPDATE app.mandatory_training_assignments SET
          status = 'completed',
          completed_at = now(),
          updated_at = now()
        WHERE id = ${id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND status IN ('assigned', 'in_progress', 'overdue')
        RETURNING *
      `;

      if (!assignment) return null;

      const [enriched] = await tx`
        SELECT
          a.*,
          c.name AS course_name,
          CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name
        FROM app.mandatory_training_assignments a
        JOIN app.courses c ON c.id = a.course_id AND c.tenant_id = a.tenant_id
        JOIN app.employees e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = a.tenant_id
        WHERE a.id = ${assignment.id}::uuid
      `;

      return enriched;
    };

    const result = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return result ? this.mapAssignmentRow(result) : null;
  }

  // ===========================================================================
  // Scheduler Operations (System Context)
  // ===========================================================================

  /**
   * Find assignments that are past deadline and not yet marked overdue.
   */
  async findOverdueAssignments(limit: number = 500): Promise<any[]> {
    return this.db.sql`
      SELECT
        a.id,
        a.tenant_id,
        a.rule_id,
        a.employee_id,
        a.course_id,
        a.deadline_at,
        a.status,
        r.escalation_days,
        c.name AS course_name,
        e.user_id,
        ep.first_name,
        ep.last_name,
        u.email
      FROM app.mandatory_training_assignments a
      JOIN app.mandatory_training_rules r ON r.id = a.rule_id AND r.tenant_id = a.tenant_id
      JOIN app.courses c ON c.id = a.course_id AND c.tenant_id = a.tenant_id
      JOIN app.employees e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id
      LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = a.tenant_id
      LEFT JOIN app.users u ON u.id = e.user_id
      WHERE a.deadline_at < now()
        AND a.status IN ('assigned', 'in_progress')
        AND e.status = 'active'
      ORDER BY a.deadline_at ASC
      LIMIT ${limit}
    `;
  }

  /**
   * Mark assignments as overdue in bulk.
   */
  async markOverdue(assignmentIds: string[]): Promise<number> {
    if (assignmentIds.length === 0) return 0;

    const result = await this.db.sql`
      UPDATE app.mandatory_training_assignments
      SET status = 'overdue', updated_at = now()
      WHERE id = ANY(${assignmentIds}::uuid[])
        AND status IN ('assigned', 'in_progress')
      RETURNING id
    `;

    return result.length;
  }

  /**
   * Find assignments approaching deadline where reminder has not been sent.
   */
  async findPendingReminders(limit: number = 500): Promise<any[]> {
    return this.db.sql`
      SELECT
        a.id,
        a.tenant_id,
        a.employee_id,
        a.course_id,
        a.deadline_at,
        r.escalation_days,
        c.name AS course_name,
        e.user_id,
        ep.first_name,
        ep.last_name,
        u.email
      FROM app.mandatory_training_assignments a
      JOIN app.mandatory_training_rules r ON r.id = a.rule_id AND r.tenant_id = a.tenant_id
      JOIN app.courses c ON c.id = a.course_id AND c.tenant_id = a.tenant_id
      JOIN app.employees e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id
      LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = a.tenant_id
      LEFT JOIN app.users u ON u.id = e.user_id
      WHERE a.status IN ('assigned', 'in_progress')
        AND a.reminder_sent = false
        AND a.deadline_at <= now() + (r.escalation_days || ' days')::interval
        AND a.deadline_at > now()
        AND e.status = 'active'
      ORDER BY a.deadline_at ASC
      LIMIT ${limit}
    `;
  }

  /**
   * Mark reminders as sent.
   */
  async markReminderSent(assignmentIds: string[]): Promise<void> {
    if (assignmentIds.length === 0) return;

    await this.db.sql`
      UPDATE app.mandatory_training_assignments
      SET reminder_sent = true, reminder_sent_at = now(), updated_at = now()
      WHERE id = ANY(${assignmentIds}::uuid[])
    `;
  }

  /**
   * Find overdue assignments where manager has not been escalated.
   */
  async findPendingEscalations(limit: number = 500): Promise<any[]> {
    return this.db.sql`
      SELECT
        a.id,
        a.tenant_id,
        a.employee_id,
        a.course_id,
        a.deadline_at,
        c.name AS course_name,
        e.user_id AS employee_user_id,
        ep.first_name AS employee_first_name,
        ep.last_name AS employee_last_name,
        ms.manager_id,
        mgr.user_id AS manager_user_id,
        mgr_p.first_name AS manager_first_name,
        mgr_p.last_name AS manager_last_name,
        mgr_u.email AS manager_email
      FROM app.mandatory_training_assignments a
      JOIN app.courses c ON c.id = a.course_id AND c.tenant_id = a.tenant_id
      JOIN app.employees e ON e.id = a.employee_id AND e.tenant_id = a.tenant_id
      LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.tenant_id = a.tenant_id
      LEFT JOIN app.manager_subordinates ms
        ON ms.subordinate_id = a.employee_id
        AND ms.tenant_id = a.tenant_id
        AND ms.depth = 1
      LEFT JOIN app.employees mgr ON mgr.id = ms.manager_id AND mgr.tenant_id = a.tenant_id
      LEFT JOIN app.employee_personal mgr_p ON mgr_p.employee_id = mgr.id AND mgr_p.tenant_id = a.tenant_id
      LEFT JOIN app.users mgr_u ON mgr_u.id = mgr.user_id
      WHERE a.status = 'overdue'
        AND a.escalation_sent = false
        AND e.status = 'active'
      ORDER BY a.deadline_at ASC
      LIMIT ${limit}
    `;
  }

  /**
   * Mark escalations as sent.
   */
  async markEscalationSent(assignmentIds: string[]): Promise<void> {
    if (assignmentIds.length === 0) return;

    await this.db.sql`
      UPDATE app.mandatory_training_assignments
      SET escalation_sent = true, escalation_sent_at = now(), updated_at = now()
      WHERE id = ANY(${assignmentIds}::uuid[])
    `;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private mapRuleRow(row: any): MandatoryTrainingRuleResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      courseId: row.courseId,
      courseName: row.courseName || null,
      appliesTo: row.appliesTo,
      departmentId: row.departmentId || null,
      departmentName: row.departmentName || null,
      role: row.role || null,
      deadlineDays: Number(row.deadlineDays),
      recurrenceMonths: row.recurrenceMonths ? Number(row.recurrenceMonths) : null,
      escalationDays: Number(row.escalationDays),
      isActive: row.isActive,
      name: row.name || null,
      createdAt: row.createdAt?.toISOString?.() || row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt,
      createdBy: row.createdBy || null,
    };
  }

  private mapAssignmentRow(row: any): MandatoryTrainingAssignmentResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      ruleId: row.ruleId,
      employeeId: row.employeeId,
      employeeName: row.employeeName || null,
      courseId: row.courseId,
      courseName: row.courseName || null,
      assignedAt: row.assignedAt?.toISOString?.() || row.assignedAt,
      deadlineAt: row.deadlineAt?.toISOString?.() || row.deadlineAt,
      completedAt: row.completedAt?.toISOString?.() || row.completedAt || null,
      status: row.status,
      reminderSent: row.reminderSent ?? false,
      reminderSentAt: row.reminderSentAt?.toISOString?.() || row.reminderSentAt || null,
      escalationSent: row.escalationSent ?? false,
      escalationSentAt: row.escalationSentAt?.toISOString?.() || row.escalationSentAt || null,
      createdAt: row.createdAt?.toISOString?.() || row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt,
    };
  }
}
