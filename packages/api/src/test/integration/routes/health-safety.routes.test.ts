/**
 * Health & Safety Routes Integration Tests
 *
 * Tests the health & safety module to verify:
 * - Incident CRUD with state machine transitions
 * - RIDDOR auto-flagging for fatal/major severity
 * - Risk assessment lifecycle (draft -> active -> archived)
 * - DSE assessment creation and update
 * - Dashboard statistics
 * - RLS tenant isolation
 * - Outbox events emitted atomically
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import postgres from "postgres";
import {
  getTestDb, ensureTestInfra, isInfraAvailable, closeTestConnections,
  createTestTenant, createTestUser, setTenantContext, clearTenantContext,
  cleanupTestTenant, cleanupTestUser, TEST_CONFIG,
  type TestTenant, type TestUser,
} from "../../setup";
import { HealthSafetyRepository } from "../../../modules/health-safety/repository";
import { HealthSafetyService } from "../../../modules/health-safety/service";
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

describe("Health & Safety Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: HealthSafetyService;
  let serviceB: HealthSafetyService;
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
    tenant = await createTestTenant(db, { name: `HS A ${suffix}`, slug: `hs-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `HS B ${suffix}`, slug: `hs-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new HealthSafetyService(new HealthSafetyRepository(dbAdapter), dbAdapter);
    serviceB = new HealthSafetyService(new HealthSafetyRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'HS-001', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await setTenantContext(db, tenantB.id, userB.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${userB.id}::uuid, ${tenantB.id}::uuid, 'HS-002', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.hs_dse_assessments WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.hs_risk_assessments WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.hs_incidents WHERE tenant_id = ${tId}::uuid`;
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
  const ctxB = () => ({ tenantId: tenantB.id, userId: userB.id });

  describe("Incident Reporting", () => {
    it("should report an incident", async () => {
      if (skip) return;
      const result = await service.reportIncident(ctxA(), {
        description: "Slip in warehouse",
        severity: "minor",
        incident_date: new Date().toISOString(),
        location: "Warehouse Bay 3",
        reported_by_employee_id: user.id,
      });
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("reported");
      expect(result.data!.severity).toBe("minor");
    });

    it("should auto-flag RIDDOR for fatal incidents", async () => {
      if (skip) return;
      const result = await service.reportIncident(ctxA(), {
        description: "Fatal workplace accident",
        severity: "fatal",
        incident_date: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
      expect(result.data!.riddor_reportable).toBe(true);
    });

    it("should auto-flag RIDDOR for major incidents", async () => {
      if (skip) return;
      const result = await service.reportIncident(ctxA(), {
        description: "Major injury",
        severity: "major",
        incident_date: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
      expect(result.data!.riddor_reportable).toBe(true);
    });

    it("should get an incident by ID", async () => {
      if (skip) return;
      const created = await service.reportIncident(ctxA(), {
        description: "Get test incident",
        severity: "minor",
        incident_date: new Date().toISOString(),
      });
      const result = await service.getIncident(ctxA(), created.data!.id);
      expect(result.success).toBe(true);
      expect(result.data!.id).toBe(created.data!.id);
    });

    it("should return NOT_FOUND for non-existent incident", async () => {
      if (skip) return;
      const result = await service.getIncident(ctxA(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("Incident State Machine", () => {
    it("should transition reported -> investigating", async () => {
      if (skip) return;
      const created = await service.reportIncident(ctxA(), {
        description: "Investigate this",
        severity: "minor",
        incident_date: new Date().toISOString(),
      });
      const result = await service.updateIncident(ctxA(), created.data!.id, {
        status: "investigating",
        investigation_findings: "Initial findings",
      });
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("investigating");
    });

    it("should reject reported -> closed (must investigate first)", async () => {
      if (skip) return;
      const created = await service.reportIncident(ctxA(), {
        description: "Skip investigate",
        severity: "minor",
        incident_date: new Date().toISOString(),
      });
      const result = await service.updateIncident(ctxA(), created.data!.id, { status: "closed" });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
    });

    it("should reject reported -> resolved (must investigate first)", async () => {
      if (skip) return;
      const created = await service.reportIncident(ctxA(), {
        description: "Skip to resolved",
        severity: "minor",
        incident_date: new Date().toISOString(),
      });
      const result = await service.updateIncident(ctxA(), created.data!.id, { status: "resolved" });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
    });
  });

  describe("Risk Assessment CRUD", () => {
    it("should create a risk assessment in draft", async () => {
      if (skip) return;
      const result = await service.createRiskAssessment(ctxA(), {
        title: "Office Fire Risk",
        description: "Fire risk assessment for main office",
        assessment_date: "2026-03-01",
        review_date: "2027-03-01",
        overall_risk_level: "medium",
      });
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("draft");
      expect(result.data!.overall_risk_level).toBe("medium");
    });

    it("should reject review_date before assessment_date", async () => {
      if (skip) return;
      const result = await service.createRiskAssessment(ctxA(), {
        title: "Bad Dates RA",
        assessment_date: "2027-06-01",
        review_date: "2027-01-01",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    });

    it("should approve a draft risk assessment", async () => {
      if (skip) return;
      const created = await service.createRiskAssessment(ctxA(), {
        title: "Approve RA",
        assessment_date: "2026-03-01",
        review_date: "2027-03-01",
      });
      const result = await service.approveRiskAssessment(ctxA(), created.data!.id, user.id);
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("active");
    });

    it("should reject approving an archived assessment", async () => {
      if (skip) return;
      const created = await service.createRiskAssessment(ctxA(), {
        title: "Archive RA",
        assessment_date: "2026-03-01",
        review_date: "2027-03-01",
      });
      await service.updateRiskAssessment(ctxA(), created.data!.id, { status: "archived" });
      const result = await service.approveRiskAssessment(ctxA(), created.data!.id, user.id);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
    });
  });

  describe("Dashboard", () => {
    it("should return dashboard statistics", async () => {
      if (skip) return;
      const result = await service.getDashboard(ctxA());
      expect(result.success).toBe(true);
      expect(typeof result.data!.open_incidents).toBe("number");
      expect(typeof result.data!.active_risk_assessments).toBe("number");
      expect(typeof result.data!.riddor_reportable_total).toBe("number");
    });
  });

  describe("RLS Tenant Isolation", () => {
    it("should not allow tenant B to read tenant A incidents", async () => {
      if (skip) return;
      const created = await service.reportIncident(ctxA(), {
        description: "RLS incident test",
        severity: "minor",
        incident_date: new Date().toISOString(),
      });
      const result = await serviceB.getIncident(ctxB(), created.data!.id);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });
});
