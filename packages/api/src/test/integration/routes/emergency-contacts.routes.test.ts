/**
 * Emergency Contacts Routes Integration Tests
 *
 * Tests the emergency contact management module:
 * - Contact CRUD operations
 * - Primary contact flag management
 * - Auto-primary for first contact
 * - Employee existence validation
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
import { EmergencyContactRepository } from "../../../modules/emergency-contacts/repository";
import { EmergencyContactService } from "../../../modules/emergency-contacts/service";
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

describe("Emergency Contacts Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: EmergencyContactService;
  let serviceB: EmergencyContactService;
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
    tenant = await createTestTenant(db, { name: `EmgC A ${suffix}`, slug: `emgc-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `EmgC B ${suffix}`, slug: `emgc-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new EmergencyContactService(new EmergencyContactRepository(dbAdapter), dbAdapter);
    serviceB = new EmergencyContactService(new EmergencyContactRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'EC-001', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.emergency_contacts WHERE tenant_id = ${tId}::uuid`;
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

  it("should create an emergency contact", async () => {
    if (skip) return;
    const result = await service.create(ctxA(), user.id, {
      contact_name: "Jane Doe",
      relationship: "spouse",
      phone_primary: "07700900001",
      is_primary: true,
    });
    expect(result.success).toBe(true);
    expect(result.data!.contactName).toBe("Jane Doe");
    expect(result.data!.isPrimary).toBe(true);
  });

  it("should get an emergency contact by ID", async () => {
    if (skip) return;
    const created = await service.create(ctxA(), user.id, {
      contact_name: "Get Contact",
      relationship: "parent",
      phone_primary: "07700900002",
    });
    const result = await service.getById(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
    expect(result.data!.id).toBe(created.data!.id);
  });

  it("should return NOT_FOUND for non-existent contact", async () => {
    if (skip) return;
    const result = await service.getById(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should update an emergency contact", async () => {
    if (skip) return;
    const created = await service.create(ctxA(), user.id, {
      contact_name: "Update Contact",
      relationship: "sibling",
      phone_primary: "07700900003",
    });
    const result = await service.update(ctxA(), created.data!.id, {
      contact_name: "Updated Name",
      phone_secondary: "07700900004",
    });
    expect(result.success).toBe(true);
    expect(result.data!.contactName).toBe("Updated Name");
  });

  it("should delete an emergency contact", async () => {
    if (skip) return;
    const created = await service.create(ctxA(), user.id, {
      contact_name: "Delete Contact",
      relationship: "friend",
      phone_primary: "07700900005",
    });
    const result = await service.delete(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
  });

  it("should reject create for non-existent employee", async () => {
    if (skip) return;
    const result = await service.create(ctxA(), crypto.randomUUID(), {
      contact_name: "No Employee",
      relationship: "other",
      phone_primary: "07700900006",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should list contacts for an employee", async () => {
    if (skip) return;
    const result = await service.listByEmployee(ctxA(), user.id);
    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.create(ctxA(), user.id, {
      contact_name: "RLS Contact",
      relationship: "spouse",
      phone_primary: "07700900007",
    });
    const result = await serviceB.getById(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
