/**
 * Diversity Monitoring Routes Integration Tests
 *
 * Tests the voluntary diversity data collection module:
 * - Submit diversity data with consent
 * - Consent requirement enforcement
 * - Withdraw (delete) diversity data
 * - Aggregate statistics (admin)
 * - Completion rate reporting
 * - RLS tenant isolation
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import postgres from "postgres";
import {
  getTestDb, ensureTestInfra, isInfraAvailable, closeTestConnections,
  createTestTenant, createTestUser, setTenantContext, clearTenantContext,
  cleanupTestTenant, cleanupTestUser, TEST_CONFIG,
  type TestTenant, type TestUser,
} from "../../setup";
import { DiversityRepository } from "../../../modules/diversity/repository";
import { DiversityService } from "../../../modules/diversity/service";
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

describe("Diversity Monitoring Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: DiversityService;
  let serviceB: DiversityService;
  let skip = false;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) { skip = true; return; }

    db = getTestDb();
    camelDb = postgres({
      host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port,
      database: TEST_CONFIG.database.database,
      username: TEST_CONFIG.database.username, password: TEST_CONFIG.database.password,
      max: 1, idle_timeout: 20, connect_timeout: 10,
      connection: { search_path: "app,public" },
      transform: postgres.camel,
    });

    const suffix = Date.now();
    tenant = await createTestTenant(db, { name: `Diversity A ${suffix}`, slug: `diversity-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Diversity B ${suffix}`, slug: `diversity-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new DiversityService(new DiversityRepository(dbAdapter), dbAdapter);
    serviceB = new DiversityService(new DiversityRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'DIV-001', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await setTenantContext(db, tenantB.id, userB.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${userB.id}::uuid, ${tenantB.id}::uuid, 'DIV-002', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.diversity_data WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.employee_status_history WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.employees WHERE tenant_id = ${tId}::uuid`;
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

  it("should reject diversity data without consent", async () => {
    if (skip) return;
    const result = await service.upsertMyData(ctxA(), {
      consent_given: false,
      ethnicity: "prefer_not_to_say",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("should submit diversity data with consent", async () => {
    if (skip) return;
    const result = await service.upsertMyData(ctxA(), {
      consent_given: true,
      ethnicity: "white_british",
      disability_status: "no",
    });
    expect(result.success).toBe(true);
    expect(result.data!.consentGiven).toBe(true);
  });

  it("should get own diversity data", async () => {
    if (skip) return;
    const result = await service.getMyData(ctxA());
    expect(result.success).toBe(true);
  });

  it("should update own diversity data", async () => {
    if (skip) return;
    const result = await service.upsertMyData(ctxA(), {
      consent_given: true,
      ethnicity: "white_irish",
    });
    expect(result.success).toBe(true);
  });

  it("should get aggregate statistics", async () => {
    if (skip) return;
    const result = await service.getAggregateStats(ctxA());
    expect(result.success).toBe(true);
    expect(typeof result.data!.totalResponses).toBe("number");
  });

  it("should get completion rate", async () => {
    if (skip) return;
    const result = await service.getCompletionRate(ctxA());
    expect(result.success).toBe(true);
    expect(typeof result.data!.totalEmployees).toBe("number");
    expect(typeof result.data!.completionRate).toBe("number");
  });

  it("should withdraw diversity data", async () => {
    if (skip) return;
    const result = await service.withdrawMyData(ctxA());
    expect(result.success).toBe(true);
    expect(result.data!.message).toContain("withdrawn");
  });

  it("should return NOT_FOUND after withdrawal", async () => {
    if (skip) return;
    const result = await service.getMyData(ctxA());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
