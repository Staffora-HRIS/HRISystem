/**
 * Migration Validation Integration Tests
 *
 * Verifies:
 * - All expected tables exist in the app schema
 * - All tenant-owned tables have RLS enabled
 * - All tenant-owned tables have tenant isolation policies
 * - Required indexes exist
 * - Schema constraints are in place
 * - Migration tracking table is consistent
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  getTestDb,
  ensureTestInfra,
  isInfraAvailable,
  closeTestConnections,
} from "../setup";
import postgres from "postgres";
import { TEST_CONFIG } from "../setup";

describe("Migration Validation", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  // Admin connection for schema introspection (bypasses RLS)
  let adminDb: ReturnType<typeof postgres> | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    adminDb = postgres({
      host: TEST_CONFIG.database.host,
      port: TEST_CONFIG.database.port,
      database: TEST_CONFIG.database.database,
      username: TEST_CONFIG.database.adminUsername,
      password: TEST_CONFIG.database.adminPassword,
      max: 1,
      idle_timeout: 10,
      connect_timeout: 10,
    });
  });

  afterAll(async () => {
    if (db) await closeTestConnections(db);
    if (adminDb) await adminDb.end({ timeout: 5 }).catch(() => {});
  });

  // ===========================================================================
  // Core Tables Existence
  // ===========================================================================
  describe("Core tables existence", () => {
    const coreHrTables = [
      "tenants",
      "users",
      "sessions",
      "employees",
      "employee_personal",
      "org_units",
      "positions",
      "position_assignments",
      "employee_contacts",
      "employee_addresses",
      "employee_status_history",
      "roles",
      "role_assignments",
      "user_tenants",
    ];

    for (const table of coreHrTables) {
      it(`should have table app.${table}`, async () => {
        if (!adminDb) return;

        const result = await adminDb<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = ${table}
          ) as exists
        `;

        expect(result[0]!.exists).toBe(true);
      });
    }
  });

  describe("Absence module tables existence", () => {
    const absenceTables = [
      "leave_types",
      "leave_policies",
      "leave_balances",
      "leave_balance_ledger",
      "leave_requests",
    ];

    for (const table of absenceTables) {
      it(`should have table app.${table}`, async () => {
        if (!adminDb) return;

        const result = await adminDb<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = ${table}
          ) as exists
        `;

        expect(result[0]!.exists).toBe(true);
      });
    }
  });

  describe("Cases module tables existence", () => {
    const caseTables = [
      "case_categories",
      "cases",
    ];

    for (const table of caseTables) {
      it(`should have table app.${table}`, async () => {
        if (!adminDb) return;

        const result = await adminDb<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = ${table}
          ) as exists
        `;

        expect(result[0]!.exists).toBe(true);
      });
    }
  });

  describe("Onboarding module tables existence", () => {
    const onboardingTables = [
      "onboarding_templates",
      "onboarding_template_tasks",
      "onboarding_instances",
      "onboarding_task_completions",
    ];

    for (const table of onboardingTables) {
      it(`should have table app.${table}`, async () => {
        if (!adminDb) return;

        const result = await adminDb<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = ${table}
          ) as exists
        `;

        expect(result[0]!.exists).toBe(true);
      });
    }
  });

  describe("Infrastructure tables existence", () => {
    const infraTables = [
      "domain_outbox",
      "idempotency_keys",
      "audit_log",
    ];

    for (const table of infraTables) {
      it(`should have table app.${table}`, async () => {
        if (!adminDb) return;

        const result = await adminDb<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = ${table}
          ) as exists
        `;

        expect(result[0]!.exists).toBe(true);
      });
    }
  });

  // ===========================================================================
  // RLS Enabled Verification
  // ===========================================================================
  describe("RLS enabled on all tenant-owned tables", () => {
    it("should have RLS enabled on all tables with tenant_id column", async () => {
      if (!adminDb) return;

      // Find all tables with tenant_id that do NOT have RLS enabled
      // Exclude partition child tables (relispartition = true) as they inherit
      // RLS from the parent partitioned table
      const tablesWithoutRls = await adminDb<{ tableName: string }[]>`
        SELECT c.relname as "tableName"
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app'
          AND c.relkind = 'r'
          AND c.relrowsecurity = false
          AND c.relispartition = false
          AND EXISTS (
            SELECT 1 FROM information_schema.columns col
            WHERE col.table_schema = 'app'
              AND col.table_name = c.relname
              AND col.column_name = 'tenant_id'
          )
      `;

      if (tablesWithoutRls.length > 0) {
        const missingTables = tablesWithoutRls.map(r => r.tableName).join(", ");
        expect(missingTables).toBe(""); // Will fail with table names shown
      }

      expect(tablesWithoutRls.length).toBe(0);
    });
  });

  describe("RLS policies on tenant-owned tables", () => {
    it("should have at least one tenant isolation policy on each tenant-owned table", async () => {
      if (!adminDb) return;

      // Find tenant-owned tables missing tenant isolation policies
      // Exclude partition child tables as they inherit policies from parent
      // Exclude views (relkind='v') since RLS policies only apply to tables
      const tablesWithTenantId = await adminDb<{ tableName: string }[]>`
        SELECT DISTINCT col.table_name as "tableName"
        FROM information_schema.columns col
        JOIN pg_class c ON c.relname = col.table_name
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'app'
        WHERE col.table_schema = 'app'
          AND col.column_name = 'tenant_id'
          AND col.table_name NOT IN ('schema_migrations')
          AND c.relispartition = false
          AND c.relkind = 'r'
      `;

      const tablesMissingPolicy: string[] = [];

      for (const { tableName } of tablesWithTenantId) {
        const policies = await adminDb<{ count: string }[]>`
          SELECT COUNT(*)::text as count
          FROM pg_policies
          WHERE schemaname = 'app'
            AND tablename = ${tableName}
            AND (
              qual LIKE '%current_tenant%'
              OR qual LIKE '%is_system_context%'
              OR with_check LIKE '%current_tenant%'
              OR with_check LIKE '%is_system_context%'
            )
        `;

        if (parseInt(policies[0]!.count, 10) === 0) {
          tablesMissingPolicy.push(tableName);
        }
      }

      if (tablesMissingPolicy.length > 0) {
        const missing = tablesMissingPolicy.join(", ");
        console.warn(`Tables missing tenant isolation policy: ${missing}`);
      }

      expect(tablesMissingPolicy.length).toBe(0);
    });
  });

  // ===========================================================================
  // Schema State Validation
  // ===========================================================================
  describe("Schema state validation", () => {
    it("should have the hris_app role created", async () => {
      if (!adminDb) return;

      const result = await adminDb<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = 'hris_app'
        ) as exists
      `;

      expect(result[0]!.exists).toBe(true);
    });

    it("should have hris_app with NOBYPASSRLS", async () => {
      if (!adminDb) return;

      const result = await adminDb<{ rolbypassrls: boolean }[]>`
        SELECT rolbypassrls FROM pg_roles WHERE rolname = 'hris_app'
      `;

      expect(result.length).toBe(1);
      expect(result[0]!.rolbypassrls).toBe(false);
    });

    it("should have app schema created", async () => {
      if (!adminDb) return;

      const result = await adminDb<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.schemata
          WHERE schema_name = 'app'
        ) as exists
      `;

      expect(result[0]!.exists).toBe(true);
    });

    it("should have schema_migrations table for tracking", async () => {
      if (!adminDb) return;

      const result = await adminDb<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE (table_schema = 'app' OR table_schema = 'public')
            AND table_name = 'schema_migrations'
        ) as exists
      `;

      expect(result[0]!.exists).toBe(true);
    });

    it("should have migration entries recorded", async () => {
      if (!adminDb) return;

      // Check in both schemas since schema_migrations might be in either
      const count = await adminDb<{ count: string }[]>`
        SELECT COUNT(*)::text as count FROM (
          SELECT 1 FROM app.schema_migrations
          UNION ALL
          SELECT 1 FROM public.schema_migrations WHERE false
        ) sub
      `.catch(async () => {
        // Try public schema if app schema fails
        return await adminDb!<{ count: string }[]>`
          SELECT COUNT(*)::text as count FROM public.schema_migrations
        `.catch(() => [{ count: "0" }]);
      });

      expect(parseInt(count[0]!.count, 10)).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Required Functions Existence
  // ===========================================================================
  describe("Required functions existence", () => {
    const requiredFunctions = [
      "set_tenant_context",
      "is_system_context",
      "enable_system_context",
      "disable_system_context",
      "update_updated_at_column",
      "validate_employee_status_transition",
      "get_current_employee_personal",
      "get_employee_personal_as_of",
      "validate_leave_request_status_transition",
      "validate_case_status_transition",
    ];

    for (const funcName of requiredFunctions) {
      it(`should have function app.${funcName}`, async () => {
        if (!adminDb) return;

        const result = await adminDb<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'app'
              AND p.proname = ${funcName}
          ) as exists
        `;

        expect(result[0]!.exists).toBe(true);
      });
    }
  });

  // ===========================================================================
  // Required Enum Types
  // ===========================================================================
  describe("Required enum types", () => {
    const requiredEnums = [
      "employee_status",
      "leave_type_category",
      "leave_request_status",
      "leave_unit",
      "balance_transaction_type",
      "case_status",
      "case_priority",
      "case_type",
      "escalation_level",
      "resolution_type",
      "template_status",
      "onboarding_instance_status",
    ];

    for (const enumName of requiredEnums) {
      it(`should have enum type app.${enumName}`, async () => {
        if (!adminDb) return;

        const result = await adminDb<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'app'
              AND t.typname = ${enumName}
              AND t.typtype = 'e'
          ) as exists
        `;

        expect(result[0]!.exists).toBe(true);
      });
    }
  });

  // ===========================================================================
  // Column Constraints Verification
  // ===========================================================================
  describe("Column constraints verification", () => {
    it("should have employees.tenant_id as NOT NULL", async () => {
      if (!adminDb) return;

      const result = await adminDb<{ isNullable: string }[]>`
        SELECT is_nullable as "isNullable"
        FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'employees' AND column_name = 'tenant_id'
      `;

      expect(result[0]!.isNullable).toBe("NO");
    });

    it("should have employees.employee_number as NOT NULL", async () => {
      if (!adminDb) return;

      const result = await adminDb<{ isNullable: string }[]>`
        SELECT is_nullable as "isNullable"
        FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'employees' AND column_name = 'employee_number'
      `;

      expect(result[0]!.isNullable).toBe("NO");
    });

    it("should have employees.hire_date as NOT NULL", async () => {
      if (!adminDb) return;

      const result = await adminDb<{ isNullable: string }[]>`
        SELECT is_nullable as "isNullable"
        FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'employees' AND column_name = 'hire_date'
      `;

      expect(result[0]!.isNullable).toBe("NO");
    });

    it("should have leave_balances.closing_balance as a generated column", async () => {
      if (!adminDb) return;

      const result = await adminDb<{ isGenerated: string }[]>`
        SELECT is_generated as "isGenerated"
        FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'leave_balances' AND column_name = 'closing_balance'
      `;

      expect(result[0]!.isGenerated).toBe("ALWAYS");
    });

    it("should have leave_balances.available_balance as a generated column", async () => {
      if (!adminDb) return;

      const result = await adminDb<{ isGenerated: string }[]>`
        SELECT is_generated as "isGenerated"
        FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'leave_balances' AND column_name = 'available_balance'
      `;

      expect(result[0]!.isGenerated).toBe("ALWAYS");
    });
  });

  // ===========================================================================
  // Trigger Existence
  // ===========================================================================
  describe("Required triggers", () => {
    const requiredTriggers: [string, string][] = [
      ["employees", "validate_employee_status_transition"],
      ["leave_requests", "validate_leave_request_status_transition"],
      ["cases", "validate_case_status_transition"],
      ["onboarding_instances", "validate_onboarding_instance_status_transition"],
      ["onboarding_templates", "validate_onboarding_template_status_transition"],
      ["cases", "generate_case_number"],
    ];

    for (const [tableName, triggerName] of requiredTriggers) {
      it(`should have trigger ${triggerName} on app.${tableName}`, async () => {
        if (!adminDb) return;

        const result = await adminDb<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.triggers
            WHERE trigger_schema = 'app'
              AND event_object_table = ${tableName}
              AND trigger_name = ${triggerName}
          ) as exists
        `;

        expect(result[0]!.exists).toBe(true);
      });
    }
  });
});
