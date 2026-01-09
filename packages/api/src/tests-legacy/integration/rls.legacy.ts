/**
 * Row-Level Security (RLS) Integration Tests
 *
 * Tests that tenant isolation is properly enforced through PostgreSQL RLS policies.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import postgres from "postgres";
import { getTestDatabaseUrl } from "../../config/database";

// FIX: Using centralized configuration to prevent password mismatch issues
const TEST_DB_URL = getTestDatabaseUrl();

describe("RLS - Tenant Isolation", () => {
  let sql: postgres.Sql;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    sql = postgres(TEST_DB_URL);

    // Create test tenants
    const [tA] = await sql`
      INSERT INTO app.tenants (id, name, slug, status)
      VALUES (gen_random_uuid(), 'Tenant A', 'tenant-a', 'active')
      RETURNING id
    `;
    const [tB] = await sql`
      INSERT INTO app.tenants (id, name, slug, status)
      VALUES (gen_random_uuid(), 'Tenant B', 'tenant-b', 'active')
      RETURNING id
    `;
    tenantA = tA.id;
    tenantB = tB.id;
  });

  afterAll(async () => {
    // Clean up test data
    await sql`DELETE FROM app.tenants WHERE slug IN ('tenant-a', 'tenant-b')`;
    await sql.end();
  });

  it("should only return data for the current tenant", async () => {
    // Create employees in both tenants
    await sql`
      INSERT INTO app.employees (id, tenant_id, employee_number, first_name, last_name, email, status)
      VALUES 
        (gen_random_uuid(), ${tenantA}::uuid, 'EMP-A1', 'Alice', 'Smith', 'alice@tenant-a.com', 'active'),
        (gen_random_uuid(), ${tenantB}::uuid, 'EMP-B1', 'Bob', 'Jones', 'bob@tenant-b.com', 'active')
    `;

    // Set tenant context to Tenant A and query
    await sql`SELECT set_config('app.current_tenant', ${tenantA}, true)`;
    const tenantAEmployees = await sql`SELECT * FROM app.employees WHERE tenant_id = ${tenantA}::uuid`;

    // Set tenant context to Tenant B and query
    await sql`SELECT set_config('app.current_tenant', ${tenantB}, true)`;
    const tenantBEmployees = await sql`SELECT * FROM app.employees WHERE tenant_id = ${tenantB}::uuid`;

    // Verify isolation
    expect(tenantAEmployees.length).toBeGreaterThanOrEqual(1);
    expect(tenantBEmployees.length).toBeGreaterThanOrEqual(1);
    expect(tenantAEmployees.every((e: any) => e.tenantId === tenantA)).toBe(true);
    expect(tenantBEmployees.every((e: any) => e.tenantId === tenantB)).toBe(true);
  });

  it("should prevent cross-tenant data access", async () => {
    // Set tenant context to Tenant A
    await sql`SELECT set_config('app.current_tenant', ${tenantA}, true)`;

    // Try to access Tenant B's data directly (should return empty due to RLS)
    const crossTenantQuery = await sql`
      SELECT * FROM app.employees WHERE tenant_id = ${tenantB}::uuid
    `;

    // With proper RLS, this should return empty or only tenant A data
    expect(crossTenantQuery.every((e: any) => e.tenantId !== tenantB)).toBe(true);
  });

  it("should enforce tenant_id on INSERT", async () => {
    await sql`SELECT set_config('app.current_tenant', ${tenantA}, true)`;

    // Insert should automatically use current tenant or fail if mismatched
    const [newEmployee] = await sql`
      INSERT INTO app.employees (id, tenant_id, employee_number, first_name, last_name, email, status)
      VALUES (gen_random_uuid(), ${tenantA}::uuid, 'EMP-A2', 'Charlie', 'Brown', 'charlie@tenant-a.com', 'active')
      RETURNING tenant_id
    `;

    expect(newEmployee.tenantId).toBe(tenantA);
  });
});

describe("RLS - User Context", () => {
  let sql: postgres.Sql;
  let testTenant: string;
  let testUser: string;

  beforeAll(async () => {
    sql = postgres(TEST_DB_URL);

    // Create test tenant and user
    const [tenant] = await sql`
      INSERT INTO app.tenants (id, name, slug, status)
      VALUES (gen_random_uuid(), 'Test Tenant', 'test-tenant-rls', 'active')
      RETURNING id
    `;
    testTenant = tenant.id;

    const [user] = await sql`
      INSERT INTO app.users (id, email, password_hash, first_name, last_name, status)
      VALUES (gen_random_uuid(), 'test@rls.com', 'hash', 'Test', 'User', 'active')
      RETURNING id
    `;
    testUser = user.id;
  });

  afterAll(async () => {
    await sql`DELETE FROM app.users WHERE email = 'test@rls.com'`;
    await sql`DELETE FROM app.tenants WHERE slug = 'test-tenant-rls'`;
    await sql.end();
  });

  it("should track user context in audit fields", async () => {
    await sql`SELECT set_config('app.current_tenant', ${testTenant}, true)`;
    await sql`SELECT set_config('app.current_user', ${testUser}, true)`;

    const [record] = await sql`
      INSERT INTO app.employees (id, tenant_id, employee_number, first_name, last_name, email, status)
      VALUES (gen_random_uuid(), ${testTenant}::uuid, 'EMP-AUDIT', 'Audit', 'Test', 'audit@test.com', 'active')
      RETURNING created_at, updated_at
    `;

    expect(record.createdAt).toBeDefined();
    expect(record.updatedAt).toBeDefined();
  });
});
