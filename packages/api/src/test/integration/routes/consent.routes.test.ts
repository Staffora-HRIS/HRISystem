/**
 * Consent Routes Integration Tests
 *
 * Tests the GDPR consent management module to verify:
 * - Consent purpose CRUD (code uniqueness, version tracking)
 * - Grant consent for an employee
 * - Withdraw consent (as easy as granting per GDPR)
 * - Conflict detection for duplicate grants
 * - Version bump on substantive purpose changes (triggers re-consent)
 * - Stale consent detection
 * - Consent check (quick authorization gate)
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
import { ConsentRepository } from "../../../modules/consent/repository";
import { ConsentService } from "../../../modules/consent/service";
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

describe("Consent Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: ConsentService;
  let serviceB: ConsentService;
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
    tenant = await createTestTenant(db, { name: `Consent A ${suffix}`, slug: `consent-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Consent B ${suffix}`, slug: `consent-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new ConsentService(new ConsentRepository(dbAdapter), dbAdapter);
    serviceB = new ConsentService(new ConsentRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'CON-001', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await setTenantContext(db, tenantB.id, userB.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${userB.id}::uuid, ${tenantB.id}::uuid, 'CON-002', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.consent_audit_log WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.consent_records WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.consent_purposes WHERE tenant_id = ${tId}::uuid`;
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

  describe("Consent Purpose CRUD", () => {
    it("should create a consent purpose", async () => {
      if (skip) return;
      const result = await service.createPurpose(ctxA(), {
        code: `MKTG-${Date.now()}`,
        name: "Marketing Communications",
        description: "Consent to receive marketing emails",
        legal_basis: "consent",
        data_categories: ["email", "name"],
        retention_period_days: 365,
      });
      expect(result.success).toBe(true);
      expect(result.data!.version).toBe(1);
      expect(result.data!.is_active).toBe(true);
    });

    it("should reject duplicate purpose code", async () => {
      if (skip) return;
      const code = `DUP-${Date.now()}`;
      await service.createPurpose(ctxA(), {
        code, name: "First", description: "First purpose",
        legal_basis: "consent", data_categories: ["email"],
      });
      const result = await service.createPurpose(ctxA(), {
        code, name: "Second", description: "Second purpose",
        legal_basis: "consent", data_categories: ["email"],
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CONFLICT");
    });

    it("should get a purpose by ID", async () => {
      if (skip) return;
      const created = await service.createPurpose(ctxA(), {
        code: `GET-${Date.now()}`, name: "Get Test", description: "Test",
        legal_basis: "consent", data_categories: ["name"],
      });
      const result = await service.getPurpose(ctxA(), created.data!.id);
      expect(result.success).toBe(true);
      expect(result.data!.code).toContain("GET-");
    });

    it("should return NOT_FOUND for non-existent purpose", async () => {
      if (skip) return;
      const result = await service.getPurpose(ctxA(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });

    it("should list consent purposes", async () => {
      if (skip) return;
      const result = await service.listPurposes(ctxA());
      expect(result.items).toBeDefined();
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });

    it("should bump version when updating substantive fields", async () => {
      if (skip) return;
      const created = await service.createPurpose(ctxA(), {
        code: `VER-${Date.now()}`, name: "Version Test", description: "Original",
        legal_basis: "consent", data_categories: ["email"],
      });
      expect(created.data!.version).toBe(1);

      const updated = await service.updatePurpose(ctxA(), created.data!.id, {
        description: "Updated description",
      });
      expect(updated.success).toBe(true);
      expect(updated.data!.version).toBe(2);
    });
  });

  describe("Grant and Withdraw Consent", () => {
    it("should grant consent for an employee", async () => {
      if (skip) return;
      const purpose = await service.createPurpose(ctxA(), {
        code: `GRANT-${Date.now()}`, name: "Grant Test", description: "Test",
        legal_basis: "consent", data_categories: ["email"],
      });
      const result = await service.grantConsent(
        ctxA(), user.id, purpose.data!.id, "web",
        { ipAddress: "192.168.1.1" }
      );
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("granted");
      expect(result.data!.consent_method).toBe("web");
    });

    it("should reject duplicate grant for same purpose", async () => {
      if (skip) return;
      const purpose = await service.createPurpose(ctxA(), {
        code: `DBLGRANT-${Date.now()}`, name: "Double Grant", description: "Test",
        legal_basis: "consent", data_categories: ["email"],
      });
      await service.grantConsent(ctxA(), user.id, purpose.data!.id, "web");
      const result = await service.grantConsent(ctxA(), user.id, purpose.data!.id, "web");
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CONFLICT");
    });

    it("should reject grant for inactive purpose", async () => {
      if (skip) return;
      const purpose = await service.createPurpose(ctxA(), {
        code: `INACTIVE-${Date.now()}`, name: "Inactive", description: "Test",
        legal_basis: "consent", data_categories: ["email"],
      });
      await service.updatePurpose(ctxA(), purpose.data!.id, { is_active: false });

      const result = await service.grantConsent(ctxA(), user.id, purpose.data!.id, "web");
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    });

    it("should withdraw granted consent", async () => {
      if (skip) return;
      const purpose = await service.createPurpose(ctxA(), {
        code: `WITHDRAW-${Date.now()}`, name: "Withdraw Test", description: "Test",
        legal_basis: "consent", data_categories: ["email"],
      });
      await service.grantConsent(ctxA(), user.id, purpose.data!.id, "web");

      const result = await service.withdrawConsent(ctxA(), user.id, purpose.data!.id, "No longer needed");
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("withdrawn");
      expect(result.data!.withdrawal_reason).toBe("No longer needed");
    });

    it("should reject withdrawing already withdrawn consent", async () => {
      if (skip) return;
      const purpose = await service.createPurpose(ctxA(), {
        code: `DBLWD-${Date.now()}`, name: "Double Withdraw", description: "Test",
        legal_basis: "consent", data_categories: ["email"],
      });
      await service.grantConsent(ctxA(), user.id, purpose.data!.id, "web");
      await service.withdrawConsent(ctxA(), user.id, purpose.data!.id);

      const result = await service.withdrawConsent(ctxA(), user.id, purpose.data!.id);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Consent Check", () => {
    it("should check consent status for an employee", async () => {
      if (skip) return;
      const code = `CHECK-${Date.now()}`;
      const purpose = await service.createPurpose(ctxA(), {
        code, name: "Check Test", description: "Test",
        legal_basis: "consent", data_categories: ["email"],
      });
      await service.grantConsent(ctxA(), user.id, purpose.data!.id, "web");

      const result = await service.checkConsent(ctxA(), user.id, code);
      expect(result.success).toBe(true);
      expect(result.data!.has_consent).toBe(true);
      expect(result.data!.requires_reconsent).toBe(false);
    });

    it("should detect stale consent after version bump", async () => {
      if (skip) return;
      const code = `STALE-${Date.now()}`;
      const purpose = await service.createPurpose(ctxA(), {
        code, name: "Stale Test", description: "Original",
        legal_basis: "consent", data_categories: ["email"],
      });
      await service.grantConsent(ctxA(), user.id, purpose.data!.id, "web");

      // Bump version
      await service.updatePurpose(ctxA(), purpose.data!.id, { description: "Updated" });

      const result = await service.checkConsent(ctxA(), user.id, code);
      expect(result.success).toBe(true);
      expect(result.data!.has_consent).toBe(false);
      expect(result.data!.requires_reconsent).toBe(true);
    });

    it("should return NOT_FOUND for non-existent purpose code", async () => {
      if (skip) return;
      const result = await service.checkConsent(ctxA(), user.id, "NONEXISTENT");
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("Dashboard", () => {
    it("should return consent dashboard statistics", async () => {
      if (skip) return;
      const result = await service.getConsentDashboard(ctxA());
      expect(result.success).toBe(true);
      expect(typeof result.data!.total_purposes).toBe("number");
      expect(typeof result.data!.active_purposes).toBe("number");
      expect(typeof result.data!.total_records).toBe("number");
      expect(result.data!.by_status).toBeDefined();
    });
  });

  describe("RLS Tenant Isolation", () => {
    it("should not allow tenant B to see tenant A consent purposes", async () => {
      if (skip) return;
      await service.createPurpose(ctxA(), {
        code: `RLS-${Date.now()}`, name: "RLS Test", description: "Test",
        legal_basis: "consent", data_categories: ["email"],
      });
      const result = await serviceB.listPurposes(ctxB());
      for (const item of result.items) {
        expect(item.tenant_id).toBe(tenantB.id);
      }
    });

    it("should not allow tenant B to read tenant A purpose by ID", async () => {
      if (skip) return;
      const created = await service.createPurpose(ctxA(), {
        code: `RLSID-${Date.now()}`, name: "RLS ID Test", description: "Test",
        legal_basis: "consent", data_categories: ["email"],
      });
      const result = await serviceB.getPurpose(ctxB(), created.data!.id);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("Outbox Events", () => {
    it("should emit domain events for consent lifecycle", async () => {
      if (skip) return;
      const purpose = await service.createPurpose(ctxA(), {
        code: `OB-${Date.now()}`, name: "Outbox Test", description: "Test",
        legal_basis: "consent", data_categories: ["email"],
      });

      const granted = await service.grantConsent(ctxA(), user.id, purpose.data!.id, "web");
      expect(granted.success).toBe(true);

      await setTenantContext(db, tenant.id, user.id);

      // Check purpose creation event
      const purposeOutbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'consent_purpose' AND aggregate_id = ${purpose.data!.id}::uuid
      `;
      expect(purposeOutbox.some(e => e.event_type === "consent.purpose.created")).toBe(true);

      // Check consent grant event
      const grantOutbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'consent_record' AND aggregate_id = ${granted.data!.id}::uuid
      `;
      expect(grantOutbox.some(e => e.event_type === "consent.granted")).toBe(true);
    });
  });
});
