/**
 * Agency Management Module - Service Layer
 *
 * Business logic for recruitment agency and placement management.
 * Emits domain events via the outbox pattern for all mutations.
 */

import type { DatabaseClient } from "../../plugins/db";
import {
  AgencyRepository,
  type AgencyRow,
  type PlacementRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { emitDomainEvent } from "../../lib/outbox";
import type {
  CreateAgency,
  UpdateAgency,
  CreatePlacement,
  UpdatePlacement,
  AgencyFilters,
  AgencyResponse,
  PlacementResponse,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Mappers
// =============================================================================

function formatDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d);
}

function mapAgencyToResponse(row: AgencyRow): AgencyResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    name: row.name,
    contact_name: row.contactName,
    email: row.email,
    phone: row.phone,
    website: row.website,
    terms_agreed: row.termsAgreed,
    fee_type: row.feeType as AgencyResponse["fee_type"],
    fee_amount: row.feeAmount ? Number(row.feeAmount) : null,
    preferred: row.preferred,
    status: row.status as AgencyResponse["status"],
    notes: row.notes,
    placements_count: row.placementsCount,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function mapPlacementToResponse(row: PlacementRow): PlacementResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    agency_id: row.agencyId,
    agency_name: row.agencyName,
    candidate_id: row.candidateId,
    requisition_id: row.requisitionId,
    fee_agreed: row.feeAgreed ? Number(row.feeAgreed) : null,
    fee_paid: row.feePaid,
    placement_date: formatDate(row.placementDate),
    guarantee_end_date: formatDate(row.guaranteeEndDate),
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

// =============================================================================
// Service
// =============================================================================

export class AgencyService {
  constructor(
    private repository: AgencyRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Agency Operations
  // ===========================================================================

  async listAgencies(
    ctx: TenantContext,
    filters: AgencyFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<AgencyResponse>> {
    const result = await this.repository.listAgencies(ctx, filters, pagination);
    return {
      items: result.items.map(mapAgencyToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getAgency(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<AgencyResponse>> {
    const agency = await this.repository.getAgencyById(ctx, id);
    if (!agency) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Agency not found", details: { id } },
      };
    }
    return { success: true, data: mapAgencyToResponse(agency) };
  }

  async createAgency(
    ctx: TenantContext,
    data: CreateAgency
  ): Promise<ServiceResult<AgencyResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const agency = await this.repository.createAgency(ctx, data, tx);

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "recruitment_agency",
        aggregateId: agency.id,
        eventType: "agency.created",
        payload: { agency: mapAgencyToResponse(agency) },
        userId: ctx.userId,
      });

      return { success: true, data: mapAgencyToResponse(agency) };
    });
  }

  async updateAgency(
    ctx: TenantContext,
    id: string,
    data: UpdateAgency
  ): Promise<ServiceResult<AgencyResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getAgencyByIdTx(id, tx);
      if (!existing) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Agency not found", details: { id } },
        };
      }

      const updated = await this.repository.updateAgency(id, data, tx);
      if (!updated) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Failed to update agency" },
        };
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "recruitment_agency",
        aggregateId: id,
        eventType: "agency.updated",
        payload: { agency: mapAgencyToResponse(updated), changes: data },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapAgencyToResponse(updated) };
    });
  }

  async deleteAgency(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getAgencyByIdTx(id, tx);
      if (!existing) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Agency not found", details: { id } },
        };
      }

      const deleted = await this.repository.deleteAgency(id, tx);

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "recruitment_agency",
        aggregateId: id,
        eventType: "agency.deleted",
        payload: { agencyId: id },
        userId: ctx.userId,
      });

      return { success: true as const, data: { deleted } };
    });
  }

  // ===========================================================================
  // Placement Operations
  // ===========================================================================

  async listPlacements(
    ctx: TenantContext,
    agencyId: string,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<PlacementResponse>> {
    const result = await this.repository.listPlacements(ctx, agencyId, pagination);
    return {
      items: result.items.map(mapPlacementToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async createPlacement(
    ctx: TenantContext,
    data: CreatePlacement
  ): Promise<ServiceResult<PlacementResponse>> {
    // Verify agency exists
    const agency = await this.repository.getAgencyById(ctx, data.agency_id);
    if (!agency) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Agency not found", details: { agency_id: data.agency_id } },
      };
    }

    if (agency.status === "blacklisted") {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Cannot create placement with a blacklisted agency",
          details: { agency_id: data.agency_id, status: agency.status },
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      const placement = await this.repository.createPlacement(ctx, data, tx);

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "agency_placement",
        aggregateId: placement.id,
        eventType: "agency.placement.created",
        payload: { placement: mapPlacementToResponse(placement), agencyId: data.agency_id },
        userId: ctx.userId,
      });

      return { success: true, data: mapPlacementToResponse(placement) };
    });
  }

  async updatePlacement(
    ctx: TenantContext,
    placementId: string,
    data: UpdatePlacement
  ): Promise<ServiceResult<PlacementResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const updated = await this.repository.updatePlacement(placementId, data, tx);
      if (!updated) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Placement not found", details: { placementId } },
        };
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "agency_placement",
        aggregateId: placementId,
        eventType: "agency.placement.updated",
        payload: { placement: mapPlacementToResponse(updated), changes: data },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapPlacementToResponse(updated) };
    });
  }
}
