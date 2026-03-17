/**
 * Core HR Module - Employee Address Service
 *
 * Implements business logic for Employee Address operations including
 * CRUD with effective dating, UK postcode validation, overlap prevention,
 * and domain events via the outbox pattern.
 */

import type { DatabaseClient } from "../../plugins/db";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import type { HRRepository } from "./repository";
import type {
  AddressRepository,
  EmployeeAddressRow,
  CreateAddressInput,
  UpdateAddressInput,
} from "./address.repository";
import type { PaginationQuery } from "./schemas";
import type { PaginatedResult } from "./repository.types";
import { ErrorCodes } from "../../plugins/errors";

// =============================================================================
// Types
// =============================================================================

export interface AddressResponse {
  id: string;
  tenant_id: string;
  employee_id: string;
  address_type: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  county: string | null;
  postcode: string | null;
  country: string;
  effective_from: string;
  effective_to: string | null;
  is_primary: boolean;
  is_current: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// UK Postcode Validation
// =============================================================================

/**
 * Validates UK postcode format.
 * Matches formats: A9 9AA, A99 9AA, A9A 9AA, AA9 9AA, AA99 9AA, AA9A 9AA
 * Case-insensitive, allows optional space between outward and inward parts.
 *
 * Returns false only when country is GB and the postcode is invalid.
 * Non-GB countries skip validation.
 */
export function isValidUkPostcode(postcode: string | null | undefined, country: string = "GB"): boolean {
  if (!postcode) return true; // null/undefined postcodes allowed
  if (country !== "GB") return true; // only validate UK postcodes

  const trimmed = postcode.trim().toUpperCase();
  // Standard UK postcode regex
  const ukPostcodeRegex = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/;
  return ukPostcodeRegex.test(trimmed);
}

// =============================================================================
// Address Service
// =============================================================================

export class AddressService {
  constructor(
    private addressRepo: AddressRepository,
    private hrRepo: HRRepository,
    private db: DatabaseClient
  ) {}

  /**
   * Get all current addresses for an employee
   */
  async getCurrentAddresses(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<AddressResponse[]>> {
    // Verify employee exists
    const { employee } = await this.hrRepo.findEmployeeById(context, employeeId);
    if (!employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.EMPLOYEE_NOT_FOUND,
          message: `Employee with ID '${employeeId}' not found`,
        },
      };
    }

    const addresses = await this.addressRepo.findCurrentAddresses(context, employeeId);
    return {
      success: true,
      data: addresses.map(mapAddressRowToResponse),
    };
  }

  /**
   * Get a single address by ID
   */
  async getAddress(
    context: TenantContext,
    employeeId: string,
    addressId: string
  ): Promise<ServiceResult<AddressResponse>> {
    // Verify employee exists
    const { employee } = await this.hrRepo.findEmployeeById(context, employeeId);
    if (!employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.EMPLOYEE_NOT_FOUND,
          message: `Employee with ID '${employeeId}' not found`,
        },
      };
    }

    const address = await this.addressRepo.findAddressById(context, addressId);
    if (!address || address.employeeId !== employeeId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Address with ID '${addressId}' not found for employee '${employeeId}'`,
        },
      };
    }

    return {
      success: true,
      data: mapAddressRowToResponse(address),
    };
  }

  /**
   * Get address history for an employee
   */
  async getAddressHistory(
    context: TenantContext,
    employeeId: string,
    addressType?: string,
    dateRange?: { from?: string; to?: string }
  ): Promise<ServiceResult<AddressResponse[]>> {
    // Verify employee exists
    const { employee } = await this.hrRepo.findEmployeeById(context, employeeId);
    if (!employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.EMPLOYEE_NOT_FOUND,
          message: `Employee with ID '${employeeId}' not found`,
        },
      };
    }

    const addresses = await this.addressRepo.findAddressHistory(
      context,
      employeeId,
      addressType,
      dateRange
    );

    return {
      success: true,
      data: addresses.map(mapAddressRowToResponse),
    };
  }

  /**
   * Create a new address for an employee (effective-dated)
   */
  async createAddress(
    context: TenantContext,
    employeeId: string,
    data: CreateAddressInput,
    idempotencyKey?: string
  ): Promise<ServiceResult<AddressResponse>> {
    // Verify employee exists
    const { employee } = await this.hrRepo.findEmployeeById(context, employeeId);
    if (!employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.EMPLOYEE_NOT_FOUND,
          message: `Employee with ID '${employeeId}' not found`,
        },
      };
    }

    // Validate UK postcode
    const country = data.country || "GB";
    if (!isValidUkPostcode(data.postcode, country)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Invalid UK postcode format. Expected format: e.g., SW1A 1AA, M1 1AA, EC2A 4BX",
          details: { field: "postcode", value: data.postcode },
        },
      };
    }

    // Validate effective dates
    if (data.effective_to && data.effective_to <= data.effective_from) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "effective_to must be after effective_from",
          details: { field: "effective_to" },
        },
      };
    }

    // Create within transaction with outbox event
    const result = await this.db.withTransaction(context, async (tx) => {
      const address = await this.addressRepo.createAddress(
        tx,
        context,
        employeeId,
        data,
        context.userId || ""
      );

      // Write domain event to outbox
      await tx`
        INSERT INTO app.domain_outbox (
          id, tenant_id, aggregate_type, aggregate_id,
          event_type, payload, created_at
        )
        VALUES (
          ${crypto.randomUUID()}, ${context.tenantId}::uuid,
          'employee', ${employeeId}::uuid,
          'hr.employee.address.created',
          ${JSON.stringify({
            address: mapAddressRowToResponse(address),
            actor: context.userId,
          })}::jsonb,
          now()
        )
      `;

      return address;
    });

    return {
      success: true,
      data: mapAddressRowToResponse(result),
    };
  }

  /**
   * Update an address (effective-dated: close existing, create new)
   */
  async updateAddress(
    context: TenantContext,
    employeeId: string,
    addressId: string,
    data: UpdateAddressInput,
    idempotencyKey?: string
  ): Promise<ServiceResult<AddressResponse>> {
    // Verify employee exists
    const { employee } = await this.hrRepo.findEmployeeById(context, employeeId);
    if (!employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.EMPLOYEE_NOT_FOUND,
          message: `Employee with ID '${employeeId}' not found`,
        },
      };
    }

    // Verify address exists and belongs to employee
    const existing = await this.addressRepo.findAddressById(context, addressId);
    if (!existing || existing.employeeId !== employeeId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Address with ID '${addressId}' not found for employee '${employeeId}'`,
        },
      };
    }

    // Only allow updating current (non-closed) addresses
    if (existing.effectiveTo !== null) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Cannot update a closed address record. Create a new address instead.",
        },
      };
    }

    // Validate UK postcode
    const country = data.country || existing.country;
    const postcode = data.postcode !== undefined ? data.postcode : existing.postcode;
    if (!isValidUkPostcode(postcode, country)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Invalid UK postcode format. Expected format: e.g., SW1A 1AA, M1 1AA, EC2A 4BX",
          details: { field: "postcode", value: postcode },
        },
      };
    }

    // effective_from must be >= the existing record's effective_from
    if (data.effective_from <= String(existing.effectiveFrom)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "effective_from must be after the current record's effective_from date",
          details: { field: "effective_from" },
        },
      };
    }

    // Update within transaction with outbox event
    const result = await this.db.withTransaction(context, async (tx) => {
      const address = await this.addressRepo.updateAddress(
        tx,
        context,
        addressId,
        employeeId,
        data,
        context.userId || ""
      );

      // Write domain event to outbox
      await tx`
        INSERT INTO app.domain_outbox (
          id, tenant_id, aggregate_type, aggregate_id,
          event_type, payload, created_at
        )
        VALUES (
          ${crypto.randomUUID()}, ${context.tenantId}::uuid,
          'employee', ${employeeId}::uuid,
          'hr.employee.address.updated',
          ${JSON.stringify({
            previousAddressId: addressId,
            address: mapAddressRowToResponse(address),
            actor: context.userId,
          })}::jsonb,
          now()
        )
      `;

      return address;
    });

    return {
      success: true,
      data: mapAddressRowToResponse(result),
    };
  }

  /**
   * Close (soft-delete) an address
   */
  async closeAddress(
    context: TenantContext,
    employeeId: string,
    addressId: string,
    closeDate: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<{ success: boolean }>> {
    // Verify employee exists
    const { employee } = await this.hrRepo.findEmployeeById(context, employeeId);
    if (!employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.EMPLOYEE_NOT_FOUND,
          message: `Employee with ID '${employeeId}' not found`,
        },
      };
    }

    // Verify address exists and belongs to employee
    const existing = await this.addressRepo.findAddressById(context, addressId);
    if (!existing || existing.employeeId !== employeeId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Address with ID '${addressId}' not found for employee '${employeeId}'`,
        },
      };
    }

    if (existing.effectiveTo !== null) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Address is already closed",
        },
      };
    }

    // Close within transaction with outbox event
    await this.db.withTransaction(context, async (tx) => {
      await this.addressRepo.closeAddress(tx, context, addressId, closeDate);

      // Write domain event to outbox
      await tx`
        INSERT INTO app.domain_outbox (
          id, tenant_id, aggregate_type, aggregate_id,
          event_type, payload, created_at
        )
        VALUES (
          ${crypto.randomUUID()}, ${context.tenantId}::uuid,
          'employee', ${employeeId}::uuid,
          'hr.employee.address.closed',
          ${JSON.stringify({
            addressId,
            closeDate,
            actor: context.userId,
          })}::jsonb,
          now()
        )
      `;
    });

    return {
      success: true,
      data: { success: true },
    };
  }
}

// =============================================================================
// Mapping Helpers
// =============================================================================

function mapAddressRowToResponse(row: EmployeeAddressRow): AddressResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    employee_id: row.employeeId,
    address_type: row.addressType,
    address_line_1: row.addressLine1,
    address_line_2: row.addressLine2,
    city: row.city,
    county: row.county,
    postcode: row.postcode,
    country: row.country,
    effective_from: row.effectiveFrom instanceof Date
      ? row.effectiveFrom.toISOString().split("T")[0]!
      : String(row.effectiveFrom),
    effective_to: row.effectiveTo instanceof Date
      ? row.effectiveTo.toISOString().split("T")[0]!
      : row.effectiveTo ? String(row.effectiveTo) : null,
    is_primary: row.isPrimary,
    is_current: row.isCurrent,
    created_by: row.createdBy,
    created_at: row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date
      ? row.updatedAt.toISOString()
      : String(row.updatedAt),
  };
}
