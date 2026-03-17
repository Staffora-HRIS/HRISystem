/**
 * Policy Distribution Module - Service Layer
 *
 * Business logic for policy document distribution with read receipts.
 * - Distribute policies to departments or all employees
 * - Track acknowledgement status per distribution
 * - Record individual employee acknowledgements with IP address
 * - Outbox events for async processing (notifications, audit)
 */

import type { DatabaseClient } from "../../plugins/db";
import {
  PolicyDistributionRepository,
  type DistributionRow,
  type AcknowledgementRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateDistribution,
  PaginationQuery,
  DistributionResponse,
  DistributionStatusResponse,
  AcknowledgementResponse,
} from "./schemas";

// =============================================================================
// Mappers
// =============================================================================

function mapDistributionToResponse(row: DistributionRow): DistributionResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    document_id: row.documentId,
    title: row.title,
    distributed_at: row.distributedAt.toISOString(),
    distributed_by: row.distributedBy,
    target_departments: Array.isArray(row.targetDepartments)
      ? row.targetDepartments
      : [],
    target_all: row.targetAll,
    created_at: row.createdAt.toISOString(),
  };
}

function mapAcknowledgementToResponse(row: AcknowledgementRow): AcknowledgementResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    distribution_id: row.distributionId,
    employee_id: row.employeeId,
    acknowledged_at: row.acknowledgedAt.toISOString(),
    ip_address: row.ipAddress ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

// =============================================================================
// Service
// =============================================================================

export class PolicyDistributionService {
  constructor(
    private repository: PolicyDistributionRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Distribution Operations
  // ===========================================================================

  /**
   * Distribute a policy document to targeted departments or all employees.
   * Writes an outbox event in the same transaction for async notification delivery.
   */
  async distribute(
    ctx: TenantContext,
    data: CreateDistribution
  ): Promise<ServiceResult<DistributionResponse>> {
    // Validate: must target at least departments or all
    const hasDepartments = data.target_departments && data.target_departments.length > 0;
    const targetAll = data.target_all === true;

    if (!hasDepartments && !targetAll) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Distribution must target at least one department or set target_all to true",
        },
      };
    }

    const distribution = await this.db.withTransaction(ctx, async (tx) => {
      const created = await this.repository.createDistribution(
        ctx,
        { ...data, distributedBy: ctx.userId! },
        tx
      );

      // Write outbox event in same transaction
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'policy_distribution',
          ${created.id},
          'policy.distribution.created',
          ${JSON.stringify({
            distributionId: created.id,
            documentId: data.document_id,
            title: data.title,
            targetAll,
            targetDepartments: data.target_departments ?? [],
            actor: ctx.userId,
          })}::jsonb,
          now()
        )
      `;

      return created;
    });

    return { success: true, data: mapDistributionToResponse(distribution) };
  }

  /**
   * Get the status of a specific distribution including paginated acknowledgements.
   */
  async getDistributionStatus(
    ctx: TenantContext,
    distributionId: string,
    pagination: PaginationQuery
  ): Promise<ServiceResult<DistributionStatusResponse>> {
    const distribution = await this.repository.getDistributionById(
      ctx,
      distributionId
    );

    if (!distribution) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Distribution not found",
        },
      };
    }

    const [ackResult, totalCount] = await Promise.all([
      this.repository.listAcknowledgements(ctx, distributionId, pagination),
      this.repository.countAcknowledgements(ctx, distributionId),
    ]);

    return {
      success: true,
      data: {
        distribution: mapDistributionToResponse(distribution),
        acknowledgements: {
          items: ackResult.items.map((row) => ({
            id: row.id,
            employee_id: row.employeeId,
            acknowledged_at: row.acknowledgedAt.toISOString(),
            ip_address: row.ipAddress ?? null,
          })),
          total: totalCount,
          nextCursor: ackResult.nextCursor,
          hasMore: ackResult.hasMore,
        },
      },
    };
  }

  /**
   * List all distributions with cursor-based pagination
   */
  async listDistributions(
    ctx: TenantContext,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<DistributionResponse>> {
    const result = await this.repository.listDistributions(ctx, pagination);

    return {
      items: result.items.map(mapDistributionToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Acknowledgement Operations
  // ===========================================================================

  /**
   * Record an employee's acknowledgement of a policy distribution.
   * Idempotent: returns the existing acknowledgement if already recorded.
   */
  async acknowledge(
    ctx: TenantContext,
    distributionId: string,
    employeeId: string,
    ipAddress: string | null
  ): Promise<ServiceResult<AcknowledgementResponse>> {
    // Verify the distribution exists
    const distribution = await this.repository.getDistributionById(
      ctx,
      distributionId
    );

    if (!distribution) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Distribution not found",
        },
      };
    }

    // Check if already acknowledged — return existing if so (idempotent)
    const existing = await this.repository.getAcknowledgement(
      ctx,
      distributionId,
      employeeId
    );

    if (existing) {
      return {
        success: true,
        data: mapAcknowledgementToResponse(existing),
      };
    }

    // Create acknowledgement with outbox event in same transaction
    const acknowledgement = await this.db.withTransaction(ctx, async (tx) => {
      const created = await this.repository.createAcknowledgement(
        ctx,
        distributionId,
        employeeId,
        ipAddress,
        tx
      );

      if (!created) {
        // Race condition: another request created it between our check and insert.
        // ON CONFLICT DO NOTHING returned no rows, so we fetch the existing one.
        return null;
      }

      // Write outbox event in same transaction
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'policy_distribution',
          ${distributionId},
          'policy.distribution.acknowledged',
          ${JSON.stringify({
            distributionId,
            employeeId,
            acknowledgementId: created.id,
            actor: ctx.userId,
          })}::jsonb,
          now()
        )
      `;

      return created;
    });

    // Handle race condition: fetch the existing record
    if (!acknowledgement) {
      const raceExisting = await this.repository.getAcknowledgement(
        ctx,
        distributionId,
        employeeId
      );

      if (raceExisting) {
        return {
          success: true,
          data: mapAcknowledgementToResponse(raceExisting),
        };
      }

      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create acknowledgement",
        },
      };
    }

    return {
      success: true,
      data: mapAcknowledgementToResponse(acknowledgement),
    };
  }
}
