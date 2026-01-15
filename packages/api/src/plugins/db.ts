/**
 * PostgreSQL Database Plugin
 *
 * Provides database connectivity using the 'postgres' package.
 * Features:
 * - Connection pool management
 * - Transaction wrapper with tenant context setting
 * - Query logging in development
 * - Type-safe query interface
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
}

/**
 * Load database configuration from environment
 */
function loadDbConfig(): DbConfig {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl) {
    const url = new URL(databaseUrl);

    const sslMode = url.searchParams.get("sslmode");
    const ssl: DbConfig["ssl"] = sslMode === "require" || sslMode === "prefer"
      ? sslMode
      : process.env["DB_SSL"] === "true"
      ? "require"
      : false;

    return {
      host: url.hostname,
      port: Number(url.port) || 5432,
      database: url.pathname.replace(/^\//, "") || "hris",
      username: decodeURIComponent(url.username || "hris"),
      password: decodeURIComponent(url.password || ""),
      maxConnections: Number(process.env["DB_MAX_CONNECTIONS"]) || 20,
      idleTimeout: Number(process.env["DB_IDLE_TIMEOUT"]) || 30,
      connectTimeout: Number(process.env["DB_CONNECT_TIMEOUT"]) || 10,
      ssl,
    };
  }

  return {
    host: process.env["DB_HOST"] || "localhost",
    port: Number(process.env["DB_PORT"]) || 5432,
    database: process.env["DB_NAME"] || "hris",
    username: process.env["DB_USER"] || "hris",
    password: process.env["DB_PASSWORD"] || "hris_dev_password",
    maxConnections: Number(process.env["DB_MAX_CONNECTIONS"]) || 20,
    idleTimeout: Number(process.env["DB_IDLE_TIMEOUT"]) || 30,
    connectTimeout: Number(process.env["DB_CONNECT_TIMEOUT"]) || 10,
    ssl: process.env["DB_SSL"] === "true" ? "require" : false,
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
  private isProduction: boolean;

  constructor(config: DbConfig) {
    this.isProduction = process.env["NODE_ENV"] === "production";

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
      // Debug logging in development
      debug: (connection, query, params) => {
        if (!this.isProduction) {
          console.log(`[DB Query] ${query.substring(0, 200)}...`);
          if (params && params.length > 0) {
            console.log(`[DB Params] ${JSON.stringify(params).substring(0, 100)}`);
          }
        }
      },
      onnotice: (notice) => {
        if (!this.isProduction) {
          console.log(`[DB Notice] ${notice.message}`);
        }
      },
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

      // Clear context (optional, transaction will end anyway)
      await tx`SELECT app.clear_tenant_context()`;

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

      if (isolationLevel) {
        await tx.unsafe(
          `SET TRANSACTION ISOLATION LEVEL ${isolationLevel.toUpperCase()}`
        );
      }

      if (accessMode) {
        await tx.unsafe(`SET TRANSACTION ${accessMode.toUpperCase()}`);
      }

      // Set tenant context for RLS
      await tx`SELECT app.set_tenant_context(${context.tenantId}::uuid, ${context.userId || null}::uuid)`;

      try {
        const result = await callback(tx);

        await tx`SELECT app.clear_tenant_context()`;

        return result;
      } catch (error) {
        try {
          await tx`SELECT app.clear_tenant_context()`;
        } catch {
          // Ignore errors during cleanup
        }
        throw error;
      }
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
      console.log("[DB] Database plugin initialized");

      // Verify connection on startup
      const health = await db.healthCheck();
      if (health.status === "up") {
        console.log(`[DB] Connection verified (${health.latency}ms)`);
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
 * Generate a hash of the request body for idempotency
 */
export async function hashRequestBody(body: unknown): Promise<string> {
  const bodyStr = JSON.stringify(body || {});
  const encoder = new TextEncoder();
  const data = encoder.encode(bodyStr);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Utility to build dynamic WHERE clauses
 */
export function buildWhereClause(
  sql: Sql<Record<string, unknown>>,
  conditions: Record<string, unknown>
): postgres.PendingQuery<any> {
  const entries = Object.entries(conditions).filter(
    ([, value]) => value !== undefined && value !== null
  );

  if (entries.length === 0) {
    return sql`TRUE`;
  }

  const fragments = entries.map(([key, value], index) => {
    const column = sql(key);
    if (index === 0) {
      return sql`${column} = ${value as any}`;
    }
    return sql`AND ${column} = ${value as any}`;
  });

  return sql`${fragments}`;
}

// =============================================================================
// Exports
// =============================================================================

export type { Sql, TransactionSql, Row };
