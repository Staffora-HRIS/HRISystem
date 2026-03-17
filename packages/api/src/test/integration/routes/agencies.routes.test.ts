/**
 * Agencies Routes Integration Tests
 *
 * Tests the recruitment agency management module:
 * - Agency CRUD operations
 * - Placement creation and listing
 * - Blacklisted agency placement prevention
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
import { AgencyRepository } from "../../../modules/agencies/repository";
import { AgencyService } from "../../../modules/agencies/service";
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

describe("Agencies Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: AgencyService;
  let serviceB: AgencyService;
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
    tenant = await createTestTenant(db, { name: `Agency A ${suffix}`, slug: `agency-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Agency B ${suffix}`, slug: `agency-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new AgencyService(new AgencyRepository(dbAdapter), dbAdapter);
    serviceB = new AgencyService(new AgencyRepository(dbAdapter), dbAdapter);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.agency_placements WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.recruitment_agencies WHERE tenant_id = ${tId}::uuid`;
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

  describe("Agency CRUD", () => {
    it("should create an agency", async () => {
      if (skip) return;
      const result = await service.createAgency(ctxA(), {
        name: `Test Agency ${Date.now()}`,
        contact_name: "John Doe",
        email: "john@agency.com",
        status: "active",
      });
      expect(result.success).toBe(true);
      expect(result.data!.name).toContain("Test Agency");
      expect(result.data!.status).toBe("active");
    });

    it("should get an agency by ID", async () => {
      if (skip) return;
      const created = await service.createAgency(ctxA(), {
        name: `Get Agency ${Date.now()}`,
        status: "active",
      });
      const result = await service.getAgency(ctxA(), created.data!.id);
      expect(result.success).toBe(true);
      expect(result.data!.id).toBe(created.data!.id);
    });

    it("should return NOT_FOUND for non-existent agency", async () => {
      if (skip) return;
      const result = await service.getAgency(ctxA(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });

    it("should update an agency", async () => {
      if (skip) return;
      const created = await service.createAgency(ctxA(), {
        name: `Update Agency ${Date.now()}`,
        status: "active",
      });
      const result = await service.updateAgency(ctxA(), created.data!.id, {
        name: "Updated Agency Name",
        preferred: true,
      });
      expect(result.success).toBe(true);
      expect(result.data!.name).toBe("Updated Agency Name");
      expect(result.data!.preferred).toBe(true);
    });

    it("should delete an agency", async () => {
      if (skip) return;
      const created = await service.createAgency(ctxA(), {
        name: `Delete Agency ${Date.now()}`,
        status: "active",
      });
      const result = await service.deleteAgency(ctxA(), created.data!.id);
      expect(result.success).toBe(true);
      expect(result.data!.deleted).toBe(true);
    });

    it("should list agencies", async () => {
      if (skip) return;
      await service.createAgency(ctxA(), { name: `List Agency ${Date.now()}`, status: "active" });
      const result = await service.listAgencies(ctxA(), {}, {});
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Placement Operations", () => {
    it("should reject placement for blacklisted agency", async () => {
      if (skip) return;
      const agency = await service.createAgency(ctxA(), {
        name: `Blacklisted ${Date.now()}`,
        status: "blacklisted",
      });
      const result = await service.createPlacement(ctxA(), {
        agency_id: agency.data!.id,
        candidate_id: crypto.randomUUID(),
        placement_date: "2025-06-01",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("RLS Tenant Isolation", () => {
    it("should not allow tenant B to read tenant A agency by ID", async () => {
      if (skip) return;
      const created = await service.createAgency(ctxA(), {
        name: `RLS Agency ${Date.now()}`,
        status: "active",
      });
      const result = await serviceB.getAgency(ctxB(), created.data!.id);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });

    it("should not show tenant A agencies in tenant B list", async () => {
      if (skip) return;
      await service.createAgency(ctxA(), { name: `RLS List ${Date.now()}`, status: "active" });
      const result = await serviceB.listAgencies(ctxB(), {}, {});
      for (const item of result.items) {
        expect(item.tenant_id).toBe(tenantB.id);
      }
    });
  });

  describe("Outbox Events", () => {
    it("should emit domain events for agency creation", async () => {
      if (skip) return;
      const created = await service.createAgency(ctxA(), {
        name: `Outbox Agency ${Date.now()}`,
        status: "active",
      });
      expect(created.success).toBe(true);

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'recruitment_agency' AND aggregate_id = ${created.data!.id}::uuid
      `;
      expect(outbox.some(e => e.event_type === "agency.created")).toBe(true);
    });
  });
});
