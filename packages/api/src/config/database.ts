/**
 * Centralized Database Configuration Constants
 *
 * This module provides a single source of truth for all database configuration.
 *
 * IMPORTANT: No passwords are hardcoded in source. All credentials must come
 * from environment variables (DATABASE_APP_URL, DATABASE_URL, DB_PASSWORD, etc.)
 * or docker/.env. The application will refuse to start without proper configuration.
 */

// =============================================================================
// Default Database Configuration Constants
// =============================================================================

/**
 * Default PostgreSQL user for development
 * Must match docker-compose.yml: POSTGRES_USER default
 */
export const DEFAULT_DB_USER = "hris";

/**
 * Default PostgreSQL database name
 * Must match docker-compose.yml: POSTGRES_DB default
 */
export const DEFAULT_DB_NAME = "hris";

/**
 * Default PostgreSQL host for local development
 */
export const DEFAULT_DB_HOST = "localhost";

/**
 * Default PostgreSQL port
 */
export const DEFAULT_DB_PORT = 5432;

/**
 * Default test database name
 */
export const DEFAULT_TEST_DB_NAME = "hris_test";

// =============================================================================
// Connection URL Builders
// =============================================================================

/**
 * Build a PostgreSQL connection URL from components.
 * Password is required -- no hardcoded fallback.
 */
export function buildDatabaseUrl(options: {
  user?: string;
  password: string;
  host?: string;
  port?: number;
  database?: string;
}): string {
  const user = encodeURIComponent(options.user || DEFAULT_DB_USER);
  const password = encodeURIComponent(options.password);
  const host = options.host || DEFAULT_DB_HOST;
  const port = options.port || DEFAULT_DB_PORT;
  const database = options.database || DEFAULT_DB_NAME;

  return `postgres://${user}:${password}@${host}:${port}/${database}`;
}

/**
 * Get database URL from environment.
 * Requires DATABASE_URL to be set. Throws if missing.
 */
export function getDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "DATABASE_URL environment variable is required. Set it in docker/.env"
    );
  }
  return url;
}

/**
 * Get test database URL from environment.
 * Falls back to TEST_DATABASE_URL env var; throws if missing.
 */
export function getTestDatabaseUrl(): string {
  const url = process.env["TEST_DATABASE_URL"];
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL environment variable is required for tests."
    );
  }
  return url;
}

// =============================================================================
// Redis Configuration Constants
// =============================================================================

/**
 * Default Redis URL for local development
 */
export const DEFAULT_REDIS_URL = "redis://localhost:6379";

/**
 * Get Redis URL from environment or use development default
 */
export function getRedisUrl(): string {
  return process.env["REDIS_URL"] || DEFAULT_REDIS_URL;
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate that the database URL contains expected credentials
 * Used in tests to catch configuration mismatches early
 */
export function validateDatabaseUrl(url: string): {
  valid: boolean;
  user?: string;
  host?: string;
  port?: number;
  database?: string;
  error?: string;
} {
  try {
    const parsed = new URL(url);
    
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return { valid: false, error: "Invalid protocol, expected postgres://" };
    }

    return {
      valid: true,
      user: decodeURIComponent(parsed.username),
      host: parsed.hostname,
      port: parseInt(parsed.port) || DEFAULT_DB_PORT,
      database: parsed.pathname.replace(/^\//, ""),
    };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to parse database URL: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
