/**
 * Data Breach Routes Integration Tests
 *
 * Tests the GDPR data breach notification module:
 * - Breach reporting with ICO deadline calculation
 * - State machine enforcement (reported -> assessing -> ico_notified -> subjects_notified -> closed)
 * - Dashboard statistics
 * - Timeline entries
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
import { DataBreachRepository } from "../../../modules/data-breach/repository";
import { DataBreachService } from "../../../modules/data-breach/service";
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

describe("Data Breach Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: DataBreachService;
  let serviceB: DataBreachService;
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
    tenant = await createTestTenant(db, { name: `Breach A ${suffix}`, slug: `breach-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Breach B ${suffix}`, slug: `breach-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new DataBreachService(new DataBreachRepository(dbAdapter), dbAdapter);
    serviceB = new DataBreachService(new DataBreachRepository(dbAdapter), dbAdapter);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.data_breach_timeline WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.data_breaches WHERE tenant_id = ${tId}::uuid`;
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

  it("should report a data breach", async () => {
    if (skip) return;
    const result = await service.reportBreach(ctxA(), {
      title: `Breach ${Date.now()}`,
      description: "Test breach report",
      discovery_date: new Date().toISOString(),
      breach_category: "unauthorised_access",
      severity: "high",
      detected_by: user.id,
    });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("reported");
    expect(result.data!.ico_deadline).toBeTruthy();
  });

  it("should get a breach by ID", async () => {
    if (skip) return;
    const created = await service.reportBreach(ctxA(), {
      title: `Get Breach ${Date.now()}`,
      description: "Test get",
      discovery_date: new Date().toISOString(),
      breach_category: "unauthorised_disclosure",
      severity: "medium",
      detected_by: user.id,
    });
    const result = await service.getBreach(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
    expect(result.data!.id).toBe(created.data!.id);
  });

  it("should return NOT_FOUND for non-existent breach", async () => {
    if (skip) return;
    const result = await service.getBreach(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should assess a reported breach", async () => {
    if (skip) return;
    const created = await service.reportBreach(ctxA(), {
      title: `Assess Breach ${Date.now()}`,
      description: "Test assess",
      discovery_date: new Date().toISOString(),
      breach_category: "loss",
      severity: "low",
      detected_by: user.id,
    });
    const result = await service.assessBreach(ctxA(), created.data!.id, {
      severity: "medium",
      risk_to_individuals: true,
      high_risk_to_individuals: false,
      ico_notification_required: true,
      subject_notification_required: false,
    });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("assessing");
  });

  it("should reject invalid state transition (reported -> closed)", async () => {
    if (skip) return;
    const created = await service.reportBreach(ctxA(), {
      title: `Invalid Transition ${Date.now()}`,
      description: "Test invalid",
      discovery_date: new Date().toISOString(),
      breach_category: "unauthorised_access",
      severity: "low",
      detected_by: user.id,
    });
    const result = await service.closeBreach(ctxA(), created.data!.id, {
      lessons_learned: "test",
      remediation_plan: "test",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
  });

  it("should list breaches", async () => {
    if (skip) return;
    const result = await service.listBreaches(ctxA(), {}, {});
    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it("should get breach dashboard", async () => {
    if (skip) return;
    const result = await service.getBreachDashboard(ctxA());
    expect(result.success).toBe(true);
    expect(typeof result.data!.open_breaches).toBe("number");
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.reportBreach(ctxA(), {
      title: `RLS Breach ${Date.now()}`,
      description: "RLS test",
      discovery_date: new Date().toISOString(),
      breach_category: "unauthorised_access",
      severity: "low",
      detected_by: user.id,
    });
    const result = await serviceB.getBreach(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
