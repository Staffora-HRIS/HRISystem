/**
 * API Keys Module - Service Layer
 *
 * Business logic for API key generation, validation, and lifecycle management.
 * Emits domain events via the outbox pattern for all mutations.
 *
 * Key generation:
 * - Format: sfra_ + 32 random bytes base64url encoded
 * - Hash: SHA-256 before storage
 * - Display: first 8 characters stored as key_prefix
 *
 * The full key is returned ONLY at creation time and never stored.
 */

import { createHash } from "crypto";
import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import {
  ApiKeyRepository,
  type ApiKeyRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateApiKey,
  UpdateApiKey,
  ApiKeyResponse,
  ApiKeyCreatedResponse,
  ApiKeyFilters,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/** Prefix for all Staffora API keys */
const KEY_PREFIX = "sfra_";

/** Number of random bytes for key generation */
const KEY_RANDOM_BYTES = 32;

// =============================================================================
// Key Generation Utilities
// =============================================================================

/**
 * Generate a new API key.
 * Format: sfra_ + 32 random bytes encoded as base64url (no padding).
 * Total length: ~49 characters (5 prefix + ~43 base64url chars).
 */
function generateApiKey(): string {
  const randomBytes = new Uint8Array(KEY_RANDOM_BYTES);
  crypto.getRandomValues(randomBytes);
  const encoded = Buffer.from(randomBytes).toString("base64url");
  return `${KEY_PREFIX}${encoded}`;
}

/**
 * Hash an API key with SHA-256 for storage.
 * Returns the hex-encoded digest (64 characters).
 */
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Extract the display prefix from a key (first 8 characters).
 */
function extractKeyPrefix(key: string): string {
  return key.substring(0, 8);
}

// =============================================================================
// Domain Event Types
// =============================================================================

type ApiKeyEventType =
  | "api-key.created"
  | "api-key.updated"
  | "api-key.revoked";

// =============================================================================
// Mappers
// =============================================================================

function mapRowToResponse(row: ApiKeyRow): ApiKeyResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    name: row.name,
    key_prefix: row.keyPrefix,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    expires_at: row.expiresAt?.toISOString() ?? null,
    last_used_at: row.lastUsedAt?.toISOString() ?? null,
    revoked_at: row.revokedAt?.toISOString() ?? null,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// =============================================================================
// Service
// =============================================================================

export class ApiKeyService {
  constructor(
    private repository: ApiKeyRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox within the same transaction as the business write
   */
  private async emitEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    aggregateId: string,
    eventType: ApiKeyEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        'api_key',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: ctx.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /**
   * List API keys with filters and pagination.
   * Never returns the full key or hash.
   */
  async listApiKeys(
    ctx: TenantContext,
    filters: ApiKeyFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<ApiKeyResponse>> {
    const result = await this.repository.listApiKeys(ctx, filters, pagination);
    return {
      items: result.items.map(mapRowToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single API key by ID.
   * Never returns the full key or hash.
   */
  async getApiKey(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<ApiKeyResponse>> {
    const row = await this.repository.getById(ctx, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "API key not found",
          details: { id },
        },
      };
    }
    return { success: true, data: mapRowToResponse(row) };
  }

  /**
   * Generate a new API key.
   * Returns the full key ONLY in this response; it is never stored or retrievable again.
   */
  async createApiKey(
    ctx: TenantContext
  , data: CreateApiKey
  ): Promise<ServiceResult<ApiKeyCreatedResponse>> {
    if (!ctx.userId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: "User context required to create an API key",
        },
      };
    }

    // Generate key, hash, and prefix
    const fullKey = generateApiKey();
    const keyHash = hashApiKey(fullKey);
    const keyPrefix = extractKeyPrefix(fullKey);

    const row = await this.db.withTransaction(ctx, async (tx) => {
      const created = await this.repository.create(
        ctx,
        {
          name: data.name,
          keyHash,
          keyPrefix,
          scopes: data.scopes ?? [],
          expiresAt: data.expires_at ?? null,
          createdBy: ctx.userId!,
        },
        tx
      );

      await this.emitEvent(tx, ctx, created.id, "api-key.created", {
        apiKeyId: created.id,
        name: data.name,
        scopes: data.scopes ?? [],
        expiresAt: data.expires_at ?? null,
      });

      return created;
    });

    return {
      success: true,
      data: {
        id: row.id,
        tenant_id: row.tenantId,
        name: row.name,
        key: fullKey,
        key_prefix: keyPrefix,
        scopes: Array.isArray(row.scopes) ? row.scopes : [],
        expires_at: row.expiresAt?.toISOString() ?? null,
        created_by: row.createdBy,
        created_at: row.createdAt.toISOString(),
      },
    };
  }

  /**
   * Update an API key's name, scopes, or expiry.
   * Cannot update a revoked key.
   */
  async updateApiKey(
    ctx: TenantContext,
    id: string,
    data: UpdateApiKey
  ): Promise<ServiceResult<ApiKeyResponse>> {
    // Verify key exists and is not revoked
    const existing = await this.repository.getById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "API key not found",
          details: { id },
        },
      };
    }

    if (existing.revokedAt) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Cannot update a revoked API key",
          details: { id },
        },
      };
    }

    const updated = await this.db.withTransaction(ctx, async (tx) => {
      const row = await this.repository.update(ctx, id, data, tx);

      if (row) {
        await this.emitEvent(tx, ctx, id, "api-key.updated", {
          apiKeyId: id,
          changes: data,
        });
      }

      return row;
    });

    if (!updated) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "API key not found after update",
          details: { id },
        },
      };
    }

    return { success: true, data: mapRowToResponse(updated) };
  }

  /**
   * Revoke an API key (soft-delete by setting revoked_at).
   * Revoked keys cannot be used for authentication.
   */
  async revokeApiKey(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<{ revoked: boolean }>> {
    const existing = await this.repository.getById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "API key not found",
          details: { id },
        },
      };
    }

    if (existing.revokedAt) {
      // Already revoked - idempotent response
      return { success: true, data: { revoked: true } };
    }

    await this.db.withTransaction(ctx, async (tx) => {
      await this.repository.revoke(ctx, id, tx);

      await this.emitEvent(tx, ctx, id, "api-key.revoked", {
        apiKeyId: id,
        name: existing.name,
      });
    });

    return { success: true, data: { revoked: true } };
  }

  // ===========================================================================
  // Authentication Support
  // ===========================================================================

  /**
   * Validate an API key for authentication.
   * Called by the auth middleware when a Bearer token starts with "sfra_".
   *
   * Returns the API key row if valid, null if invalid/expired/revoked.
   * Updates last_used_at as a fire-and-forget side effect.
   */
  async validateApiKey(
    rawKey: string
  ): Promise<{
    valid: boolean;
    tenantId?: string;
    userId?: string;
    scopes?: string[];
    keyId?: string;
  }> {
    // Quick format check
    if (!rawKey.startsWith(KEY_PREFIX)) {
      return { valid: false };
    }

    const keyHash = hashApiKey(rawKey);
    const row = await this.repository.findByKeyHash(keyHash);

    if (!row) {
      return { valid: false };
    }

    // Update last_used_at in the background (non-blocking)
    this.repository.touchLastUsed(row.id).catch(() => {});

    return {
      valid: true,
      tenantId: row.tenantId,
      userId: row.createdBy,
      scopes: Array.isArray(row.scopes) ? row.scopes : [],
      keyId: row.id,
    };
  }
}

// =============================================================================
// Static Utilities (exported for use by auth middleware)
// =============================================================================

/**
 * Check if a bearer token looks like a Staffora API key (starts with sfra_)
 */
export function isStaforaApiKey(token: string): boolean {
  return token.startsWith(KEY_PREFIX);
}
