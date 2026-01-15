/**
 * RLS Coverage Integration Test
 *
 * Ensures every tenant-owned table has Row-Level Security enabled and a tenant isolation policy.
 *
 * Tenant-owned table definition used here:
 * - table in schema 'app'
 * - has a 'tenant_id' column
 * - is not a partitioned child table
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  getTestDb,
  ensureTestInfra,
  isInfraAvailable,
  closeTestConnections,
} from "../setup";

interface TenantOwnedTable {
  schemaName: string;
  tableName: string;
}

describe("RLS Coverage", () => {
  let db: ReturnType<typeof getTestDb> | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
  });

  afterAll(async () => {
    if (!db) return;
    await closeTestConnections(db);
  });

  it("should have RLS enabled and tenant isolation policies on all tenant-owned tables", async () => {
    if (!db) return;

    const tables = await db<TenantOwnedTable[]>`
      WITH tenant_owned AS (
        SELECT
          n.nspname as schema_name,
          c.relname as table_name,
          c.oid as table_oid,
          c.relrowsecurity as rls_enabled,
          c.relkind as relkind,
          c.relispartition as is_partition
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'app'
          AND c.relkind IN ('r','p')
          AND a.attname = 'tenant_id'
          AND a.attnum > 0
          AND NOT a.attisdropped
      )
      SELECT schema_name as "schemaName", table_name as "tableName"
      FROM tenant_owned
      WHERE is_partition = false
      ORDER BY schema_name, table_name;
    `;

    expect(tables.length).toBeGreaterThan(0);

    const missingRls: TenantOwnedTable[] = [];
    const missingPolicy: Array<TenantOwnedTable & { policyCount: number }> = [];

    for (const t of tables) {
      const rls = await db<Array<{ relrowsecurity: boolean }>>`
        SELECT c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ${t.schemaName}
          AND c.relname = ${t.tableName}
        LIMIT 1
      `;

      if (!rls[0]?.relrowsecurity) {
        missingRls.push(t);
        continue;
      }

      // Require at least one policy that references app.current_tenant OR current_setting('app.current_tenant')
      const policies = await db<Array<{ count: string }>>`
        SELECT COUNT(*)::text as count
        FROM pg_policies p
        WHERE p.schemaname = ${t.schemaName}
          AND p.tablename = ${t.tableName}
          AND (
            (p.qual ILIKE '%app.current_tenant%')
            OR (p.qual ILIKE '%current_tenant%')
            OR (p.with_check ILIKE '%app.current_tenant%')
            OR (p.with_check ILIKE '%current_tenant%')
          )
      `;

      const count = parseInt(policies[0]?.count ?? "0", 10);
      if (count === 0) {
        missingPolicy.push({ ...t, policyCount: count });
      }
    }

    if (missingRls.length || missingPolicy.length) {
      const format = (x: TenantOwnedTable) => `${x.schemaName}.${x.tableName}`;
      const details = {
        missingRls: missingRls.map(format),
        missingTenantPolicies: missingPolicy.map(format),
      };
      expect(details).toEqual({ missingRls: [], missingTenantPolicies: [] });
    }
  });
});
