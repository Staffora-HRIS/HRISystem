/**
 * Offer Letters Module - Service Layer
 *
 * Business logic for offer letter operations:
 * - Creating offer letters from templates with variable substitution
 * - Updating draft offer letters
 * - Sending offer letters to candidates
 * - Recording candidate accept/decline responses
 * - State machine enforcement (draft -> sent -> accepted/declined/expired)
 * - Domain event emission via outbox pattern
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import {
  OfferLetterRepository,
  type OfferLetterRow,
  type TenantContext,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateOfferLetter,
  UpdateOfferLetter,
  OfferLetterResponse,
  OfferLetterFilters,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Service
// =============================================================================

export class OfferLetterService {
  constructor(
    private repository: OfferLetterRepository,
    private db: DatabaseClient
  ) {}

  // ---------------------------------------------------------------------------
  // Domain Event Emission
  // ---------------------------------------------------------------------------

  private async emitEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        'offer_letter',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: ctx.userId })}::jsonb,
        now()
      )
    `;
  }

  // ---------------------------------------------------------------------------
  // Template Rendering
  // ---------------------------------------------------------------------------

  /**
   * Replace {{key}} placeholders in a template string with provided values.
   * Unresolved placeholders are left as-is.
   */
  private renderTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      return values[key] !== undefined ? values[key] : `{{${key}}}`;
    });
  }

  // ---------------------------------------------------------------------------
  // Create Offer Letter
  // ---------------------------------------------------------------------------

  async createOfferLetter(
    ctx: TenantContext,
    data: CreateOfferLetter
  ): Promise<ServiceResult<OfferLetterResponse>> {
    // Resolve content: either from template or from provided content
    let finalContent = data.content || "";
    let templateVariables: Record<string, string> = data.templateVariables || {};

    if (data.templateId) {
      // Fetch template
      const templateRows = await this.db.withTransaction(ctx, async (tx) => {
        return tx<{ bodyTemplate: string; active: boolean; subject: string | null }[]>`
          SELECT body_template, active, subject
          FROM app.letter_templates
          WHERE id = ${data.templateId}::uuid
        `;
      });

      const template = templateRows[0];
      if (!template) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Letter template not found",
            details: { templateId: data.templateId },
          },
        };
      }

      if (!template.active) {
        return {
          success: false,
          error: {
            code: "TEMPLATE_INACTIVE",
            message: "Cannot use an inactive letter template",
            details: { templateId: data.templateId },
          },
        };
      }

      // Fetch candidate/requisition data for auto-population
      const autoData = await this.repository.getCandidateDataForRendering(
        ctx,
        data.candidateId,
        data.requisitionId
      );

      if (!autoData) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Candidate or requisition not found",
            details: { candidateId: data.candidateId, requisitionId: data.requisitionId },
          },
        };
      }

      // Merge: auto-resolved values + offer-specific values + explicit overrides
      templateVariables = {
        ...autoData,
        salary: String(data.salaryOffered),
        start_date: data.startDate,
        ...data.templateVariables,
      };

      finalContent = this.renderTemplate(template.bodyTemplate, templateVariables);
    } else if (!data.content) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Either templateId or content must be provided",
        },
      };
    }

    // Validate candidate exists
    const candidateCheck = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ id: string }[]>`
        SELECT id FROM app.candidates WHERE id = ${data.candidateId}::uuid
      `;
    });

    if (candidateCheck.length === 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Candidate not found",
          details: { candidateId: data.candidateId },
        },
      };
    }

    // Validate requisition exists
    const requisitionCheck = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ id: string }[]>`
        SELECT id FROM app.requisitions WHERE id = ${data.requisitionId}::uuid
      `;
    });

    if (requisitionCheck.length === 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Requisition not found",
          details: { requisitionId: data.requisitionId },
        },
      };
    }

    // Create in transaction with outbox event
    const result = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const offerLetter = await this.repository.create(tx, ctx, {
        candidateId: data.candidateId,
        requisitionId: data.requisitionId,
        templateId: data.templateId || null,
        content: finalContent,
        salaryOffered: data.salaryOffered,
        startDate: data.startDate,
        expiresAt: data.expiresAt || null,
        templateVariables,
        createdBy: ctx.userId || null,
      });

      await this.emitEvent(tx, ctx, offerLetter.id, "recruitment.offer_letter.created", {
        offerLetterId: offerLetter.id,
        candidateId: data.candidateId,
        requisitionId: data.requisitionId,
        templateId: data.templateId || null,
      });

      return offerLetter;
    });

    return {
      success: true,
      data: this.mapToResponse(result),
    };
  }

  // ---------------------------------------------------------------------------
  // Get Offer Letter
  // ---------------------------------------------------------------------------

  async getOfferLetter(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<OfferLetterResponse>> {
    const offerLetter = await this.repository.findById(ctx, id);

    if (!offerLetter) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Offer letter not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapToResponse(offerLetter),
    };
  }

  // ---------------------------------------------------------------------------
  // List Offer Letters
  // ---------------------------------------------------------------------------

  async listOfferLetters(
    ctx: TenantContext,
    filters: OfferLetterFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<OfferLetterResponse>> {
    const result = await this.repository.list(ctx, {
      cursor: pagination.cursor,
      limit: pagination.limit,
      candidateId: filters.candidateId,
      requisitionId: filters.requisitionId,
      status: filters.status,
      search: filters.search,
    });

    return {
      items: result.items.map(this.mapToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ---------------------------------------------------------------------------
  // Update Draft Offer Letter
  // ---------------------------------------------------------------------------

  async updateOfferLetter(
    ctx: TenantContext,
    id: string,
    data: UpdateOfferLetter
  ): Promise<ServiceResult<OfferLetterResponse>> {
    // Verify it exists
    const existing = await this.repository.findById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Offer letter not found",
          details: { id },
        },
      };
    }

    if (existing.status !== "draft") {
      return {
        success: false,
        error: {
          code: "STATE_MACHINE_VIOLATION",
          message: "Only draft offer letters can be updated",
          details: { currentStatus: existing.status },
        },
      };
    }

    const result = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const updated = await this.repository.update(tx, id, {
        content: data.content,
        salaryOffered: data.salaryOffered,
        startDate: data.startDate,
        expiresAt: data.expiresAt,
        templateVariables: data.templateVariables,
      });

      if (!updated) {
        return null;
      }

      await this.emitEvent(tx, ctx, id, "recruitment.offer_letter.updated", {
        offerLetterId: id,
        changes: data,
      });

      return updated;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: "STATE_MACHINE_VIOLATION",
          message: "Only draft offer letters can be updated",
          details: { id },
        },
      };
    }

    // Re-fetch with joins
    const refreshed = await this.repository.findById(ctx, id);
    return {
      success: true,
      data: this.mapToResponse(refreshed || result),
    };
  }

  // ---------------------------------------------------------------------------
  // Send Offer Letter (draft -> sent)
  // ---------------------------------------------------------------------------

  async sendOfferLetter(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<OfferLetterResponse>> {
    const existing = await this.repository.findById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Offer letter not found",
          details: { id },
        },
      };
    }

    if (existing.status !== "draft") {
      return {
        success: false,
        error: {
          code: "STATE_MACHINE_VIOLATION",
          message: `Cannot send offer letter with status '${existing.status}'; must be 'draft'`,
          details: { currentStatus: existing.status, allowedFrom: ["draft"] },
        },
      };
    }

    const result = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const sent = await this.repository.markSent(tx, id);

      if (!sent) {
        throw new Error("Failed to mark offer letter as sent");
      }

      await this.emitEvent(tx, ctx, id, "recruitment.offer_letter.sent", {
        offerLetterId: id,
        candidateId: existing.candidateId,
        requisitionId: existing.requisitionId,
      });

      return sent;
    });

    const refreshed = await this.repository.findById(ctx, id);
    return {
      success: true,
      data: this.mapToResponse(refreshed || result),
    };
  }

  // ---------------------------------------------------------------------------
  // Accept Offer Letter (sent -> accepted)
  // ---------------------------------------------------------------------------

  async acceptOfferLetter(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<OfferLetterResponse>> {
    const existing = await this.repository.findById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Offer letter not found",
          details: { id },
        },
      };
    }

    if (existing.status !== "sent") {
      return {
        success: false,
        error: {
          code: "STATE_MACHINE_VIOLATION",
          message: `Cannot accept offer letter with status '${existing.status}'; must be 'sent'`,
          details: { currentStatus: existing.status, allowedFrom: ["sent"] },
        },
      };
    }

    // Check if offer has expired
    if (existing.expiresAt && new Date(existing.expiresAt) < new Date()) {
      return {
        success: false,
        error: {
          code: "STATE_MACHINE_VIOLATION",
          message: "Cannot accept an expired offer letter",
          details: { expiresAt: existing.expiresAt },
        },
      };
    }

    const result = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const accepted = await this.repository.markAccepted(tx, id);

      if (!accepted) {
        throw new Error("Failed to mark offer letter as accepted");
      }

      await this.emitEvent(tx, ctx, id, "recruitment.offer_letter.accepted", {
        offerLetterId: id,
        candidateId: existing.candidateId,
        requisitionId: existing.requisitionId,
        salaryOffered: existing.salaryOffered,
        startDate: existing.startDate,
      });

      return accepted;
    });

    const refreshed = await this.repository.findById(ctx, id);
    return {
      success: true,
      data: this.mapToResponse(refreshed || result),
    };
  }

  // ---------------------------------------------------------------------------
  // Decline Offer Letter (sent -> declined)
  // ---------------------------------------------------------------------------

  async declineOfferLetter(
    ctx: TenantContext,
    id: string,
    reason?: string
  ): Promise<ServiceResult<OfferLetterResponse>> {
    const existing = await this.repository.findById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Offer letter not found",
          details: { id },
        },
      };
    }

    if (existing.status !== "sent") {
      return {
        success: false,
        error: {
          code: "STATE_MACHINE_VIOLATION",
          message: `Cannot decline offer letter with status '${existing.status}'; must be 'sent'`,
          details: { currentStatus: existing.status, allowedFrom: ["sent"] },
        },
      };
    }

    const result = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const declined = await this.repository.markDeclined(tx, id, reason);

      if (!declined) {
        throw new Error("Failed to mark offer letter as declined");
      }

      await this.emitEvent(tx, ctx, id, "recruitment.offer_letter.declined", {
        offerLetterId: id,
        candidateId: existing.candidateId,
        requisitionId: existing.requisitionId,
        reason: reason || null,
      });

      return declined;
    });

    const refreshed = await this.repository.findById(ctx, id);
    return {
      success: true,
      data: this.mapToResponse(refreshed || result),
    };
  }

  // ---------------------------------------------------------------------------
  // Response mapper
  // ---------------------------------------------------------------------------

  private mapToResponse = (row: OfferLetterRow): OfferLetterResponse => {
    const toStr = (val: unknown): string | null => {
      if (val === null || val === undefined) return null;
      if (val instanceof Date) return val.toISOString();
      return String(val);
    };

    return {
      id: row.id,
      tenantId: row.tenantId,
      candidateId: row.candidateId,
      requisitionId: row.requisitionId,
      templateId: row.templateId || null,
      content: row.content,
      salaryOffered: Number(row.salaryOffered),
      startDate: toStr(row.startDate) || "",
      status: row.status,
      sentAt: toStr(row.sentAt),
      respondedAt: toStr(row.respondedAt),
      expiresAt: toStr(row.expiresAt),
      declineReason: row.declineReason || null,
      templateVariables: (row.templateVariables || {}) as Record<string, string>,
      createdBy: row.createdBy || null,
      createdAt: toStr(row.createdAt) || "",
      updatedAt: toStr(row.updatedAt) || "",
      candidateName: row.candidateName,
      requisitionTitle: row.requisitionTitle,
    };
  };
}
