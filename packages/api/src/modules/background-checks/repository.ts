/**
 * Background Checks Repository
 *
 * Database operations for background check requests sent to external
 * screening providers. Uses postgres.js tagged templates with RLS
 * enforced via tenant context. TODO-194.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface BackgroundCheckRequest {
  id: string;
  tenantId: string;
  employeeId: string;
  checkType: "dbs" | "credit" | "employment_history" | "education" | "references";
  provider: string;
  providerReference: string | null;
  status: "pending" | "in_progress" | "completed" | "failed";
  result: Record<string, unknown> | null;
  requestedAt: string;
  completedAt: string | null;
  requestedBy: string | null;
  webhookSecret: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  employeeName?: string | null;
}

// =============================================================================
// Background Check Requests Repository
// =============================================================================

export class BackgroundCheckRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * List background check requests with cursor-based pagination and filters.
   */
  async list(
    ctx: TenantContext,
    options: {
      cursor?: string;
      limit?: number;
      employeeId?: string;
      status?: string;
      checkType?: string;
      provider?: string;
      search?: string;
    } = {}
  ): Promise<{ items: BackgroundCheckRequest[]; nextCursor: string | null; hasMore: boolean }> {
    const { cursor, limit = 20, employeeId, status, checkType, provider, search } = options;

    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<BackgroundCheckRequest[]>`
          SELECT
            bcr.id,
            bcr.tenant_id,
            bcr.employee_id,
            bcr.check_type,
            bcr.provider,
            bcr.provider_reference,
            bcr.status,
            bcr.result,
            bcr.requested_at,
            bcr.completed_at,
            bcr.requested_by,
            bcr.created_at,
            bcr.updated_at,
            app.get_employee_display_name(e.id) as employee_name
          FROM app.background_check_requests bcr
          LEFT JOIN app.employees e ON e.id = bcr.employee_id
          WHERE bcr.tenant_id = ${ctx.tenantId}::uuid
          ${employeeId ? tx`AND bcr.employee_id = ${employeeId}::uuid` : tx``}
          ${status ? tx`AND bcr.status = ${status}::app.background_check_request_status` : tx``}
          ${checkType ? tx`AND bcr.check_type = ${checkType}::app.background_check_type` : tx``}
          ${provider ? tx`AND bcr.provider = ${provider}` : tx``}
          ${search ? tx`AND (bcr.provider ILIKE ${"%" + search + "%"} OR bcr.provider_reference ILIKE ${"%" + search + "%"})` : tx``}
          ${cursor ? tx`AND bcr.id > ${cursor}::uuid` : tx``}
          ORDER BY bcr.created_at DESC, bcr.id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Get a single background check request by ID.
   */
  async getById(ctx: TenantContext, id: string): Promise<BackgroundCheckRequest | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<BackgroundCheckRequest[]>`
        SELECT
          bcr.id,
          bcr.tenant_id,
          bcr.employee_id,
          bcr.check_type,
          bcr.provider,
          bcr.provider_reference,
          bcr.status,
          bcr.result,
          bcr.requested_at,
          bcr.completed_at,
          bcr.requested_by,
          bcr.webhook_secret,
          bcr.created_at,
          bcr.updated_at,
          app.get_employee_display_name(e.id) as employee_name
        FROM app.background_check_requests bcr
        LEFT JOIN app.employees e ON e.id = bcr.employee_id
        WHERE bcr.id = ${id}::uuid AND bcr.tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
  }

  /**
   * Create a new background check request.
   * Returns the created record. The outbox event should be emitted
   * within the same transaction by the caller (service layer).
   */
  async create(
    ctx: TenantContext,
    data: {
      employeeId: string;
      checkType: string;
      provider: string;
      requestedBy?: string;
      webhookSecret?: string;
    },
    tx: TransactionSql
  ): Promise<BackgroundCheckRequest> {
    const rows = await tx<BackgroundCheckRequest[]>`
      INSERT INTO app.background_check_requests (
        tenant_id, employee_id, check_type, provider,
        requested_by, webhook_secret
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employeeId}::uuid,
        ${data.checkType}::app.background_check_type,
        ${data.provider},
        ${data.requestedBy || null}::uuid,
        ${data.webhookSecret || null}
      )
      RETURNING id, tenant_id, employee_id, check_type, provider,
        provider_reference, status, result, requested_at, completed_at,
        requested_by, webhook_secret, created_at, updated_at
    `;
    return rows[0];
  }

  /**
   * Transition a check to in_progress and record the provider reference.
   * Called after the provider API accepts the request.
   */
  async markInProgress(
    ctx: TenantContext,
    id: string,
    providerReference: string,
    tx: TransactionSql
  ): Promise<BackgroundCheckRequest | null> {
    const rows = await tx<BackgroundCheckRequest[]>`
      UPDATE app.background_check_requests SET
        status = 'in_progress'::app.background_check_request_status,
        provider_reference = ${providerReference},
        updated_at = now()
      WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING id, tenant_id, employee_id, check_type, provider,
        provider_reference, status, result, requested_at, completed_at,
        requested_by, webhook_secret, created_at, updated_at
    `;
    return rows[0] || null;
  }

  /**
   * Record the result from a provider webhook callback.
   * Uses system context since webhooks are unauthenticated (provider-initiated).
   */
  async recordResult(
    providerName: string,
    providerReference: string,
    status: "completed" | "failed",
    result: Record<string, unknown> | null,
    tx: TransactionSql
  ): Promise<BackgroundCheckRequest | null> {
    const rows = await tx<BackgroundCheckRequest[]>`
      UPDATE app.background_check_requests SET
        status = ${status}::app.background_check_request_status,
        result = ${result ? JSON.stringify(result) : null}::jsonb,
        completed_at = now(),
        updated_at = now()
      WHERE provider = ${providerName}
        AND provider_reference = ${providerReference}
        AND status = 'in_progress'::app.background_check_request_status
      RETURNING id, tenant_id, employee_id, check_type, provider,
        provider_reference, status, result, requested_at, completed_at,
        requested_by, webhook_secret, created_at, updated_at
    `;
    return rows[0] || null;
  }

  /**
   * Look up a request by provider and provider reference.
   * Used by webhook handler for signature verification.
   */
  async findByProviderReference(
    providerName: string,
    providerReference: string,
    tx: TransactionSql
  ): Promise<BackgroundCheckRequest | null> {
    const rows = await tx<BackgroundCheckRequest[]>`
      SELECT
        id, tenant_id, employee_id, check_type, provider,
        provider_reference, status, result, requested_at, completed_at,
        requested_by, webhook_secret, created_at, updated_at
      FROM app.background_check_requests
      WHERE provider = ${providerName}
        AND provider_reference = ${providerReference}
    `;
    return rows[0] || null;
  }
}
