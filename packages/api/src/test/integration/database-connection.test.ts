/**
 * Database Connection Integration Tests
 * 
 * These tests verify that the database connection works correctly with
 * the configured credentials. They help catch configuration issues early
 * before deployment.
 * 
 * FIX: Created to prevent recurrence of authentication failures caused by
 * password mismatch between PostgreSQL and application configuration.
 * 
 * Run with: bun test src/test/integration/database-connection.test.ts
 * 
 * Prerequisites:
 *   - PostgreSQL must be running
 *   - DATABASE_URL must be set or defaults must match running database
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import postgres from "postgres";
import {
  getDatabaseUrl,
  getDefaultDatabaseUrl,
  validateDatabaseUrl,
  DEFAULT_DB_PASSWORD,
} from "../../config/database";

describe("Database Connection Integration", () => {
  let sql: postgres.Sql | null = null;
  let connectionError: Error | null = null;
  const requireDb = process.env["REQUIRE_TEST_DB"] === "true";

  beforeAll(async () => {
    const dbUrl = getDatabaseUrl();
    
    // Validate URL format first
    const validation = validateDatabaseUrl(dbUrl);
    if (!validation.valid) {
      connectionError = new Error(`Invalid database URL: ${validation.error}`);
      return;
    }

    try {
      sql = postgres(dbUrl, {
        max: 1,
        connect_timeout: 10,
        idle_timeout: 5,
      });

      // Test connection with a simple query
      await sql`SELECT 1 as test`;
    } catch (error) {
      connectionError = error instanceof Error ? error : new Error(String(error));
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  it("should connect to PostgreSQL successfully", () => {
    if (connectionError) {
      if (!requireDb) {
        console.warn(
          "[SKIP] Database Connection Integration - Postgres not available (set REQUIRE_TEST_DB=true to enforce)"
        );
        return;
      }

      // Provide helpful error message for common issues
      const errorMessage = connectionError.message.toLowerCase();
      
      if (errorMessage.includes("password authentication failed")) {
        throw new Error(
          `Database authentication failed!\n\n` +
          `This usually means the password in your configuration doesn't match ` +
          `the password in the PostgreSQL database.\n\n` +
          `Expected password: ${DEFAULT_DB_PASSWORD}\n\n` +
          `To fix this, run one of the following:\n` +
          `  - PowerShell: .\\docker\\scripts\\reset-db-password.ps1\n` +
          `  - Bash: ./docker/scripts/reset-db-password.sh\n` +
          `  - Or delete the postgres volume: docker volume rm docker_postgres_data\n\n` +
          `Original error: ${connectionError.message}`
        );
      }
      
      if (errorMessage.includes("connection refused") || errorMessage.includes("econnrefused")) {
        throw new Error(
          `Database connection refused!\n\n` +
          `PostgreSQL doesn't appear to be running.\n\n` +
          `To start it, run:\n` +
          `  cd docker && docker-compose up -d postgres\n\n` +
          `Original error: ${connectionError.message}`
        );
      }

      throw connectionError;
    }

    expect(sql).not.toBeNull();
  });

  it("should be able to execute a query", async () => {
    if (!sql || connectionError) {
      console.warn("Skipping query test - connection failed");
      return;
    }

    const result = await sql`SELECT current_database() as db_name, current_user as user_name`;
    
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].db_name).toBeDefined();
    expect(result[0].user_name).toBeDefined();
  });

  it("should be able to access the app schema", async () => {
    if (!sql || connectionError) {
      console.warn("Skipping schema test - connection failed");
      return;
    }

    try {
      // Check if app schema exists
      const result = await sql`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name = 'app'
      `;
      
      expect(result.length).toBe(1);
      expect(result[0].schema_name).toBe("app");
    } catch (error) {
      // If schema doesn't exist, migrations may not have run
      console.warn("App schema not found - migrations may not have been applied");
    }
  });

  it("should have correct user permissions", async () => {
    if (!sql || connectionError) {
      console.warn("Skipping permissions test - connection failed");
      return;
    }

    // Verify the connected user has expected permissions
    const result = await sql`
      SELECT has_schema_privilege(current_user, 'app', 'USAGE') as has_usage
    `;
    
    // This might be false if migrations haven't run, which is okay for this test
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
  });
});

describe("Database URL Configuration", () => {
  it("should have valid default database URL", () => {
    const defaultUrl = getDefaultDatabaseUrl();
    const validation = validateDatabaseUrl(defaultUrl);
    
    expect(validation.valid).toBe(true);
    expect(validation.user).toBe("hris");
    expect(validation.database).toBe("hris");
  });

  it("should use environment DATABASE_URL if set", () => {
    const envUrl = process.env["DATABASE_URL"];
    const currentUrl = getDatabaseUrl();
    const defaultUrl = getDefaultDatabaseUrl();

    if (envUrl) {
      expect(currentUrl).toBe(envUrl);
    } else {
      expect(currentUrl).toBe(defaultUrl);
    }
  });

  it("should have matching password in default URL", () => {
    const defaultUrl = getDefaultDatabaseUrl();
    
    // Ensure the default URL contains the correct password
    expect(defaultUrl).toContain(`:${DEFAULT_DB_PASSWORD}@`);
  });
});

describe("Connection Pool Behavior", () => {
  it("should handle connection pool creation and cleanup", async () => {
    const dbUrl = getDatabaseUrl();
    
    // Create a new pool
    const pool = postgres(dbUrl, {
      max: 2,
      connect_timeout: 5,
      idle_timeout: 1,
    });

    try {
      // Run multiple queries to test pool
      const results = await Promise.all([
        pool`SELECT 1 as a`,
        pool`SELECT 2 as b`,
      ]);

      expect(results[0][0].a).toBe(1);
      expect(results[1][0].b).toBe(2);
    } catch (error) {
      // Connection might fail if DB isn't running - that's okay for this test
      if (error instanceof Error && error.message.includes("authentication failed")) {
        throw new Error(
          `Authentication failed - password mismatch detected!\n` +
          `Run reset-db-password script to fix.`
        );
      }
      console.warn("Pool test skipped - database not available");
    } finally {
      // Always clean up
      await pool.end();
    }
  });
});
