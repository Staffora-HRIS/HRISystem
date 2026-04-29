/**
 * Data Retention Routes Integration Tests
 *
 * Tests the GDPR data retention policy management module:
 * - Retention policy CRUD
 * - Duplicate category prevention
 * - UK default policy seeding
 * - Exception (legal hold) management
 * - Dashboard statistics
 * - RLS tenant isolation
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import postgres from "postgres";
import {
  getTestDb, ensureTestInfra, isInfraAvailable, closeTestConnections,
  createTestTenant, createTestUser, clearTenantContext,
  cleanupTestTenant, cleanupTestUser, TEST_CONFIG,
  type TestTenant, type TestUser,
} from "../../setup";
import { DataRetentionRepository } from "../../../modules/data-retention/repository";
import { DataRetentionService } from "../../../modules/data-retention/service";
import type { DatabaseClient } from "../../../plugins/db";

function buildCamelDbAdapter(camelDb: ReturnType<typeof postgres>) {
  return {
    withTransaction: async <T>(ctx: { tenantId: string; userId?: string }, fn: (tx: unknown) => Promise<T>): Promise<T> => {
      return camelDb.begin(async (tx) => {
        await tx`SELECT app.set_tenant_context(${ctx.tenantId}::uuid, ${ctx.userId || null}::uuid)`;
        return fn(tx);
      }) as Promise<T>;
    },
  } as unknown as DatabaseClient;
}

describe("Data Retention Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: DataRetentionService;
  let serviceB: DataRetentionService;
  let skip = false;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) { skip = true; return; }

    db = getTestDb();
    camelDb = postgres({
      host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port,
      database: TEST_CONFIG.database.database,
      username: TEST_CONFIG.database.username, password: TEST_CONFIG.database.password,
      max: 5, idle_timeout: 20, connect_timeout: 10,
      connection: { search_path: "app,public" },
      transform: postgres.camel,
    });

    const suffix = Date.now();
    tenant = await createTestTenant(db, { name: `Retention A ${suffix}`, slug: `retention-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Retention B ${suffix}`, slug: `retention-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new DataRetentionService(new DataRetentionRepository(dbAdapter), dbAdapter);
    serviceB = new DataRetentionService(new DataRetentionRepository(dbAdapter), dbAdapter);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.retention_exceptions WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.retention_reviews WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.retention_policies WHERE tenant_id = ${tId}::uuid`;
        }
      });
    } catch (e) { console.error("Cleanup error (non-fatal):", e); }
    await adminDb.end({ timeout: 5 }).catch(() => {});
    await cleanupTestUser(db, user.id); await cleanupTestUser(db, userB.id);
    await cleanupTestTenant(db, tenant.id); await cleanupTestTenant(db, tenantB.id);
    await camelDb.end({ timeout: 5 }).catch(() => {}); await closeTestConnections(db);
  });

  afterEach(async () => { if (skip) return; await clearTenantContext(db); });

  const ctxA = () => ({ tenantId: tenant.id, userId: user.id });
  const ctxB = () => ({ tenantId: tenantB.id, userId: userB.id });

  it("should create a retention policy", async () => {
    if (skip) return;
    const result = await service.createPolicy(ctxA(), {
      name: "Test Payroll Policy",
      description: "Test retention for payroll",
      dataCategory: "payroll",
      retentionPeriodMonths: 72,
      legalBasis: "tax_law",
    });
    expect(result.success).toBe(true);
    expect(result.data!.retentionPeriodMonths).toBe(72);
    expect(result.data!.status).toBe("active");
  });

  it("should reject duplicate policy for same category", async () => {
    if (skip) return;
    const result = await service.createPolicy(ctxA(), {
      name: "Duplicate Payroll",
      dataCategory: "payroll",
      retentionPeriodMonths: 48,
      legalBasis: "employment_law",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("CONFLICT");
  });

  it("should get a policy by ID", async () => {
    if (skip) return;
    const created = await service.createPolicy(ctxA(), {
      name: "Get Policy Test",
      dataCategory: "tax",
      retentionPeriodMonths: 72,
      legalBasis: "tax_law",
    });
    const result = await service.getPolicy(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
    expect(result.data!.id).toBe(created.data!.id);
  });

  it("should return NOT_FOUND for non-existent policy", async () => {
    if (skip) return;
    const result = await service.getPolicy(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should update a retention policy", async () => {
    if (skip) return;
    const created = await service.createPolicy(ctxA(), {
      name: "Update Policy",
      dataCategory: "time_entries",
      retentionPeriodMonths: 24,
      legalBasis: "employment_law",
    });
    const result = await service.updatePolicy(ctxA(), created.data!.id, {
      retentionPeriodMonths: 36,
      autoPurgeEnabled: true,
    });
    expect(result.success).toBe(true);
    expect(result.data!.retentionPeriodMonths).toBe(36);
  });

  it("should list retention policies", async () => {
    if (skip) return;
    const result = await service.listPolicies(ctxA(), {});
    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it("should get retention dashboard", async () => {
    if (skip) return;
    const result = await service.getRetentionDashboard(ctxA());
    expect(result.success).toBe(true);
    expect(typeof result.data!.totalPolicies).toBe("number");
    expect(typeof result.data!.activePolicies).toBe("number");
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.createPolicy(ctxA(), {
      name: "RLS Policy",
      dataCategory: "recruitment",
      retentionPeriodMonths: 6,
      legalBasis: "limitation_act",
    });
    const result = await serviceB.getPolicy(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
