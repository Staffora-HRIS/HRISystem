/**
 * DBS Checks Service
 *
 * Business logic for DBS (Disclosure and Barring Service) check operations.
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
import { DbsCheckRepository, type TenantContext, type DbsCheck } from "./repository";

// =============================================================================
// Valid status transitions
// =============================================================================

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["submitted"],
  submitted: ["received"],
  received: ["clear", "flagged"],
  clear: ["expired"],
  flagged: ["expired"],
};

// =============================================================================
// Service
// =============================================================================

export class DbsCheckService {
  private repository: DbsCheckRepository;

  constructor(private db: DatabaseClient) {
    this.repository = new DbsCheckRepository(db);
  }

  async list(
    ctx: TenantContext,
    options: {
      cursor?: string;
      limit?: number;
      employeeId?: string;
      status?: string;
      checkLevel?: string;
      search?: string;
    } = {}
  ) {
    return this.repository.list(ctx, options);
  }

  async getById(ctx: TenantContext, id: string): Promise<ServiceResult<DbsCheck>> {
    return withServiceErrorHandling("fetching DBS check", async () => {
      const check = await this.repository.getById(ctx, id);
      if (!check) return notFound("DBS check");
      return serviceSuccess(check);
    });
  }

  async create(
    ctx: TenantContext,
    data: {
      employeeId: string;
      checkLevel: string;
      notes?: string;
    }
  ): Promise<ServiceResult<DbsCheck>> {
    return withServiceErrorHandling("creating DBS check", async () => {
      const check = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
        const result = await this.repository.create(ctx, data);

        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "dbs_check",
          aggregateId: result.id,
          eventType: "recruitment.dbs_check.created",
          payload: { dbsCheck: result },
          userId: ctx.userId,
        });

        return result;
      });

      return serviceSuccess(check);
    });
  }

  async update(
    ctx: TenantContext,
    id: string,
    data: Partial<{
      checkLevel: string;
      certificateNumber: string | null;
      issueDate: string | null;
      dbsUpdateServiceRegistered: boolean;
      updateServiceId: string | null;
      result: string | null;
      expiryDate: string | null;
      notes: string | null;
    }>
  ): Promise<ServiceResult<DbsCheck>> {
    return withServiceErrorHandling("updating DBS check", async () => {
      const existing = await this.repository.getById(ctx, id);
      if (!existing) return notFound("DBS check");

      const updated = await this.repository.update(ctx, id, data);
      if (!updated) {
        return serviceFailure("UPDATE_FAILED", "Failed to update DBS check");
      }

      await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "dbs_check",
          aggregateId: updated.id,
          eventType: "recruitment.dbs_check.updated",
          payload: { oldCheck: existing, dbsCheck: updated, changes: data },
          userId: ctx.userId,
        });
      });

      return serviceSuccess(updated);
    });
  }

  async submit(
    ctx: TenantContext,
    id: string,
    data?: { certificateNumber?: string; notes?: string }
  ): Promise<ServiceResult<DbsCheck>> {
    return withServiceErrorHandling("submitting DBS check", async () => {
      const existing = await this.repository.getById(ctx, id);
      if (!existing) return notFound("DBS check");

      const allowed = VALID_TRANSITIONS[existing.status];
      if (!allowed || !allowed.includes("submitted")) {
        return serviceFailure(
          "INVALID_TRANSITION",
          `Cannot submit DBS check in '${existing.status}' status`
        );
      }

      const updated = await this.repository.updateStatus(ctx, id, "submitted", {
        certificateNumber: data?.certificateNumber,
      });
      if (!updated) return notFound("DBS check");

      await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "dbs_check",
          aggregateId: updated.id,
          eventType: "recruitment.dbs_check.submitted",
          payload: { dbsCheck: updated, fromStatus: existing.status },
          userId: ctx.userId,
        });
      });

      return serviceSuccess(updated);
    });
  }

  async recordResult(
    ctx: TenantContext,
    id: string,
    data: {
      certificateNumber: string;
      issueDate: string;
      result?: string;
      expiryDate?: string;
      dbsUpdateServiceRegistered?: boolean;
      updateServiceId?: string;
      clear: boolean;
    }
  ): Promise<ServiceResult<DbsCheck>> {
    return withServiceErrorHandling("recording DBS result", async () => {
      const existing = await this.repository.getById(ctx, id);
      if (!existing) return notFound("DBS check");

      // Must be in submitted or received state
      if (existing.status !== "submitted" && existing.status !== "received") {
        return serviceFailure(
          "INVALID_TRANSITION",
          `Cannot record result for DBS check in '${existing.status}' status. Must be 'submitted' or 'received'.`
        );
      }

      const newStatus = data.clear ? "clear" : "flagged";

      const updated = await this.repository.updateStatus(ctx, id, newStatus, {
        certificateNumber: data.certificateNumber,
        issueDate: data.issueDate,
        result: data.result,
        expiryDate: data.expiryDate,
        dbsUpdateServiceRegistered: data.dbsUpdateServiceRegistered,
        updateServiceId: data.updateServiceId,
        checkedBy: ctx.userId,
      });
      if (!updated) return notFound("DBS check");

      await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "dbs_check",
          aggregateId: updated.id,
          eventType: `recruitment.dbs_check.result_recorded`,
          payload: {
            dbsCheck: updated,
            fromStatus: existing.status,
            toStatus: newStatus,
            clear: data.clear,
          },
          userId: ctx.userId,
        });
      });

      return serviceSuccess(updated);
    });
  }
}
