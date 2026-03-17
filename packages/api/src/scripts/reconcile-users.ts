/**
 * User Table Reconciliation Utility
 *
 * Detects and repairs mismatches between the Better Auth canonical table
 * (app."user") and the legacy application table (app.users).
 *
 * The dual-table architecture exists because Better Auth manages its own
 * `app."user"` table (camelCase text IDs) while the rest of the HRIS
 * application uses `app.users` (UUID IDs, snake_case). databaseHooks in
 * better-auth.ts keep them in sync, but failures can cause drift.
 *
 * This utility handles three categories of drift:
 * 1. Missing rows  — user exists in app."user" but not in app.users
 * 2. Drifted fields — email, name, status, or mfaEnabled differ
 * 3. Orphaned rows  — user exists in app.users but not in app."user"
 *
 * Safety:
 * - Uses system context to bypass RLS
 * - All repairs are logged with full context
 * - Dry-run mode available (default when called without --fix)
 * - Batch limits prevent unbounded queries
 */

import type postgres from "postgres";
import type { TransactionSql } from "postgres";

// ============================================================================
// Types
// ============================================================================

export interface ReconciliationResult {
  /** Users in app."user" missing from app.users */
  missingInAppUsers: MissingUser[];
  /** Users with field mismatches between the two tables */
  driftedUsers: DriftedUser[];
  /** Users in app.users missing from app."user" (orphaned) */
  orphanedInAppUsers: OrphanedUser[];
  /** Summary counts */
  summary: {
    totalChecked: number;
    missingCount: number;
    driftedCount: number;
    orphanedCount: number;
    repairedCount: number;
    failedCount: number;
  };
}

export interface MissingUser {
  id: string;
  email: string;
  name: string | null;
  status: string;
  mfaEnabled: boolean;
  repaired: boolean;
  error?: string;
}

export interface DriftedUser {
  id: string;
  fields: DriftField[];
  repaired: boolean;
  error?: string;
}

export interface DriftField {
  field: string;
  betterAuthValue: unknown;
  appUsersValue: unknown;
}

export interface OrphanedUser {
  id: string;
  email: string;
  name: string | null;
  status: string;
  /** Orphaned rows are reported but NOT auto-repaired */
  note: string;
}

export interface ReconcileOptions {
  /** Maximum number of rows to check per category */
  batchLimit?: number;
  /** If true, apply repairs. If false, only report drift (dry-run). */
  fix?: boolean;
  /** If true, output verbose logging */
  verbose?: boolean;
}

// ============================================================================
// Helper: system context wrapper for raw postgres.js
// ============================================================================

async function withSystemContext<T>(
  db: ReturnType<typeof postgres>,
  fn: (tx: TransactionSql) => Promise<T>
): Promise<T> {
  return (await db.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant', '00000000-0000-0000-0000-000000000000', true)`;
    await tx`SELECT app.enable_system_context()`;
    try {
      return await fn(tx);
    } finally {
      await tx`SELECT app.disable_system_context()`;
    }
  })) as T;
}

// ============================================================================
// Core Reconciliation Logic
// ============================================================================

/**
 * Run reconciliation between app."user" and app.users.
 *
 * @param db - A postgres.js client instance
 * @param options - Reconciliation options
 * @returns A detailed report of findings and repairs
 */
export async function reconcileUsers(
  db: ReturnType<typeof postgres>,
  options: ReconcileOptions = {}
): Promise<ReconciliationResult> {
  const batchLimit = options.batchLimit ?? 500;
  const fix = options.fix ?? false;
  const verbose = options.verbose ?? false;

  const log = (msg: string) => {
    if (verbose) console.log(`[Reconcile] ${msg}`);
  };

  const result: ReconciliationResult = {
    missingInAppUsers: [],
    driftedUsers: [],
    orphanedInAppUsers: [],
    summary: {
      totalChecked: 0,
      missingCount: 0,
      driftedCount: 0,
      orphanedCount: 0,
      repairedCount: 0,
      failedCount: 0,
    },
  };

  log("Starting user table reconciliation...");

  // ---- Phase 1: Find users in app."user" missing from app.users ----
  log("Phase 1: Checking for missing rows in app.users...");

  const missing = await withSystemContext(db, async (tx) => {
    return await tx<Array<{
      id: string;
      email: string;
      name: string | null;
      status: string;
      mfaEnabled: boolean;
    }>>`
      SELECT
        ba.id,
        ba.email,
        ba.name,
        COALESCE(ba.status, 'active') AS status,
        COALESCE(ba."mfaEnabled", false) AS "mfaEnabled"
      FROM app."user" ba
      LEFT JOIN app.users au ON au.id = ba.id::uuid
      WHERE au.id IS NULL
      LIMIT ${batchLimit}
    `;
  });

  result.summary.missingCount = missing.length;
  result.summary.totalChecked += missing.length;

  for (const row of missing) {
    const entry: MissingUser = {
      id: row.id,
      email: row.email,
      name: row.name,
      status: row.status,
      mfaEnabled: row.mfaEnabled,
      repaired: false,
    };

    if (fix) {
      try {
        await withSystemContext(db, async (tx) => {
          await tx`
            INSERT INTO app.users (id, email, name, status, mfa_enabled, email_verified, created_at, updated_at)
            VALUES (
              ${row.id}::uuid,
              ${row.email},
              ${row.name ?? row.email},
              ${row.status},
              ${row.mfaEnabled},
              false,
              now(),
              now()
            )
            ON CONFLICT (id) DO NOTHING
          `;
        });
        entry.repaired = true;
        result.summary.repairedCount++;
        log(`  Repaired missing user: ${row.id} (${row.email})`);
      } catch (err) {
        entry.error = err instanceof Error ? err.message : String(err);
        result.summary.failedCount++;
        console.error(`[Reconcile] Failed to repair missing user ${row.id}:`, entry.error);
      }
    } else {
      log(`  [DRY-RUN] Would create app.users row for: ${row.id} (${row.email})`);
    }

    result.missingInAppUsers.push(entry);
  }

  // ---- Phase 2: Find users with drifted fields ----
  log("Phase 2: Checking for field drift...");

  const drifted = await withSystemContext(db, async (tx) => {
    return await tx<Array<{
      id: string;
      baEmail: string;
      baName: string | null;
      baStatus: string;
      baMfa: boolean;
      baEmailVerified: boolean;
      auEmail: string;
      auName: string | null;
      auStatus: string;
      auMfa: boolean;
      auEmailVerified: boolean;
    }>>`
      SELECT
        ba.id,
        ba.email AS "baEmail",
        ba.name AS "baName",
        COALESCE(ba.status, 'active') AS "baStatus",
        COALESCE(ba."mfaEnabled", false) AS "baMfa",
        COALESCE(ba."emailVerified", false) AS "baEmailVerified",
        au.email AS "auEmail",
        au.name AS "auName",
        COALESCE(au.status, 'active') AS "auStatus",
        COALESCE(au.mfa_enabled, false) AS "auMfa",
        COALESCE(au.email_verified, false) AS "auEmailVerified"
      FROM app."user" ba
      JOIN app.users au ON au.id = ba.id::uuid
      WHERE ba.email != au.email
         OR ba.name IS DISTINCT FROM au.name
         OR COALESCE(ba.status, 'active') != COALESCE(au.status, 'active')
         OR COALESCE(ba."mfaEnabled", false) != COALESCE(au.mfa_enabled, false)
         OR COALESCE(ba."emailVerified", false) != COALESCE(au.email_verified, false)
      LIMIT ${batchLimit}
    `;
  });

  result.summary.driftedCount = drifted.length;
  result.summary.totalChecked += drifted.length;

  for (const row of drifted) {
    const fields: DriftField[] = [];

    if (row.baEmail !== row.auEmail) {
      fields.push({ field: "email", betterAuthValue: row.baEmail, appUsersValue: row.auEmail });
    }
    if (row.baName !== row.auName) {
      fields.push({ field: "name", betterAuthValue: row.baName, appUsersValue: row.auName });
    }
    if (row.baStatus !== row.auStatus) {
      fields.push({ field: "status", betterAuthValue: row.baStatus, appUsersValue: row.auStatus });
    }
    if (row.baMfa !== row.auMfa) {
      fields.push({ field: "mfaEnabled", betterAuthValue: row.baMfa, appUsersValue: row.auMfa });
    }
    if (row.baEmailVerified !== row.auEmailVerified) {
      fields.push({ field: "emailVerified", betterAuthValue: row.baEmailVerified, appUsersValue: row.auEmailVerified });
    }

    const entry: DriftedUser = {
      id: row.id,
      fields,
      repaired: false,
    };

    if (fix) {
      try {
        // Better Auth is the source of truth — sync from app."user" to app.users
        await withSystemContext(db, async (tx) => {
          await tx`
            UPDATE app.users SET
              email = ${row.baEmail},
              name = ${row.baName ?? row.baEmail},
              status = ${row.baStatus},
              mfa_enabled = ${row.baMfa},
              email_verified = ${row.baEmailVerified},
              updated_at = now()
            WHERE id = ${row.id}::uuid
          `;
        });
        entry.repaired = true;
        result.summary.repairedCount++;
        log(`  Repaired drifted user: ${row.id} — fields: ${fields.map(f => f.field).join(", ")}`);
      } catch (err) {
        entry.error = err instanceof Error ? err.message : String(err);
        result.summary.failedCount++;
        console.error(`[Reconcile] Failed to repair drifted user ${row.id}:`, entry.error);
      }
    } else {
      log(`  [DRY-RUN] Would fix drift for: ${row.id} — fields: ${fields.map(f => f.field).join(", ")}`);
    }

    result.driftedUsers.push(entry);
  }

  // ---- Phase 3: Find orphaned rows in app.users (no matching app."user") ----
  log("Phase 3: Checking for orphaned rows in app.users...");

  const orphaned = await withSystemContext(db, async (tx) => {
    return await tx<Array<{
      id: string;
      email: string;
      name: string | null;
      status: string;
    }>>`
      SELECT
        au.id::text AS id,
        au.email,
        au.name,
        COALESCE(au.status, 'active') AS status
      FROM app.users au
      LEFT JOIN app."user" ba ON ba.id = au.id::text
      WHERE ba.id IS NULL
      LIMIT ${batchLimit}
    `;
  });

  result.summary.orphanedCount = orphaned.length;
  result.summary.totalChecked += orphaned.length;

  for (const row of orphaned) {
    result.orphanedInAppUsers.push({
      id: row.id,
      email: row.email,
      name: row.name,
      status: row.status,
      note:
        "User exists in app.users but not in app.\"user\". " +
        "This may be a pre-BetterAuth legacy user or a manual insert. " +
        "Not auto-repaired — review manually.",
    });
    log(`  [ORPHAN] ${row.id} (${row.email}) — exists only in app.users`);
  }

  // ---- Summary ----
  log("Reconciliation complete.");
  log(`  Total checked: ${result.summary.totalChecked}`);
  log(`  Missing in app.users: ${result.summary.missingCount}`);
  log(`  Drifted fields: ${result.summary.driftedCount}`);
  log(`  Orphaned in app.users: ${result.summary.orphanedCount}`);
  log(`  Repaired: ${result.summary.repairedCount}`);
  log(`  Failed: ${result.summary.failedCount}`);

  return result;
}
