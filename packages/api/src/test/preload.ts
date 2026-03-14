/**
 * Test preload — sets environment variables BEFORE any modules are imported.
 * This ensures auth secrets are available when app.ts initializes BetterAuth.
 */
console.log("[preload] Setting test environment variables");

function setEnvIfMissing(key: string, value: string): void {
  if (process.env[key] === undefined) process.env[key] = value;
}

// Auth secrets required when importing the full app (route integration tests)
setEnvIfMissing("BETTER_AUTH_SECRET", "test-secret-for-better-auth-minimum-32-chars!!");
setEnvIfMissing("SESSION_SECRET", "test-secret-for-session-minimum-32-chars!!");
setEnvIfMissing("CSRF_SECRET", "test-secret-for-csrf-minimum-32-chars!!");

// Database defaults
setEnvIfMissing("TEST_DB_ADMIN_USER", "hris");
setEnvIfMissing("TEST_DB_ADMIN_PASSWORD", "hris_dev_password");
setEnvIfMissing("TEST_DB_USER", "hris_app");
setEnvIfMissing("TEST_DB_PASSWORD", "hris_app_dev_password");
setEnvIfMissing("TEST_DB_NAME", "hris");

// App database URL — use hris_app (NOBYPASSRLS) so RLS policies are enforced in route tests
setEnvIfMissing("DATABASE_APP_URL", "postgres://hris_app:hris_app_dev_password@localhost:5432/hris");

// Redis URL with password
setEnvIfMissing("REDIS_URL", "redis://:staffora_redis_dev@localhost:6379");
setEnvIfMissing("REDIS_PASSWORD", "staffora_redis_dev");
setEnvIfMissing("TEST_REDIS_PASSWORD", "staffora_redis_dev");
