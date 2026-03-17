/**
 * Recognition Module - Service Layer
 *
 * Business logic for peer recognition.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { emitDomainEvent } from "../../lib/outbox";
import {
  withServiceErrorHandling,
  serviceSuccess,
  serviceFailure,
  type ServiceResult,
} from "../../lib/service-errors";
import { RecognitionRepository, type TenantContext } from "./repository";
import type {
  CreateRecognition,
  RecognitionResponse,
  LeaderboardResponse,
} from "./schemas";

export class RecognitionService {
  constructor(
    private repository: RecognitionRepository,
    private db: DatabaseClient
  ) {}

  /**
   * List recognitions with optional filters and cursor-based pagination.
   */
  async list(
    ctx: TenantContext,
    filters: {
      category?: string;
      visibility?: string;
      toEmployeeId?: string;
      fromEmployeeId?: string;
      cursor?: string;
      limit?: number;
    }
  ): Promise<ServiceResult<{ items: RecognitionResponse[]; nextCursor: string | null; hasMore: boolean }>> {
    return withServiceErrorHandling("listing recognitions", async () => {
      const limit = Math.min(Math.max(filters.limit || 20, 1), 100);
      const result = await this.repository.list(ctx, { ...filters, limit });
      return serviceSuccess({
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.nextCursor !== null,
      });
    });
  }

  /**
   * Give recognition to a colleague.
   */
  async create(
    ctx: TenantContext,
    fromEmployeeId: string,
    data: CreateRecognition
  ): Promise<ServiceResult<RecognitionResponse>> {
    return withServiceErrorHandling("creating recognition", async () => {
      // Prevent self-recognition (also enforced at DB level)
      if (fromEmployeeId === data.toEmployeeId) {
        return serviceFailure("VALIDATION_ERROR", "You cannot recognise yourself");
      }

      const recognition = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.create(ctx, fromEmployeeId, data, tx);

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "recognition",
            aggregateId: result.id,
            eventType: "recognition.given",
            payload: {
              recognition: result,
              fromEmployeeId,
              toEmployeeId: data.toEmployeeId,
              category: data.category,
            },
            userId: ctx.userId,
          });

          return result;
        }
      );

      return serviceSuccess(recognition);
    });
  }

  /**
   * Get the leaderboard of most-recognised employees.
   */
  async getLeaderboard(
    ctx: TenantContext,
    days: number = 30,
    limit: number = 10
  ): Promise<ServiceResult<LeaderboardResponse>> {
    return withServiceErrorHandling("fetching recognition leaderboard", async () => {
      const clampedDays = Math.min(Math.max(days, 1), 365);
      const clampedLimit = Math.min(Math.max(limit, 1), 50);
      const entries = await this.repository.getLeaderboard(ctx, clampedDays, clampedLimit);
      return serviceSuccess({
        entries,
        period: `last_${clampedDays}_days`,
      });
    });
  }
}
