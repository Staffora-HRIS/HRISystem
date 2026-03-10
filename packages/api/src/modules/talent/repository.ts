/**
 * Talent Module - Repository Layer
 *
 * Database operations for Talent Management.
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

export class TalentRepository {
  constructor(private db: any) {}

  // ===========================================================================
  // Goal Operations
  // ===========================================================================

  async listGoals(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      status?: string;
      category?: string;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<any>> {
    const limit = pagination.limit ?? 20;

    const goals = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          SELECT g.*, e.first_name || ' ' || e.last_name as employee_name
          FROM app.goals g
          JOIN app.employees e ON e.id = g.employee_id
          WHERE g.tenant_id = ${ctx.tenantId}::uuid
          ${filters.employeeId ? tx`AND g.employee_id = ${filters.employeeId}::uuid` : tx``}
          ${filters.status ? tx`AND g.status = ${filters.status}` : tx``}
          ${filters.category ? tx`AND g.category = ${filters.category}` : tx``}
          ${pagination.cursor ? tx`AND g.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY g.target_date ASC, g.id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = goals.length > limit;
    const items = hasMore ? goals.slice(0, limit) : goals;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getGoalById(ctx: TenantContext, id: string): Promise<any | null> {
    const [goal] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          SELECT g.*, e.first_name || ' ' || e.last_name as employee_name
          FROM app.goals g
          JOIN app.employees e ON e.id = g.employee_id
          WHERE g.id = ${id}::uuid AND g.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return goal || null;
  }

  async createGoal(ctx: TenantContext, data: any): Promise<any> {
    const [goal] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          INSERT INTO app.goals (
            id, tenant_id, employee_id, title, description, category,
            weight, target_date, metrics, parent_goal_id, status, progress
          ) VALUES (
            gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
            ${data.title}, ${data.description || null}, ${data.category || null},
            ${data.weight || 0}, ${data.targetDate}::date,
            ${data.metrics ? JSON.stringify(data.metrics) : null}::jsonb,
            ${data.parentGoalId || null}::uuid, 'active', 0
          )
          RETURNING *
        `;
      }
    );

    return goal;
  }

  async updateGoal(ctx: TenantContext, id: string, data: any): Promise<any | null> {
    const [goal] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          UPDATE app.goals SET
            title = COALESCE(${data.title}, title),
            description = COALESCE(${data.description}, description),
            category = COALESCE(${data.category}, category),
            weight = COALESCE(${data.weight}, weight),
            target_date = COALESCE(${data.targetDate}::date, target_date),
            status = COALESCE(${data.status}, status),
            progress = COALESCE(${data.progress}, progress),
            metrics = COALESCE(${data.metrics ? JSON.stringify(data.metrics) : null}::jsonb, metrics),
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING *
        `;
      }
    );

    return goal || null;
  }

  async softDeleteGoal(ctx: TenantContext, id: string): Promise<boolean> {
    const result = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          UPDATE app.goals SET
            status = 'cancelled',
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING id
        `;
      }
    );

    return result.length > 0;
  }

  // ===========================================================================
  // Review Cycle Operations
  // ===========================================================================

  async listReviewCycles(
    ctx: TenantContext,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<any>> {
    const limit = pagination.limit ?? 20;

    const cycles = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          SELECT * FROM app.performance_cycles
          WHERE tenant_id = ${ctx.tenantId}::uuid
          ${pagination.cursor ? tx`AND id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY end_date DESC, id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = cycles.length > limit;
    const items = hasMore ? cycles.slice(0, limit) : cycles;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getReviewCycleById(ctx: TenantContext, id: string): Promise<any | null> {
    const [cycle] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          SELECT * FROM app.performance_cycles
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return cycle || null;
  }

  async createReviewCycle(ctx: TenantContext, data: any): Promise<any> {
    const [cycle] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          INSERT INTO app.performance_cycles (
            id, tenant_id, name, description, start_date, end_date,
            review_start, review_end, calibration_start, status
          ) VALUES (
            gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.name}, ${data.description || null},
            ${data.periodStart || data.startDate}::date, ${data.periodEnd || data.endDate}::date,
            ${data.selfReviewDeadline || data.reviewStart}::date, ${data.managerReviewDeadline || data.reviewEnd}::date,
            ${data.calibrationDeadline || data.calibrationStart || null}::date, 'draft'
          )
          RETURNING *
        `;
      }
    );

    return cycle;
  }

  // ===========================================================================
  // Review Operations
  // ===========================================================================

  async listReviews(
    ctx: TenantContext,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<any>> {
    const limit = pagination.limit ?? 20;

    const reviews = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          SELECT r.*, e.first_name || ' ' || e.last_name as employee_name,
                 rc.name as cycle_name
          FROM app.reviews r
          JOIN app.employees e ON e.id = r.employee_id
          JOIN app.performance_cycles rc ON rc.id = r.cycle_id
          WHERE r.tenant_id = ${ctx.tenantId}::uuid
          ${pagination.cursor ? tx`AND r.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY r.created_at DESC, r.id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = reviews.length > limit;
    const items = hasMore ? reviews.slice(0, limit) : reviews;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getReviewById(ctx: TenantContext, id: string): Promise<any | null> {
    const [review] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          SELECT r.*, e.first_name || ' ' || e.last_name as employee_name,
                 rc.name as cycle_name
          FROM app.reviews r
          JOIN app.employees e ON e.id = r.employee_id
          JOIN app.performance_cycles rc ON rc.id = r.cycle_id
          WHERE r.id = ${id}::uuid AND r.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return review || null;
  }

  async createReview(ctx: TenantContext, data: any): Promise<any> {
    const [review] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          INSERT INTO app.reviews (
            id, tenant_id, cycle_id, employee_id, reviewer_id, status
          ) VALUES (
            gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.reviewCycleId || data.cycleId}::uuid,
            ${data.employeeId}::uuid, ${data.reviewerId}::uuid, 'draft'
          )
          RETURNING *
        `;
      }
    );

    return review;
  }

  async submitSelfReview(ctx: TenantContext, id: string, selfReviewData: any): Promise<any | null> {
    const [review] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          UPDATE app.reviews SET
            self_review = ${JSON.stringify(selfReviewData)}::jsonb,
            status = 'self_review',
            self_review_submitted_at = now(),
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING *
        `;
      }
    );

    return review || null;
  }

  async submitManagerReview(ctx: TenantContext, id: string, managerReviewData: any): Promise<any | null> {
    const [review] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          UPDATE app.reviews SET
            manager_review = ${JSON.stringify(managerReviewData)}::jsonb,
            status = 'manager_review',
            manager_review_submitted_at = now(),
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING *
        `;
      }
    );

    return review || null;
  }

  // ===========================================================================
  // Competency Operations
  // ===========================================================================

  async listCompetencies(
    ctx: TenantContext,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<any>> {
    const limit = pagination.limit ?? 20;

    const competencies = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          SELECT * FROM app.competencies
          WHERE tenant_id = ${ctx.tenantId}::uuid
          ${pagination.cursor ? tx`AND id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY category, name, id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = competencies.length > limit;
    const items = hasMore ? competencies.slice(0, limit) : competencies;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getCompetencyById(ctx: TenantContext, id: string): Promise<any | null> {
    const [competency] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          SELECT * FROM app.competencies
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return competency || null;
  }

  async createCompetency(ctx: TenantContext, data: any): Promise<any> {
    const [competency] = await this.db.withTransaction(
      ctx,
      async (tx: any) => {
        return tx`
          INSERT INTO app.competencies (
            id, tenant_id, name, description, category, levels
          ) VALUES (
            gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.name},
            ${data.description || null}, ${data.category},
            ${JSON.stringify(data.levels)}::jsonb
          )
          RETURNING *
        `;
      }
    );

    return competency;
  }
}
