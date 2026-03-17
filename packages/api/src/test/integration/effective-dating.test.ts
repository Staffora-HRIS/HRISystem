/**
 * Effective Dating Integration Tests
 *
 * Verifies that effective dating validation works correctly,
 * including overlap detection and concurrency handling.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import {
  getTestDb,
  ensureTestInfra,
  isInfraAvailable,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  cleanupTestTenant,
  cleanupTestUser,
  type TestTenant,
  type TestUser,
} from "../setup";
import {
  validateNoOverlap,
  rangesOverlap,
  type DateRange,
  type EffectiveDatedRecord,
} from "@staffora/shared";

describe("Effective Dating", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;
  let employeeId: string;
  let orgUnitId: string;
  let positionId: string;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    tenant = await createTestTenant(db);
    user = await createTestUser(db, tenant.id);

    // Create test employee with supporting data
    await setTenantContext(db, tenant.id, user.id);

    const ouResult = await db<{ id: string }[]>`
      INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
      VALUES (${tenant.id}::uuid, 'ED-TEST', 'Effective Dating Test Org', true, CURRENT_DATE)
      RETURNING id
    `;
    orgUnitId = ouResult[0]!.id;

    const posResult = await db<{ id: string }[]>`
      INSERT INTO app.positions (tenant_id, org_unit_id, code, title, is_active, headcount)
      VALUES (${tenant.id}::uuid, ${orgUnitId}::uuid, 'ED-POS', 'Test Position', true, 10)
      RETURNING id
    `;
    positionId = posResult[0]!.id;

    const empResult = await db<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
      VALUES (${tenant.id}::uuid, 'ED-EMP-001', 'active', '2023-01-01')
      RETURNING id
    `;
    employeeId = empResult[0]!.id;
  });

  afterAll(async () => {
    if (!db || !tenant || !user) return;
    await cleanupTestTenant(db, tenant.id);
    await cleanupTestUser(db, user.id);
    await closeTestConnections(db);
  });

  beforeEach(async () => {
    if (!db || !tenant || !user) return;
    await setTenantContext(db, tenant.id, user.id);
  });

  afterEach(async () => {
    if (!db) return;
    await clearTenantContext(db);
  });

  describe("rangesOverlap utility", () => {
    it("should detect overlapping ranges", () => {
      const rangeA: DateRange = { effectiveFrom: "2024-01-01", effectiveTo: "2024-06-30" };
      const rangeB: DateRange = { effectiveFrom: "2024-03-01", effectiveTo: "2024-12-31" };

      expect(rangesOverlap(rangeA, rangeB)).toBe(true);
    });

    it("should detect non-overlapping adjacent ranges", () => {
      const rangeA: DateRange = { effectiveFrom: "2024-01-01", effectiveTo: "2024-06-30" };
      const rangeB: DateRange = { effectiveFrom: "2024-07-01", effectiveTo: "2024-12-31" };

      expect(rangesOverlap(rangeA, rangeB)).toBe(false);
    });

    it("should detect overlap with open-ended range", () => {
      const rangeA: DateRange = { effectiveFrom: "2024-01-01", effectiveTo: null };
      const rangeB: DateRange = { effectiveFrom: "2024-06-01", effectiveTo: "2024-12-31" };

      expect(rangesOverlap(rangeA, rangeB)).toBe(true);
    });

    it("should detect overlap when ranges are identical", () => {
      const rangeA: DateRange = { effectiveFrom: "2024-01-01", effectiveTo: "2024-12-31" };
      const rangeB: DateRange = { effectiveFrom: "2024-01-01", effectiveTo: "2024-12-31" };

      expect(rangesOverlap(rangeA, rangeB)).toBe(true);
    });

    it("should detect contained range overlap", () => {
      const outer: DateRange = { effectiveFrom: "2024-01-01", effectiveTo: "2024-12-31" };
      const inner: DateRange = { effectiveFrom: "2024-03-01", effectiveTo: "2024-06-30" };

      expect(rangesOverlap(outer, inner)).toBe(true);
    });
  });

  describe("validateNoOverlap utility", () => {
    const existingRecords: EffectiveDatedRecord[] = [
      { id: "1", effectiveFrom: "2024-01-01", effectiveTo: "2024-06-30" },
      { id: "2", effectiveFrom: "2024-07-01", effectiveTo: null },
    ];

    it("should pass for non-overlapping new range", () => {
      const newRange: DateRange = { effectiveFrom: "2023-01-01", effectiveTo: "2023-12-31" };

      const result = validateNoOverlap("emp-123", "position", newRange, existingRecords);

      expect(result.valid).toBe(true);
      expect(result.overlappingRecords.length).toBe(0);
    });

    it("should fail for overlapping new range", () => {
      const newRange: DateRange = { effectiveFrom: "2024-03-01", effectiveTo: "2024-09-30" };

      const result = validateNoOverlap("emp-123", "position", newRange, existingRecords);

      expect(result.valid).toBe(false);
      expect(result.overlappingRecords.length).toBe(2);
      expect(result.errorMessage).toContain("would overlap");
    });

    it("should allow update of existing record (excludeId)", () => {
      const newRange: DateRange = { effectiveFrom: "2024-01-01", effectiveTo: "2024-06-30" };

      const result = validateNoOverlap(
        "emp-123",
        "position",
        newRange,
        existingRecords,
        "1" // Exclude record being updated
      );

      expect(result.valid).toBe(true);
    });
  });

  describe("Compensation effective dating", () => {
    let compId1: string;

    beforeEach(async () => {
      // Skip if fixtures not available
      if (!db || !tenant || !user) return;
      // Create initial compensation record
      const result = await db<{ id: string }[]>`
        INSERT INTO app.compensation_history (
          tenant_id, employee_id, base_salary, currency, pay_frequency, effective_from, effective_to
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, 50000, 'GBP', 'monthly',
          '2024-01-01', '2024-06-30'
        )
        RETURNING id
      `;
      compId1 = result[0]!.id;
    });

    afterEach(async () => {
      if (!db) return;
      await db`DELETE FROM app.compensation_history WHERE employee_id = ${employeeId}::uuid`;
    });

    it("should allow non-overlapping compensation change", async () => {
      if (!db || !tenant) return;
      // This should succeed - new record starts after existing ends
      const result = await db<{ id: string }[]>`
        INSERT INTO app.compensation_history (
          tenant_id, employee_id, base_salary, currency, pay_frequency, effective_from, effective_to
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, 55000, 'GBP', 'monthly',
          '2024-07-01', NULL
        )
        RETURNING id
      `;

      expect(result.length).toBe(1);
    });

    it("should detect overlapping compensation via application logic", async () => {
      if (!db) return;
      // Fetch existing records
      const existing = await db<EffectiveDatedRecord[]>`
        SELECT id, effective_from as "effectiveFrom", effective_to as "effectiveTo"
        FROM app.compensation_history
        WHERE employee_id = ${employeeId}::uuid
      `;

      // Validate new overlapping range
      const newRange: DateRange = { effectiveFrom: "2024-03-01", effectiveTo: "2024-09-30" };
      const validation = validateNoOverlap(employeeId, "compensation", newRange, existing);

      expect(validation.valid).toBe(false);
      expect(validation.overlappingRecords.length).toBe(1);
    });
  });

  describe("Position assignment effective dating", () => {
    let assignmentId1: string;

    beforeEach(async () => {
      // Skip if fixtures not available
      if (!db || !tenant || !user) return;
      const result = await db<{ id: string }[]>`
        INSERT INTO app.position_assignments (
          tenant_id, employee_id, position_id, org_unit_id, is_primary,
          effective_from, effective_to
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${positionId}::uuid, ${orgUnitId}::uuid, true,
          '2024-01-01', '2024-06-30'
        )
        RETURNING id
      `;
      assignmentId1 = result[0]!.id;
    });

    afterEach(async () => {
      if (!db) return;
      await db`DELETE FROM app.position_assignments WHERE employee_id = ${employeeId}::uuid`;
    });

    it("should allow non-overlapping position transfer", async () => {
      if (!db || !tenant) return;
      const result = await db<{ id: string }[]>`
        INSERT INTO app.position_assignments (
          tenant_id, employee_id, position_id, org_unit_id, is_primary,
          effective_from, effective_to
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${positionId}::uuid, ${orgUnitId}::uuid, true,
          '2024-07-01', NULL
        )
        RETURNING id
      `;

      expect(result.length).toBe(1);
    });

    it("should validate overlapping position assignment", async () => {
      if (!db) return;
      const existing = await db<EffectiveDatedRecord[]>`
        SELECT id, effective_from as "effectiveFrom", effective_to as "effectiveTo"
        FROM app.position_assignments
        WHERE employee_id = ${employeeId}::uuid
      `;

      const newRange: DateRange = { effectiveFrom: "2024-05-01", effectiveTo: "2024-08-31" };
      const validation = validateNoOverlap(employeeId, "position", newRange, existing);

      expect(validation.valid).toBe(false);
    });
  });

  describe("Concurrent overlap validation", () => {
    it("should handle concurrent inserts", async () => {
      // Skip if fixtures not available
      if (!db || !tenant) return;
      // Simulate concurrent validation by checking before insert
      const newRange1: DateRange = { effectiveFrom: "2025-01-01", effectiveTo: "2025-06-30" };
      const newRange2: DateRange = { effectiveFrom: "2025-03-01", effectiveTo: "2025-09-30" };

      // First request validates
      const existing1 = await db<EffectiveDatedRecord[]>`
        SELECT id, effective_from as "effectiveFrom", effective_to as "effectiveTo"
        FROM app.compensation_history
        WHERE employee_id = ${employeeId}::uuid
      `;
      const validation1 = validateNoOverlap(employeeId, "compensation", newRange1, existing1);
      expect(validation1.valid).toBe(true);

      // Insert first record
      await db`
        INSERT INTO app.compensation_history (
          tenant_id, employee_id, base_salary, currency, pay_frequency, effective_from, effective_to
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, 60000, 'GBP', 'monthly',
          '2025-01-01', '2025-06-30'
        )
      `;

      // Second request validates AFTER first insert
      const existing2 = await db<EffectiveDatedRecord[]>`
        SELECT id, effective_from as "effectiveFrom", effective_to as "effectiveTo"
        FROM app.compensation_history
        WHERE employee_id = ${employeeId}::uuid
      `;
      const validation2 = validateNoOverlap(employeeId, "compensation", newRange2, existing2);

      // Should now detect overlap with newly inserted record
      expect(validation2.valid).toBe(false);
    });
  });
});
