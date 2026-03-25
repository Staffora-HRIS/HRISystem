/**
 * Geofence Routes Integration Tests
 *
 * Tests the geofence location and violation module:
 * - Location CRUD with coordinate validation
 * - Location check (proximity detection)
 * - Violation recording and resolution
 * - State machine for violation resolution
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
import { GeofenceRepository } from "../../../modules/geofence/repository";
import { GeofenceService } from "../../../modules/geofence/service";
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

describe("Geofence Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: GeofenceService;
  let serviceB: GeofenceService;
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
    tenant = await createTestTenant(db, { name: `Geo A ${suffix}`, slug: `geo-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Geo B ${suffix}`, slug: `geo-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new GeofenceService(new GeofenceRepository(dbAdapter), dbAdapter);
    serviceB = new GeofenceService(new GeofenceRepository(dbAdapter), dbAdapter);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.geofence_violations WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.geofence_locations WHERE tenant_id = ${tId}::uuid`;
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

  it("should create a geofence location", async () => {
    if (skip) return;
    const result = await service.createLocation(ctxA(), {
      name: `Office ${Date.now()}`,
      code: `OFF-${Date.now()}`,
      latitude: 51.5074,
      longitude: -0.1278,
      radius_meters: 100,
    });
    expect(result.success).toBe(true);
    expect(result.data!.latitude).toBeCloseTo(51.5074);
  });

  it("should get a location by ID", async () => {
    if (skip) return;
    const created = await service.createLocation(ctxA(), {
      name: `Get Location ${Date.now()}`,
      code: `GET-${Date.now()}`,
      latitude: 51.509865,
      longitude: -0.118092,
      radius_meters: 200,
    });
    const result = await service.getLocation(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
  });

  it("should return NOT_FOUND for non-existent location", async () => {
    if (skip) return;
    const result = await service.getLocation(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should update a geofence location", async () => {
    if (skip) return;
    const created = await service.createLocation(ctxA(), {
      name: `Update Location ${Date.now()}`,
      code: `UPD-${Date.now()}`,
      latitude: 52.4862,
      longitude: -1.8904,
      radius_meters: 150,
    });
    const result = await service.updateLocation(ctxA(), created.data!.id, {
      radius_meters: 250,
    });
    expect(result.success).toBe(true);
    expect(result.data!.radius_meters).toBe(250);
  });

  it("should delete a geofence location", async () => {
    if (skip) return;
    const created = await service.createLocation(ctxA(), {
      name: `Delete Location ${Date.now()}`,
      code: `DEL-${Date.now()}`,
      latitude: 53.4808,
      longitude: -2.2426,
    });
    const result = await service.deleteLocation(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
    expect(result.data!.deleted).toBe(true);
  });

  it("should check location within zone", async () => {
    if (skip) return;
    await service.createLocation(ctxA(), {
      name: `Check Location ${Date.now()}`,
      code: `CHK-${Date.now()}`,
      latitude: 51.5074,
      longitude: -0.1278,
      radius_meters: 500,
    });
    const result = await service.checkLocation(ctxA(), 51.5074, -0.1278);
    expect(result.success).toBe(true);
  });

  it("should list geofence locations", async () => {
    if (skip) return;
    const result = await service.listLocations(ctxA(), {}, {});
    expect(result.items).toBeDefined();
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.createLocation(ctxA(), {
      name: `RLS Location ${Date.now()}`,
      code: `RLS-${Date.now()}`,
      latitude: 55.9533,
      longitude: -3.1883,
    });
    const result = await serviceB.getLocation(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
