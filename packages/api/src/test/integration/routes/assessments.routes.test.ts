/**
 * Assessments Routes Integration Tests
 *
 * Tests the recruitment assessment module:
 * - Assessment template CRUD
 * - Candidate assessment scheduling
 * - Result recording and status transitions
 * - Cancellation state machine enforcement
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
import { AssessmentService } from "../../../modules/assessments/service";
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

describe("Assessments Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: AssessmentService;
  let serviceB: AssessmentService;
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
    tenant = await createTestTenant(db, { name: `Assess A ${suffix}`, slug: `assess-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Assess B ${suffix}`, slug: `assess-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new AssessmentService(dbAdapter);
    serviceB = new AssessmentService(dbAdapter);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.candidate_assessments WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.assessment_templates WHERE tenant_id = ${tId}::uuid`;
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

  describe("Template CRUD", () => {
    it("should create an assessment template", async () => {
      if (skip) return;
      const result = await service.createTemplate(ctxA(), {
        name: `Template ${Date.now()}`,
        type: "technical",
        description: "Technical skills assessment",
        passMark: 70,
        timeLimitMinutes: 60,
      });
      expect(result.success).toBe(true);
      expect(result.data!.name).toContain("Template");
    });

    it("should get a template by ID", async () => {
      if (skip) return;
      const created = await service.createTemplate(ctxA(), {
        name: `Get Template ${Date.now()}`,
        type: "behavioural",
      });
      const result = await service.getTemplate(ctxA(), created.data!.id);
      expect(result.success).toBe(true);
      expect(result.data!.id).toBe(created.data!.id);
    });

    it("should return NOT_FOUND for non-existent template", async () => {
      if (skip) return;
      const result = await service.getTemplate(ctxA(), crypto.randomUUID());
      expect(result.success).toBe(false);
    });

    it("should update an assessment template", async () => {
      if (skip) return;
      const created = await service.createTemplate(ctxA(), {
        name: `Update Template ${Date.now()}`,
        type: "technical",
      });
      const result = await service.updateTemplate(ctxA(), created.data!.id, {
        description: "Updated description",
        passMark: 80,
      });
      expect(result.success).toBe(true);
    });

    it("should list assessment templates", async () => {
      if (skip) return;
      const result = await service.listTemplates(ctxA(), {});
      expect(result.items).toBeDefined();
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Candidate Assessment Lifecycle", () => {
    it("should schedule a candidate assessment", async () => {
      if (skip) return;
      const template = await service.createTemplate(ctxA(), {
        name: `Schedule Template ${Date.now()}`,
        type: "technical",
      });
      const result = await service.scheduleCandidateAssessment(ctxA(), {
        candidateId: crypto.randomUUID(),
        templateId: template.data!.id,
      });
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("scheduled");
    });

    it("should reject scheduling with inactive template", async () => {
      if (skip) return;
      const template = await service.createTemplate(ctxA(), {
        name: `Inactive Template ${Date.now()}`,
        type: "technical",
      });
      await service.updateTemplate(ctxA(), template.data!.id, { active: false });
      const result = await service.scheduleCandidateAssessment(ctxA(), {
        candidateId: crypto.randomUUID(),
        templateId: template.data!.id,
      });
      expect(result.success).toBe(false);
    });

    it("should cancel a scheduled assessment", async () => {
      if (skip) return;
      const template = await service.createTemplate(ctxA(), {
        name: `Cancel Template ${Date.now()}`,
        type: "technical",
      });
      const scheduled = await service.scheduleCandidateAssessment(ctxA(), {
        candidateId: crypto.randomUUID(),
        templateId: template.data!.id,
      });
      const result = await service.cancelCandidateAssessment(ctxA(), scheduled.data!.id);
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("cancelled");
    });
  });

  describe("RLS Tenant Isolation", () => {
    it("should not allow tenant B to read tenant A template", async () => {
      if (skip) return;
      const created = await service.createTemplate(ctxA(), {
        name: `RLS Template ${Date.now()}`,
        type: "technical",
      });
      const result = await serviceB.getTemplate(ctxB(), created.data!.id);
      expect(result.success).toBe(false);
    });
  });
});
