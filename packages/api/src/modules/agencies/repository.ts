/**
 * Agency Management Module - Repository Layer
 *
 * Database operations for recruitment agencies and placements.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateAgency,
  UpdateAgency,
  CreatePlacement,
  UpdatePlacement,
  AgencyFilters,
  PaginationQuery,
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

export interface AgencyRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  termsAgreed: boolean;
  feeType: string | null;
  feeAmount: string | null; // numeric comes as string
  preferred: boolean;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Aggregated
  placementsCount?: number;
}

export interface PlacementRow extends Row {
  id: string;
  tenantId: string;
  agencyId: string;
  agencyName?: string;
  candidateId: string | null;
  requisitionId: string | null;
  feeAgreed: string | null; // numeric
  feePaid: boolean;
  placementDate: Date | null;
  guaranteeEndDate: Date | null;
  createdAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class AgencyRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Agency Operations
  // ===========================================================================

  async listAgencies(
    ctx: TenantContext,
    filters: AgencyFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<AgencyRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<AgencyRow[]>`
        SELECT
          ra.id, ra.tenant_id, ra.name, ra.contact_name,
          ra.email, ra.phone, ra.website,
          ra.terms_agreed, ra.fee_type, ra.fee_amount,
          ra.preferred, ra.status, ra.notes,
          ra.created_at, ra.updated_at,
          COUNT(ap.id)::int AS placements_count
        FROM recruitment_agencies ra
        LEFT JOIN agency_placements ap ON ap.agency_id = ra.id AND ap.tenant_id = ra.tenant_id
        WHERE 1=1
          ${filters.status ? tx`AND ra.status = ${filters.status}::app.agency_status` : tx``}
          ${filters.preferred !== undefined ? tx`AND ra.preferred = ${filters.preferred}` : tx``}
          ${filters.search ? tx`AND (
            ra.name ILIKE ${"%" + filters.search + "%"}
            OR ra.contact_name ILIKE ${"%" + filters.search + "%"}
            OR ra.email ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
          ${pagination.cursor ? tx`AND ra.id > ${pagination.cursor}::uuid` : tx``}
        GROUP BY ra.id
        ORDER BY ra.name ASC, ra.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0 ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  async getAgencyById(
    ctx: TenantContext,
    id: string
  ): Promise<AgencyRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<AgencyRow[]>`
        SELECT
          ra.id, ra.tenant_id, ra.name, ra.contact_name,
          ra.email, ra.phone, ra.website,
          ra.terms_agreed, ra.fee_type, ra.fee_amount,
          ra.preferred, ra.status, ra.notes,
          ra.created_at, ra.updated_at,
          COUNT(ap.id)::int AS placements_count
        FROM recruitment_agencies ra
        LEFT JOIN agency_placements ap ON ap.agency_id = ra.id AND ap.tenant_id = ra.tenant_id
        WHERE ra.id = ${id}::uuid
        GROUP BY ra.id
      `;
    });
    return rows[0] ?? null;
  }

  async getAgencyByIdTx(
    id: string,
    tx: TransactionSql
  ): Promise<AgencyRow | null> {
    const rows = await tx<AgencyRow[]>`
      SELECT
        id, tenant_id, name, contact_name,
        email, phone, website,
        terms_agreed, fee_type, fee_amount,
        preferred, status, notes,
        created_at, updated_at
      FROM recruitment_agencies
      WHERE id = ${id}::uuid
    `;
    return rows[0] ?? null;
  }

  async createAgency(
    ctx: TenantContext,
    data: CreateAgency,
    tx: TransactionSql
  ): Promise<AgencyRow> {
    const [row] = await tx<AgencyRow[]>`
      INSERT INTO recruitment_agencies (
        tenant_id, name, contact_name, email, phone, website,
        terms_agreed, fee_type, fee_amount, preferred, notes
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.name},
        ${data.contact_name ?? null},
        ${data.email ?? null},
        ${data.phone ?? null},
        ${data.website ?? null},
        ${data.terms_agreed ?? false},
        ${data.fee_type ?? null},
        ${data.fee_amount ?? null},
        ${data.preferred ?? false},
        ${data.notes ?? null}
      )
      RETURNING
        id, tenant_id, name, contact_name,
        email, phone, website,
        terms_agreed, fee_type, fee_amount,
        preferred, status, notes,
        created_at, updated_at
    `;
    return row;
  }

  async updateAgency(
    id: string,
    data: UpdateAgency,
    tx: TransactionSql
  ): Promise<AgencyRow | null> {
    const [row] = await tx<AgencyRow[]>`
      UPDATE recruitment_agencies
      SET
        name = COALESCE(${data.name ?? null}, name),
        contact_name = CASE WHEN ${data.contact_name !== undefined} THEN ${data.contact_name ?? null} ELSE contact_name END,
        email = CASE WHEN ${data.email !== undefined} THEN ${data.email ?? null} ELSE email END,
        phone = CASE WHEN ${data.phone !== undefined} THEN ${data.phone ?? null} ELSE phone END,
        website = CASE WHEN ${data.website !== undefined} THEN ${data.website ?? null} ELSE website END,
        terms_agreed = COALESCE(${data.terms_agreed ?? null}, terms_agreed),
        fee_type = CASE WHEN ${data.fee_type !== undefined} THEN ${data.fee_type ? data.fee_type + '' : null}::app.agency_fee_type ELSE fee_type END,
        fee_amount = CASE WHEN ${data.fee_amount !== undefined} THEN ${data.fee_amount ?? null} ELSE fee_amount END,
        preferred = COALESCE(${data.preferred ?? null}, preferred),
        status = COALESCE(${data.status ? data.status + '' : null}::app.agency_status, status),
        notes = CASE WHEN ${data.notes !== undefined} THEN ${data.notes ?? null} ELSE notes END
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, name, contact_name,
        email, phone, website,
        terms_agreed, fee_type, fee_amount,
        preferred, status, notes,
        created_at, updated_at
    `;
    return row ?? null;
  }

  async deleteAgency(
    id: string,
    tx: TransactionSql
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM recruitment_agencies WHERE id = ${id}::uuid
    `;
    return result.count > 0;
  }

  // ===========================================================================
  // Placement Operations
  // ===========================================================================

  async listPlacements(
    ctx: TenantContext,
    agencyId: string,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<PlacementRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<PlacementRow[]>`
        SELECT
          ap.id, ap.tenant_id, ap.agency_id,
          ap.candidate_id, ap.requisition_id,
          ap.fee_agreed, ap.fee_paid,
          ap.placement_date, ap.guarantee_end_date,
          ap.created_at,
          ra.name AS agency_name
        FROM agency_placements ap
        JOIN recruitment_agencies ra ON ra.id = ap.agency_id AND ra.tenant_id = ap.tenant_id
        WHERE ap.agency_id = ${agencyId}::uuid
          ${pagination.cursor ? tx`AND ap.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY ap.created_at DESC, ap.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0 ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  async createPlacement(
    ctx: TenantContext,
    data: CreatePlacement,
    tx: TransactionSql
  ): Promise<PlacementRow> {
    const [row] = await tx<PlacementRow[]>`
      INSERT INTO agency_placements (
        tenant_id, agency_id, candidate_id, requisition_id,
        fee_agreed, fee_paid, placement_date, guarantee_end_date
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.agency_id}::uuid,
        ${data.candidate_id ?? null},
        ${data.requisition_id ?? null},
        ${data.fee_agreed ?? null},
        ${data.fee_paid ?? false},
        ${data.placement_date ?? null},
        ${data.guarantee_end_date ?? null}
      )
      RETURNING
        id, tenant_id, agency_id,
        candidate_id, requisition_id,
        fee_agreed, fee_paid,
        placement_date, guarantee_end_date,
        created_at
    `;
    return row;
  }

  async updatePlacement(
    placementId: string,
    data: UpdatePlacement,
    tx: TransactionSql
  ): Promise<PlacementRow | null> {
    const [row] = await tx<PlacementRow[]>`
      UPDATE agency_placements
      SET
        fee_agreed = CASE WHEN ${data.fee_agreed !== undefined} THEN ${data.fee_agreed ?? null} ELSE fee_agreed END,
        fee_paid = COALESCE(${data.fee_paid ?? null}, fee_paid),
        placement_date = CASE WHEN ${data.placement_date !== undefined} THEN ${data.placement_date ?? null}::date ELSE placement_date END,
        guarantee_end_date = CASE WHEN ${data.guarantee_end_date !== undefined} THEN ${data.guarantee_end_date ?? null}::date ELSE guarantee_end_date END
      WHERE id = ${placementId}::uuid
      RETURNING
        id, tenant_id, agency_id,
        candidate_id, requisition_id,
        fee_agreed, fee_paid,
        placement_date, guarantee_end_date,
        created_at
    `;
    return row ?? null;
  }
}
