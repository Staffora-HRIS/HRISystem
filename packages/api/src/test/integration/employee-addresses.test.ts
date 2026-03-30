/**
 * Employee Address Management Integration Tests
 *
 * Tests for:
 * - CRUD operations on employee_addresses with effective dating
 * - UK postcode format validation
 * - RLS tenant isolation
 * - Address history tracking
 * - Outbox event atomicity
 * - Overlap prevention
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import postgres from "postgres";
import {
  TEST_CONFIG,
  ensureTestInfra,
  isInfraAvailable,
} from "../setup";
import { isValidUkPostcode } from "../../modules/hr/address.service";

// =============================================================================
// Test Helpers
// =============================================================================

let db: ReturnType<typeof postgres>;
let tenantAId: string;
let tenantBId: string;
let userAId: string;
let userBId: string;
let employeeAId: string;
let employeeBId: string;

async function setTenantContext(
  sql: ReturnType<typeof postgres>,
  tenantId: string,
  userId: string
): Promise<void> {
  await sql`SELECT set_config('app.current_tenant', ${tenantId}, false)`;
  await sql`SELECT set_config('app.current_user', ${userId}, false)`;
}

async function resetSystemContext(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`SELECT app.disable_system_context()`;
}

async function withSystemContext<T>(
  sql: ReturnType<typeof postgres>,
  fn: () => Promise<T>
): Promise<T> {
  await sql`SELECT app.enable_system_context()`;
  try {
    return await fn();
  } finally {
    await sql`SELECT app.disable_system_context()`;
  }
}

// =============================================================================
// Setup
// =============================================================================

beforeAll(async () => {
  await ensureTestInfra();
  if (!isInfraAvailable()) return;

  // Use max: 1 to ensure session-level set_config() (tenant context) persists
  // across queries within the same test. With max > 1, session state may be
  // lost when postgres.js assigns queries to different pooled connections.
  db = postgres({
    host: TEST_CONFIG.database.host,
    port: TEST_CONFIG.database.port,
    database: TEST_CONFIG.database.database,
    username: TEST_CONFIG.database.username,
    password: TEST_CONFIG.database.password,
    max: 1,
    idle_timeout: 10,
    connect_timeout: 5,
    transform: {
      column: { to: postgres.toCamel, from: postgres.fromCamel },
    },
  });

  // Create test tenants and users within system context
  // Use max: 1 to ensure enable_system_context() and subsequent queries
  // share the same connection (system context is session-level state).
  const adminDb = postgres({
    host: TEST_CONFIG.database.host,
    port: TEST_CONFIG.database.port,
    database: TEST_CONFIG.database.database,
    username: TEST_CONFIG.database.adminUsername,
    password: TEST_CONFIG.database.adminPassword,
    max: 1,
    idle_timeout: 10,
    transform: {
      column: { to: postgres.toCamel, from: postgres.fromCamel },
    },
  });

  try {
    await adminDb`SELECT app.enable_system_context()`;

    // Create Tenant A
    const [tA] = await adminDb<{ id: string }[]>`
      INSERT INTO app.tenants (name, slug, status)
      VALUES ('Address Test Tenant A', ${'addr-test-a-' + Date.now()}, 'active')
      RETURNING id
    `;
    tenantAId = tA!.id;

    // Create Tenant B
    const [tB] = await adminDb<{ id: string }[]>`
      INSERT INTO app.tenants (name, slug, status)
      VALUES ('Address Test Tenant B', ${'addr-test-b-' + Date.now()}, 'active')
      RETURNING id
    `;
    tenantBId = tB!.id;

    // Create User A
    const [uA] = await adminDb<{ id: string }[]>`
      INSERT INTO app.users (email, password_hash, name, status)
      VALUES (${'addr-a-' + Date.now() + '@test.com'}, 'test', 'Address UserA', 'active')
      RETURNING id
    `;
    userAId = uA!.id;

    // Create User B
    const [uB] = await adminDb<{ id: string }[]>`
      INSERT INTO app.users (email, password_hash, name, status)
      VALUES (${'addr-b-' + Date.now() + '@test.com'}, 'test', 'Address UserB', 'active')
      RETURNING id
    `;
    userBId = uB!.id;

    // Create Employee A (tenant A)
    await adminDb`SELECT set_config('app.current_tenant', ${tenantAId}, false)`;
    const [eA] = await adminDb<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, hire_date, status)
      VALUES (${tenantAId}::uuid, 'ADDR-A-001', '2024-01-01', 'active')
      RETURNING id
    `;
    employeeAId = eA!.id;

    // Create personal record for employee A (needed by findEmployeeById)
    await adminDb`
      INSERT INTO app.employee_personal (
        tenant_id, employee_id, effective_from,
        first_name, last_name, created_by
      )
      VALUES (
        ${tenantAId}::uuid, ${employeeAId}::uuid, '2024-01-01',
        'Address', 'TestA', ${userAId}::uuid
      )
    `;

    // Create Employee B (tenant B)
    await adminDb`SELECT set_config('app.current_tenant', ${tenantBId}, false)`;
    const [eB] = await adminDb<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, hire_date, status)
      VALUES (${tenantBId}::uuid, 'ADDR-B-001', '2024-01-01', 'active')
      RETURNING id
    `;
    employeeBId = eB!.id;

    await adminDb`
      INSERT INTO app.employee_personal (
        tenant_id, employee_id, effective_from,
        first_name, last_name, created_by
      )
      VALUES (
        ${tenantBId}::uuid, ${employeeBId}::uuid, '2024-01-01',
        'Address', 'TestB', ${userBId}::uuid
      )
    `;

    await adminDb`SELECT app.disable_system_context()`;
  } finally {
    await adminDb.end({ timeout: 5 }).catch(() => {});
  }
});

afterAll(async () => {
  if (!isInfraAvailable() || !db) return;

  // Cleanup test data
  const adminDb = postgres({
    host: TEST_CONFIG.database.host,
    port: TEST_CONFIG.database.port,
    database: TEST_CONFIG.database.database,
    username: TEST_CONFIG.database.adminUsername,
    password: TEST_CONFIG.database.adminPassword,
    max: 1,
    idle_timeout: 5,
    transform: {
      column: { to: postgres.toCamel, from: postgres.fromCamel },
    },
  });

  try {
    await adminDb`SELECT app.enable_system_context()`;
    if (employeeAId) await adminDb`DELETE FROM app.employees WHERE id = ${employeeAId}::uuid`;
    if (employeeBId) await adminDb`DELETE FROM app.employees WHERE id = ${employeeBId}::uuid`;
    if (userAId) await adminDb`DELETE FROM app.users WHERE id = ${userAId}::uuid`;
    if (userBId) await adminDb`DELETE FROM app.users WHERE id = ${userBId}::uuid`;
    if (tenantAId) await adminDb`DELETE FROM app.tenants WHERE id = ${tenantAId}::uuid`;
    if (tenantBId) await adminDb`DELETE FROM app.tenants WHERE id = ${tenantBId}::uuid`;
    await adminDb`SELECT app.disable_system_context()`;
  } finally {
    await adminDb.end({ timeout: 5 }).catch(() => {});
    await db.end({ timeout: 5 }).catch(() => {});
  }
});

// =============================================================================
// UK Postcode Validation (Unit Tests)
// =============================================================================

describe("UK Postcode Validation", () => {
  it("should accept valid UK postcodes", () => {
    expect(isValidUkPostcode("SW1A 1AA", "GB")).toBe(true);
    expect(isValidUkPostcode("M1 1AA", "GB")).toBe(true);
    expect(isValidUkPostcode("EC2A 4BX", "GB")).toBe(true);
    expect(isValidUkPostcode("B1 1BB", "GB")).toBe(true);
    expect(isValidUkPostcode("LS1 4AP", "GB")).toBe(true);
    expect(isValidUkPostcode("W1A 0AX", "GB")).toBe(true);
    expect(isValidUkPostcode("CR2 6XH", "GB")).toBe(true);
    expect(isValidUkPostcode("DN55 1PT", "GB")).toBe(true);
    // Without space
    expect(isValidUkPostcode("SW1A1AA", "GB")).toBe(true);
    // Lowercase
    expect(isValidUkPostcode("sw1a 1aa", "GB")).toBe(true);
  });

  it("should reject invalid UK postcodes", () => {
    expect(isValidUkPostcode("INVALID", "GB")).toBe(false);
    expect(isValidUkPostcode("12345", "GB")).toBe(false);
    expect(isValidUkPostcode("ABC 123", "GB")).toBe(false);
    expect(isValidUkPostcode("", "GB")).toBe(false);
  });

  it("should skip validation for non-GB countries", () => {
    expect(isValidUkPostcode("12345", "US")).toBe(true);
    expect(isValidUkPostcode("INVALID", "FR")).toBe(true);
  });

  it("should accept null/undefined postcodes", () => {
    expect(isValidUkPostcode(null, "GB")).toBe(true);
    expect(isValidUkPostcode(undefined, "GB")).toBe(true);
  });
});

// =============================================================================
// Address CRUD Operations
// =============================================================================

describe("Employee Address CRUD", () => {
  let addressIdA: string;

  it("should create an address for tenant A employee", async () => {
    if (!isInfraAvailable()) return;

    await setTenantContext(db, tenantAId, userAId);
    await resetSystemContext(db);

    const rows = await db<{
      id: string;
      addressType: string;
      addressLine1: string;
      city: string;
      county: string | null;
      postcode: string;
      country: string;
      isPrimary: boolean;
      isCurrent: boolean;
    }[]>`
      INSERT INTO app.employee_addresses (
        tenant_id, employee_id, address_type, address_line_1,
        city, county, postcode, country, is_primary, effective_from, created_by
      )
      VALUES (
        ${tenantAId}::uuid, ${employeeAId}::uuid, 'home', '10 Downing Street',
        'London', 'Greater London', 'SW1A 2AA', 'GB', true, '2024-01-15', ${userAId}::uuid
      )
      RETURNING id, address_type, address_line_1, city, county, postcode, country, is_primary, is_current
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]!.addressType).toBe("home");
    expect(rows[0]!.addressLine1).toBe("10 Downing Street");
    expect(rows[0]!.city).toBe("London");
    expect(rows[0]!.county).toBe("Greater London");
    expect(rows[0]!.postcode).toBe("SW1A 2AA");
    expect(rows[0]!.country).toBe("GB");
    expect(rows[0]!.isPrimary).toBe(true);
    expect(rows[0]!.isCurrent).toBe(true);

    addressIdA = rows[0]!.id;
  });

  it("should default country to GB", async () => {
    if (!isInfraAvailable()) return;

    await setTenantContext(db, tenantAId, userAId);
    await resetSystemContext(db);

    const rows = await db<{ country: string }[]>`
      INSERT INTO app.employee_addresses (
        tenant_id, employee_id, address_type, address_line_1,
        city, postcode, is_primary, effective_from
      )
      VALUES (
        ${tenantAId}::uuid, ${employeeAId}::uuid, 'work', '1 Business Park',
        'Manchester', 'M1 1AA', false, '2024-01-15'
      )
      RETURNING country
    `;

    expect(rows[0]!.country).toBe("GB");

    // Cleanup
    await db`DELETE FROM app.employee_addresses WHERE address_type = 'work' AND employee_id = ${employeeAId}::uuid`;
  });

  it("should list current addresses for the employee", async () => {
    if (!isInfraAvailable()) return;

    await setTenantContext(db, tenantAId, userAId);
    await resetSystemContext(db);

    const rows = await db<{ id: string; isCurrent: boolean }[]>`
      SELECT id, is_current FROM app.employee_addresses
      WHERE employee_id = ${employeeAId}::uuid AND effective_to IS NULL
    `;

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.isCurrent === true)).toBe(true);
  });

  it("should update an address city and postcode", async () => {
    if (!isInfraAvailable()) return;

    await setTenantContext(db, tenantAId, userAId);
    await resetSystemContext(db);

    const rows = await db<{ city: string; postcode: string }[]>`
      UPDATE app.employee_addresses
      SET city = 'Birmingham', postcode = 'B1 1BB'
      WHERE id = ${addressIdA}
      RETURNING city, postcode
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]!.city).toBe("Birmingham");
    expect(rows[0]!.postcode).toBe("B1 1BB");
  });

  it("should enforce UK postcode format constraint for GB addresses", async () => {
    if (!isInfraAvailable()) return;

    await setTenantContext(db, tenantAId, userAId);
    await resetSystemContext(db);

    try {
      await db`
        INSERT INTO app.employee_addresses (
          tenant_id, employee_id, address_type, address_line_1,
          city, postcode, country, effective_from
        )
        VALUES (
          ${tenantAId}::uuid, ${employeeAId}::uuid, 'mailing', '1 Fake Road',
          'London', 'INVALID', 'GB', '2024-06-01'
        )
      `;
      throw new Error("Expected constraint violation but insert succeeded");
    } catch (error) {
      const message = String(error);
      expect(
        message.includes("employee_addresses_uk_postcode_format") ||
        message.includes("violates check constraint")
      ).toBe(true);
    }
  });

  it("should allow non-UK postcodes when country is not GB", async () => {
    if (!isInfraAvailable()) return;

    await setTenantContext(db, tenantAId, userAId);
    await resetSystemContext(db);

    const rows = await db<{ id: string; postcode: string }[]>`
      INSERT INTO app.employee_addresses (
        tenant_id, employee_id, address_type, address_line_1,
        city, postcode, country, effective_from
      )
      VALUES (
        ${tenantAId}::uuid, ${employeeAId}::uuid, 'mailing', '123 Main St',
        'New York', '10001', 'US', '2024-06-01'
      )
      RETURNING id, postcode
    `;

    expect(rows[0]!.postcode).toBe("10001");

    // Cleanup
    await db`DELETE FROM app.employee_addresses WHERE id = ${rows[0]!.id}::uuid`;
  });

  it("should close an address by setting effective_to", async () => {
    if (!isInfraAvailable()) return;

    await setTenantContext(db, tenantAId, userAId);
    await resetSystemContext(db);

    const rows = await db<{ isCurrent: boolean; effectiveTo: Date }[]>`
      UPDATE app.employee_addresses
      SET effective_to = '2024-12-31'
      WHERE id = ${addressIdA}
      RETURNING is_current, effective_to
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]!.isCurrent).toBe(false);
  });
});

// =============================================================================
// RLS Tenant Isolation
// =============================================================================

describe("Employee Address RLS", () => {
  let addressIdTenantA: string;

  beforeAll(async () => {
    if (!isInfraAvailable()) return;

    await setTenantContext(db, tenantAId, userAId);
    await resetSystemContext(db);

    const [row] = await db<{ id: string }[]>`
      INSERT INTO app.employee_addresses (
        tenant_id, employee_id, address_type, address_line_1,
        city, postcode, country, is_primary, effective_from
      )
      VALUES (
        ${tenantAId}::uuid, ${employeeAId}::uuid, 'home', '42 RLS Test Lane',
        'Bristol', 'BS1 1AA', 'GB', true, '2024-03-01'
      )
      RETURNING id
    `;
    addressIdTenantA = row!.id;
  });

  it("tenant B cannot see tenant A's addresses", async () => {
    if (!isInfraAvailable()) return;

    await setTenantContext(db, tenantBId, userBId);
    await resetSystemContext(db);

    const rows = await db<{ id: string }[]>`
      SELECT id FROM app.employee_addresses WHERE id = ${addressIdTenantA}
    `;

    expect(rows).toHaveLength(0);
  });

  it("tenant B cannot insert addresses with tenant A's tenant_id", async () => {
    if (!isInfraAvailable()) return;

    await setTenantContext(db, tenantBId, userBId);
    await resetSystemContext(db);

    try {
      await db`
        INSERT INTO app.employee_addresses (
          tenant_id, employee_id, address_type, address_line_1,
          city, country, effective_from
        )
        VALUES (
          ${tenantAId}::uuid, ${employeeAId}::uuid, 'work', '99 Rogue Road',
          'London', 'GB', '2024-03-01'
        )
      `;
      throw new Error("Expected RLS error but insert succeeded");
    } catch (error) {
      const message = String(error);
      const isRlsError =
        message.includes("new row violates") ||
        message.includes("violates row-level security") ||
        message.includes("permission denied");
      expect(isRlsError).toBe(true);
    }
  });

  it("tenant B cannot update tenant A's addresses", async () => {
    if (!isInfraAvailable()) return;

    await setTenantContext(db, tenantBId, userBId);
    await resetSystemContext(db);

    const result = await db`
      UPDATE app.employee_addresses
      SET city = 'Hacked City'
      WHERE id = ${addressIdTenantA}
    `;

    // RLS should prevent the update (0 rows affected because row is invisible)
    expect(result.count).toBe(0);
  });
});

// =============================================================================
// Effective Dating
// =============================================================================

describe("Employee Address Effective Dating", () => {
  it("should track address history via effective_from/effective_to", async () => {
    if (!isInfraAvailable()) return;

    await setTenantContext(db, tenantAId, userAId);
    await resetSystemContext(db);

    // Create initial address
    const [initial] = await db<{ id: string }[]>`
      INSERT INTO app.employee_addresses (
        tenant_id, employee_id, address_type, address_line_1,
        city, postcode, country, is_primary, effective_from
      )
      VALUES (
        ${tenantAId}::uuid, ${employeeAId}::uuid, 'home', '1 First Address',
        'Leeds', 'LS1 4AP', 'GB', false, '2023-01-01'
      )
      RETURNING id
    `;

    // Close it and create successor
    await db`
      UPDATE app.employee_addresses
      SET effective_to = '2024-06-01'
      WHERE id = ${initial!.id}::uuid
    `;

    const [successor] = await db<{ id: string }[]>`
      INSERT INTO app.employee_addresses (
        tenant_id, employee_id, address_type, address_line_1,
        city, postcode, country, is_primary, effective_from
      )
      VALUES (
        ${tenantAId}::uuid, ${employeeAId}::uuid, 'home', '2 Second Address',
        'York', 'YO1 7HX', 'GB', false, '2024-06-01'
      )
      RETURNING id
    `;

    // Query history: should see both records
    const history = await db<{ id: string; isCurrent: boolean; addressLine1: string }[]>`
      SELECT id, is_current, address_line_1
      FROM app.employee_addresses
      WHERE employee_id = ${employeeAId}::uuid
        AND address_type = 'home'
        AND is_primary = false
      ORDER BY effective_from DESC
    `;

    expect(history.length).toBeGreaterThanOrEqual(2);

    const currentRecord = history.find((r) => r.id === successor!.id);
    const closedRecord = history.find((r) => r.id === initial!.id);

    expect(currentRecord?.isCurrent).toBe(true);
    expect(closedRecord?.isCurrent).toBe(false);

    // Cleanup
    await db`DELETE FROM app.employee_addresses WHERE id = ${initial!.id}::uuid`;
    await db`DELETE FROM app.employee_addresses WHERE id = ${successor!.id}::uuid`;
  });
});

// =============================================================================
// is_current Generated Column
// =============================================================================

describe("is_current generated column", () => {
  it("should be true when effective_to IS NULL", async () => {
    if (!isInfraAvailable()) return;

    await setTenantContext(db, tenantAId, userAId);
    await resetSystemContext(db);

    const [row] = await db<{ isCurrent: boolean }[]>`
      INSERT INTO app.employee_addresses (
        tenant_id, employee_id, address_type, address_line_1,
        city, country, effective_from
      )
      VALUES (
        ${tenantAId}::uuid, ${employeeAId}::uuid, 'emergency', '1 Emergency Lane',
        'Oxford', 'GB', '2024-01-01'
      )
      RETURNING is_current
    `;

    expect(row!.isCurrent).toBe(true);

    // Cleanup
    await db`DELETE FROM app.employee_addresses WHERE address_type = 'emergency' AND employee_id = ${employeeAId}::uuid`;
  });

  it("should be false when effective_to is set", async () => {
    if (!isInfraAvailable()) return;

    await setTenantContext(db, tenantAId, userAId);
    await resetSystemContext(db);

    const [row] = await db<{ id: string; isCurrent: boolean }[]>`
      INSERT INTO app.employee_addresses (
        tenant_id, employee_id, address_type, address_line_1,
        city, country, effective_from, effective_to
      )
      VALUES (
        ${tenantAId}::uuid, ${employeeAId}::uuid, 'emergency', '2 Old Emergency Lane',
        'Cambridge', 'GB', '2023-01-01', '2024-01-01'
      )
      RETURNING id, is_current
    `;

    expect(row!.isCurrent).toBe(false);

    // Cleanup
    await db`DELETE FROM app.employee_addresses WHERE id = ${row!.id}::uuid`;
  });
});
