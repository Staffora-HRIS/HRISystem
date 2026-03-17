/**
 * Database Configuration Tests
 *
 * These tests ensure that database configuration is consistent across
 * all modules to prevent authentication failures.
 *
 * After the hardcoded-password removal, these tests verify:
 * - Non-password defaults are correct
 * - buildDatabaseUrl requires a password argument
 * - getDatabaseUrl / getTestDatabaseUrl throw when env vars are missing
 * - No hardcoded passwords remain in source files
 */

import { describe, it, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  DEFAULT_DB_USER,
  DEFAULT_DB_NAME,
  DEFAULT_DB_HOST,
  DEFAULT_DB_PORT,
  DEFAULT_REDIS_URL,
  buildDatabaseUrl,
  getDatabaseUrl,
  getTestDatabaseUrl,
  validateDatabaseUrl,
} from "./database";

// =============================================================================
// Configuration Constants Tests
// =============================================================================

describe("Database Configuration Constants", () => {
  it("should have correct default user", () => {
    expect(DEFAULT_DB_USER).toBe("hris");
  });

  it("should have correct default database name", () => {
    expect(DEFAULT_DB_NAME).toBe("hris");
  });

  it("should have correct default host", () => {
    expect(DEFAULT_DB_HOST).toBe("localhost");
  });

  it("should have correct default port", () => {
    expect(DEFAULT_DB_PORT).toBe(5432);
  });

  it("should have correct default Redis URL", () => {
    expect(DEFAULT_REDIS_URL).toBe("redis://localhost:6379");
  });

  it("should NOT export DEFAULT_DB_PASSWORD (hardcoded passwords removed)", () => {
    // Ensure no password constant is exported
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exports = require("./database");
    expect(exports.DEFAULT_DB_PASSWORD).toBeUndefined();
    expect(exports.DEFAULT_APP_DB_PASSWORD).toBeUndefined();
  });
});

// =============================================================================
// URL Builder Tests
// =============================================================================

describe("Database URL Builders", () => {
  it("should build URL with required password parameter", () => {
    const url = buildDatabaseUrl({
      user: "custom_user",
      password: "custom_pass",
      host: "db.example.com",
      port: 5433,
      database: "custom_db",
    });
    expect(url).toBe("postgres://custom_user:custom_pass@db.example.com:5433/custom_db");
  });

  it("should use default user when not specified", () => {
    const url = buildDatabaseUrl({ password: "test_pass" });
    expect(url).toContain("postgres://hris:");
  });

  it("should URL-encode special characters in credentials", () => {
    const url = buildDatabaseUrl({
      user: "user@domain",
      password: "pass#word!",
    });
    expect(url).toContain("user%40domain");
    expect(url).toContain("pass%23word!");
  });
});

// =============================================================================
// URL Validation Tests
// =============================================================================

describe("Database URL Validation", () => {
  it("should validate correct postgres URL", () => {
    const result = validateDatabaseUrl("postgres://user:pass@host:5432/db");
    expect(result.valid).toBe(true);
    expect(result.user).toBe("user");
    expect(result.host).toBe("host");
    expect(result.port).toBe(5432);
    expect(result.database).toBe("db");
  });

  it("should validate postgresql:// protocol", () => {
    const result = validateDatabaseUrl("postgresql://user:pass@host:5432/db");
    expect(result.valid).toBe(true);
  });

  it("should reject invalid protocol", () => {
    const result = validateDatabaseUrl("mysql://user:pass@host:3306/db");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid protocol");
  });

  it("should reject malformed URL", () => {
    const result = validateDatabaseUrl("not-a-url");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Failed to parse");
  });

  it("should decode URL-encoded credentials", () => {
    const result = validateDatabaseUrl("postgres://user%40domain:pass%23word@host:5432/db");
    expect(result.valid).toBe(true);
    expect(result.user).toBe("user@domain");
  });
});

// =============================================================================
// Configuration Consistency Tests
// =============================================================================

describe("Configuration Consistency", () => {
  const projectRoot = path.resolve(__dirname, "../../../../..");

  it("should not have hardcoded passwords in source files", async () => {
    // Files that must NOT contain hardcoded password strings
    const filesToCheck = [
      "packages/api/src/plugins/db.ts",
      "packages/api/src/config/database.ts",
    ];

    const forbiddenPatterns = [
      "hris_dev_password",
      "hris_app_dev_password",
    ];

    for (const file of filesToCheck) {
      const filePath = path.join(projectRoot, file);

      if (!fs.existsSync(filePath)) {
        continue;
      }

      const content = fs.readFileSync(filePath, "utf-8");

      for (const pattern of forbiddenPatterns) {
        expect(content).not.toContain(pattern);
      }
    }
  });
});

// =============================================================================
// Environment Variable Override Tests
// =============================================================================

describe("Environment Variable Requirements", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  it("should use DATABASE_URL from environment when set", () => {
    const customUrl = "postgres://custom:pass@custom-host:5433/custom_db";
    process.env["DATABASE_URL"] = customUrl;

    expect(getDatabaseUrl()).toBe(customUrl);
  });

  it("should throw when DATABASE_URL is not set", () => {
    delete process.env["DATABASE_URL"];

    expect(() => getDatabaseUrl()).toThrow("DATABASE_URL environment variable is required");
  });

  it("should throw when TEST_DATABASE_URL is not set", () => {
    delete process.env["TEST_DATABASE_URL"];

    expect(() => getTestDatabaseUrl()).toThrow("TEST_DATABASE_URL environment variable is required");
  });
});
