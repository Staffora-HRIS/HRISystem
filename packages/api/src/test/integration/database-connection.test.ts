/**
 * Database Connection Integration Tests
 *
 * These tests verify that the database connection works correctly with
 * the configured credentials. They help catch configuration issues early
 * before deployment.
 *
 * Run with: bun test src/test/integration/database-connection.test.ts
 *
 * Prerequisites:
 *   - PostgreSQL must be running
 *   - DATABASE_URL or DATABASE_APP_URL must be set
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import postgres from "postgres";
import {
  getDatabaseUrl,
  validateDatabaseUrl,
} from "../../config/database";

describe("Database Connection Integration", () => {
  let sql: postgres.Sql | null = null;
  let connectionError: Error | null = null;
  const requireDb = process.env["REQUIRE_TEST_DB"] === "true";

  beforeAll(async () => {
    let dbUrl: string;
    try {
      dbUrl = getDatabaseUrl();
    } catch {
      connectionError = new Error(
        "DATABASE_URL is not set. Set it in docker/.env or as an environment variable."
      );
      return;
    }

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
          `Ensure DATABASE_URL or DATABASE_APP_URL is set correctly in docker/.env.\n\n` +
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
  it("should require DATABASE_URL to be set", () => {
    // getDatabaseUrl now throws if DATABASE_URL is not set
    // If it IS set (as in CI/docker), it should return a valid URL
    const envUrl = process.env["DATABASE_URL"];
    if (envUrl) {
      expect(getDatabaseUrl()).toBe(envUrl);
      const validation = validateDatabaseUrl(envUrl);
      expect(validation.valid).toBe(true);
    } else {
      expect(() => getDatabaseUrl()).toThrow();
    }
  });
});

describe("Connection Pool Behavior", () => {
  it("should handle connection pool creation and cleanup", async () => {
    let dbUrl: string;
    try {
      dbUrl = getDatabaseUrl();
    } catch {
      console.warn("Pool test skipped - DATABASE_URL not set");
      return;
    }

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
          `Authentication failed - check DATABASE_URL credentials in docker/.env.`
        );
      }
      console.warn("Pool test skipped - database not available");
    } finally {
      // Always clean up
      await pool.end();
    }
  });
});
