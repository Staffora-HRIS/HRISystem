import postgres from "postgres";
import { bootstrapRoot } from "./bootstrap-root";

function loadDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (url) return url;

  const nodeEnv = process.env["NODE_ENV"] || "development";
  const dbPassword = process.env["DB_PASSWORD"]
    ?? (nodeEnv === "development" || nodeEnv === "test" ? "hris_dev_password" : undefined);

  if (!dbPassword) {
    throw new Error(
      "DB_PASSWORD or DATABASE_URL environment variable is required. " +
      "Hardcoded fallback is only available when NODE_ENV is 'development' or 'test'."
    );
  }

  const host = process.env["DB_HOST"] ?? "localhost";
  const port = process.env["DB_PORT"] ?? "5432";
  const database = process.env["DB_NAME"] ?? "hris";
  const user = encodeURIComponent(process.env["DB_USER"] ?? "hris");
  const password = encodeURIComponent(dbPassword);

  return `postgres://${user}:${password}@${host}:${port}/${database}`;
}

const email = process.env["ROOT_EMAIL"] ?? "root@staffora.co.uk";
const tenantId = process.env["ROOT_TENANT_ID"];
const tenantSlug = process.env["ROOT_TENANT_SLUG"];
const tenantName = process.env["ROOT_TENANT_NAME"];
const name = process.env["ROOT_NAME"] ?? "Root";

const db = postgres(loadDatabaseUrl(), { max: 1, connection: { search_path: "app,public" } });

try {
  const envPassword = process.env["ROOT_PASSWORD"];
  if (envPassword) {
    // Operator-supplied password: pass through to the bootstrapper, never log it.
    const result = await bootstrapRoot(db, {
      email, password: envPassword, name, tenantId, tenantSlug, tenantName,
    });
    console.log(JSON.stringify(result, null, 2));
    console.log("\nUsing ROOT_PASSWORD from environment");
  } else {
    // Auto-generated password: server-side random, safe to display once for the operator to capture.
    const generated = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const result = await bootstrapRoot(db, {
      email, password: generated, name, tenantId, tenantSlug, tenantName,
    });
    console.log(JSON.stringify(result, null, 2));
    console.log(`\nGenerated password: ${generated}`);
    console.log("Save this password now — it will not be shown again.");
  }
} finally {
  await db.end({ timeout: 2 });
}
