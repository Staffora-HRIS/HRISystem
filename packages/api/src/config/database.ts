/**
 * Centralized Database Configuration Constants
 * 
 * This module provides a single source of truth for all database configuration
 * defaults to prevent inconsistencies that cause authentication failures.
 * 
 * FIX: Created to prevent password mismatch issues where different modules
 * used different default passwords (e.g., "hris" vs "hris_dev_password")
 * causing PostgreSQL authentication failures.
 * 
 * IMPORTANT: All modules that need database connection defaults should import
 * from this module instead of hardcoding their own values.
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
 * Default PostgreSQL password for development
 * Must match docker-compose.yml: POSTGRES_PASSWORD default
 * 
 * CRITICAL: This value MUST be kept in sync with:
 * - docker/docker-compose.yml (POSTGRES_PASSWORD default)
 * - docker/.env.example (POSTGRES_PASSWORD)
 * - docker/.env (POSTGRES_PASSWORD)
 */
export const DEFAULT_DB_PASSWORD = "hris_dev_password";

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
 * Build a PostgreSQL connection URL from components
 */
export function buildDatabaseUrl(options: {
  user?: string;
  password?: string;
  host?: string;
  port?: number;
  database?: string;
} = {}): string {
  const user = encodeURIComponent(options.user || DEFAULT_DB_USER);
  const password = encodeURIComponent(options.password || DEFAULT_DB_PASSWORD);
  const host = options.host || DEFAULT_DB_HOST;
  const port = options.port || DEFAULT_DB_PORT;
  const database = options.database || DEFAULT_DB_NAME;

  return `postgres://${user}:${password}@${host}:${port}/${database}`;
}

/**
 * Get default database URL for development
 */
export function getDefaultDatabaseUrl(): string {
  return buildDatabaseUrl();
}

/**
 * Get default test database URL for development
 */
export function getDefaultTestDatabaseUrl(): string {
  return buildDatabaseUrl({ database: DEFAULT_TEST_DB_NAME });
}

/**
 * Get database URL from environment or use development default
 */
export function getDatabaseUrl(): string {
  return process.env["DATABASE_URL"] || getDefaultDatabaseUrl();
}

/**
 * Get test database URL from environment or use development default
 */
export function getTestDatabaseUrl(): string {
  return process.env["TEST_DATABASE_URL"] || getDefaultTestDatabaseUrl();
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
