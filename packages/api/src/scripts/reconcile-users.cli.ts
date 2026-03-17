/**
 * CLI: User Table Reconciliation
 *
 * Detects and optionally repairs drift between app."user" (Better Auth)
 * and app.users (legacy HRIS table).
 *
 * Usage:
 *   bun run reconcile:users                # Dry-run (report only)
 *   bun run reconcile:users -- --fix       # Apply repairs
 *   bun run reconcile:users -- --verbose   # Verbose output
 *   bun run reconcile:users -- --fix --verbose --limit 100
 *
 * Environment:
 *   DATABASE_URL or DB_PASSWORD must be set (same as bootstrap:root).
 */

import postgres from "postgres";
import { reconcileUsers } from "./reconcile-users";

// ============================================================================
// Configuration
// ============================================================================

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

// ============================================================================
// CLI Argument Parsing
// ============================================================================

const args = process.argv.slice(2);

const fix = args.includes("--fix");
const verbose = args.includes("--verbose") || args.includes("-v");

let batchLimit = 500;
const limitIdx = args.indexOf("--limit");
if (limitIdx !== -1 && args[limitIdx + 1]) {
  const parsed = parseInt(args[limitIdx + 1], 10);
  if (!isNaN(parsed) && parsed > 0) {
    batchLimit = parsed;
  }
}

// ============================================================================
// Main
// ============================================================================

console.log("===========================================");
console.log("User Table Reconciliation");
console.log("===========================================");
console.log(`Mode: ${fix ? "FIX (will apply repairs)" : "DRY-RUN (report only)"}`);
console.log(`Batch limit: ${batchLimit}`);
console.log(`Verbose: ${verbose}`);
console.log("===========================================\n");

const db = postgres(loadDatabaseUrl(), {
  max: 1,
  connection: { search_path: "app,public" },
});

try {
  const result = await reconcileUsers(db, { fix, verbose, batchLimit });

  // ---- Print Report ----
  console.log("\n===========================================");
  console.log("Reconciliation Report");
  console.log("===========================================");
  console.log(`Total checked:          ${result.summary.totalChecked}`);
  console.log(`Missing in app.users:   ${result.summary.missingCount}`);
  console.log(`Drifted fields:         ${result.summary.driftedCount}`);
  console.log(`Orphaned in app.users:  ${result.summary.orphanedCount}`);

  if (fix) {
    console.log(`Repaired:               ${result.summary.repairedCount}`);
    console.log(`Failed:                 ${result.summary.failedCount}`);
  }

  // ---- Detail: Missing ----
  if (result.missingInAppUsers.length > 0) {
    console.log("\n--- Missing in app.users ---");
    for (const user of result.missingInAppUsers) {
      const status = fix ? (user.repaired ? "REPAIRED" : `FAILED: ${user.error}`) : "DRY-RUN";
      console.log(`  ${user.id} (${user.email}) — ${status}`);
    }
  }

  // ---- Detail: Drifted ----
  if (result.driftedUsers.length > 0) {
    console.log("\n--- Drifted Fields ---");
    for (const user of result.driftedUsers) {
      const status = fix ? (user.repaired ? "REPAIRED" : `FAILED: ${user.error}`) : "DRY-RUN";
      const fieldNames = user.fields.map(f => f.field).join(", ");
      console.log(`  ${user.id} — fields: [${fieldNames}] — ${status}`);
      if (verbose) {
        for (const f of user.fields) {
          console.log(`    ${f.field}: app."user" = ${JSON.stringify(f.betterAuthValue)} | app.users = ${JSON.stringify(f.appUsersValue)}`);
        }
      }
    }
  }

  // ---- Detail: Orphaned ----
  if (result.orphanedInAppUsers.length > 0) {
    console.log("\n--- Orphaned in app.users (manual review required) ---");
    for (const user of result.orphanedInAppUsers) {
      console.log(`  ${user.id} (${user.email}) — status: ${user.status}`);
      if (verbose) {
        console.log(`    Note: ${user.note}`);
      }
    }
  }

  // ---- Exit code ----
  const hasIssues = result.summary.missingCount > 0 ||
    result.summary.driftedCount > 0 ||
    result.summary.orphanedCount > 0;

  if (!hasIssues) {
    console.log("\nAll user tables are in sync. No issues found.");
  } else if (!fix) {
    console.log("\nRun with --fix to apply repairs.");
  }

  // Exit 0 if no issues or all repaired; exit 1 if issues remain unrepaired
  const unrepairedIssues = fix
    ? result.summary.failedCount > 0 || result.summary.orphanedCount > 0
    : hasIssues;

  process.exit(unrepairedIssues ? 1 : 0);
} catch (error) {
  console.error("\nFatal error during reconciliation:", error);
  process.exit(2);
} finally {
  await db.end({ timeout: 2 });
}
