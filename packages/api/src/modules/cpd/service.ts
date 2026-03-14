/**
 * CPD Module - Service Layer
 *
 * Business logic for CPD record management.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { emitDomainEvent } from "../../lib/outbox";
import {
  withServiceErrorHandling,
  notFound,
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "../../lib/service-errors";
import {
  CpdRepository,
  type TenantContext,
  type PaginationParams,
} from "./repository";
import type {
  CreateCpdRecord,
  UpdateCpdRecord,
  CpdRecordResponse,
} from "./schemas";

export class CpdService {
  constructor(
    private repository: CpdRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  async listRecords(
    ctx: TenantContext,
    filters: { employeeId?: string; activityType?: string; verified?: boolean },
    pagination: PaginationParams
  ) {
    return this.repository.listRecords(ctx, filters, pagination);
  }

  async getRecord(ctx: TenantContext, id: string): Promise<ServiceResult<CpdRecordResponse>> {
    return withServiceErrorHandling("fetching CPD record", async () => {
      const record = await this.repository.getRecordById(ctx, id);
      if (!record) return notFound("CPD record");
      return serviceSuccess(record);
    });
  }

  async createRecord(
    ctx: TenantContext,
    data: CreateCpdRecord
  ): Promise<ServiceResult<CpdRecordResponse>> {
    return withServiceErrorHandling("creating CPD record", async () => {
      const record = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createRecord(ctx, data, tx);

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "cpd_record",
            aggregateId: result.id,
            eventType: "lms.cpd_record.created",
            payload: { record: result },
            userId: ctx.userId,
          });

          return result;
        }
      );

      return serviceSuccess(record);
    });
  }

  async updateRecord(
    ctx: TenantContext,
    id: string,
    data: UpdateCpdRecord
  ): Promise<ServiceResult<CpdRecordResponse>> {
    return withServiceErrorHandling("updating CPD record", async () => {
      const existing = await this.repository.getRecordById(ctx, id);
      if (!existing) return notFound("CPD record");

      if (existing.verified) {
        return serviceFailure("CPD_ALREADY_VERIFIED", "Cannot update a verified CPD record");
      }

      const record = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateRecord(ctx, id, data, tx);
          if (!result) return null;

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "cpd_record",
            aggregateId: id,
            eventType: "lms.cpd_record.updated",
            payload: { record: result, previousValues: existing },
            userId: ctx.userId,
          });

          return result;
        }
      );

      if (!record) return notFound("CPD record");
      return serviceSuccess(record);
    });
  }

  async verifyRecord(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<CpdRecordResponse>> {
    return withServiceErrorHandling("verifying CPD record", async () => {
      const existing = await this.repository.getRecordById(ctx, id);
      if (!existing) return notFound("CPD record");

      if (existing.verified) {
        return serviceFailure("CPD_ALREADY_VERIFIED", "CPD record is already verified");
      }

      const record = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.verifyRecord(ctx, id, ctx.userId || "", tx);
          if (!result) return null;

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "cpd_record",
            aggregateId: id,
            eventType: "lms.cpd_record.verified",
            payload: { record: result, verifiedBy: ctx.userId },
            userId: ctx.userId,
          });

          return result;
        }
      );

      if (!record) return notFound("CPD record");
      return serviceSuccess(record);
    });
  }

  async deleteRecord(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<boolean>> {
    return withServiceErrorHandling("deleting CPD record", async () => {
      const existing = await this.repository.getRecordById(ctx, id);
      if (!existing) return notFound("CPD record");

      if (existing.verified) {
        return serviceFailure("CPD_ALREADY_VERIFIED", "Cannot delete a verified CPD record");
      }

      const deleted = await this.repository.deleteRecord(ctx, id);
      return serviceSuccess(deleted);
    });
  }
}
