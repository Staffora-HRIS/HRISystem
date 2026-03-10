/**
 * Cases Module - Repository Layer
 *
 * Database operations for HR Case Management.
 * All queries respect RLS via tenant context.
 */

import type {
  CreateCase,
  UpdateCase,
  CaseResponse,
  CreateComment,
  CommentResponse,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class CasesRepository {
  constructor(private db: any) {}

  // ===========================================================================
  // Case Operations
  // ===========================================================================

  async listCases(
    ctx: TenantContext,
    filters: {
      category?: string;
      status?: string;
      priority?: string;
      assigneeId?: string;
      requesterId?: string;
      isOverdue?: boolean;
      search?: string;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<CaseResponse>> {
    const limit = pagination.limit ?? 20;

    const cases = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            c.*,
            e.first_name || ' ' || e.last_name as requester_name,
            a.first_name || ' ' || a.last_name as assignee_name
          FROM app.cases c
          LEFT JOIN app.employees e ON e.id = c.requester_id
          LEFT JOIN app.users a ON a.id = c.assigned_to
          WHERE c.tenant_id = ${ctx.tenantId}::uuid
          ${filters.category ? tx`AND c.category_id = ${filters.category}::uuid` : tx``}
          ${filters.status ? tx`AND c.status = ${filters.status}` : tx``}
          ${filters.priority ? tx`AND c.priority = ${filters.priority}` : tx``}
          ${filters.assigneeId ? tx`AND c.assigned_to = ${filters.assigneeId}::uuid` : tx``}
          ${filters.requesterId ? tx`AND c.requester_id = ${filters.requesterId}::uuid` : tx``}
          ${filters.isOverdue ? tx`AND c.sla_resolution_due_at < now() AND c.sla_status IN ('warning', 'breached') AND c.status NOT IN ('resolved', 'closed', 'cancelled')` : tx``}
          ${filters.search ? tx`AND (c.subject ILIKE ${'%' + filters.search + '%'} OR c.case_number ILIKE ${'%' + filters.search + '%'})` : tx``}
          ${pagination.cursor ? tx`AND c.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY
            CASE c.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
            c.created_at DESC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = cases.length > limit;
    const items = hasMore ? cases.slice(0, limit) : cases;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapCaseRow),
      nextCursor,
      hasMore,
    };
  }

  async getCaseById(ctx: TenantContext, id: string): Promise<CaseResponse | null> {
    const [hrCase] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            c.*,
            e.first_name || ' ' || e.last_name as requester_name,
            a.first_name || ' ' || a.last_name as assignee_name
          FROM app.cases c
          LEFT JOIN app.employees e ON e.id = c.requester_id
          LEFT JOIN app.users a ON a.id = c.assigned_to
          WHERE c.id = ${id}::uuid AND c.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return hrCase ? this.mapCaseRow(hrCase) : null;
  }

  async getCaseByNumber(
    ctx: TenantContext,
    caseNumber: string
  ): Promise<CaseResponse | null> {
    const [hrCase] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            c.*,
            e.first_name || ' ' || e.last_name as requester_name,
            a.first_name || ' ' || a.last_name as assignee_name
          FROM app.cases c
          LEFT JOIN app.employees e ON e.id = c.requester_id
          LEFT JOIN app.users a ON a.id = c.assigned_to
          WHERE c.case_number = ${caseNumber} AND c.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return hrCase ? this.mapCaseRow(hrCase) : null;
  }

  async getEmployeeCases(ctx: TenantContext, employeeId: string): Promise<CaseResponse[]> {
    const cases = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            c.*,
            a.first_name || ' ' || a.last_name as assignee_name
          FROM app.cases c
          LEFT JOIN app.users a ON a.id = c.assigned_to
          WHERE c.requester_id = ${employeeId}::uuid AND c.tenant_id = ${ctx.tenantId}::uuid
          ORDER BY c.created_at DESC
        `;
      }
    );

    return cases.map(this.mapCaseRow);
  }

  async createCase(ctx: TenantContext, data: CreateCase): Promise<CaseResponse> {
    const caseNumber = `CASE-${Date.now().toString(36).toUpperCase()}`;

    const [hrCase] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          INSERT INTO app.cases (
            id, tenant_id, case_number, requester_id, category_id, subject,
            description, priority, assigned_to, tags
          ) VALUES (
            gen_random_uuid(), ${ctx.tenantId}::uuid, ${caseNumber},
            ${data.requesterId}::uuid, ${data.category}::uuid, ${data.subject},
            ${data.description || null}, ${data.priority || 'medium'},
            ${data.assigneeId || null}::uuid,
            ${JSON.stringify(data.tags || [])}::jsonb
          )
          RETURNING *
        `;
      }
    );

    return this.mapCaseRow(hrCase);
  }

  async updateCase(
    ctx: TenantContext,
    id: string,
    data: UpdateCase
  ): Promise<CaseResponse | null> {
    const [hrCase] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          UPDATE app.cases SET
            subject = COALESCE(${data.subject}, subject),
            description = COALESCE(${data.description}, description),
            category_id = COALESCE(${data.category}::uuid, category_id),
            priority = COALESCE(${data.priority}, priority),
            status = COALESCE(${data.status}, status),
            assigned_to = COALESCE(${data.assigneeId}::uuid, assigned_to),
            resolution_summary = COALESCE(${data.resolution}, resolution_summary),
            resolved_at = CASE WHEN ${data.status} = 'resolved' AND resolved_at IS NULL THEN now() ELSE resolved_at END,
            closed_at = CASE WHEN ${data.status} = 'closed' AND closed_at IS NULL THEN now() ELSE closed_at END,
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING *
        `;
      }
    );

    return hrCase ? this.mapCaseRow(hrCase) : null;
  }

  async assignCase(
    ctx: TenantContext,
    id: string,
    assigneeId: string
  ): Promise<CaseResponse | null> {
    const [hrCase] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          UPDATE app.cases SET
            assigned_to = ${assigneeId}::uuid,
            status = CASE WHEN status = 'new' THEN 'open' ELSE status END,
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING *
        `;
      }
    );

    return hrCase ? this.mapCaseRow(hrCase) : null;
  }

  async escalateCase(
    ctx: TenantContext,
    id: string,
    escalateTo?: string
  ): Promise<CaseResponse | null> {
    const [hrCase] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          UPDATE app.cases SET
            assigned_to = COALESCE(${escalateTo}::uuid, assigned_to),
            escalated_at = now(),
            escalated_by = ${ctx.userId}::uuid,
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING *
        `;
      }
    );

    return hrCase ? this.mapCaseRow(hrCase) : null;
  }

  async resolveCase(
    ctx: TenantContext,
    id: string,
    resolution: string
  ): Promise<CaseResponse | null> {
    const [hrCase] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          UPDATE app.cases SET
            status = 'resolved',
            resolution_summary = ${resolution},
            resolved_at = now(),
            resolved_by = ${ctx.userId}::uuid,
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING *
        `;
      }
    );

    return hrCase ? this.mapCaseRow(hrCase) : null;
  }

  async closeCase(ctx: TenantContext, id: string): Promise<CaseResponse | null> {
    const [hrCase] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          UPDATE app.cases SET
            status = 'closed',
            closed_at = now(),
            closed_by = ${ctx.userId}::uuid,
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING *
        `;
      }
    );

    return hrCase ? this.mapCaseRow(hrCase) : null;
  }

  // ===========================================================================
  // Comment Operations
  // ===========================================================================

  async listComments(ctx: TenantContext, caseId: string): Promise<CommentResponse[]> {
    const comments = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            cc.*,
            u.first_name || ' ' || u.last_name as author_name
          FROM app.case_comments cc
          JOIN app.users u ON u.id = cc.author_id
          WHERE cc.case_id = ${caseId}::uuid
          ORDER BY cc.created_at ASC
        `;
      }
    );

    return comments.map(this.mapCommentRow);
  }

  async createComment(
    ctx: TenantContext,
    caseId: string,
    data: CreateComment
  ): Promise<CommentResponse> {
    const [comment] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        // SLA response tracking is handled by the mark_sla_response_on_comment trigger
        return tx`
          INSERT INTO app.case_comments (
            id, tenant_id, case_id, author_id, content, is_internal
          ) VALUES (
            gen_random_uuid(), ${ctx.tenantId}::uuid, ${caseId}::uuid, ${ctx.userId}::uuid,
            ${data.content}, ${data.isInternal || false}
          )
          RETURNING *
        `;
      }
    );

    return this.mapCommentRow(comment);
  }

  // ===========================================================================
  // Employee Lookup
  // ===========================================================================

  async getEmployeeIdByUserId(ctx: TenantContext): Promise<string | null> {
    const [employee] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT id FROM app.employees
          WHERE user_id = ${ctx.userId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          LIMIT 1
        `;
      }
    );

    return employee?.id || null;
  }

  // ===========================================================================
  // Analytics Operations
  // ===========================================================================

  async getCaseAnalytics(ctx: TenantContext) {
    const [analytics] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            COUNT(*) as total_cases,
            COUNT(*) FILTER (WHERE status IN ('new', 'open', 'pending', 'on_hold')) as open_cases,
            COUNT(*) FILTER (WHERE status = 'resolved') as resolved_cases,
            AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) FILTER (WHERE status = 'resolved') as average_resolution_hours,
            COUNT(*) FILTER (WHERE sla_status = 'breached' AND status NOT IN ('resolved', 'closed', 'cancelled')) as sla_breach_count
          FROM app.cases
          WHERE tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    const byCategory = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT category_id, COUNT(*) as count
          FROM app.cases
          WHERE tenant_id = ${ctx.tenantId}::uuid
          GROUP BY category_id
          ORDER BY count DESC
        `;
      }
    );

    const byPriority = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT priority, COUNT(*) as count
          FROM app.cases
          WHERE tenant_id = ${ctx.tenantId}::uuid
          GROUP BY priority
          ORDER BY
            CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
        `;
      }
    );

    return {
      totalCases: Number(analytics.totalCases) || 0,
      openCases: Number(analytics.openCases) || 0,
      resolvedCases: Number(analytics.resolvedCases) || 0,
      averageResolutionHours: analytics.averageResolutionHours
        ? Number(analytics.averageResolutionHours)
        : null,
      slaBreachCount: Number(analytics.slaBreachCount) || 0,
      byCategory: byCategory.map((r: any) => ({
        category: r.categoryId,
        count: Number(r.count),
      })),
      byPriority: byPriority.map((r: any) => ({
        priority: r.priority,
        count: Number(r.count),
      })),
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private mapCaseRow(row: any): CaseResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      caseNumber: row.caseNumber,
      requesterId: row.requesterId,
      requesterName: row.requesterName,
      category: row.categoryId,
      subject: row.subject,
      description: row.description,
      priority: row.priority,
      status: row.status,
      assigneeId: row.assignedTo,
      assigneeName: row.assigneeName,
      resolution: row.resolutionSummary,
      dueDate: row.slaResolutionDueAt?.toISOString()?.split("T")[0] || row.slaResolutionDueAt || null,
      resolvedAt: row.resolvedAt?.toISOString() || row.resolvedAt,
      closedAt: row.closedAt?.toISOString() || row.closedAt,
      firstResponseAt: row.slaResponseMetAt?.toISOString() || row.slaResponseMetAt,
      slaBreached: row.slaStatus === 'breached',
      tags: row.tags,
      createdBy: row.requesterId,
      createdAt: row.createdAt?.toISOString() || row.createdAt,
      updatedAt: row.updatedAt?.toISOString() || row.updatedAt,
    };
  }

  private mapCommentRow(row: any): CommentResponse {
    return {
      id: row.id,
      caseId: row.caseId,
      authorId: row.authorId,
      authorName: row.authorName,
      content: row.content,
      isInternal: row.isInternal,
      createdAt: row.createdAt?.toISOString() || row.createdAt,
      updatedAt: row.editedAt?.toISOString() || row.createdAt?.toISOString() || row.createdAt,
    };
  }
}
