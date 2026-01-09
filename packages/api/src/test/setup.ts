/**
 * Test Setup and Utilities
 *
 * Provides test infrastructure for integration testing:
 * - Database setup/teardown
 * - Test tenant/user fixtures
 * - Transaction management for test isolation
 */

import postgres, { type TransactionSql } from "postgres";
import Redis from "ioredis";

 const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

 function setEnvIfMissing(key: string, value: string): void {
  if (process.env[key] === undefined) process.env[key] = value;
 }

 export async function ensureTestInfra(): Promise<void> {
  await preflight();
 }

 async function loadDockerEnv(): Promise<void> {
  // For local dev, we prefer docker/.env but it is gitignored.
  // This keeps test setup friction low while still allowing overrides.
  const dockerEnvPath = new URL("../../../../docker/.env", import.meta.url);
  try {
    const exists = await Bun.file(dockerEnvPath).exists();
    if (!exists) return;
  } catch {
    return;
  }

  try {
    const contents = await Bun.file(dockerEnvPath).text();
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;

      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (!hasOwn(process.env, key) && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore parsing errors; env vars can still be provided by the caller.
  }
 }

 await loadDockerEnv();

// =============================================================================
// Configuration
// =============================================================================

export const TEST_CONFIG = {
  database: {
    host: process.env["TEST_DB_HOST"] ?? process.env["DB_HOST"] ?? "localhost",
    port: parseInt(process.env["TEST_DB_PORT"] ?? process.env["DB_PORT"] ?? "5432", 10),
    database: process.env["TEST_DB_NAME"] ?? process.env["DB_NAME"] ?? "hris",

    // Use a non-superuser role for tests so RLS is actually enforced.
    username: process.env["TEST_DB_USER"] ?? process.env["DB_USER"] ?? "hris_app",
    password: process.env["TEST_DB_PASSWORD"] ?? process.env["DB_PASSWORD"] ?? "hris_dev_password",

    // Admin credentials used only during test bootstrap to create/grant the app role.
    adminUsername: process.env["TEST_DB_ADMIN_USER"] ?? "hris",
    adminPassword: process.env["TEST_DB_ADMIN_PASSWORD"] ?? "hris_dev_password",
  },
  redis: {
    host: process.env["TEST_REDIS_HOST"] ?? process.env["REDIS_HOST"] ?? "localhost",
    port: parseInt(process.env["TEST_REDIS_PORT"] ?? process.env["REDIS_PORT"] ?? "6379", 10),
  },
};

 // If you use the repo's docker-compose defaults, align tests to them.
 setEnvIfMissing("TEST_DB_ADMIN_USER", "hris");
 setEnvIfMissing("TEST_DB_ADMIN_PASSWORD", "hris_dev_password");
 setEnvIfMissing("TEST_DB_USER", "hris_app");
 setEnvIfMissing("TEST_DB_PASSWORD", "hris_dev_password");
 setEnvIfMissing("TEST_DB_NAME", "hris");

// =============================================================================
// Database Client
// =============================================================================

let testDb: ReturnType<typeof postgres> | null = null;
let testRedis: Redis | null = null;

 let didPreflight = false;
 let infraAvailable = false;
 let infraError: string | null = null;

 /**
  * Check if test infrastructure (database + Redis) is available
  */
 export function isInfraAvailable(): boolean {
   return infraAvailable;
 }

 /**
  * Get the error message if infrastructure is not available
  */
 export function getInfraError(): string | null {
   return infraError;
 }

 /**
  * Skip helper for tests that require infrastructure
  * Use in beforeAll: if (skipIfNoInfra()) return;
  */
 export function skipIfNoInfra(): boolean {
   if (!infraAvailable) {
     console.log("[SKIP] Test skipped - infrastructure not available");
     return true;
   }
   return false;
 }

 async function preflight(): Promise<void> {
  if (didPreflight) return;
  didPreflight = true;

  const db = postgres({
    host: TEST_CONFIG.database.host,
    port: TEST_CONFIG.database.port,
    database: TEST_CONFIG.database.database,
    username: TEST_CONFIG.database.adminUsername,
    password: TEST_CONFIG.database.adminPassword,
    max: 1,
    idle_timeout: 2,
    connect_timeout: 2,
  });

  try {
    await db`SELECT 1`;

    // Verify schema exists before proceeding
    const schemaCheck = await db<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'app' AND table_name = 'tenants'
      ) as exists
    `;
    
    if (!schemaCheck[0]?.exists) {
      infraError = "[tests] Database schema not found (app.tenants missing). Run 'bun run migrate:up' first.";
      infraAvailable = false;
      await db.end({ timeout: 2 }).catch(() => {});
      return;
    }

    // Ensure the non-bypass role exists so RLS tests are meaningful
    await db.unsafe(
      "DO $$\n" +
        "BEGIN\n" +
        "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hris_app') THEN\n" +
        "    CREATE ROLE hris_app LOGIN PASSWORD 'hris_dev_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n" +
        "  END IF;\n" +
        "END\n" +
        "$$;"
    );

    // Grants required for application queries during tests
    await db.unsafe(`GRANT CONNECT ON DATABASE ${TEST_CONFIG.database.database} TO hris_app;`);
    await db.unsafe("GRANT USAGE ON SCHEMA app, public TO hris_app;");
    await db.unsafe("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO hris_app;");
    await db.unsafe("GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA app TO hris_app;");
    await db.unsafe("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO hris_app;");

    await db.unsafe("ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hris_app;");
    await db.unsafe("ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO hris_app;");
    await db.unsafe("ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO hris_app;");

    await db.unsafe(
      "CREATE OR REPLACE FUNCTION app.prevent_update()\n" +
        "RETURNS TRIGGER\n" +
        "LANGUAGE plpgsql\n" +
        "AS $$\n" +
        "BEGIN\n" +
        "    IF app.is_system_context() THEN\n" +
        "        RETURN NEW;\n" +
        "    END IF;\n\n" +
        "    RAISE EXCEPTION 'Updates are not allowed on this table';\n" +
        "END;\n" +
        "$$;"
    );

    await db.unsafe(
      "CREATE OR REPLACE FUNCTION app.prevent_delete()\n" +
        "RETURNS TRIGGER\n" +
        "LANGUAGE plpgsql\n" +
        "AS $$\n" +
        "BEGIN\n" +
        "    IF app.is_system_context() THEN\n" +
        "        RETURN OLD;\n" +
        "    END IF;\n\n" +
        "    RAISE EXCEPTION 'Deletes are not allowed on this table';\n" +
        "END;\n" +
        "$$;"
    );
  } catch (err) {
    const host = TEST_CONFIG.database.host;
    const port = TEST_CONFIG.database.port;
    const name = TEST_CONFIG.database.database;
    infraError = `[tests] Cannot connect to Postgres (host=${host} port=${port} db=${name}). Run 'bun run docker:up' and 'bun run migrate:up'.`;
    infraAvailable = false;
    await db.end({ timeout: 2 }).catch(() => {});
    return;
  } finally {
    await db.end({ timeout: 2 }).catch(() => {});
  }

  const redis = new Redis({
    host: TEST_CONFIG.redis.host,
    port: TEST_CONFIG.redis.port,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    connectTimeout: 2000,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    await redis.ping();
    infraAvailable = true;
    infraError = null;
  } catch (err) {
    const host = TEST_CONFIG.redis.host;
    const port = TEST_CONFIG.redis.port;
    infraError = `[tests] Cannot connect to Redis (host=${host} port=${port}). Run 'bun run docker:up'.`;
    infraAvailable = false;
  } finally {
    redis.disconnect();
  }
 }

/**
 * Get or create test database connection
 * Returns null if infrastructure is not available
 */
export function getTestDb(): ReturnType<typeof postgres> {
  if (!didPreflight) {
    throw new Error("[tests] Test infra not initialized. Call ensureTestInfra() in your beforeAll().");
  }

  if (!infraAvailable) {
    throw new Error("[tests] Infrastructure not available. " + (infraError || ""));
  }

  return postgres({
    host: TEST_CONFIG.database.host,
    port: TEST_CONFIG.database.port,
    database: TEST_CONFIG.database.database,
    username: TEST_CONFIG.database.username,
    password: TEST_CONFIG.database.password,
    // Single-session per suite/file to keep set_config() tenant/user context stable
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

/**
 * Get or create test Redis connection
 * Returns null if infrastructure is not available
 */
export function getTestRedis(): Redis {
  if (!didPreflight) {
    throw new Error("[tests] Test infra not initialized. Call ensureTestInfra() in your beforeAll().");
  }

  if (!infraAvailable) {
    throw new Error("[tests] Infrastructure not available. " + (infraError || ""));
  }

  return new Redis({
    host: TEST_CONFIG.redis.host,
    port: TEST_CONFIG.redis.port,
    maxRetriesPerRequest: 3,
  });
}

/**
 * Close all test connections
 */
export async function closeTestConnections(
  db?: ReturnType<typeof postgres>,
  redis?: Redis
): Promise<void> {
  if (db) {
    await db.end();
  } else if (testDb) {
    await testDb.end();
    testDb = null;
  }

  if (redis) {
    redis.disconnect();
  } else if (testRedis) {
    testRedis.disconnect();
    testRedis = null;
  }
}

// =============================================================================
// Test Fixtures
// =============================================================================

export interface TestTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface TestUser {
  id: string;
  email: string;
  tenantId: string;
  roleId: string;
}

/**
 * Create a test tenant
 */
export async function createTestTenant(
  db: ReturnType<typeof postgres>,
  overrides: Partial<TestTenant> = {}
): Promise<TestTenant> {
  const tenant = {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? `Test Tenant ${Date.now()}`,
    slug: overrides.slug ?? `test-tenant-${Date.now()}`,
    status: overrides.status ?? "active",
  };

  await withSystemContext(db, async (tx) => {
    await tx`
      INSERT INTO app.tenants (id, name, slug, status)
      VALUES (${tenant.id}::uuid, ${tenant.name}, ${tenant.slug}, ${tenant.status})
    `;
  });

  return tenant;
}

/**
 * Create a test user
 */
export async function createTestUser(
  db: ReturnType<typeof postgres>,
  tenantId: string,
  overrides: Partial<TestUser> = {}
): Promise<TestUser> {
  const userId = overrides.id ?? crypto.randomUUID();
  const email = overrides.email ?? `test-${Date.now()}@example.com`;

  let roleId: string | undefined;

  await withSystemContext(db, async (tx) => {
    // user_tenants/role_assignments RLS INSERT policies require current tenant context
    await tx`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    await tx`SELECT set_config('app.current_user', ${userId}, true)`;

    await tx`
      INSERT INTO app.users (id, email, password_hash, status, email_verified)
      VALUES (${userId}::uuid, ${email}, 'test-hash', 'active', true)
      ON CONFLICT (id) DO NOTHING
    `;

    const roles = await tx<{ id: string }[]>`
      SELECT id FROM app.roles
      WHERE tenant_id = ${tenantId}::uuid OR tenant_id IS NULL
      ORDER BY tenant_id NULLS FIRST
      LIMIT 1
    `;

    roleId = roles[0]?.id;
    if (!roleId) {
      roleId = crypto.randomUUID();
      await tx`
        INSERT INTO app.roles (id, tenant_id, name, description, is_system)
        VALUES (${roleId}::uuid, ${tenantId}::uuid, 'Test Role', 'Test role', false)
      `;
    }

    await tx`
      INSERT INTO app.user_tenants (tenant_id, user_id, is_primary, status)
      VALUES (${tenantId}::uuid, ${userId}::uuid, true, 'active')
      ON CONFLICT (tenant_id, user_id) DO NOTHING
    `;

    await tx`
      INSERT INTO app.role_assignments (tenant_id, user_id, role_id, constraints)
      VALUES (${tenantId}::uuid, ${userId}::uuid, ${roleId}::uuid, '{}'::jsonb)
      ON CONFLICT DO NOTHING
    `;
  });

  return {
    id: userId,
    email,
    tenantId,
    roleId: roleId!,
  };
}

/**
 * Set tenant context for RLS
 */
export async function setTenantContext(
  db: ReturnType<typeof postgres>,
  tenantId: string,
  userId?: string
): Promise<void> {
  // Session-level so subsequent queries in the suite see the same tenant/user context
  await db`SELECT set_config('app.current_tenant', ${tenantId}, false)`;
  await db`SELECT set_config('app.current_user', ${userId ?? ""}, false)`;
}

/**
 * Clear tenant context
 */
export async function clearTenantContext(
  db: ReturnType<typeof postgres>
): Promise<void> {
  // Keep tenant as a valid UUID to avoid policy casts failing with invalid UUID syntax.
  await db`SELECT set_config('app.current_tenant', '00000000-0000-0000-0000-000000000000', false)`;
  // Keep user empty so audit triggers using app.current_user_id() return NULL.
  await db`SELECT set_config('app.current_user', '', false)`;
}

export async function withSystemContext<T>(
  db: ReturnType<typeof postgres>,
  fn: (tx: TransactionSql) => Promise<T>
): Promise<T> {
  return await db.begin(async (tx) => {
    await tx`SELECT app.enable_system_context()`;
    try {
      return await fn(tx);
    } finally {
      await tx`SELECT app.disable_system_context()`;
    }
  });
}

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Run a function in a transaction that gets rolled back
 */
export async function withTestTransaction<T>(
  db: ReturnType<typeof postgres>,
  fn: (tx: TransactionSql) => Promise<T>
): Promise<T> {
  return await db.begin(async (tx) => {
    try {
      const result = await fn(tx);
      // Rollback by throwing
      throw { __rollback: true, result };
    } catch (e) {
      if (e && typeof e === "object" && "__rollback" in e) {
        throw e; // Re-throw to trigger rollback
      }
      throw e;
    }
  }).catch((e) => {
    if (e && typeof e === "object" && "__rollback" in e) {
      return (e as { result: T }).result;
    }
    throw e;
  });
}

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Clean up test data for a tenant
 */
export async function cleanupTestTenant(
  db: ReturnType<typeof postgres>,
  tenantId: string
): Promise<void> {
  // Skip if tenantId is empty or not a valid UUID
  if (!tenantId || !UUID_REGEX.test(tenantId)) return;
  
  try {
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.role_assignments WHERE tenant_id = ${tenantId}::uuid`;
      await tx`DELETE FROM app.user_tenants WHERE tenant_id = ${tenantId}::uuid`;
      await tx`DELETE FROM app.roles WHERE tenant_id = ${tenantId}::uuid`;
      await tx`DELETE FROM app.tenants WHERE id = ${tenantId}::uuid`;
    });
  } catch (e) {
    // Ignore cleanup errors to prevent test failures
    console.warn(`cleanupTestTenant warning: ${e}`);
  }
}

/**
 * Clean up test user
 */
export async function cleanupTestUser(
  db: ReturnType<typeof postgres>,
  userId: string
): Promise<void> {
  // Skip if userId is empty or not a valid UUID
  if (!userId || !UUID_REGEX.test(userId)) return;
  
  try {
    await withSystemContext(db, async (tx) => {
      await tx`
        UPDATE app.employee_status_history
        SET created_by = NULL
        WHERE created_by = ${userId}::uuid
      `;

      await tx`DELETE FROM app.role_assignments WHERE user_id = ${userId}::uuid`;
      await tx`DELETE FROM app.user_tenants WHERE user_id = ${userId}::uuid`;
      await tx`DELETE FROM app.sessions WHERE user_id = ${userId}::uuid`;
      await tx`DELETE FROM app.users WHERE id = ${userId}::uuid`;
    });
  } catch (e) {
    // Ignore cleanup errors to prevent test failures
    console.warn(`cleanupTestUser warning: ${e}`);
  }
}

// =============================================================================
// Test Context
// =============================================================================

export interface TestContext {
  db: ReturnType<typeof postgres>;
  redis: Redis;
  tenant: TestTenant;
  user: TestUser;
  cleanup: () => Promise<void>;
}

/**
 * Create a complete test context with tenant and user
 * Returns null if infrastructure is not available
 */
export async function createTestContext(): Promise<TestContext | null> {
  await ensureTestInfra();
  
  if (!infraAvailable) {
    return null;
  }

  const db = getTestDb();
  const redis = getTestRedis();

  const tenant = await createTestTenant(db);
  const user = await createTestUser(db, tenant.id);

  return {
    db,
    redis,
    tenant,
    user,
    cleanup: async () => {
      await cleanupTestUser(db, user.id);
      await cleanupTestTenant(db, tenant.id);
    },
  };
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Assert that a query throws an RLS error
 */
export async function expectRlsError(
  fn: () => Promise<unknown>
): Promise<void> {
  try {
    await fn();
    throw new Error("Expected RLS error but query succeeded");
  } catch (error) {
    // Check for RLS-related error messages
    const message = String(error);
    const isRlsError =
      message.includes("permission denied") ||
      message.includes("violates row-level security") ||
      message.includes("new row violates");

    if (!isRlsError) {
      throw new Error(`Expected RLS error but got: ${message}`);
    }
  }
}

/**
 * Alias for expectRlsError - asserts that a query throws an RLS violation
 */
export const assertRlsViolation = expectRlsError;

/**
 * Assert that a value is defined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message ?? "Expected value to be defined");
  }
}
