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
          LEFT JOIN app.users a ON a.id = c.assignee_id
          WHERE c.tenant_id = ${ctx.tenantId}::uuid
          ${filters.category ? tx`AND c.category = ${filters.category}` : tx``}
          ${filters.status ? tx`AND c.status = ${filters.status}` : tx``}
          ${filters.priority ? tx`AND c.priority = ${filters.priority}` : tx``}
          ${filters.assigneeId ? tx`AND c.assignee_id = ${filters.assigneeId}::uuid` : tx``}
          ${filters.requesterId ? tx`AND c.requester_id = ${filters.requesterId}::uuid` : tx``}
          ${filters.isOverdue ? tx`AND c.due_date < CURRENT_DATE AND c.status NOT IN ('resolved', 'closed', 'cancelled')` : tx``}
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
          LEFT JOIN app.users a ON a.id = c.assignee_id
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
          LEFT JOIN app.users a ON a.id = c.assignee_id
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
          LEFT JOIN app.users a ON a.id = c.assignee_id
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
            id, tenant_id, case_number, requester_id, category, subject,
            description, priority, status, assignee_id, due_date, created_by
          ) VALUES (
            gen_random_uuid(), ${ctx.tenantId}::uuid, ${caseNumber},
            ${data.requesterId}::uuid, ${data.category}, ${data.subject},
            ${data.description || null}, ${data.priority || 'medium'},
            'open', ${data.assigneeId || null}::uuid, ${data.dueDate || null}::date,
            ${ctx.userId}::uuid
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
            category = COALESCE(${data.category}, category),
            priority = COALESCE(${data.priority}, priority),
            status = COALESCE(${data.status}, status),
            assignee_id = COALESCE(${data.assigneeId}::uuid, assignee_id),
            resolution = COALESCE(${data.resolution}, resolution),
            due_date = COALESCE(${data.dueDate}::date, due_date),
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
            assignee_id = ${assigneeId}::uuid,
            status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
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
            status = 'escalated',
            assignee_id = COALESCE(${escalateTo}::uuid, assignee_id),
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
            resolution = ${resolution},
            resolved_at = now(),
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
        // Update first_response_at if this is the first HR response
        await tx`
          UPDATE app.cases SET
            first_response_at = CASE
              WHEN first_response_at IS NULL AND ${!data.isInternal || false} = false
              THEN now()
              ELSE first_response_at
            END,
            updated_at = now()
          WHERE id = ${caseId}::uuid
        `;

        return tx`
          INSERT INTO app.case_comments (
            id, case_id, author_id, content, is_internal
          ) VALUES (
            gen_random_uuid(), ${caseId}::uuid, ${ctx.userId}::uuid,
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
            COUNT(*) FILTER (WHERE status IN ('open', 'in_progress', 'pending_info', 'escalated')) as open_cases,
            COUNT(*) FILTER (WHERE status = 'resolved') as resolved_cases,
            AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) FILTER (WHERE status = 'resolved') as average_resolution_hours,
            COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('resolved', 'closed', 'cancelled')) as sla_breach_count
          FROM app.cases
          WHERE tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    const byCategory = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT category, COUNT(*) as count
          FROM app.cases
          WHERE tenant_id = ${ctx.tenantId}::uuid
          GROUP BY category
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
      totalCases: Number(analytics.total_cases) || 0,
      openCases: Number(analytics.open_cases) || 0,
      resolvedCases: Number(analytics.resolved_cases) || 0,
      averageResolutionHours: analytics.average_resolution_hours
        ? Number(analytics.average_resolution_hours)
        : null,
      slaBreachCount: Number(analytics.sla_breach_count) || 0,
      byCategory: byCategory.map((r: any) => ({
        category: r.category,
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
      tenantId: row.tenant_id,
      caseNumber: row.case_number,
      requesterId: row.requester_id,
      requesterName: row.requester_name,
      category: row.category,
      subject: row.subject,
      description: row.description,
      priority: row.priority,
      status: row.status,
      assigneeId: row.assignee_id,
      assigneeName: row.assignee_name,
      resolution: row.resolution,
      dueDate: row.due_date?.toISOString()?.split("T")[0] || row.due_date,
      resolvedAt: row.resolved_at?.toISOString() || row.resolved_at,
      closedAt: row.closed_at?.toISOString() || row.closed_at,
      firstResponseAt: row.first_response_at?.toISOString() || row.first_response_at,
      slaBreached: row.sla_breached,
      tags: row.tags,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString() || row.created_at,
      updatedAt: row.updated_at?.toISOString() || row.updated_at,
    };
  }

  private mapCommentRow(row: any): CommentResponse {
    return {
      id: row.id,
      caseId: row.case_id,
      authorId: row.author_id,
      authorName: row.author_name,
      content: row.content,
      isInternal: row.is_internal,
      createdAt: row.created_at?.toISOString() || row.created_at,
      updatedAt: row.updated_at?.toISOString() || row.updated_at,
    };
  }
}
