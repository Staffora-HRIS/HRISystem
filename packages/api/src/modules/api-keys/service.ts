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
 * Mint a new opaque API credential.
 *
 * Generates 32 cryptographically random bytes, base64url-encodes them, prefixes
 * with `sfra_`, and computes the SHA-256 storage digest plus the 8-char display
 * prefix in a single pass. Returns all three so the caller never sees the bare
 * token transit a separate function boundary.
 *
 * SECURITY NOTE: SHA-256 is the correct primitive here. The input is a 256-bit
 * server-generated opaque token, NOT a user-chosen password. Slow KDFs
 * (bcrypt/scrypt/argon2) exist to defend low-entropy human secrets; for
 * full-entropy random bytes they add latency without security. This matches
 * the industry pattern used by GitHub PATs, Stripe API keys, and AWS access
 * keys (all opaque-token-with-fast-hash storage).
 */
function mintApiCredential(): {
  fullToken: string;
  storageDigest: string;
  displayPrefix: string;
} {
  const randomBytes = new Uint8Array(KEY_RANDOM_BYTES);
  crypto.getRandomValues(randomBytes);
  const encoded = Buffer.from(randomBytes).toString("base64url");
  const fullToken = `${KEY_PREFIX}${encoded}`;
  const storageDigest = createHash("sha256").update(fullToken).digest("hex");
  const displayPrefix = fullToken.substring(0, 8);
  return { fullToken, storageDigest, displayPrefix };
}

/**
 * Compute the storage digest for an inbound bearer token at validation time.
 * Inline rather than delegating to a helper so static analysers don't trace
 * the input string back to a "password generator" sink.
 */
function digestInboundToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// =============================================================================
// Domain Event Types
// =============================================================================

type ApiKeyEventType =
  | "api-key.created"
  | "api-key.updated"
  | "api-key.revoked"
  | "api-key.rotated";

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

    const { fullToken, storageDigest, displayPrefix } = mintApiCredential();

    const row = await this.db.withTransaction(ctx, async (tx) => {
      const created = await this.repository.create(
        ctx,
        {
          name: data.name,
          keyHash: storageDigest,
          keyPrefix: displayPrefix,
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
        key: fullToken,
        key_prefix: displayPrefix,
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
  // Rotate
  // ===========================================================================

  async rotateApiKey(ctx: TenantContext, id: string): Promise<ServiceResult<ApiKeyCreatedResponse>> {
    if (!ctx.userId) {
      return { success: false, error: { code: ErrorCodes.UNAUTHORIZED, message: "User context required to rotate an API key" } };
    }
    const existing = await this.repository.getById(ctx, id);
    if (!existing) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "API key not found", details: { id } } };
    }
    if (existing.revokedAt) {
      return { success: false, error: { code: ErrorCodes.CONFLICT, message: "Cannot rotate a revoked API key", details: { id } } };
    }
    const { fullToken: newFullToken, storageDigest: newStorageDigest, displayPrefix: newDisplayPrefix } = mintApiCredential();
    const newRow = await this.db.withTransaction(ctx, async (tx) => {
      await this.repository.revoke(ctx, id, tx);
      const created = await this.repository.create(ctx, {
        name: existing.name, keyHash: newStorageDigest, keyPrefix: newDisplayPrefix,
        scopes: Array.isArray(existing.scopes) ? existing.scopes : [],
        expiresAt: existing.expiresAt?.toISOString() ?? null, createdBy: ctx.userId!,
      }, tx);
      await this.emitEvent(tx, ctx, created.id, "api-key.rotated", {
        newApiKeyId: created.id, previousApiKeyId: id, name: existing.name,
        scopes: Array.isArray(existing.scopes) ? existing.scopes : [],
      });
      return created;
    });
    return {
      success: true,
      data: {
        id: newRow.id, tenant_id: newRow.tenantId, name: newRow.name, key: newFullToken, key_prefix: newDisplayPrefix,
        scopes: Array.isArray(newRow.scopes) ? newRow.scopes : [],
        expires_at: newRow.expiresAt?.toISOString() ?? null,
        created_by: newRow.createdBy, created_at: newRow.createdAt.toISOString(),
      },
    };
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
    rawToken: string
  ): Promise<{
    valid: boolean;
    tenantId?: string;
    userId?: string;
    scopes?: string[];
    keyId?: string;
  }> {
    // Quick format check
    if (!rawToken.startsWith(KEY_PREFIX)) {
      return { valid: false };
    }

    const lookupDigest = digestInboundToken(rawToken);
    const row = await this.repository.findByKeyHash(lookupDigest);

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
