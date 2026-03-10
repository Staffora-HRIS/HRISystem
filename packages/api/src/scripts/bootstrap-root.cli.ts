import postgres from "postgres";
import { bootstrapRoot } from "./bootstrap-root";

function loadDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (url) return url;

  const host = process.env["DB_HOST"] ?? "localhost";
  const port = process.env["DB_PORT"] ?? "5432";
  const database = process.env["DB_NAME"] ?? "hris";
  const user = encodeURIComponent(process.env["DB_USER"] ?? "hris");
  const password = encodeURIComponent(process.env["DB_PASSWORD"] ?? "hris_dev_password");

  return `postgres://${user}:${password}@${host}:${port}/${database}`;
}

const email = process.env["ROOT_EMAIL"] ?? "root@hris.local";
const password = process.env["ROOT_PASSWORD"] ?? `${crypto.randomUUID()}-${crypto.randomUUID()}`;

const tenantId = process.env["ROOT_TENANT_ID"];
const tenantSlug = process.env["ROOT_TENANT_SLUG"];
const tenantName = process.env["ROOT_TENANT_NAME"];
const name = process.env["ROOT_NAME"] ?? "Root";

const db = postgres(loadDatabaseUrl(), { max: 1, connection: { search_path: "app,public" } });

try {
  const result = await bootstrapRoot(db, { email, password, name, tenantId, tenantSlug, tenantName });
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nGenerated password: ${password}`);
  console.log("Save this password now — it will not be shown again.");
} finally {
  await db.end({ timeout: 2 });
}
