/**
 * Reference Checks Service
 *
 * Business logic for reference check operations.
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
import { ReferenceCheckRepository, type TenantContext, type ReferenceCheck } from "./repository";

// =============================================================================
// Valid status transitions
// =============================================================================

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["sent", "failed"],
  sent: ["received"],
  received: ["verified", "failed"],
};

// =============================================================================
// Service
// =============================================================================

export class ReferenceCheckService {
  private repository: ReferenceCheckRepository;

  constructor(private db: DatabaseClient) {
    this.repository = new ReferenceCheckRepository(db);
  }

  async list(
    ctx: TenantContext,
    options: {
      cursor?: string;
      limit?: number;
      candidateId?: string;
      employeeId?: string;
      status?: string;
      search?: string;
    } = {}
  ) {
    return this.repository.list(ctx, options);
  }

  async getById(ctx: TenantContext, id: string): Promise<ServiceResult<ReferenceCheck>> {
    return withServiceErrorHandling("fetching reference check", async () => {
      const check = await this.repository.getById(ctx, id);
      if (!check) return notFound("Reference check");
      return serviceSuccess(check);
    });
  }

  async create(
    ctx: TenantContext,
    data: {
      candidateId?: string;
      employeeId?: string;
      refereeName: string;
      refereeEmail: string;
      refereePhone?: string;
      refereeRelationship: string;
      companyName?: string;
      jobTitle?: string;
      datesFrom?: string;
      datesTo?: string;
    }
  ): Promise<ServiceResult<ReferenceCheck>> {
    // Validate at least one subject
    if (!data.candidateId && !data.employeeId) {
      return serviceFailure("VALIDATION_ERROR", "Either candidateId or employeeId must be provided");
    }

    return withServiceErrorHandling("creating reference check", async () => {
      const check = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
        const result = await this.repository.create(ctx, data);

        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "reference_check",
          aggregateId: result.id,
          eventType: "recruitment.reference_check.created",
          payload: { referenceCheck: result },
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
      refereeName: string;
      refereeEmail: string;
      refereePhone: string | null;
      refereeRelationship: string;
      companyName: string | null;
      jobTitle: string | null;
      datesFrom: string | null;
      datesTo: string | null;
      referenceContent: string | null;
      verificationNotes: string | null;
      satisfactory: boolean | null;
    }>
  ): Promise<ServiceResult<ReferenceCheck>> {
    return withServiceErrorHandling("updating reference check", async () => {
      const existing = await this.repository.getById(ctx, id);
      if (!existing) return notFound("Reference check");

      const updated = await this.repository.update(ctx, id, data);
      if (!updated) {
        return serviceFailure("UPDATE_FAILED", "Failed to update reference check");
      }

      await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "reference_check",
          aggregateId: updated.id,
          eventType: "recruitment.reference_check.updated",
          payload: { oldCheck: existing, referenceCheck: updated, changes: data },
          userId: ctx.userId,
        });
      });

      return serviceSuccess(updated);
    });
  }

  async send(ctx: TenantContext, id: string): Promise<ServiceResult<ReferenceCheck>> {
    return this._transition(ctx, id, "sent", {
      sentAt: new Date().toISOString(),
    });
  }

  async verify(
    ctx: TenantContext,
    id: string,
    data: { verificationNotes?: string; satisfactory: boolean }
  ): Promise<ServiceResult<ReferenceCheck>> {
    // Must be in 'received' state to verify
    return withServiceErrorHandling("verifying reference check", async () => {
      const existing = await this.repository.getById(ctx, id);
      if (!existing) return notFound("Reference check");

      if (existing.status !== "received") {
        return serviceFailure(
          "INVALID_TRANSITION",
          `Cannot verify reference check in '${existing.status}' status. Must be 'received'.`
        );
      }

      const updated = await this.repository.updateStatus(ctx, id, "verified", {
        verifiedBy: ctx.userId,
        verificationNotes: data.verificationNotes,
        satisfactory: data.satisfactory,
      });
      if (!updated) return notFound("Reference check");

      await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "reference_check",
          aggregateId: updated.id,
          eventType: "recruitment.reference_check.verified",
          payload: { referenceCheck: updated, satisfactory: data.satisfactory },
          userId: ctx.userId,
        });
      });

      return serviceSuccess(updated);
    });
  }

  private async _transition(
    ctx: TenantContext,
    id: string,
    newStatus: string,
    extraFields?: Partial<{
      sentAt: string;
      receivedAt: string;
      verifiedBy: string;
      verificationNotes: string;
      satisfactory: boolean;
    }>
  ): Promise<ServiceResult<ReferenceCheck>> {
    return withServiceErrorHandling(`transitioning reference check to ${newStatus}`, async () => {
      const existing = await this.repository.getById(ctx, id);
      if (!existing) return notFound("Reference check");

      const allowed = VALID_TRANSITIONS[existing.status];
      if (!allowed || !allowed.includes(newStatus)) {
        return serviceFailure(
          "INVALID_TRANSITION",
          `Cannot transition from '${existing.status}' to '${newStatus}'`
        );
      }

      const updated = await this.repository.updateStatus(ctx, id, newStatus, extraFields);
      if (!updated) return notFound("Reference check");

      await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "reference_check",
          aggregateId: updated.id,
          eventType: `recruitment.reference_check.${newStatus}`,
          payload: { referenceCheck: updated, fromStatus: existing.status, toStatus: newStatus },
          userId: ctx.userId,
        });
      });

      return serviceSuccess(updated);
    });
  }
}
