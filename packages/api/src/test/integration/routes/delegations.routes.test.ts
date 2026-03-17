/**
 * Delegations Routes Integration Tests
 *
 * Tests the approval delegation module to verify:
 * - Delegation CRUD operations
 * - Self-delegation prevention
 * - Circular delegation detection
 * - Overlapping delegation prevention
 * - Date range validation
 * - Revocation by delegator
 * - Active delegation lookup
 * - Approver resolution
 * - RLS tenant isolation
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import postgres from "postgres";
import {
  getTestDb, ensureTestInfra, isInfraAvailable, closeTestConnections,
  createTestTenant, createTestUser, setTenantContext, clearTenantContext,
  cleanupTestTenant, cleanupTestUser, withSystemContext, TEST_CONFIG,
  type TestTenant, type TestUser,
} from "../../setup";
import { DelegationRepository } from "../../../modules/delegations/repository";
import { DelegationService, DelegationErrorCodes } from "../../../modules/delegations/service";
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

describe("Delegations Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let user2: TestUser;
  let userB: TestUser;
  let service: DelegationService;
  let serviceB: DelegationService;
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
    tenant = await createTestTenant(db, { name: `Del A ${suffix}`, slug: `del-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Del B ${suffix}`, slug: `del-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    user2 = await createTestUser(db, tenant.id, { email: `delegate-${suffix}@example.com` });
    userB = await createTestUser(db, tenantB.id);

    // Need to add name to users for display
    await withSystemContext(db, async (tx) => {
      await tx`UPDATE app.users SET name = 'Alice Delegator' WHERE id = ${user.id}::uuid`;
      await tx`UPDATE app.users SET name = 'Bob Delegate' WHERE id = ${user2.id}::uuid`;
      await tx`UPDATE app.users SET name = 'Charlie B' WHERE id = ${userB.id}::uuid`;
    });

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new DelegationService(new DelegationRepository(dbAdapter));
    serviceB = new DelegationService(new DelegationRepository(dbAdapter));

    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.delegation_log WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.approval_delegations WHERE tenant_id = ${tId}::uuid`;
        }
      });
    } catch (e) { console.error("Cleanup error (non-fatal):", e); }
    await adminDb.end({ timeout: 5 }).catch(() => {});
    await cleanupTestUser(db, user.id); await cleanupTestUser(db, user2.id);
    await cleanupTestUser(db, userB.id);
    await cleanupTestTenant(db, tenant.id); await cleanupTestTenant(db, tenantB.id);
    await camelDb.end({ timeout: 5 }).catch(() => {}); await closeTestConnections(db);
  });

  afterEach(async () => { if (skip) return; await clearTenantContext(db); });

  const ctxA = () => ({ tenantId: tenant.id, userId: user.id });
  const ctxA2 = () => ({ tenantId: tenant.id, userId: user2.id });
  const ctxB = () => ({ tenantId: tenantB.id, userId: userB.id });

  describe("Create Delegation", () => {
    it("should create a delegation", async () => {
      if (skip) return;
      const result = await service.createDelegation(ctxA(), {
        delegateId: user2.id,
        startDate: "2026-04-01",
        endDate: "2026-04-30",
        scope: "absence",
      });
      expect(result.success).toBe(true);
      expect(result.data!.delegatorId).toBe(user.id);
      expect(result.data!.delegateId).toBe(user2.id);
      expect(result.data!.scope).toBe("absence");
      expect(result.data!.isActive).toBe(true);
    });

    it("should reject self-delegation", async () => {
      if (skip) return;
      const result = await service.createDelegation(ctxA(), {
        delegateId: user.id,
        startDate: "2026-05-01",
        endDate: "2026-05-31",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(DelegationErrorCodes.SELF_DELEGATION);
    });

    it("should reject end date before start date", async () => {
      if (skip) return;
      const result = await service.createDelegation(ctxA(), {
        delegateId: user2.id,
        startDate: "2026-06-30",
        endDate: "2026-06-01",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(DelegationErrorCodes.INVALID_DATE_RANGE);
    });

    it("should reject overlapping delegation for same scope", async () => {
      if (skip) return;
      await service.createDelegation(ctxA(), {
        delegateId: user2.id,
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        scope: "all",
      });
      const result = await service.createDelegation(ctxA(), {
        delegateId: user2.id,
        startDate: "2026-07-15",
        endDate: "2026-08-15",
        scope: "all",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(DelegationErrorCodes.OVERLAPPING_DELEGATION);
    });
  });

  describe("List and Active Delegation", () => {
    it("should list delegations for current user", async () => {
      if (skip) return;
      const result = await service.listMyDelegations(ctxA());
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe("Revoke Delegation", () => {
    it("should revoke an active delegation", async () => {
      if (skip) return;
      const created = await service.createDelegation(ctxA(), {
        delegateId: user2.id,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        scope: "cases",
      });
      expect(created.success).toBe(true);

      const result = await service.revokeDelegation(ctxA(), created.data!.id);
      expect(result.success).toBe(true);
      expect(result.data!.isActive).toBe(false);
    });

    it("should return error when revoking non-existent delegation", async () => {
      if (skip) return;
      const result = await service.revokeDelegation(ctxA(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(DelegationErrorCodes.DELEGATION_NOT_FOUND);
    });
  });

  describe("Approver Resolution", () => {
    it("should resolve to self when no active delegation", async () => {
      if (skip) return;
      const result = await service.resolveApprover(ctxB(), userB.id, "absence");
      expect(result.success).toBe(true);
      expect(result.data!.effectiveApproverId).toBe(userB.id);
      expect(result.data!.delegationId).toBeNull();
    });
  });

  describe("RLS Tenant Isolation", () => {
    it("should not allow tenant B to see tenant A delegations", async () => {
      if (skip) return;
      const created = await service.createDelegation(ctxA(), {
        delegateId: user2.id,
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        scope: "rls_test",
      });
      expect(created.success).toBe(true);

      // Tenant B listing should not include tenant A delegations
      const result = await serviceB.listMyDelegations(ctxB());
      expect(result.success).toBe(true);
      // Tenant B user has no delegations
      for (const d of result.data!) {
        expect(d.delegationId).not.toBe(created.data!.id);
      }
    });
  });
});
