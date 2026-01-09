import postgres from "postgres";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Command = "up" | "down" | "create";

function isDuplicateObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const anyErr = error as { code?: unknown; message?: unknown };

  // 42710 = duplicate_object (e.g., trigger already exists)
  if (anyErr.code === "42710") return true;

  // Fallback in case code isn't available.
  if (typeof anyErr.message === "string" && /already exists/i.test(anyErr.message)) {
    return true;
  }

  return false;
}

function getMigrationsDir(): string {
  if (process.env["MIGRATIONS_DIR"]) return process.env["MIGRATIONS_DIR"];

  return path.resolve(fileURLToPath(new URL("../../../../migrations", import.meta.url)));
}

function getDbConnection() {
  if (process.env["DATABASE_URL"]) {
    return postgres(process.env["DATABASE_URL"]);
  }

  return postgres({
    host: process.env["DB_HOST"] || "localhost",
    port: Number(process.env["DB_PORT"]) || 5432,
    database: process.env["DB_NAME"] || "hris",
    username: process.env["DB_USER"] || "hris",
    password: process.env["DB_PASSWORD"] || "hris_dev_password",
    max: Number(process.env["DB_MAX_CONNECTIONS"]) || 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

async function ensureMigrationsTable(sql: postgres.Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

async function getMigrationFiles(migrationsDir: string): Promise<string[]> {
  const files = await readdir(migrationsDir);
  return files
    .filter((f) => /^\d+_.+\.sql$/i.test(f))
    .sort((a, b) => a.localeCompare(b));
}

async function applyMigrations(sql: postgres.Sql, migrationsDir: string): Promise<void> {
  await ensureMigrationsTable(sql);

  const appliedRows = await sql<{ filename: string }[]>`
    SELECT filename FROM public.schema_migrations
  `;
  const applied = new Set(appliedRows.map((r) => r.filename));

  const files = await getMigrationFiles(migrationsDir);

  for (const file of files) {
    if (applied.has(file)) continue;

    const filePath = path.join(migrationsDir, file);
    const migrationSql = await Bun.file(filePath).text();

    console.log(`[migrate] applying ${file}`);

    try {
      await sql.begin(async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyTx = tx as any;
        if (typeof anyTx.unsafe !== "function") {
          throw new Error(
            "Migration runner requires postgres.sql.unsafe(). Please update the migration runner to use the available API."
          );
        }

        await anyTx.unsafe(migrationSql);
        await tx`
          INSERT INTO public.schema_migrations (filename)
          VALUES (${file})
        `;
      });
    } catch (error) {
      if (isDuplicateObjectError(error)) {
        const message = (error as any)?.message;
        console.warn(`[migrate] ${file} appears already applied; marking as applied. ${message ?? ""}`);
        await sql`
          INSERT INTO public.schema_migrations (filename)
          VALUES (${file})
          ON CONFLICT (filename) DO NOTHING
        `;
        continue;
      }

      throw error;
    }
  }

  console.log("[migrate] up-to-date");
}

async function createMigration(migrationsDir: string, name?: string): Promise<void> {
  const safeName = (name || "new_migration")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const files = await getMigrationFiles(migrationsDir);
  const last = files[files.length - 1];
  const nextNum = last ? Number.parseInt(last.split("_")[0] || "0", 10) + 1 : 1;
  const prefix = String(nextNum).padStart(4, "0");

  const filename = `${prefix}_${safeName}.sql`;
  const fullPath = path.join(migrationsDir, filename);

  if (await Bun.file(fullPath).exists()) {
    throw new Error(`Migration already exists: ${filename}`);
  }

  const template = `-- Migration: ${prefix}_${safeName}\n-- Created: ${new Date().toISOString().slice(0, 10)}\n-- Description: \n\n-- =============================================================================\n-- UP Migration\n-- =============================================================================\n\n\n-- =============================================================================\n-- DOWN Migration (for rollback)\n-- =============================================================================\n\n`;

  await Bun.write(fullPath, template);
  console.log(`[migrate] created ${path.relative(process.cwd(), fullPath)}`);
}

async function main(): Promise<void> {
  const command = (process.argv[2] as Command | undefined) ?? "up";

  const migrationsDir = getMigrationsDir();

  if (command === "create") {
    await createMigration(migrationsDir, process.argv[3]);
    return;
  }

  if (command === "down") {
    throw new Error(
      "Down migrations are not supported (migration files include only commented-down sections)."
    );
  }

  const sql = getDbConnection();
  try {
    await applyMigrations(sql, migrationsDir);
  } finally {
    await sql.end();
  }
}

await main();
