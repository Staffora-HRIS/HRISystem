/**
 * Employee Photos Routes Integration Tests
 *
 * Tests the employee photo management module:
 * - Photo upload (create/replace)
 * - Photo retrieval
 * - MIME type validation
 * - File size validation
 * - Photo deletion
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
import { EmployeePhotosRepository } from "../../../modules/employee-photos/repository";
import { EmployeePhotosService } from "../../../modules/employee-photos/service";
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

describe("Employee Photos Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: EmployeePhotosService;
  let serviceB: EmployeePhotosService;
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
    tenant = await createTestTenant(db, { name: `Photo A ${suffix}`, slug: `photo-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Photo B ${suffix}`, slug: `photo-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new EmployeePhotosService(new EmployeePhotosRepository(dbAdapter), dbAdapter);
    serviceB = new EmployeePhotosService(new EmployeePhotosRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'PH-001', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.employee_photos WHERE tenant_id = ${tId}::uuid`;
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

  it("should upload a photo", async () => {
    if (skip) return;
    const result = await service.uploadPhoto(ctxA(), user.id, {
      file_key: `photos/${user.id}/avatar.jpg`,
      original_filename: "avatar.jpg",
      mime_type: "image/jpeg",
      file_size_bytes: 1024,
    });
    expect(result.success).toBe(true);
    expect(result.data!.mime_type).toBe("image/jpeg");
  });

  it("should get photo metadata", async () => {
    if (skip) return;
    const result = await service.getPhoto(ctxA(), user.id);
    expect(result.success).toBe(true);
    expect(result.data!.employee_id).toBe(user.id);
  });

  it("should reject invalid MIME type", async () => {
    if (skip) return;
    const result = await service.uploadPhoto(ctxA(), user.id, {
      file_key: "photos/test.pdf",
      original_filename: "test.pdf",
      mime_type: "application/pdf",
      file_size_bytes: 1024,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("should reject oversized file", async () => {
    if (skip) return;
    const result = await service.uploadPhoto(ctxA(), user.id, {
      file_key: "photos/big.jpg",
      original_filename: "big.jpg",
      mime_type: "image/jpeg",
      file_size_bytes: 10 * 1024 * 1024, // 10 MB
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("should delete a photo", async () => {
    if (skip) return;
    const result = await service.deletePhoto(ctxA(), user.id);
    expect(result.success).toBe(true);
    expect(result.data!.deleted).toBe(true);
  });

  it("should return NOT_FOUND for non-existent employee", async () => {
    if (skip) return;
    const result = await service.getPhoto(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should block cross-tenant photo access (RLS)", async () => {
    if (skip) return;
    await service.uploadPhoto(ctxA(), user.id, {
      file_key: `photos/${user.id}/rls.jpg`,
      original_filename: "rls.jpg",
      mime_type: "image/jpeg",
      file_size_bytes: 512,
    });
    const result = await serviceB.getPhoto(ctxB(), user.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
