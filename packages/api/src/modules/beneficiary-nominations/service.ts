/**
 * Beneficiary Nominations Module - Service Layer
 *
 * Implements business logic for beneficiary nomination operations.
 * Key invariant: the sum of percentages per employee per benefit_type
 * must not exceed 100. The service validates this on every create/update.
 * A separate summary endpoint reports whether each benefit_type sums
 * to exactly 100 (i.e. is "complete").
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  BeneficiaryNominationRepository,
  BeneficiaryNominationRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateBeneficiaryNomination,
  UpdateBeneficiaryNomination,
  BeneficiaryNominationResponse,
  NominationFilters,
  PercentageSummary,
} from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "benefits.beneficiary_nomination.created"
  | "benefits.beneficiary_nomination.updated"
  | "benefits.beneficiary_nomination.deleted";

// =============================================================================
// Beneficiary Nomination Service
// =============================================================================

export class BeneficiaryNominationService {
  constructor(
    private repository: BeneficiaryNominationRepository,
    private db: DatabaseClient
  ) {}

  // ---------------------------------------------------------------------------
  // Domain Event Emission
  // ---------------------------------------------------------------------------

  /**
   * Emit domain event to outbox (same transaction as business write)
   */
  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateType: string,
    aggregateId: string,
    eventType: DomainEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        ${aggregateType},
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Map database row to API response shape
   */
  private mapToResponse(row: BeneficiaryNominationRow): BeneficiaryNominationResponse {
    return {
      id: row.id,
      employeeId: row.employeeId,
      benefitType: row.benefitType,
      beneficiaryName: row.beneficiaryName,
      relationship: row.relationship,
      dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString().split("T")[0]! : null,
      percentage: parseFloat(String(row.percentage)),
      address: row.address,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Verify that the employee exists.
   * Returns success=false if not found.
   */
  private async verifyEmployeeExists(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<void>> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<{ id: string }[]>`
        SELECT id FROM employees WHERE id = ${employeeId}::uuid
      `;
    });

    if (rows.length === 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Employee with ID '${employeeId}' not found`,
          details: { employeeId },
        },
      };
    }

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------

  /**
   * List beneficiary nominations for an employee
   */
  async listByEmployee(
    context: TenantContext,
    employeeId: string,
    filters: NominationFilters = {}
  ): Promise<PaginatedServiceResult<BeneficiaryNominationResponse>> {
    // Verify employee exists
    const check = await this.verifyEmployeeExists(context, employeeId);
    if (!check.success) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const result = await this.repository.listByEmployee(
      context,
      employeeId,
      filters
    );

    return {
      items: result.items.map((row) => this.mapToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ---------------------------------------------------------------------------
  // Get
  // ---------------------------------------------------------------------------

  /**
   * Get a single beneficiary nomination by ID
   */
  async getById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<BeneficiaryNominationResponse>> {
    const row = await this.repository.findById(context, id);

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Beneficiary nomination with ID '${id}' not found`,
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapToResponse(row),
    };
  }

  // ---------------------------------------------------------------------------
  // Percentage Summary
  // ---------------------------------------------------------------------------

  /**
   * Get a summary of nomination percentages per benefit_type for an employee.
   * Useful for the UI to show which benefit types are fully allocated (sum = 100).
   */
  async getPercentageSummary(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<PercentageSummary[]>> {
    const check = await this.verifyEmployeeExists(context, employeeId);
    if (!check.success) {
      return { success: false, error: check.error };
    }

    const sums = await this.repository.getPercentageSumsByEmployee(context, employeeId);

    const items: PercentageSummary[] = sums.map((row) => {
      const total = parseFloat(row.totalPercentage);
      return {
        benefitType: row.benefitType,
        totalPercentage: total,
        isComplete: Math.abs(total - 100) < 0.001, // floating point safe comparison
        nominationCount: parseInt(row.nominationCount, 10),
      };
    });

    return { success: true, data: items };
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  /**
   * Create a beneficiary nomination for an employee.
   *
   * Business rules:
   * - Employee must exist.
   * - Adding this nomination must not cause the total percentage for the
   *   (employee, benefit_type) combination to exceed 100.
   */
  async create(
    context: TenantContext,
    employeeId: string,
    data: CreateBeneficiaryNomination,
    _idempotencyKey?: string
  ): Promise<ServiceResult<BeneficiaryNominationResponse>> {
    // Verify employee exists
    const check = await this.verifyEmployeeExists(context, employeeId);
    if (!check.success) {
      return { success: false, error: check.error };
    }

    // Validate percentage sum will not exceed 100
    const currentSum = await this.repository.getPercentageSumForBenefitType(
      context,
      employeeId,
      data.benefit_type
    );

    const newTotal = currentSum + data.percentage;
    if (newTotal > 100 + 0.001) { // floating point safe
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Total percentage for benefit type '${data.benefit_type}' would be ${newTotal.toFixed(2)}%, which exceeds 100%. Current total is ${currentSum.toFixed(2)}%, requested addition is ${data.percentage}%.`,
          details: {
            benefitType: data.benefit_type,
            currentTotal: currentSum,
            requested: data.percentage,
            wouldBeTotal: newTotal,
          },
        },
      };
    }

    // Create inside a transaction so outbox is atomic
    const nomination = await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.create(tx, context, employeeId, data);

      // Emit domain event in the same transaction
      await this.emitEvent(
        tx,
        context,
        "beneficiary_nomination",
        row.id,
        "benefits.beneficiary_nomination.created",
        { beneficiaryNomination: this.mapToResponse(row), employeeId }
      );

      return row;
    });

    return {
      success: true,
      data: this.mapToResponse(nomination),
    };
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  /**
   * Update a beneficiary nomination.
   *
   * Business rules:
   * - Nomination must exist.
   * - If percentage is being changed, the new total for (employee, benefit_type)
   *   must not exceed 100.
   */
  async update(
    context: TenantContext,
    id: string,
    data: UpdateBeneficiaryNomination,
    _idempotencyKey?: string
  ): Promise<ServiceResult<BeneficiaryNominationResponse>> {
    // Verify nomination exists
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Beneficiary nomination with ID '${id}' not found`,
          details: { id },
        },
      };
    }

    // If percentage is changing, validate the new total
    if (data.percentage !== undefined) {
      const currentSumExcludingSelf = await this.repository.getPercentageSumForBenefitType(
        context,
        existing.employeeId,
        existing.benefitType,
        id // exclude this nomination from the sum
      );

      const newTotal = currentSumExcludingSelf + data.percentage;
      if (newTotal > 100 + 0.001) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Total percentage for benefit type '${existing.benefitType}' would be ${newTotal.toFixed(2)}%, which exceeds 100%. Other nominations total ${currentSumExcludingSelf.toFixed(2)}%, requested percentage is ${data.percentage}%.`,
            details: {
              benefitType: existing.benefitType,
              otherNominationsTotal: currentSumExcludingSelf,
              requested: data.percentage,
              wouldBeTotal: newTotal,
            },
          },
        };
      }
    }

    const updated = await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.update(tx, context, id, data);

      if (!row) {
        throw new Error(`Beneficiary nomination '${id}' disappeared during update`);
      }

      // Emit domain event in the same transaction
      await this.emitEvent(
        tx,
        context,
        "beneficiary_nomination",
        row.id,
        "benefits.beneficiary_nomination.updated",
        {
          beneficiaryNomination: this.mapToResponse(row),
          employeeId: row.employeeId,
          changes: data,
        }
      );

      return row;
    });

    return {
      success: true,
      data: this.mapToResponse(updated),
    };
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  /**
   * Delete a beneficiary nomination.
   *
   * Note: deleting a nomination may cause the total for that benefit_type
   * to drop below 100. This is allowed -- the summary endpoint will report
   * it as incomplete.
   */
  async delete(
    context: TenantContext,
    id: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Verify nomination exists
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Beneficiary nomination with ID '${id}' not found`,
          details: { id },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      const deleted = await this.repository.delete(tx, context, id);

      if (!deleted) {
        throw new Error(`Beneficiary nomination '${id}' disappeared during delete`);
      }

      // Emit domain event in the same transaction
      await this.emitEvent(
        tx,
        context,
        "beneficiary_nomination",
        id,
        "benefits.beneficiary_nomination.deleted",
        {
          beneficiaryNomination: this.mapToResponse(existing),
          employeeId: existing.employeeId,
        }
      );
    });

    return { success: true };
  }
}
