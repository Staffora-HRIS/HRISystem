/**
 * Beneficiary Nominations Module - Repository Layer
 *
 * Provides data access methods for beneficiary nomination entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateBeneficiaryNomination,
  UpdateBeneficiaryNomination,
  NominationFilters,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Database row type for beneficiary nominations
 */
export interface BeneficiaryNominationRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  benefitType: string;
  beneficiaryName: string;
  relationship: string;
  dateOfBirth: Date | null;
  percentage: string; // numeric comes back as string from postgres.js
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Percentage sum per benefit type
 */
export interface PercentageSumRow {
  benefitType: string;
  totalPercentage: string; // numeric from postgres
  nominationCount: string; // count from postgres
}

// =============================================================================
// Repository
// =============================================================================

export class BeneficiaryNominationRepository {
  constructor(private db: DatabaseClient) {}

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /**
   * List beneficiary nominations for an employee with cursor-based pagination.
   * Optionally filter by benefit_type.
   */
  async listByEmployee(
    context: TenantContext,
    employeeId: string,
    filters: NominationFilters = {}
  ): Promise<PaginatedResult<BeneficiaryNominationRow>> {
    const limit = filters.limit ? Number(filters.limit) : 50;
    const fetchLimit = limit + 1; // Fetch one extra to determine hasMore

    const rows = await this.db.withTransaction(context, async (tx) => {
      if (filters.benefit_type && filters.cursor) {
        return await tx<BeneficiaryNominationRow[]>`
          SELECT
            id, tenant_id, employee_id, benefit_type, beneficiary_name,
            relationship, date_of_birth, percentage, address,
            created_at, updated_at
          FROM beneficiary_nominations
          WHERE employee_id = ${employeeId}::uuid
            AND benefit_type = ${filters.benefit_type}
            AND id > ${filters.cursor}::uuid
          ORDER BY benefit_type ASC, id ASC
          LIMIT ${fetchLimit}
        `;
      }

      if (filters.benefit_type) {
        return await tx<BeneficiaryNominationRow[]>`
          SELECT
            id, tenant_id, employee_id, benefit_type, beneficiary_name,
            relationship, date_of_birth, percentage, address,
            created_at, updated_at
          FROM beneficiary_nominations
          WHERE employee_id = ${employeeId}::uuid
            AND benefit_type = ${filters.benefit_type}
          ORDER BY benefit_type ASC, id ASC
          LIMIT ${fetchLimit}
        `;
      }

      if (filters.cursor) {
        return await tx<BeneficiaryNominationRow[]>`
          SELECT
            id, tenant_id, employee_id, benefit_type, beneficiary_name,
            relationship, date_of_birth, percentage, address,
            created_at, updated_at
          FROM beneficiary_nominations
          WHERE employee_id = ${employeeId}::uuid
            AND id > ${filters.cursor}::uuid
          ORDER BY benefit_type ASC, id ASC
          LIMIT ${fetchLimit}
        `;
      }

      return await tx<BeneficiaryNominationRow[]>`
        SELECT
          id, tenant_id, employee_id, benefit_type, beneficiary_name,
          relationship, date_of_birth, percentage, address,
          created_at, updated_at
        FROM beneficiary_nominations
        WHERE employee_id = ${employeeId}::uuid
        ORDER BY benefit_type ASC, id ASC
        LIMIT ${fetchLimit}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find beneficiary nomination by ID
   */
  async findById(
    context: TenantContext,
    id: string
  ): Promise<BeneficiaryNominationRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<BeneficiaryNominationRow[]>`
        SELECT
          id, tenant_id, employee_id, benefit_type, beneficiary_name,
          relationship, date_of_birth, percentage, address,
          created_at, updated_at
        FROM beneficiary_nominations
        WHERE id = ${id}::uuid
      `;
    });

    return rows[0] ?? null;
  }

  /**
   * Get percentage sums per benefit_type for an employee.
   * Used for validation and the summary endpoint.
   */
  async getPercentageSumsByEmployee(
    context: TenantContext,
    employeeId: string
  ): Promise<PercentageSumRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return await tx<PercentageSumRow[]>`
        SELECT
          benefit_type,
          SUM(percentage)::text AS total_percentage,
          COUNT(*)::text AS nomination_count
        FROM beneficiary_nominations
        WHERE employee_id = ${employeeId}::uuid
        GROUP BY benefit_type
        ORDER BY benefit_type
      `;
    });
  }

  /**
   * Get total percentage allocated for a specific employee + benefit_type,
   * optionally excluding a specific nomination (for update validation).
   */
  async getPercentageSumForBenefitType(
    context: TenantContext,
    employeeId: string,
    benefitType: string,
    excludeId?: string
  ): Promise<number> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      if (excludeId) {
        return await tx<{ total: string }[]>`
          SELECT COALESCE(SUM(percentage), 0)::text AS total
          FROM beneficiary_nominations
          WHERE employee_id = ${employeeId}::uuid
            AND benefit_type = ${benefitType}
            AND id != ${excludeId}::uuid
        `;
      }

      return await tx<{ total: string }[]>`
        SELECT COALESCE(SUM(percentage), 0)::text AS total
        FROM beneficiary_nominations
        WHERE employee_id = ${employeeId}::uuid
          AND benefit_type = ${benefitType}
      `;
    });

    return parseFloat(rows[0]?.total ?? "0");
  }

  // ---------------------------------------------------------------------------
  // Write Operations (require transaction handle)
  // ---------------------------------------------------------------------------

  /**
   * Create a beneficiary nomination
   */
  async create(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    data: CreateBeneficiaryNomination
  ): Promise<BeneficiaryNominationRow> {
    const rows = await tx<BeneficiaryNominationRow[]>`
      INSERT INTO beneficiary_nominations (
        tenant_id, employee_id, benefit_type, beneficiary_name,
        relationship, date_of_birth, percentage, address
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${employeeId}::uuid,
        ${data.benefit_type},
        ${data.beneficiary_name},
        ${data.relationship},
        ${data.date_of_birth ?? null},
        ${data.percentage},
        ${data.address ?? null}
      )
      RETURNING
        id, tenant_id, employee_id, benefit_type, beneficiary_name,
        relationship, date_of_birth, percentage, address,
        created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update a beneficiary nomination
   */
  async update(
    tx: TransactionSql,
    _context: TenantContext,
    id: string,
    data: UpdateBeneficiaryNomination
  ): Promise<BeneficiaryNominationRow | null> {
    const rows = await tx<BeneficiaryNominationRow[]>`
      UPDATE beneficiary_nominations
      SET
        beneficiary_name = COALESCE(${data.beneficiary_name ?? null}, beneficiary_name),
        relationship     = COALESCE(${data.relationship ?? null}, relationship),
        date_of_birth    = CASE WHEN ${data.date_of_birth !== undefined} THEN ${data.date_of_birth ?? null}::date ELSE date_of_birth END,
        percentage       = COALESCE(${data.percentage ?? null}, percentage),
        address          = CASE WHEN ${data.address !== undefined} THEN ${data.address ?? null} ELSE address END
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, benefit_type, beneficiary_name,
        relationship, date_of_birth, percentage, address,
        created_at, updated_at
    `;

    return rows[0] ?? null;
  }

  /**
   * Delete a beneficiary nomination
   */
  async delete(
    tx: TransactionSql,
    _context: TenantContext,
    id: string
  ): Promise<boolean> {
    const rows = await tx<{ id: string }[]>`
      DELETE FROM beneficiary_nominations
      WHERE id = ${id}::uuid
      RETURNING id
    `;

    return rows.length > 0;
  }
}
