/**
 * PostgreSQL Database Plugin
 *
 * Provides database connectivity using the 'postgres' package.
 * Features:
 * - Connection pool management
 * - Transaction wrapper with tenant context setting
 * - Query logging in development
 * - Type-safe query interface
 *
 * ==========================================================================
 * CONNECTION BUDGET
 * ==========================================================================
 * With PgBouncer (production / Docker):
 *   App pools connect to PgBouncer (port 6432) which multiplexes onto a
 *   smaller number of PostgreSQL backend connections (default_pool_size=25).
 *   PgBouncer accepts up to max_client_conn=200 client connections.
 *
 *   Pool                          | max | Driver      | Notes
 *   ------------------------------|-----|-------------|-------------------------
 *   postgres.js (API + workers)   |  10 | postgres.js | Per-process pool via getDbClient()
 *   Better Auth + lockout handler |   5 | pg (Pool)   | Required by better-auth library
 *   ------------------------------|-----|-------------|-------------------------
 *   TOTAL per process             |  15 |             | PgBouncer handles multiplexing
 *
 * Without PgBouncer (local development / tests):
 *   Direct connection to PostgreSQL (max_connections = 100).
 *
 *   Pool                          | max | Driver      | Notes
 *   ------------------------------|-----|-------------|-------------------------
 *   postgres.js (API + workers)   |  20 | postgres.js | Shared singleton via getDbClient()
 *   Better Auth + lockout handler |   5 | pg (Pool)   | Required by better-auth library
 *   ------------------------------|-----|-------------|-------------------------
 *   TOTAL                         |  25 |             | Leaves 75 for superuser/migrations
 * ==========================================================================
 *
 * PGBOUNCER COMPATIBILITY:
 * When DATABASE_APP_URL points to PgBouncer (port 6432), prepared statements
 * are automatically disabled (prepare: false) because PgBouncer in transaction
 * mode reassigns server connections between transactions, making server-side
 * prepared statements invalid. This is detected by checking the port number
 * or the PGBOUNCER_ENABLED=true env var.
 *
 * The Scheduler and OutboxProcessor reuse the postgres.js singleton pool
 * (via getDbClient()) when launched through the worker entry points. Only
 * when run as standalone scripts do they create their own postgres.js pool.
 *
 * Better Auth requires the 'pg' driver (Pool) and cannot use postgres.js
 * directly. Its pool is capped at 5 connections and shared with the
 * account lockout handler in better-auth-handler.ts.
 */

import { Elysia } from "elysia";
import postgres, { type Sql, type TransactionSql, type Row } from "postgres";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Database configuration from environment variables
 */
export interface DbConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  maxConnections: number;
  idleTimeout: number;
  connectTimeout: number;
  ssl: boolean | "require" | "prefer";
  /** Disable prepared statements for PgBouncer transaction-mode compatibility */
  prepare: boolean;
}

/**
 * Detect whether the connection URL points to PgBouncer.
 *
 * Heuristics (in priority order):
 * 1. PGBOUNCER_ENABLED env var explicitly set to "true"
 * 2. Connection port is 6432 (PgBouncer conventional port)
 *
 * When PgBouncer is detected:
 * - Prepared statements must be disabled (prepare: false)
 * - Pool sizes can be smaller (PgBouncer handles multiplexing)
 */
function isPgBouncerConnection(port: number): boolean {
  if (process.env["PGBOUNCER_ENABLED"] === "true") return true;
  return port === 6432;
}

/**
 * Load database configuration from environment.
 *
 * Requires DATABASE_APP_URL (preferred) or DATABASE_URL to be set.
 * Falls back to component env vars (DB_HOST, DB_PORT, etc.) only if
 * DB_PASSWORD is also set. Throws on startup if no credentials are available.
 */
function loadDbConfig(): DbConfig {
  // Prefer DATABASE_APP_URL (hris_app with NOBYPASSRLS) over DATABASE_URL
  const databaseUrl = process.env["DATABASE_APP_URL"] || process.env["DATABASE_URL"];
  if (databaseUrl) {
    const url = new URL(databaseUrl);
    const port = Number(url.port) || 5432;
    const viaPgBouncer = isPgBouncerConnection(port);

    const sslMode = url.searchParams.get("sslmode");
    const ssl: DbConfig["ssl"] = sslMode === "require" || sslMode === "prefer"
      ? sslMode
      : process.env["DB_SSL"] === "true"
      ? "require"
      : false;

    return {
      host: url.hostname,
      port,
      database: url.pathname.replace(/^\//, "") || "hris",
      username: decodeURIComponent(url.username || "hris"),
      password: decodeURIComponent(url.password || ""),
      // Smaller pool when behind PgBouncer (it handles multiplexing)
      maxConnections: Number(process.env["DB_MAX_CONNECTIONS"]) || (viaPgBouncer ? 10 : 20),
      idleTimeout: Number(process.env["DB_IDLE_TIMEOUT"]) || 20,
      connectTimeout: Number(process.env["DB_CONNECT_TIMEOUT"]) || 10,
      ssl,
      // PgBouncer transaction mode does not support server-side prepared statements
      prepare: !viaPgBouncer,
    };
  }

  // Component env var fallback -- DB_PASSWORD is required (no hardcoded default)
  const dbPassword = process.env["DB_PASSWORD"];
  if (!dbPassword) {
    throw new Error(
      "DATABASE_APP_URL environment variable is required. Set it in docker/.env"
    );
  }

  const port = Number(process.env["DB_PORT"]) || 5432;
  const viaPgBouncer = isPgBouncerConnection(port);

  return {
    host: process.env["DB_HOST"] || "localhost",
    port,
    database: process.env["DB_NAME"] || "hris",
    username: process.env["DB_USER"] || "hris",
    password: dbPassword,
    maxConnections: Number(process.env["DB_MAX_CONNECTIONS"]) || (viaPgBouncer ? 10 : 20),
    idleTimeout: Number(process.env["DB_IDLE_TIMEOUT"]) || 30,
    connectTimeout: Number(process.env["DB_CONNECT_TIMEOUT"]) || 10,
    ssl: process.env["DB_SSL"] === "true" ? "require" : false,
    prepare: !viaPgBouncer,
  };
}

// =============================================================================
// Types
// =============================================================================

/**
 * Tenant context for RLS
 */
export interface TenantContext {
  tenantId: string;
  userId?: string;
}

/**
 * Transaction options
 */
export interface TransactionOptions {
  isolationLevel?: "read committed" | "repeatable read" | "serializable";
  accessMode?: "read write" | "read only";
}

/**
 * Query result with metadata
 */
export interface QueryResult<T extends Row> {
  rows: T[];
  count: number;
  command: string;
}

// =============================================================================
// Database Client
// =============================================================================

/**
 * Database client wrapper with tenant context support
 */
export class DatabaseClient {
  private sql: Sql<Record<string, unknown>>;
  /** The PostgreSQL role name used for this connection pool */
  public readonly connectionUser: string;

  constructor(config: DbConfig) {
    this.connectionUser = config.username;
    const debugEnabled = process.env["DB_DEBUG"] === "true";
    const viaPgBouncer = !config.prepare;

    if (viaPgBouncer) {
      console.log(`[DB] PgBouncer detected (port=${config.port}) — prepared statements disabled`);
    }

    this.sql = postgres({
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
      password: config.password,
      max: config.maxConnections,
      idle_timeout: config.idleTimeout,
      connect_timeout: config.connectTimeout,
      ssl: config.ssl,
      // Disable prepared statements when connecting through PgBouncer.
      // PgBouncer in transaction mode reassigns server connections between
      // transactions, so server-side prepared statements become invalid.
      prepare: config.prepare,
      // Use the app schema by default
      connection: {
        search_path: "app,public",
      },
      // Transform column names from snake_case to camelCase
      transform: {
        column: {
          to: postgres.toCamel,
          from: postgres.fromCamel,
        },
      },
      // Debug logging is opt-in via DB_DEBUG=true to avoid leaking PII
      debug: debugEnabled
        ? (_connection: number, query: string, params: unknown[]) => {
            console.log(`[DB Query] ${query.substring(0, 200)}`);
            if (params && params.length > 0) {
              console.log(`[DB Params] count=${params.length}`);
            }
          }
        : undefined,
      onnotice: debugEnabled
        ? (notice) => {
            console.log(`[DB Notice] ${notice.message}`);
          }
        : undefined,
    });
  }

  /**
   * Get the raw postgres client for direct queries
   */
  get client(): Sql<Record<string, unknown>> {
    return this.sql;
  }

  /**
   * Execute a query without tenant context
   * Use this for system operations like migrations
   */
  async query<T extends Row>(
    strings: TemplateStringsArray,
    ...values: any[]
  ): Promise<T[]> {
    return (await this.sql<T[]>(strings, ...(values as any))) as T[];
  }

  /**
   * Execute a query with tenant context set
   * This is the primary method for tenant-scoped queries
   */
  async queryWithTenant<T extends Row>(
    context: TenantContext,
    strings: TemplateStringsArray,
    ...values: any[]
  ): Promise<T[]> {
    return (await this.sql.begin(async (tx) => {
      // Set tenant context for RLS
      await tx`SELECT app.set_tenant_context(${context.tenantId}::uuid, ${context.userId || null}::uuid)`;

      // Execute the query
      const result = (await tx<T[]>(strings, ...(values as any))) as T[];

      return result;
    })) as T[];
  }

  /**
   * Execute multiple queries within a transaction with tenant context
   * The transaction callback receives a sql client with tenant context already set
   */
  async withTransaction<T>(
    context: TenantContext,
    callback: (tx: TransactionSql<Record<string, unknown>>) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const { isolationLevel, accessMode } = options;

    return (await this.sql.begin(async (tx) => {
      if (!context || typeof (context as any).tenantId !== "string" || !(context as any).tenantId) {
        throw new Error("Tenant context required for transaction");
      }

      // Set isolation level using a whitelist of known values (no sql.unsafe)
      if (isolationLevel) {
        switch (isolationLevel) {
          case "read committed":
            await tx`SET TRANSACTION ISOLATION LEVEL READ COMMITTED`;
            break;
          case "repeatable read":
            await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
            break;
          case "serializable":
            await tx`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`;
            break;
          default: {
            const _exhaustive: never = isolationLevel;
            throw new Error(`Invalid isolation level: ${_exhaustive}`);
          }
        }
      }

      // Set access mode using a whitelist of known values (no sql.unsafe)
      if (accessMode) {
        switch (accessMode) {
          case "read write":
            await tx`SET TRANSACTION READ WRITE`;
            break;
          case "read only":
            await tx`SET TRANSACTION READ ONLY`;
            break;
          default: {
            const _exhaustive: never = accessMode;
            throw new Error(`Invalid access mode: ${_exhaustive}`);
          }
        }
      }

      // Set tenant context for RLS
      await tx`SELECT app.set_tenant_context(${context.tenantId}::uuid, ${context.userId || null}::uuid)`;

      return await callback(tx);
    })) as T;
  }

  /**
   * Execute a query in system context (bypasses RLS)
   * Use with extreme caution - only for migrations, seeds, and system operations
   */
  async withSystemContext<T>(
    callback: (tx: TransactionSql<Record<string, unknown>>) => Promise<T>
  ): Promise<T> {
    return (await this.sql.begin(async (tx) => {
      // Set valid nil UUIDs to prevent RLS policy cast errors on empty string.
      // Some policies check both current_tenant and current_user with ::uuid casts,
      // which fail when the setting is empty or missing.
      await tx`SELECT set_config('app.current_tenant', '00000000-0000-0000-0000-000000000000', true)`;
      await tx`SELECT set_config('app.current_user', '00000000-0000-0000-0000-000000000000', true)`;
      // Enable system context to bypass RLS
      await tx`SELECT app.enable_system_context()`;

      try {
        const result = await callback(tx);

        // Disable system context
        await tx`SELECT app.disable_system_context()`;

        return result;
      } catch (error) {
        // Disable context even on error
        try {
          await tx`SELECT app.disable_system_context()`;
        } catch {
          // Ignore errors during cleanup
        }
        throw error;
      }
    })) as T;
  }

  /**
   * Health check - verify database connectivity
   */
  async healthCheck(): Promise<{ status: "up" | "down"; latency: number }> {
    const start = Date.now();
    try {
      await this.sql`SELECT 1`;
      return {
        status: "up",
        latency: Date.now() - start,
      };
    } catch {
      return {
        status: "down",
        latency: Date.now() - start,
      };
    }
  }

  /**
   * Close all connections in the pool
   */
  async close(): Promise<void> {
    await this.sql.end();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let dbClient: DatabaseClient | null = null;

/**
 * Get or create the database client singleton
 */
export function getDbClient(): DatabaseClient {
  if (!dbClient) {
    const config = loadDbConfig();
    dbClient = new DatabaseClient(config);
  }
  return dbClient;
}

/**
 * Close the database client (for cleanup)
 */
export async function closeDbClient(): Promise<void> {
  if (dbClient) {
    await dbClient.close();
    dbClient = null;
  }
}

// =============================================================================
// Elysia Plugin
// =============================================================================

/**
 * Database plugin for Elysia
 *
 * Adds database client to the request context.
 * Also handles graceful shutdown.
 *
 * Usage:
 * ```ts
 * const app = new Elysia()
 *   .use(dbPlugin())
 *   .get('/example', ({ db }) => {
 *     return db.query`SELECT * FROM users`;
 *   });
 * ```
 */
export function dbPlugin() {
  const db = getDbClient();

  return new Elysia({ name: "db" })
    .decorate("db", db)
    .onStart(async () => {
      console.log(`[DB] Database plugin initialized (role=${db.connectionUser})`);

      // Verify connection on startup
      const health = await db.healthCheck();
      if (health.status === "up") {
        console.log(`[DB] Connection verified (${health.latency}ms, role=${db.connectionUser})`);
      } else {
        console.error("[DB] Failed to connect to database");
        throw new Error("Database connection failed");
      }
    })
    .onStop(async () => {
      console.log("[DB] Closing database connections...");
      await closeDbClient();
      console.log("[DB] Database connections closed");
    });
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a hash of the request body for idempotency.
 * Uses Bun.hash for speed when available, falls back to Web Crypto.
 */
export async function hashRequestBody(body: unknown): Promise<string> {
  const bodyStr = JSON.stringify(body || {});

  // Bun.hash is ~10x faster than Web Crypto for small payloads
  if (typeof Bun !== "undefined" && Bun.hash) {
    return Bun.hash(bodyStr).toString(16);
  }

  const data = new TextEncoder().encode(bodyStr);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hashBuffer);
  // Avoid Array.from + map allocations — build hex string directly
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

// =============================================================================
// Exports
// =============================================================================

export type { Sql, TransactionSql, Row };
