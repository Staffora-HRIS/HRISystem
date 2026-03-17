/**
 * Feedback 360 Module - Repository Layer
 *
 * Database operations for 360-degree feedback cycles and responses.
 * All queries respect RLS via tenant context.
 */

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

export class Feedback360Repository {
  constructor(private db: any) {}

  // ===========================================================================
  // Cycle Operations
  // ===========================================================================

  async listCycles(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      reviewCycleId?: string;
      status?: string;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<any>> {
    const limit = pagination.limit ?? 20;

    const cycles = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          SELECT c.id, c.tenant_id, c.review_cycle_id, c.employee_id,
                 c.status, c.deadline, c.min_responses,
                 c.created_at, c.created_by, c.updated_at,
                 e.first_name || ' ' || e.last_name AS employee_name,
                 pc.name AS review_cycle_name,
                 (SELECT COUNT(*) FROM app.feedback_360_responses r
                  WHERE r.cycle_id = c.id AND r.status = 'submitted')::integer AS submitted_count,
                 (SELECT COUNT(*) FROM app.feedback_360_responses r
                  WHERE r.cycle_id = c.id)::integer AS total_reviewers
          FROM app.feedback_360_cycles c
          JOIN app.employees e ON e.id = c.employee_id
          LEFT JOIN app.performance_cycles pc ON pc.id = c.review_cycle_id
          WHERE c.tenant_id = ${ctx.tenantId}::uuid
          ${filters.employeeId ? tx`AND c.employee_id = ${filters.employeeId}::uuid` : tx``}
          ${filters.reviewCycleId ? tx`AND c.review_cycle_id = ${filters.reviewCycleId}::uuid` : tx``}
          ${filters.status ? tx`AND c.status = ${filters.status}` : tx``}
          ${pagination.cursor ? tx`AND c.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY c.created_at DESC, c.id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = cycles.length > limit;
    const items = hasMore ? cycles.slice(0, limit) : cycles;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getCycleById(ctx: TenantContext, id: string): Promise<any | null> {
    const [cycle] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          SELECT c.id, c.tenant_id, c.review_cycle_id, c.employee_id,
                 c.status, c.deadline, c.min_responses,
                 c.created_at, c.created_by, c.updated_at,
                 e.first_name || ' ' || e.last_name AS employee_name,
                 pc.name AS review_cycle_name,
                 (SELECT COUNT(*) FROM app.feedback_360_responses r
                  WHERE r.cycle_id = c.id AND r.status = 'submitted')::integer AS submitted_count,
                 (SELECT COUNT(*) FROM app.feedback_360_responses r
                  WHERE r.cycle_id = c.id)::integer AS total_reviewers
          FROM app.feedback_360_cycles c
          JOIN app.employees e ON e.id = c.employee_id
          LEFT JOIN app.performance_cycles pc ON pc.id = c.review_cycle_id
          WHERE c.id = ${id}::uuid AND c.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return cycle || null;
  }

  async createCycle(ctx: TenantContext, data: {
    employeeId: string;
    reviewCycleId?: string;
    deadline?: string;
    minResponses?: number;
  }): Promise<any> {
    const [cycle] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          INSERT INTO app.feedback_360_cycles (
            id, tenant_id, review_cycle_id, employee_id,
            status, deadline, min_responses, created_by
          ) VALUES (
            gen_random_uuid(), ${ctx.tenantId}::uuid,
            ${data.reviewCycleId || null}::uuid,
            ${data.employeeId}::uuid,
            'draft',
            ${data.deadline || null}::date,
            ${data.minResponses ?? 3},
            ${ctx.userId || null}::uuid
          )
          RETURNING id, tenant_id, review_cycle_id, employee_id,
                    status, deadline, min_responses,
                    created_at, created_by, updated_at
        `;
      }
    );

    return cycle;
  }

  async updateCycleStatus(ctx: TenantContext, id: string, status: string): Promise<any | null> {
    const [cycle] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          UPDATE app.feedback_360_cycles SET
            status = ${status},
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING id, tenant_id, review_cycle_id, employee_id,
                    status, deadline, min_responses,
                    created_at, created_by, updated_at
        `;
      }
    );

    return cycle || null;
  }

  async updateCycle(ctx: TenantContext, id: string, data: {
    status?: string;
    deadline?: string;
    minResponses?: number;
  }): Promise<any | null> {
    const [cycle] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          UPDATE app.feedback_360_cycles SET
            status = COALESCE(${data.status || null}, status),
            deadline = COALESCE(${data.deadline || null}::date, deadline),
            min_responses = COALESCE(${data.minResponses || null}::integer, min_responses),
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING id, tenant_id, review_cycle_id, employee_id,
                    status, deadline, min_responses,
                    created_at, created_by, updated_at
        `;
      }
    );

    return cycle || null;
  }

  // ===========================================================================
  // Response Operations
  // ===========================================================================

  async listResponsesByCycle(ctx: TenantContext, cycleId: string): Promise<any[]> {
    return this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          SELECT r.id, r.tenant_id, r.cycle_id, r.reviewer_id,
                 r.reviewer_type, r.status,
                 r.submitted_at, r.created_at, r.updated_at,
                 e.first_name || ' ' || e.last_name AS reviewer_name
          FROM app.feedback_360_responses r
          JOIN app.employees e ON e.id = r.reviewer_id
          WHERE r.cycle_id = ${cycleId}::uuid
            AND r.tenant_id = ${ctx.tenantId}::uuid
          ORDER BY
            CASE r.reviewer_type
              WHEN 'self' THEN 1
              WHEN 'manager' THEN 2
              WHEN 'peer' THEN 3
              WHEN 'direct_report' THEN 4
            END,
            r.created_at ASC
        `;
      }
    );
  }

  async getResponseById(ctx: TenantContext, responseId: string): Promise<any | null> {
    const [response] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          SELECT r.id, r.tenant_id, r.cycle_id, r.reviewer_id,
                 r.reviewer_type, r.status, r.ratings,
                 r.strengths, r.development_areas, r.comments,
                 r.submitted_at, r.created_at, r.updated_at,
                 e.first_name || ' ' || e.last_name AS reviewer_name
          FROM app.feedback_360_responses r
          JOIN app.employees e ON e.id = r.reviewer_id
          WHERE r.id = ${responseId}::uuid
            AND r.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return response || null;
  }

  async getResponseByReviewerAndCycle(
    ctx: TenantContext,
    cycleId: string,
    reviewerId: string,
    reviewerType: string
  ): Promise<any | null> {
    const [response] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          SELECT r.id, r.tenant_id, r.cycle_id, r.reviewer_id,
                 r.reviewer_type, r.status, r.ratings,
                 r.strengths, r.development_areas, r.comments,
                 r.submitted_at, r.created_at, r.updated_at
          FROM app.feedback_360_responses r
          WHERE r.cycle_id = ${cycleId}::uuid
            AND r.reviewer_id = ${reviewerId}::uuid
            AND r.reviewer_type = ${reviewerType}
            AND r.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return response || null;
  }

  async createResponses(
    ctx: TenantContext,
    cycleId: string,
    reviewers: Array<{ reviewerId: string; reviewerType: string }>
  ): Promise<any[]> {
    return this.db.withTransaction(
      ctx,
      async (tx: any) => {
        const results: any[] = [];
        for (const reviewer of reviewers) {
          const [response] = await tx`
            INSERT INTO app.feedback_360_responses (
              id, tenant_id, cycle_id, reviewer_id, reviewer_type, status
            ) VALUES (
              gen_random_uuid(), ${ctx.tenantId}::uuid,
              ${cycleId}::uuid, ${reviewer.reviewerId}::uuid,
              ${reviewer.reviewerType}, 'pending'
            )
            ON CONFLICT (tenant_id, cycle_id, reviewer_id, reviewer_type)
            DO NOTHING
            RETURNING id, tenant_id, cycle_id, reviewer_id,
                      reviewer_type, status, created_at, updated_at
          `;
          if (response) {
            results.push(response);
          }
        }
        return results;
      }
    );
  }

  async submitResponse(
    ctx: TenantContext,
    responseId: string,
    data: {
      ratings: any[];
      strengths?: string;
      developmentAreas?: string;
      comments?: string;
    }
  ): Promise<any | null> {
    const [response] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        // First move to in_progress if still pending (handles the transition)
        await tx`
          UPDATE app.feedback_360_responses SET
            status = 'in_progress',
            updated_at = now()
          WHERE id = ${responseId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
            AND status = 'pending'
        `;

        // Now submit
        return tx`
          UPDATE app.feedback_360_responses SET
            status = 'submitted',
            ratings = ${JSON.stringify(data.ratings)}::jsonb,
            strengths = ${data.strengths || null},
            development_areas = ${data.developmentAreas || null},
            comments = ${data.comments || null},
            submitted_at = now(),
            updated_at = now()
          WHERE id = ${responseId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
            AND status = 'in_progress'
          RETURNING id, tenant_id, cycle_id, reviewer_id,
                    reviewer_type, status, ratings,
                    strengths, development_areas, comments,
                    submitted_at, created_at, updated_at
        `;
      }
    );

    return response || null;
  }

  async declineResponse(ctx: TenantContext, responseId: string): Promise<any | null> {
    const [response] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          UPDATE app.feedback_360_responses SET
            status = 'declined',
            updated_at = now()
          WHERE id = ${responseId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
            AND status IN ('pending', 'in_progress')
          RETURNING id, tenant_id, cycle_id, reviewer_id,
                    reviewer_type, status, created_at, updated_at
        `;
      }
    );

    return response || null;
  }

  // ===========================================================================
  // Aggregated Results
  // ===========================================================================

  async getAggregatedResults(ctx: TenantContext, cycleId: string): Promise<any[]> {
    return this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`SELECT * FROM app.get_feedback_360_aggregated_results(${cycleId}::uuid)`;
      }
    );
  }

  // ===========================================================================
  // Helper: Count submitted responses by type
  // ===========================================================================

  async getResponseCountsByType(ctx: TenantContext, cycleId: string): Promise<any[]> {
    return this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          SELECT reviewer_type,
                 COUNT(*) FILTER (WHERE status = 'submitted')::integer AS submitted,
                 COUNT(*) FILTER (WHERE status = 'pending')::integer AS pending,
                 COUNT(*) FILTER (WHERE status = 'in_progress')::integer AS in_progress,
                 COUNT(*) FILTER (WHERE status = 'declined')::integer AS declined,
                 COUNT(*)::integer AS total
          FROM app.feedback_360_responses
          WHERE cycle_id = ${cycleId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
          GROUP BY reviewer_type
          ORDER BY
            CASE reviewer_type
              WHEN 'self' THEN 1
              WHEN 'manager' THEN 2
              WHEN 'peer' THEN 3
              WHEN 'direct_report' THEN 4
            END
        `;
      }
    );
  }
}
