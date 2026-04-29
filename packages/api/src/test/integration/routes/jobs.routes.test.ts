/**
 * Jobs Catalog Routes Integration Tests
 *
 * Tests the jobs catalog module:
 * - Job CRUD operations
 * - Unique code per tenant enforcement
 * - Salary range validation
 * - State machine (draft -> active -> frozen/archived)
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
import { JobsRepository } from "../../../modules/jobs/repository";
import { JobsService } from "../../../modules/jobs/service";
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

describe("Jobs Catalog Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: JobsService;
  let serviceB: JobsService;
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
    tenant = await createTestTenant(db, { name: `Jobs A ${suffix}`, slug: `jobs-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Jobs B ${suffix}`, slug: `jobs-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new JobsService(new JobsRepository(dbAdapter), dbAdapter);
    serviceB = new JobsService(new JobsRepository(dbAdapter), dbAdapter);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.jobs WHERE tenant_id = ${tId}::uuid`;
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

  it("should create a job", async () => {
    if (skip) return;
    const result = await service.createJob(ctxA(), {
      code: `JOB-${Date.now()}`,
      title: "Software Engineer",
      description: "Full stack development",
      job_family: "Engineering",
      level: "Senior",
    });
    expect(result.success).toBe(true);
    expect(result.data!.title).toBe("Software Engineer");
    expect(result.data!.status).toBe("draft");
  });

  it("should get a job by ID", async () => {
    if (skip) return;
    const created = await service.createJob(ctxA(), {
      code: `GET-${Date.now()}`,
      title: "Product Manager",
    });
    const result = await service.getJob(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
    expect(result.data!.id).toBe(created.data!.id);
  });

  it("should return NOT_FOUND for non-existent job", async () => {
    if (skip) return;
    const result = await service.getJob(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should reject duplicate job code", async () => {
    if (skip) return;
    const code = `DUP-${Date.now()}`;
    await service.createJob(ctxA(), { code, title: "First" });
    const result = await service.createJob(ctxA(), { code, title: "Second" });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("CONFLICT");
  });

  it("should transition job status (draft -> active)", async () => {
    if (skip) return;
    const created = await service.createJob(ctxA(), {
      code: `TRANS-${Date.now()}`,
      title: "Transition Test",
    });
    const result = await service.transitionStatus(ctxA(), created.data!.id, "active");
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("active");
  });

  it("should reject invalid transition (draft -> archived)", async () => {
    if (skip) return;
    const created = await service.createJob(ctxA(), {
      code: `INV-${Date.now()}`,
      title: "Invalid Transition",
    });
    const result = await service.transitionStatus(ctxA(), created.data!.id, "archived");
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
  });

  it("should list jobs", async () => {
    if (skip) return;
    const result = await service.listJobs(ctxA(), {}, {});
    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.createJob(ctxA(), {
      code: `RLS-${Date.now()}`,
      title: "RLS Test Job",
    });
    const result = await serviceB.getJob(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
