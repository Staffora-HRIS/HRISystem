import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  ensureTestInfra,
  isInfraAvailable,
  getTestDb,
  closeTestConnections,
  createTestTenant,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  type TestTenant,
} from "../setup";
import { bootstrapRoot, SUPER_ADMIN_ROLE_ID } from "../../scripts/bootstrap-root";

describe("bootstrapRoot", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;

  const email = `root-${Date.now()}@example.com`;
  const password = "SuperSecurePassword123!";

  let createdUserId: string | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    tenant = await createTestTenant(db, { slug: `bootstrap-root-${Date.now()}` });
  });

  afterAll(async () => {
    if (!db || !tenant) return;
    if (createdUserId) {
      await cleanupTestUser(db, createdUserId);
    }
    await cleanupTestTenant(db, tenant.id);
    await closeTestConnections(db);
  });

  it("creates/updates a root user, makes them tenant member, and assigns super_admin (idempotent)", async () => {
    if (!db || !tenant) return; // Skip if infra not available
    const first = await bootstrapRoot(db, {
      email,
      password,
      name: "Root",
      tenantId: tenant.id,
    });

    createdUserId = first.userId;

    const second = await bootstrapRoot(db, {
      email,
      password,
      name: "Root",
      tenantId: tenant.id,
    });

    expect(second.userId).toBe(first.userId);
    expect(second.tenantId).toBe(first.tenantId);

    // Verify DB state (no duplicates)
    const state = await withSystemContext(db, async (tx) => {
      const users = await tx<{ id: string }[]>`
        SELECT id FROM app.users WHERE email = ${email}
      `;

      const memberships = await tx<{ count: number }[]>`
        SELECT count(*)::int as count
        FROM app.user_tenants
        WHERE tenant_id = ${tenant.id}::uuid
          AND user_id = ${first.userId}::uuid
      `;

      const assignments = await tx<{ count: number }[]>`
        SELECT count(*)::int as count
        FROM app.role_assignments
        WHERE tenant_id = ${tenant.id}::uuid
          AND user_id = ${first.userId}::uuid
          AND role_id = ${SUPER_ADMIN_ROLE_ID}::uuid
          AND effective_to IS NULL
      `;

      const superAdminRole = await tx<{ id: string }[]>`
        SELECT id FROM app.roles WHERE id = ${SUPER_ADMIN_ROLE_ID}::uuid
      `;

      return {
        usersCount: users.length,
        membershipsCount: memberships[0]?.count ?? 0,
        assignmentsCount: assignments[0]?.count ?? 0,
        superAdminRoleCount: superAdminRole.length,
      };
    });

    expect(state.superAdminRoleCount).toBe(1);
    expect(state.usersCount).toBe(1);
    expect(state.membershipsCount).toBe(1);
    expect(state.assignmentsCount).toBe(1);
  });

  it("updates password_hash via app.hash_password (login verification succeeds)", async () => {
    if (!db || !tenant) return; // Skip if infra not available
    const result = await bootstrapRoot(db, {
      email,
      password,
      name: "Root",
      tenantId: tenant.id,
    });

    createdUserId = result.userId;

    const ok = await withSystemContext(db, async (tx) => {
      const verified = await tx<{ verify: boolean }[]>`
        SELECT app.verify_password(${result.userId}::uuid, ${password}) as verify
      `;
      return verified[0]?.verify === true;
    });

    expect(ok).toBe(true);
  });
});
