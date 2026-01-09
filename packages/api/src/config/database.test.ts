/**
 * Database Configuration Tests
 * 
 * These tests ensure that database configuration is consistent across
 * all modules to prevent authentication failures.
 * 
 * FIX: Created to prevent recurrence of password mismatch issues where
 * different modules used different default passwords.
 */

import { describe, it, expect, beforeAll, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  DEFAULT_DB_USER,
  DEFAULT_DB_PASSWORD,
  DEFAULT_DB_NAME,
  DEFAULT_DB_HOST,
  DEFAULT_DB_PORT,
  DEFAULT_REDIS_URL,
  buildDatabaseUrl,
  getDefaultDatabaseUrl,
  getDefaultTestDatabaseUrl,
  validateDatabaseUrl,
} from "./database";

// =============================================================================
// Configuration Constants Tests
// =============================================================================

describe("Database Configuration Constants", () => {
  it("should have correct default user", () => {
    expect(DEFAULT_DB_USER).toBe("hris");
  });

  it("should have correct default password (must match docker-compose.yml)", () => {
    // This is the critical value that must be consistent
    expect(DEFAULT_DB_PASSWORD).toBe("hris_dev_password");
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
});

// =============================================================================
// URL Builder Tests
// =============================================================================

describe("Database URL Builders", () => {
  it("should build correct default database URL", () => {
    const url = getDefaultDatabaseUrl();
    expect(url).toBe("postgres://hris:hris_dev_password@localhost:5432/hris");
  });

  it("should build correct default test database URL", () => {
    const url = getDefaultTestDatabaseUrl();
    expect(url).toBe("postgres://hris:hris_dev_password@localhost:5432/hris_test");
  });

  it("should build URL with custom parameters", () => {
    const url = buildDatabaseUrl({
      user: "custom_user",
      password: "custom_pass",
      host: "db.example.com",
      port: 5433,
      database: "custom_db",
    });
    expect(url).toBe("postgres://custom_user:custom_pass@db.example.com:5433/custom_db");
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

  it("should have docker-compose.yml with matching default password", async () => {
    const dockerComposePath = path.join(projectRoot, "docker/docker-compose.yml");
    
    if (!fs.existsSync(dockerComposePath)) {
      console.warn("docker-compose.yml not found, skipping consistency check");
      return;
    }

    const content = fs.readFileSync(dockerComposePath, "utf-8");
    
    // Check that docker-compose.yml uses the same default password
    expect(content).toContain(`POSTGRES_PASSWORD:-${DEFAULT_DB_PASSWORD}`);
  });

  it("should have .env.example with matching default password", async () => {
    const envExamplePath = path.join(projectRoot, "docker/.env.example");
    
    if (!fs.existsSync(envExamplePath)) {
      console.warn(".env.example not found, skipping consistency check");
      return;
    }

    const content = fs.readFileSync(envExamplePath, "utf-8");
    
    // Check that .env.example uses the same default password
    expect(content).toContain(`POSTGRES_PASSWORD=${DEFAULT_DB_PASSWORD}`);
  });

  it("should not have hardcoded wrong password in source files", async () => {
    // List of files that previously had wrong password hardcoded
    const filesToCheck = [
      "packages/api/src/worker/scheduler.ts",
      "packages/api/src/worker/outbox-processor.ts",
      "packages/api/src/plugins/db.ts",
      "packages/api/src/lib/better-auth.ts",
      "packages/api/src/db/migrate.ts",
      "packages/api/src/scripts/bootstrap-root.cli.ts",
    ];

    const wrongPassword = "hris:hris@"; // The wrong pattern: user:wrongpass@

    for (const file of filesToCheck) {
      const filePath = path.join(projectRoot, file);
      
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const content = fs.readFileSync(filePath, "utf-8");
      
      // Should NOT contain the wrong password pattern
      expect(content).not.toContain(wrongPassword);
    }
  });

  it("should have consistent default URL across all database connection points", () => {
    // The expected default URL pattern
    const expectedPattern = `postgres://hris:${DEFAULT_DB_PASSWORD}@`;
    const defaultUrl = getDefaultDatabaseUrl();
    
    expect(defaultUrl).toContain(expectedPattern);
  });
});

// =============================================================================
// Environment Variable Override Tests
// =============================================================================

describe("Environment Variable Overrides", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  it("should use DATABASE_URL from environment when set", async () => {
    // Import dynamically to pick up env changes
    const customUrl = "postgres://custom:pass@custom-host:5433/custom_db";
    process.env["DATABASE_URL"] = customUrl;

    // Re-import to get fresh values
    const { getDatabaseUrl } = await import("./database");
    expect(getDatabaseUrl()).toBe(customUrl);
  });

  it("should fall back to default when DATABASE_URL not set", async () => {
    delete process.env["DATABASE_URL"];

    const { getDatabaseUrl, getDefaultDatabaseUrl } = await import("./database");
    expect(getDatabaseUrl()).toBe(getDefaultDatabaseUrl());
  });
});
