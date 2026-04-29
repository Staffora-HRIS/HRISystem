/**
 * Suspensions Module - Service Layer
 *
 * Business logic for employee suspension management during disciplinary cases.
 *
 * UK Employment Law Context:
 * - Suspensions should normally be on full pay pending investigation
 *   (ACAS Guide: Discipline and Grievances at Work)
 * - Unpaid suspension requires contractual authority and should be rare
 * - Suspensions must be reviewed regularly to avoid becoming indefinite
 * - The employer must have reasonable grounds to believe suspension is necessary
 * - Suspension should be as brief as possible
 *
 * Business Rules:
 * 1. Default suspension type is with_pay (UK best practice)
 * 2. Only one active suspension per employee at a time (DB enforced)
 * 3. Suspensions should have review dates set
 * 4. A suspension can be lifted (ended early) or expire naturally
 * 5. Extending a suspension updates the end_date
 * 6. Reviews are recorded with notes and optional next review date
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { emitDomainEvent } from "../../lib/outbox";
import { SuspensionsRepository } from "./repository";
import type { TenantContext, ServiceResult, PaginatedServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateSuspension,
  LiftSuspension,
  ExtendSuspension,
  ReviewSuspension,
  SuspensionResponse,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/** Default review interval in days if no review date is set */
const DEFAULT_REVIEW_INTERVAL_DAYS = 14;

// =============================================================================
// Service
// =============================================================================

export class SuspensionsService {
  constructor(
    private repository: SuspensionsRepository,
    private db: DatabaseClient
  ) {}

  // ---------------------------------------------------------------------------
  // Create Suspension
  // ---------------------------------------------------------------------------

  async createSuspension(
    ctx: TenantContext,
    data: CreateSuspension
  ): Promise<ServiceResult<SuspensionResponse>> {
    // Validate dates
    if (data.endDate && data.endDate < data.startDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "End date must be on or after start date",
          details: { startDate: data.startDate, endDate: data.endDate },
        },
      };
    }

    if (data.reviewDate && data.reviewDate < data.startDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Review date must be on or after start date",
          details: { startDate: data.startDate, reviewDate: data.reviewDate },
        },
      };
    }

    // Check for existing active suspension
    const existingActive = await this.repository.getActiveSuspensionForEmployee(
      ctx,
      data.employeeId
    );
    if (existingActive) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Employee already has an active suspension. Lift or expire the current suspension before creating a new one.",
          details: {
            existingSuspensionId: existingActive.id,
            existingStartDate: existingActive.startDate,
          },
        },
      };
    }

    // Default to with_pay per UK best practice
    const suspensionType = data.suspensionType || "with_pay";

    // If no review date set, default to 2 weeks from start
    let reviewDate = data.reviewDate;
    if (!reviewDate) {
      const start = new Date(data.startDate);
      start.setDate(start.getDate() + DEFAULT_REVIEW_INTERVAL_DAYS);
      reviewDate = start.toISOString().split("T")[0];
    }

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const suspension = await this.repository.createSuspension(tx, ctx, {
            employeeId: data.employeeId,
            caseId: data.caseId,
            suspensionType,
            startDate: data.startDate,
            endDate: data.endDate,
            reason: data.reason,
            authorizedBy: data.authorizedBy,
            reviewDate,
          });

          // Emit domain event
          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "employee_suspension",
            aggregateId: suspension.id,
            eventType: "cases.suspension.created",
            payload: {
              suspensionId: suspension.id,
              employeeId: data.employeeId,
              caseId: data.caseId || null,
              suspensionType,
              startDate: data.startDate,
              endDate: data.endDate || null,
              reviewDate,
            },
            userId: ctx.userId,
          });

          return suspension;
        }
      );

      return { success: true, data: result };
    } catch (error) {
      // Handle unique constraint violation (concurrent request)
      if (error instanceof Error && error.message.includes("idx_employee_suspensions_one_active_per_employee")) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Employee already has an active suspension",
          },
        };
      }

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to create suspension",
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Get Suspension
  // ---------------------------------------------------------------------------

  async getSuspension(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<SuspensionResponse>> {
    const suspension = await this.repository.getSuspensionById(ctx, id);
    if (!suspension) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Suspension not found",
        },
      };
    }

    return { success: true, data: suspension };
  }

  // ---------------------------------------------------------------------------
  // List Suspensions
  // ---------------------------------------------------------------------------

  async listSuspensions(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      caseId?: string;
      status?: string;
    },
    pagination: { cursor?: string; limit?: number }
  ): Promise<PaginatedServiceResult<SuspensionResponse>> {
    const limit = Math.min(pagination.limit || 25, 100);

    return this.repository.listSuspensions(ctx, filters, {
      cursor: pagination.cursor,
      limit,
    });
  }

  // ---------------------------------------------------------------------------
  // Lift Suspension
  // ---------------------------------------------------------------------------

  async liftSuspension(
    ctx: TenantContext,
    id: string,
    data: LiftSuspension
  ): Promise<ServiceResult<SuspensionResponse>> {
    const existing = await this.repository.getSuspensionById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Suspension not found",
        },
      };
    }

    if (existing.status !== "active") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot lift a suspension with status '${existing.status}'. Only active suspensions can be lifted.`,
        },
      };
    }

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const updated = await this.repository.liftSuspension(tx, ctx, id, {
            liftedReason: data.reason,
          });

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "employee_suspension",
            aggregateId: id,
            eventType: "cases.suspension.lifted",
            payload: {
              suspensionId: id,
              employeeId: existing.employeeId,
              caseId: existing.caseId,
              liftedReason: data.reason,
              durationDays: this.calculateDurationDays(existing.startDate),
            },
            userId: ctx.userId,
          });

          return updated;
        }
      );

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to lift suspension",
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Extend Suspension
  // ---------------------------------------------------------------------------

  async extendSuspension(
    ctx: TenantContext,
    id: string,
    data: ExtendSuspension
  ): Promise<ServiceResult<SuspensionResponse>> {
    const existing = await this.repository.getSuspensionById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Suspension not found",
        },
      };
    }

    if (existing.status !== "active") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot extend a suspension with status '${existing.status}'. Only active suspensions can be extended.`,
        },
      };
    }

    // New end date must be after start date
    if (data.endDate < existing.startDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "New end date must be on or after the suspension start date",
          details: { startDate: existing.startDate, newEndDate: data.endDate },
        },
      };
    }

    // If suspension already has an end date, new one must be later
    if (existing.endDate && data.endDate <= existing.endDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "New end date must be after the current end date to extend a suspension",
          details: { currentEndDate: existing.endDate, newEndDate: data.endDate },
        },
      };
    }

    // Review date validation
    if (data.reviewDate && data.reviewDate < existing.startDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Review date must be on or after the suspension start date",
        },
      };
    }

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const updated = await this.repository.extendSuspension(tx, ctx, id, {
            endDate: data.endDate,
            reviewDate: data.reviewDate,
          });

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "employee_suspension",
            aggregateId: id,
            eventType: "cases.suspension.extended",
            payload: {
              suspensionId: id,
              employeeId: existing.employeeId,
              caseId: existing.caseId,
              previousEndDate: existing.endDate,
              newEndDate: data.endDate,
              extensionReason: data.reason || null,
            },
            userId: ctx.userId,
          });

          return updated;
        }
      );

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to extend suspension",
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Review Suspension
  // ---------------------------------------------------------------------------

  async reviewSuspension(
    ctx: TenantContext,
    id: string,
    data: ReviewSuspension
  ): Promise<ServiceResult<SuspensionResponse>> {
    const existing = await this.repository.getSuspensionById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Suspension not found",
        },
      };
    }

    if (existing.status !== "active") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot review a suspension with status '${existing.status}'. Only active suspensions can be reviewed.`,
        },
      };
    }

    // Default next review date to 2 weeks from now if not provided
    let nextReviewDate = data.nextReviewDate;
    if (!nextReviewDate) {
      const next = new Date();
      next.setDate(next.getDate() + DEFAULT_REVIEW_INTERVAL_DAYS);
      nextReviewDate = next.toISOString().split("T")[0];
    }

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const updated = await this.repository.recordReview(tx, ctx, id, {
            reviewNotes: data.reviewNotes,
            nextReviewDate,
          });

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "employee_suspension",
            aggregateId: id,
            eventType: "cases.suspension.reviewed",
            payload: {
              suspensionId: id,
              employeeId: existing.employeeId,
              caseId: existing.caseId,
              nextReviewDate,
              durationDays: this.calculateDurationDays(existing.startDate),
            },
            userId: ctx.userId,
          });

          return updated;
        }
      );

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to record suspension review",
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private calculateDurationDays(startDateStr: string): number {
    const start = new Date(startDateStr);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }
}
