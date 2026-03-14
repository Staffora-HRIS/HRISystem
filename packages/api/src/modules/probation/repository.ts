/**
 * Probation Module - Repository Layer
 *
 * Database operations for probation reviews and reminders.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 * Uses parameterized queries throughout — no tx.unsafe().
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateProbationReview,
  ProbationFilters,
  PaginationQuery,
  ProbationOutcome,
  ReminderType,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Raw DB row for probation_reviews */
export interface ProbationReviewRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  probationStartDate: Date;
  originalEndDate: Date;
  currentEndDate: Date;
  reviewDate: Date | null;
  reviewerId: string | null;
  outcome: string;
  extensionWeeks: number | null;
  performanceNotes: string | null;
  areasOfConcern: string | null;
  developmentPlan: string | null;
  recommendation: string | null;
  meetingDate: Date | null;
  meetingNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields (optional)
  employeeNumber?: string;
  employeeName?: string;
  daysRemaining?: number;
}

/** Raw DB row for probation_reminders */
export interface ProbationReminderRow extends Row {
  id: string;
  tenantId: string;
  probationReviewId: string;
  reminderType: string;
  scheduledDate: Date;
  sent: boolean;
  sentAt: Date | null;
  createdAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class ProbationRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Review Operations
  // ===========================================================================

  /**
   * List probation reviews with cursor-based pagination.
   * Joins employee data for display names and calculates days remaining.
   */
  async listReviews(
    ctx: TenantContext,
    filters: ProbationFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<ProbationReviewRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<ProbationReviewRow[]>`
        SELECT
          pr.id, pr.tenant_id, pr.employee_id,
          pr.probation_start_date, pr.original_end_date, pr.current_end_date,
          pr.review_date, pr.reviewer_id, pr.outcome,
          pr.extension_weeks,
          pr.performance_notes, pr.areas_of_concern,
          pr.development_plan, pr.recommendation,
          pr.meeting_date, pr.meeting_notes,
          pr.created_at, pr.updated_at,
          e.employee_number,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          (pr.current_end_date - CURRENT_DATE)::int AS days_remaining
        FROM probation_reviews pr
        JOIN employees e ON e.id = pr.employee_id AND e.tenant_id = pr.tenant_id
        WHERE 1=1
          ${filters.employee_id ? tx`AND pr.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.outcome ? tx`AND pr.outcome = ${filters.outcome}::app.probation_outcome` : tx``}
          ${filters.reviewer_id ? tx`AND pr.reviewer_id = ${filters.reviewer_id}::uuid` : tx``}
          ${filters.search ? tx`AND (
            e.employee_number ILIKE ${"%" + filters.search + "%"}
            OR e.first_name ILIKE ${"%" + filters.search + "%"}
            OR e.last_name ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
          ${pagination.cursor ? tx`AND pr.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY pr.current_end_date ASC, pr.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].id
          : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * List upcoming probation reviews (pending reviews ending within N days).
   */
  async listUpcoming(
    ctx: TenantContext,
    daysAhead: number,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<ProbationReviewRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<ProbationReviewRow[]>`
        SELECT
          pr.id, pr.tenant_id, pr.employee_id,
          pr.probation_start_date, pr.original_end_date, pr.current_end_date,
          pr.review_date, pr.reviewer_id, pr.outcome,
          pr.extension_weeks,
          pr.performance_notes, pr.areas_of_concern,
          pr.development_plan, pr.recommendation,
          pr.meeting_date, pr.meeting_notes,
          pr.created_at, pr.updated_at,
          e.employee_number,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          (pr.current_end_date - CURRENT_DATE)::int AS days_remaining
        FROM probation_reviews pr
        JOIN employees e ON e.id = pr.employee_id AND e.tenant_id = pr.tenant_id
        WHERE pr.outcome = 'pending'
          AND pr.current_end_date <= CURRENT_DATE + ${daysAhead}
          AND pr.current_end_date >= CURRENT_DATE
          ${pagination.cursor ? tx`AND pr.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY pr.current_end_date ASC, pr.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].id
          : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * List overdue probation reviews (pending reviews past their end date).
   */
  async listOverdue(
    ctx: TenantContext,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<ProbationReviewRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<ProbationReviewRow[]>`
        SELECT
          pr.id, pr.tenant_id, pr.employee_id,
          pr.probation_start_date, pr.original_end_date, pr.current_end_date,
          pr.review_date, pr.reviewer_id, pr.outcome,
          pr.extension_weeks,
          pr.performance_notes, pr.areas_of_concern,
          pr.development_plan, pr.recommendation,
          pr.meeting_date, pr.meeting_notes,
          pr.created_at, pr.updated_at,
          e.employee_number,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          (pr.current_end_date - CURRENT_DATE)::int AS days_remaining
        FROM probation_reviews pr
        JOIN employees e ON e.id = pr.employee_id AND e.tenant_id = pr.tenant_id
        WHERE pr.outcome = 'pending'
          AND pr.current_end_date < CURRENT_DATE
          ${pagination.cursor ? tx`AND pr.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY pr.current_end_date ASC, pr.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].id
          : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Get a single probation review by ID with employee info.
   */
  async getReviewById(
    ctx: TenantContext,
    id: string
  ): Promise<ProbationReviewRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<ProbationReviewRow[]>`
        SELECT
          pr.id, pr.tenant_id, pr.employee_id,
          pr.probation_start_date, pr.original_end_date, pr.current_end_date,
          pr.review_date, pr.reviewer_id, pr.outcome,
          pr.extension_weeks,
          pr.performance_notes, pr.areas_of_concern,
          pr.development_plan, pr.recommendation,
          pr.meeting_date, pr.meeting_notes,
          pr.created_at, pr.updated_at,
          e.employee_number,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          (pr.current_end_date - CURRENT_DATE)::int AS days_remaining
        FROM probation_reviews pr
        JOIN employees e ON e.id = pr.employee_id AND e.tenant_id = pr.tenant_id
        WHERE pr.id = ${id}
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Get a probation review by ID (within an existing transaction).
   */
  async getReviewByIdTx(
    id: string,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<ProbationReviewRow | null> {
    const rows = await tx<ProbationReviewRow[]>`
      SELECT
        id, tenant_id, employee_id,
        probation_start_date, original_end_date, current_end_date,
        review_date, reviewer_id, outcome,
        extension_weeks,
        performance_notes, areas_of_concern,
        development_plan, recommendation,
        meeting_date, meeting_notes,
        created_at, updated_at
      FROM probation_reviews
      WHERE id = ${id}
    `;
    return rows[0] ?? null;
  }

  /**
   * Check if a pending probation review already exists for an employee.
   */
  async findPendingReviewForEmployee(
    ctx: TenantContext,
    employeeId: string
  ): Promise<ProbationReviewRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<ProbationReviewRow[]>`
        SELECT
          id, tenant_id, employee_id,
          probation_start_date, original_end_date, current_end_date,
          review_date, reviewer_id, outcome,
          extension_weeks,
          performance_notes, areas_of_concern,
          development_plan, recommendation,
          meeting_date, meeting_notes,
          created_at, updated_at
        FROM probation_reviews
        WHERE employee_id = ${employeeId}::uuid
          AND outcome = 'pending'
        LIMIT 1
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Create a probation review within an existing transaction.
   */
  async createReview(
    ctx: TenantContext,
    data: CreateProbationReview,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<ProbationReviewRow> {
    const currentEndDate = data.current_end_date || data.original_end_date;

    const rows = await tx<ProbationReviewRow[]>`
      INSERT INTO probation_reviews (
        tenant_id, employee_id,
        probation_start_date, original_end_date, current_end_date,
        reviewer_id,
        performance_notes, areas_of_concern,
        development_plan, recommendation,
        meeting_date, meeting_notes
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.probation_start_date},
        ${data.original_end_date},
        ${currentEndDate},
        ${data.reviewer_id ?? null},
        ${data.performance_notes ?? null},
        ${data.areas_of_concern ?? null},
        ${data.development_plan ?? null},
        ${data.recommendation ?? null},
        ${data.meeting_date ?? null},
        ${data.meeting_notes ?? null}
      )
      RETURNING
        id, tenant_id, employee_id,
        probation_start_date, original_end_date, current_end_date,
        review_date, reviewer_id, outcome,
        extension_weeks,
        performance_notes, areas_of_concern,
        development_plan, recommendation,
        meeting_date, meeting_notes,
        created_at, updated_at
    `;
    return rows[0];
  }

  /**
   * Extend a probation review (update current_end_date, outcome, extension_weeks).
   */
  async extendReview(
    id: string,
    newEndDate: string,
    extensionWeeks: number,
    notes: {
      performanceNotes?: string | null;
      areasOfConcern?: string | null;
      developmentPlan?: string | null;
      recommendation?: string | null;
    },
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<ProbationReviewRow | null> {
    const rows = await tx<ProbationReviewRow[]>`
      UPDATE probation_reviews
      SET
        current_end_date = ${newEndDate},
        outcome = 'extended',
        extension_weeks = ${extensionWeeks},
        performance_notes = COALESCE(${notes.performanceNotes ?? null}, performance_notes),
        areas_of_concern = COALESCE(${notes.areasOfConcern ?? null}, areas_of_concern),
        development_plan = COALESCE(${notes.developmentPlan ?? null}, development_plan),
        recommendation = COALESCE(${notes.recommendation ?? null}, recommendation)
      WHERE id = ${id}
      RETURNING
        id, tenant_id, employee_id,
        probation_start_date, original_end_date, current_end_date,
        review_date, reviewer_id, outcome,
        extension_weeks,
        performance_notes, areas_of_concern,
        development_plan, recommendation,
        meeting_date, meeting_notes,
        created_at, updated_at
    `;
    return rows[0] ?? null;
  }

  /**
   * Complete a probation review (set outcome, review date, notes).
   */
  async completeReview(
    id: string,
    outcome: ProbationOutcome,
    data: {
      reviewDate?: string | null;
      performanceNotes?: string | null;
      areasOfConcern?: string | null;
      developmentPlan?: string | null;
      recommendation?: string | null;
      meetingDate?: string | null;
      meetingNotes?: string | null;
    },
    reviewerId: string | undefined,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<ProbationReviewRow | null> {
    const rows = await tx<ProbationReviewRow[]>`
      UPDATE probation_reviews
      SET
        outcome = ${outcome}::app.probation_outcome,
        review_date = COALESCE(${data.reviewDate ?? null}, CURRENT_DATE),
        reviewer_id = COALESCE(${reviewerId ?? null}, reviewer_id),
        performance_notes = COALESCE(${data.performanceNotes ?? null}, performance_notes),
        areas_of_concern = COALESCE(${data.areasOfConcern ?? null}, areas_of_concern),
        development_plan = COALESCE(${data.developmentPlan ?? null}, development_plan),
        recommendation = COALESCE(${data.recommendation ?? null}, recommendation),
        meeting_date = COALESCE(${data.meetingDate ?? null}, meeting_date),
        meeting_notes = COALESCE(${data.meetingNotes ?? null}, meeting_notes)
      WHERE id = ${id}
      RETURNING
        id, tenant_id, employee_id,
        probation_start_date, original_end_date, current_end_date,
        review_date, reviewer_id, outcome,
        extension_weeks,
        performance_notes, areas_of_concern,
        development_plan, recommendation,
        meeting_date, meeting_notes,
        created_at, updated_at
    `;
    return rows[0] ?? null;
  }

  // ===========================================================================
  // Reminder Operations
  // ===========================================================================

  /**
   * Create reminders for a probation review within an existing transaction.
   */
  async createReminders(
    ctx: TenantContext,
    reviewId: string,
    reminders: Array<{ reminderType: ReminderType; scheduledDate: string }>,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<ProbationReminderRow[]> {
    if (reminders.length === 0) return [];

    const allRows: ProbationReminderRow[] = [];
    for (const reminder of reminders) {
      const rows = await tx<ProbationReminderRow[]>`
        INSERT INTO probation_reminders (
          tenant_id, probation_review_id, reminder_type, scheduled_date
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${reviewId}::uuid,
          ${reminder.reminderType},
          ${reminder.scheduledDate}
        )
        ON CONFLICT (tenant_id, probation_review_id, reminder_type) DO NOTHING
        RETURNING
          id, tenant_id, probation_review_id,
          reminder_type, scheduled_date, sent, sent_at, created_at
      `;
      if (rows[0]) allRows.push(rows[0]);
    }
    return allRows;
  }

  /**
   * Get reminders for a probation review.
   */
  async getRemindersForReview(
    ctx: TenantContext,
    reviewId: string
  ): Promise<ProbationReminderRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      return tx<ProbationReminderRow[]>`
        SELECT
          id, tenant_id, probation_review_id,
          reminder_type, scheduled_date, sent, sent_at, created_at
        FROM probation_reminders
        WHERE probation_review_id = ${reviewId}::uuid
        ORDER BY scheduled_date ASC
      `;
    });
  }

  /**
   * Delete unsent reminders for a review (when extending or completing).
   */
  async deleteUnsentReminders(
    reviewId: string,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<number> {
    const result = await tx`
      DELETE FROM probation_reminders
      WHERE probation_review_id = ${reviewId}::uuid
        AND sent = false
    `;
    return result.count;
  }
}
