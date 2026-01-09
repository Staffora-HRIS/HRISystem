/**
 * Transaction Utilities
 *
 * Provides high-level transaction management with:
 * - Tenant context setting
 * - Automatic outbox event writing
 * - Idempotency support
 * - Rollback on error
 */

import { type DatabaseClient, type TransactionSql, hashRequestBody } from "../plugins/db";
import { type AuditService } from "../plugins/audit";

// =============================================================================
// Types
// =============================================================================

/**
 * Tenant context for transactions
 */
export interface TenantContext {
  tenantId: string;
  userId?: string;
}

/**
 * Domain event to be written to outbox
 */
export interface DomainEvent {
  /** Type of aggregate (e.g., employee, leave_request) */
  aggregateType: string;
  /** ID of the specific aggregate */
  aggregateId: string;
  /** Event type (e.g., hr.employee.created) */
  eventType: string;
  /** Event payload */
  payload: Record<string, unknown>;
  /** Event metadata (correlation IDs, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Transaction result with events
 */
export interface TransactionResult<T> {
  /** The result of the transaction */
  result: T;
  /** Events that were written to the outbox */
  events: Array<{ id: string; eventType: string }>;
}

/**
 * Options for transaction execution
 */
export interface TransactionOptions {
  /** Isolation level */
  isolationLevel?: "read committed" | "repeatable read" | "serializable";
  /** Read-only transaction */
  readOnly?: boolean;
  /** Idempotency key for this transaction */
  idempotencyKey?: string;
  /** Route key for idempotency */
  routeKey?: string;
  /** Request body for idempotency hash */
  requestBody?: unknown;
}

/**
 * Idempotency check result
 */
export interface IdempotencyCheckResult {
  /** Whether this is a new request */
  isNew: boolean;
  /** Cached response if this is a retry */
  cachedResponse?: {
    status: number;
    body: unknown;
  };
  /** Whether the request is still being processed */
  processing?: boolean;
  /** Whether the request hash mismatches */
  hashMismatch?: boolean;
}

// =============================================================================
// Transaction Manager
// =============================================================================

/**
 * Transaction manager for coordinated database operations
 */
export class TransactionManager {
  constructor(
    private db: DatabaseClient,
    private context: TenantContext
  ) {}

  /**
   * Execute a function within a transaction with tenant context
   * Automatically writes domain events to the outbox
   */
  async execute<T>(
    callback: (tx: TransactionSql, emitEvent: (event: DomainEvent) => void) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<TransactionResult<T>> {
    const { isolationLevel = "read committed", readOnly = false } = options;
    const events: DomainEvent[] = [];

    // Event collector function passed to callback
    const emitEvent = (event: DomainEvent) => {
      events.push(event);
    };

    // Execute the transaction
    const result = await this.db.withTransaction(
      this.context,
      async (tx) => {
        // Set read-only if specified
        if (readOnly) {
          await tx`SET TRANSACTION READ ONLY`;
        }

        // Execute the callback
        const callbackResult = await callback(tx, emitEvent);

        // Write events to outbox
        const eventIds: Array<{ id: string; eventType: string }> = [];
        for (const event of events) {
          const eventResult = await tx<{ id: string }[]>`
            SELECT app.write_outbox_event(
              ${this.context.tenantId}::uuid,
              ${event.aggregateType},
              ${event.aggregateId}::uuid,
              ${event.eventType},
              ${JSON.stringify(event.payload)}::jsonb,
              ${JSON.stringify(event.metadata || {})}::jsonb
            ) as id
          `;
          if (eventResult[0]) {
            eventIds.push({ id: eventResult[0].id, eventType: event.eventType });
          }
        }

        return { result: callbackResult, eventIds };
      },
      { isolationLevel }
    );

    return {
      result: result.result,
      events: result.eventIds,
    };
  }

  /**
   * Execute a read-only operation with tenant context
   * Shorthand for execute with readOnly: true
   */
  async query<T>(callback: (tx: TransactionSql) => Promise<T>): Promise<T> {
    const result = await this.execute(
      async (tx) => callback(tx),
      { readOnly: true }
    );
    return result.result;
  }

  /**
   * Execute with idempotency support
   */
  async executeIdempotent<T>(
    userId: string,
    routeKey: string,
    idempotencyKey: string,
    requestBody: unknown,
    callback: (tx: TransactionSql, emitEvent: (event: DomainEvent) => void) => Promise<T>,
    options: Omit<TransactionOptions, "idempotencyKey" | "routeKey" | "requestBody"> = {}
  ): Promise<{ result: T; fromCache: boolean }> {
    // Hash the request body
    const requestHash = await hashRequestBody(requestBody);

    // Check idempotency
    const checkResult = await this.checkIdempotency(
      userId,
      routeKey,
      idempotencyKey,
      requestHash
    );

    // Return cached response if available
    if (!checkResult.isNew && checkResult.cachedResponse) {
      return {
        result: checkResult.cachedResponse.body as T,
        fromCache: true,
      };
    }

    // Check for processing or hash mismatch
    if (checkResult.processing) {
      throw new IdempotencyError(
        "REQUEST_STILL_PROCESSING",
        "This request is still being processed"
      );
    }

    if (checkResult.hashMismatch) {
      throw new IdempotencyError(
        "IDEMPOTENCY_HASH_MISMATCH",
        "Request body does not match the original request for this idempotency key"
      );
    }

    // Execute the transaction
    try {
      const transactionResult = await this.execute(callback, options);

      // Store the result for future retries
      await this.completeIdempotentRequest(
        userId,
        routeKey,
        idempotencyKey,
        200,
        transactionResult.result
      );

      return {
        result: transactionResult.result,
        fromCache: false,
      };
    } catch (error) {
      // Abort the idempotent request on error
      await this.abortIdempotentRequest(userId, routeKey, idempotencyKey);
      throw error;
    }
  }

  /**
   * Check idempotency for a request
   */
  private async checkIdempotency(
    userId: string,
    routeKey: string,
    idempotencyKey: string,
    requestHash: string
  ): Promise<IdempotencyCheckResult> {
    const result = await this.db.withSystemContext(async (tx) => {
      return await tx<
        Array<{
          created: boolean;
          existingResponseStatus: number | null;
          existingResponseBody: unknown;
          hashMismatch: boolean;
          stillProcessing: boolean;
        }>
      >`
        SELECT * FROM app.start_idempotent_request(
          ${this.context.tenantId}::uuid,
          ${userId}::uuid,
          ${routeKey},
          ${idempotencyKey},
          ${requestHash}
        )
      `;
    });

    const row = result[0];
    if (!row) {
      return { isNew: true };
    }

    if (row.created) {
      return { isNew: true };
    }

    if (row.hashMismatch) {
      return { isNew: false, hashMismatch: true };
    }

    if (row.stillProcessing) {
      return { isNew: false, processing: true };
    }

    if (row.existingResponseStatus !== null) {
      return {
        isNew: false,
        cachedResponse: {
          status: row.existingResponseStatus,
          body: row.existingResponseBody,
        },
      };
    }

    return { isNew: true };
  }

  /**
   * Complete an idempotent request with the response
   */
  private async completeIdempotentRequest(
    userId: string,
    routeKey: string,
    idempotencyKey: string,
    status: number,
    body: unknown
  ): Promise<void> {
    await this.db.withSystemContext(async (tx) => {
      await tx`
        SELECT app.complete_idempotent_request(
          ${this.context.tenantId}::uuid,
          ${userId}::uuid,
          ${routeKey},
          ${idempotencyKey},
          ${status},
          ${JSON.stringify(body)}::jsonb
        )
      `;
    });
  }

  /**
   * Abort an idempotent request (on error)
   */
  private async abortIdempotentRequest(
    userId: string,
    routeKey: string,
    idempotencyKey: string
  ): Promise<void> {
    await this.db.withSystemContext(async (tx) => {
      await tx`
        SELECT app.abort_idempotent_request(
          ${this.context.tenantId}::uuid,
          ${userId}::uuid,
          ${routeKey},
          ${idempotencyKey}
        )
      `;
    });
  }
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Idempotency error
 */
export class IdempotencyError extends Error {
  constructor(
    public code: "IDEMPOTENCY_KEY_REUSED" | "IDEMPOTENCY_HASH_MISMATCH" | "REQUEST_STILL_PROCESSING",
    message: string
  ) {
    super(message);
    this.name = "IdempotencyError";
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a transaction manager for a tenant context
 */
export function createTransactionManager(
  db: DatabaseClient,
  tenantId: string,
  userId?: string
): TransactionManager {
  return new TransactionManager(db, { tenantId, userId });
}

/**
 * Execute a simple transaction with tenant context
 */
export async function withTransaction<T>(
  db: DatabaseClient,
  context: TenantContext,
  callback: (tx: TransactionSql) => Promise<T>
): Promise<T> {
  return db.withTransaction(context, callback);
}

/**
 * Execute a transaction with outbox event support
 */
export async function withTransactionAndEvents<T>(
  db: DatabaseClient,
  context: TenantContext,
  callback: (tx: TransactionSql, emitEvent: (event: DomainEvent) => void) => Promise<T>
): Promise<TransactionResult<T>> {
  const manager = new TransactionManager(db, context);
  return manager.execute(callback);
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a domain event
 */
export function createEvent(
  aggregateType: string,
  aggregateId: string,
  eventType: string,
  payload: Record<string, unknown>,
  metadata?: Record<string, unknown>
): DomainEvent {
  return {
    aggregateType,
    aggregateId,
    eventType,
    payload,
    metadata: {
      ...metadata,
      occurredAt: new Date().toISOString(),
    },
  };
}

/**
 * Create a correlation metadata object
 */
export function createCorrelationMetadata(
  requestId: string,
  causationId?: string,
  correlationId?: string
): Record<string, unknown> {
  return {
    requestId,
    causationId: causationId || requestId,
    correlationId: correlationId || requestId,
  };
}

// =============================================================================
// Common Event Helpers
// =============================================================================

/**
 * Helper to create a "created" event
 */
export function createdEvent(
  aggregateType: string,
  aggregateId: string,
  data: Record<string, unknown>,
  metadata?: Record<string, unknown>
): DomainEvent {
  return createEvent(
    aggregateType,
    aggregateId,
    `${aggregateType}.created`,
    {
      id: aggregateId,
      ...data,
    },
    metadata
  );
}

/**
 * Helper to create an "updated" event
 */
export function updatedEvent(
  aggregateType: string,
  aggregateId: string,
  changes: Record<string, unknown>,
  metadata?: Record<string, unknown>
): DomainEvent {
  return createEvent(
    aggregateType,
    aggregateId,
    `${aggregateType}.updated`,
    {
      id: aggregateId,
      changes,
    },
    metadata
  );
}

/**
 * Helper to create a "deleted" event
 */
export function deletedEvent(
  aggregateType: string,
  aggregateId: string,
  metadata?: Record<string, unknown>
): DomainEvent {
  return createEvent(
    aggregateType,
    aggregateId,
    `${aggregateType}.deleted`,
    {
      id: aggregateId,
    },
    metadata
  );
}

/**
 * Helper to create a custom event
 */
export function customEvent(
  aggregateType: string,
  aggregateId: string,
  action: string,
  data: Record<string, unknown>,
  metadata?: Record<string, unknown>
): DomainEvent {
  return createEvent(
    aggregateType,
    aggregateId,
    `${aggregateType}.${action}`,
    {
      id: aggregateId,
      ...data,
    },
    metadata
  );
}
