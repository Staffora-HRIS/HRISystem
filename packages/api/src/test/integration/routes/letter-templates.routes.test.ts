/**
 * Letter Templates Routes Integration Tests
 *
 * Tests the letter template management module:
 * - Template CRUD operations
 * - Template listing with filters
 * - NOT_FOUND handling
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
import { LetterTemplatesRepository } from "../../../modules/letter-templates/repository";
import { LetterTemplatesService } from "../../../modules/letter-templates/service";
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

describe("Letter Templates Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: LetterTemplatesService;
  let serviceB: LetterTemplatesService;
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
    tenant = await createTestTenant(db, { name: `Letter A ${suffix}`, slug: `letter-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Letter B ${suffix}`, slug: `letter-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new LetterTemplatesService(new LetterTemplatesRepository(dbAdapter), dbAdapter);
    serviceB = new LetterTemplatesService(new LetterTemplatesRepository(dbAdapter), dbAdapter);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.generated_letters WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.letter_templates WHERE tenant_id = ${tId}::uuid`;
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

  it("should create a letter template", async () => {
    if (skip) return;
    const result = await service.createTemplate(ctxA(), {
      name: `Offer Letter ${Date.now()}`,
      category: "offer",
      subject: "Job Offer - {{position}}",
      body: "Dear {{employee_name}}, We are pleased to offer you the position of {{position}}.",
      placeholders: [
        { key: "employee_name", label: "Employee Name", required: true },
        { key: "position", label: "Position", required: true },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data!.name).toContain("Offer Letter");
  });

  it("should get a template by ID", async () => {
    if (skip) return;
    const created = await service.createTemplate(ctxA(), {
      name: `Get Template ${Date.now()}`,
      category: "confirmation",
      subject: "Test",
      body: "Test body",
    });
    const result = await service.getTemplate(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
    expect(result.data!.id).toBe(created.data!.id);
  });

  it("should return NOT_FOUND for non-existent template", async () => {
    if (skip) return;
    const result = await service.getTemplate(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should update a template", async () => {
    if (skip) return;
    const created = await service.createTemplate(ctxA(), {
      name: `Update Template ${Date.now()}`,
      category: "warning",
      subject: "Original",
      body: "Original body",
    });
    const result = await service.updateTemplate(ctxA(), created.data!.id, {
      subject: "Updated Subject",
    });
    expect(result.success).toBe(true);
  });

  it("should list templates", async () => {
    if (skip) return;
    const result = await service.listTemplates(ctxA(), {}, {});
    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.createTemplate(ctxA(), {
      name: `RLS Template ${Date.now()}`,
      category: "termination",
      subject: "RLS Test",
      body: "RLS test body",
    });
    const result = await serviceB.getTemplate(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
