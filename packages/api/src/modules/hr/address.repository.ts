/**
 * Core HR Module - Employee Address Repository
 *
 * Provides data access methods for Employee Address entities including
 * effective-dated records, history, overlap checking, and UK postcode validation.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql } from "../../plugins/db";
import type { TenantContext, PaginatedResult } from "./repository.types";
import type { PaginationQuery } from "./schemas";

// =============================================================================
// Types
// =============================================================================

export interface EmployeeAddressRow {
  id: string;
  tenantId: string;
  employeeId: string;
  addressType: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  county: string | null;
  postcode: string | null;
  country: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isPrimary: boolean;
  isCurrent: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAddressInput {
  address_type: string;
  address_line_1: string;
  address_line_2?: string | null;
  city: string;
  county?: string | null;
  postcode?: string | null;
  country?: string;
  effective_from: string;
  effective_to?: string | null;
  is_primary?: boolean;
}

export interface UpdateAddressInput {
  address_type?: string;
  address_line_1?: string;
  address_line_2?: string | null;
  city?: string;
  county?: string | null;
  postcode?: string | null;
  country?: string;
  effective_from: string;
  is_primary?: boolean;
}

// =============================================================================
// Address Repository
// =============================================================================

export class AddressRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Find all current addresses for an employee
   */
  async findCurrentAddresses(
    context: TenantContext,
    employeeId: string
  ): Promise<EmployeeAddressRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      return tx<EmployeeAddressRow[]>`
        SELECT id, tenant_id, employee_id, address_type,
               address_line_1, address_line_2, city, county, postcode, country,
               effective_from, effective_to, is_primary, is_current,
               created_by, created_at, updated_at
        FROM app.employee_addresses
        WHERE employee_id = ${employeeId}::uuid
          AND effective_to IS NULL
        ORDER BY address_type, is_primary DESC, created_at
      `;
    });

    return result;
  }

  /**
   * Find all addresses for an employee (paginated, includes history)
   */
  async findAddresses(
    context: TenantContext,
    employeeId: string,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<EmployeeAddressRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      return tx<EmployeeAddressRow[]>`
        SELECT id, tenant_id, employee_id, address_type,
               address_line_1, address_line_2, city, county, postcode, country,
               effective_from, effective_to, is_primary, is_current,
               created_by, created_at, updated_at
        FROM app.employee_addresses
        WHERE employee_id = ${employeeId}::uuid
          ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
        ORDER BY effective_from DESC, id
        LIMIT ${fetchLimit}
      `;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find address by ID
   */
  async findAddressById(
    context: TenantContext,
    addressId: string
  ): Promise<EmployeeAddressRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      return tx<EmployeeAddressRow[]>`
        SELECT id, tenant_id, employee_id, address_type,
               address_line_1, address_line_2, city, county, postcode, country,
               effective_from, effective_to, is_primary, is_current,
               created_by, created_at, updated_at
        FROM app.employee_addresses
        WHERE id = ${addressId}::uuid
      `;
    });

    return result[0] || null;
  }

  /**
   * Find address history for an employee, optionally filtered by address type
   */
  async findAddressHistory(
    context: TenantContext,
    employeeId: string,
    addressType?: string,
    dateRange?: { from?: string; to?: string }
  ): Promise<EmployeeAddressRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      return tx<EmployeeAddressRow[]>`
        SELECT id, tenant_id, employee_id, address_type,
               address_line_1, address_line_2, city, county, postcode, country,
               effective_from, effective_to, is_primary, is_current,
               created_by, created_at, updated_at
        FROM app.employee_addresses
        WHERE employee_id = ${employeeId}::uuid
          ${addressType ? tx`AND address_type = ${addressType}::app.address_type` : tx``}
          ${dateRange?.from ? tx`AND effective_from >= ${dateRange.from}::date` : tx``}
          ${dateRange?.to ? tx`AND (effective_to IS NULL OR effective_to <= ${dateRange.to}::date)` : tx``}
        ORDER BY effective_from DESC, created_at DESC
      `;
    });

    return result;
  }

  /**
   * Create a new address record
   */
  async createAddress(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    data: CreateAddressInput,
    createdBy: string
  ): Promise<EmployeeAddressRow> {
    // If setting as primary, unset existing primary of same type
    if (data.is_primary) {
      await tx`
        UPDATE app.employee_addresses
        SET is_primary = false, updated_at = now()
        WHERE employee_id = ${employeeId}::uuid
          AND address_type = ${data.address_type}::app.address_type
          AND is_primary = true
          AND effective_to IS NULL
      `;
    }

    const rows = await tx<EmployeeAddressRow[]>`
      INSERT INTO app.employee_addresses (
        tenant_id, employee_id, address_type,
        address_line_1, address_line_2, city, county, postcode, country,
        effective_from, effective_to, is_primary, created_by
      )
      VALUES (
        ${context.tenantId}::uuid, ${employeeId}::uuid,
        ${data.address_type}::app.address_type,
        ${data.address_line_1}, ${data.address_line_2 || null},
        ${data.city}, ${data.county || null},
        ${data.postcode || null}, ${data.country || 'GB'},
        ${data.effective_from}::date, ${data.effective_to || null}::date,
        ${data.is_primary || false}, ${createdBy}::uuid
      )
      RETURNING id, tenant_id, employee_id, address_type,
                address_line_1, address_line_2, city, county, postcode, country,
                effective_from, effective_to, is_primary, is_current,
                created_by, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update an address record (effective-dated: close existing, create new)
   */
  async updateAddress(
    tx: TransactionSql,
    context: TenantContext,
    addressId: string,
    employeeId: string,
    data: UpdateAddressInput,
    updatedBy: string
  ): Promise<EmployeeAddressRow> {
    // Get current record to merge values
    const currentRows = await tx<EmployeeAddressRow[]>`
      SELECT id, tenant_id, employee_id, address_type,
             address_line_1, address_line_2, city, county, postcode, country,
             effective_from, effective_to, is_primary, is_current,
             created_by, created_at, updated_at
      FROM app.employee_addresses
      WHERE id = ${addressId}::uuid
        AND employee_id = ${employeeId}::uuid
    `;

    const current = currentRows[0];
    if (!current) {
      throw new Error("Address not found");
    }

    // Close the current record
    await tx`
      UPDATE app.employee_addresses
      SET effective_to = ${data.effective_from}::date, updated_at = now()
      WHERE id = ${addressId}::uuid
        AND effective_from < ${data.effective_from}::date
    `;

    const newAddressType = data.address_type || current.addressType;
    const newIsPrimary = data.is_primary !== undefined ? data.is_primary : current.isPrimary;

    // If setting as primary, unset existing primary of same type
    if (newIsPrimary) {
      await tx`
        UPDATE app.employee_addresses
        SET is_primary = false, updated_at = now()
        WHERE employee_id = ${employeeId}::uuid
          AND address_type = ${newAddressType}::app.address_type
          AND is_primary = true
          AND effective_to IS NULL
          AND id != ${addressId}::uuid
      `;
    }

    // Insert new record with merged values
    const rows = await tx<EmployeeAddressRow[]>`
      INSERT INTO app.employee_addresses (
        tenant_id, employee_id, address_type,
        address_line_1, address_line_2, city, county, postcode, country,
        effective_from, is_primary, created_by
      )
      VALUES (
        ${context.tenantId}::uuid, ${employeeId}::uuid,
        ${newAddressType}::app.address_type,
        COALESCE(${data.address_line_1 || null}, ${current.addressLine1}),
        COALESCE(${data.address_line_2 !== undefined ? data.address_line_2 : null}, ${current.addressLine2}),
        COALESCE(${data.city || null}, ${current.city}),
        COALESCE(${data.county !== undefined ? data.county : null}, ${current.county}),
        COALESCE(${data.postcode !== undefined ? data.postcode : null}, ${current.postcode}),
        COALESCE(${data.country || null}, ${current.country}),
        ${data.effective_from}::date,
        ${newIsPrimary},
        ${updatedBy}::uuid
      )
      RETURNING id, tenant_id, employee_id, address_type,
                address_line_1, address_line_2, city, county, postcode, country,
                effective_from, effective_to, is_primary, is_current,
                created_by, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Soft-close an address (set effective_to to given date)
   */
  async closeAddress(
    tx: TransactionSql,
    context: TenantContext,
    addressId: string,
    closeDate: string
  ): Promise<boolean> {
    const result = await tx`
      UPDATE app.employee_addresses
      SET effective_to = ${closeDate}::date, updated_at = now()
      WHERE id = ${addressId}::uuid
        AND effective_to IS NULL
    `;

    return result.count > 0;
  }

  /**
   * Check for effective date overlap for same employee + address_type
   */
  async checkAddressOverlap(
    context: TenantContext,
    employeeId: string,
    addressType: string,
    effectiveFrom: string,
    effectiveTo: string | null,
    excludeId?: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      return tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.employee_addresses
          WHERE employee_id = ${employeeId}::uuid
            AND address_type = ${addressType}::app.address_type
            ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
            AND effective_from < ${effectiveTo || '9999-12-31'}::date
            AND (effective_to IS NULL OR effective_to > ${effectiveFrom}::date)
        ) as exists
      `;
    });

    return result[0]?.exists ?? false;
  }
}
