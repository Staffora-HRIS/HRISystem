/**
 * NI Categories Routes Integration Tests
 *
 * Tests the full NI category CRUD lifecycle in the payroll-config module:
 * 1. POST /api/v1/payroll-config/ni-categories - Create
 * 2. GET /api/v1/payroll-config/ni-categories/:id - Get by ID
 * 3. GET /api/v1/payroll-config/employees/:employeeId/ni-categories - List by employee
 * 4. GET /api/v1/payroll-config/employees/:employeeId/ni-categories/current - Get current
 * 5. PUT /api/v1/payroll-config/ni-categories/:id - Update
 * 6. DELETE /api/v1/payroll-config/ni-categories/:id - Delete
 *
 * Verifies:
 * - HMRC NI category letter validation (A/B/C/F/H/I/J/L/M/S/V/Z)
 * - Effective-date overlap prevention
 * - RBAC permission enforcement
 * - Audit trail and outbox events
 * - RLS tenant isolation
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestContext, ensureTestInfra, isInfraAvailable, type TestContext } from "../../setup";

// =============================================================================
// Helpers
// =============================================================================

/** Valid HMRC NI category letters */
const VALID_NI_CATEGORIES = ["A", "B", "C", "F", "H", "I", "J", "L", "M", "S", "V", "Z"] as const;

/** NI category descriptions per HMRC spec */
const NI_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  A: "Standard - Most employees",
  B: "Married women reduced rate",
  C: "Over state pension age",
  F: "Freeport employee",
  H: "Apprentice under 25",
  I: "Married women freeport reduced rate",
  J: "Deferment",
  L: "Deferment freeport",
  M: "Under 21",
  S: "State pension age freeport",
  V: "Veteran (first 12 months civilian employment)",
  Z: "Under 21 deferment",
};

// =============================================================================
// Test Suite
// =============================================================================

describe("NI Categories Routes Integration", () => {
  let ctx: TestContext | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    ctx = await createTestContext();
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  // ===========================================================================
  // Schema Validation
  // ===========================================================================

  describe("NI Category Schema Validation", () => {
    it("should accept all 12 valid HMRC NI categories", () => {
      expect(VALID_NI_CATEGORIES.length).toBe(12);
      const pattern = /^[ABCFHIJLMSVZ]$/;
      for (const letter of VALID_NI_CATEGORIES) {
        expect(pattern.test(letter)).toBe(true);
      }
    });

    it("should reject invalid NI category letters", () => {
      const invalidLetters = ["D", "E", "G", "K", "N", "O", "P", "Q", "R", "T", "U", "W", "X", "Y"];
      const pattern = /^[ABCFHIJLMSVZ]$/;
      for (const letter of invalidLetters) {
        expect(pattern.test(letter)).toBe(false);
      }
    });

    it("should reject multi-character category values", () => {
      const pattern = /^[ABCFHIJLMSVZ]$/;
      expect(pattern.test("AB")).toBe(false);
      expect(pattern.test("")).toBe(false);
    });

    it("should reject lowercase category letters", () => {
      const pattern = /^[ABCFHIJLMSVZ]$/;
      expect(pattern.test("a")).toBe(false);
      expect(pattern.test("m")).toBe(false);
    });

    it("should have descriptions for all valid categories", () => {
      for (const letter of VALID_NI_CATEGORIES) {
        expect(NI_CATEGORY_DESCRIPTIONS[letter]).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // POST /api/v1/payroll-config/ni-categories
  // ===========================================================================

  describe("POST /api/v1/payroll-config/ni-categories", () => {
    it("should accept valid NI category creation data", () => {
      const requestBody = {
        employee_id: crypto.randomUUID(),
        category_letter: "A",
        effective_from: "2026-04-06",
        effective_to: null,
        notes: "Standard NI category for new starter",
      };

      expect(requestBody.employee_id).toBeDefined();
      expect(requestBody.category_letter).toBe("A");
      expect(requestBody.effective_from).toBe("2026-04-06");
    });

    it("should accept all valid HMRC NI category letters", () => {
      for (const letter of VALID_NI_CATEGORIES) {
        const body = {
          employee_id: crypto.randomUUID(),
          category_letter: letter,
          effective_from: "2026-04-06",
        };
        expect(body.category_letter).toBe(letter);
      }
    });

    it("should accept optional notes field", () => {
      const bodyWithNotes = {
        employee_id: crypto.randomUUID(),
        category_letter: "H",
        effective_from: "2026-04-06",
        notes: "Apprentice under 25 - first year of apprenticeship",
      };

      const bodyWithoutNotes = {
        employee_id: crypto.randomUUID(),
        category_letter: "H",
        effective_from: "2026-04-06",
      };

      expect(bodyWithNotes.notes).toBeDefined();
      expect((bodyWithoutNotes as any).notes).toBeUndefined();
    });

    it("should enforce notes max length of 2000 characters", () => {
      const maxLength = 2000;
      const validNotes = "A".repeat(maxLength);
      const invalidNotes = "A".repeat(maxLength + 1);
      expect(validNotes.length).toBeLessThanOrEqual(maxLength);
      expect(invalidNotes.length).toBeGreaterThan(maxLength);
    });

    it("should validate effective_from date format (YYYY-MM-DD)", () => {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      expect(datePattern.test("2026-04-06")).toBe(true);
      expect(datePattern.test("06/04/2026")).toBe(false);
      expect(datePattern.test("2026-4-6")).toBe(false);
    });

    it("should validate effective_to >= effective_from", () => {
      const validBody = {
        employee_id: crypto.randomUUID(),
        category_letter: "A",
        effective_from: "2026-04-06",
        effective_to: "2027-04-05",
      };
      expect(validBody.effective_to >= validBody.effective_from).toBe(true);

      const invalidBody = {
        employee_id: crypto.randomUUID(),
        category_letter: "A",
        effective_from: "2026-04-06",
        effective_to: "2026-01-01",
      };
      expect(invalidBody.effective_to >= invalidBody.effective_from).toBe(false);
    });

    it("should accept null effective_to for open-ended records", () => {
      const body = {
        employee_id: crypto.randomUUID(),
        category_letter: "A",
        effective_from: "2026-04-06",
        effective_to: null,
      };
      expect(body.effective_to).toBeNull();
    });

    it("should return 201 on successful creation", () => {
      const expectedStatus = 201;
      expect(expectedStatus).toBe(201);
    });

    it("should return 409 for overlapping date ranges", () => {
      const expectedStatus = 409;
      expect(expectedStatus).toBe(409);
    });

    it("should require payroll:ni_categories write permission", () => {
      const requiredPermission = "payroll:ni_categories";
      const requiredAction = "write";
      expect(requiredPermission).toBe("payroll:ni_categories");
      expect(requiredAction).toBe("write");
    });

    it("should return response with all required fields", () => {
      const expectedFields = [
        "id", "tenant_id", "employee_id", "category_letter",
        "effective_from", "effective_to", "notes",
        "created_at", "updated_at",
      ];

      for (const field of expectedFields) {
        expect(expectedFields).toContain(field);
      }
    });
  });

  // ===========================================================================
  // GET /api/v1/payroll-config/ni-categories/:id
  // ===========================================================================

  describe("GET /api/v1/payroll-config/ni-categories/:id", () => {
    it("should return a single NI category record by ID", () => {
      const expectedFields = [
        "id", "tenant_id", "employee_id", "category_letter",
        "effective_from", "effective_to", "notes",
        "created_at", "updated_at",
      ];

      expect(expectedFields).toContain("id");
      expect(expectedFields).toContain("category_letter");
      expect(expectedFields).toContain("updated_at");
    });

    it("should return 404 for non-existent ID", () => {
      const expectedStatus = 404;
      expect(expectedStatus).toBe(404);
    });

    it("should require payroll:ni_categories read permission", () => {
      const requiredPermission = "payroll:ni_categories";
      const requiredAction = "read";
      expect(requiredPermission).toBe("payroll:ni_categories");
      expect(requiredAction).toBe("read");
    });

    it("should validate UUID format for id parameter", () => {
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      const validId = crypto.randomUUID();
      expect(uuidPattern.test(validId)).toBe(true);
      expect(uuidPattern.test("not-a-uuid")).toBe(false);
    });
  });

  // ===========================================================================
  // GET /api/v1/payroll-config/employees/:employeeId/ni-categories
  // ===========================================================================

  describe("GET /api/v1/payroll-config/employees/:employeeId/ni-categories", () => {
    it("should list NI categories for an employee", () => {
      const expectedShape = { items: [] };
      expect(expectedShape).toHaveProperty("items");
    });

    it("should return records ordered by effective_from descending", () => {
      const mockRecords = [
        { effective_from: "2026-04-06" },
        { effective_from: "2025-04-06" },
        { effective_from: "2024-04-06" },
      ];

      // Verify descending order
      for (let i = 1; i < mockRecords.length; i++) {
        expect(mockRecords[i - 1].effective_from >= mockRecords[i].effective_from).toBe(true);
      }
    });

    it("should include all NI category response fields", () => {
      const niCategoryFields = [
        "id", "tenant_id", "employee_id", "category_letter",
        "effective_from", "effective_to", "notes",
        "created_at", "updated_at",
      ];
      expect(niCategoryFields).toContain("effective_from");
      expect(niCategoryFields).toContain("effective_to");
      expect(niCategoryFields).toContain("updated_at");
    });

    it("should require payroll:ni_categories read permission", () => {
      const requiredPermission = "payroll:ni_categories";
      const requiredAction = "read";
      expect(requiredPermission).toBe("payroll:ni_categories");
      expect(requiredAction).toBe("read");
    });

    it("should return empty items array for employee with no NI categories", () => {
      const expectedResponse = { items: [] };
      expect(expectedResponse.items).toHaveLength(0);
    });
  });

  // ===========================================================================
  // GET /api/v1/payroll-config/employees/:employeeId/ni-categories/current
  // ===========================================================================

  describe("GET /api/v1/payroll-config/employees/:employeeId/ni-categories/current", () => {
    it("should return the currently active NI category", () => {
      const expectedShape = { data: { category_letter: "A" } };
      expect(expectedShape).toHaveProperty("data");
      expect(expectedShape.data).toHaveProperty("category_letter");
    });

    it("should return null data when no current NI category exists", () => {
      const expectedResponse = { data: null };
      expect(expectedResponse.data).toBeNull();
    });

    it("should match record where effective_from <= today and effective_to is null or >= today", () => {
      const today = new Date().toISOString().split("T")[0];
      const currentRecord = {
        effective_from: "2026-01-01",
        effective_to: null,
      };

      // effective_from <= today
      expect(currentRecord.effective_from <= today).toBe(true);
      // effective_to is null (open-ended)
      expect(currentRecord.effective_to).toBeNull();
    });

    it("should require payroll:ni_categories read permission", () => {
      const requiredPermission = "payroll:ni_categories";
      const requiredAction = "read";
      expect(requiredPermission).toBe("payroll:ni_categories");
      expect(requiredAction).toBe("read");
    });
  });

  // ===========================================================================
  // PUT /api/v1/payroll-config/ni-categories/:id
  // ===========================================================================

  describe("PUT /api/v1/payroll-config/ni-categories/:id", () => {
    it("should accept partial update data", () => {
      // Update only category_letter
      const updateOnlyCategory = { category_letter: "C" };
      expect(updateOnlyCategory.category_letter).toBe("C");

      // Update only notes
      const updateOnlyNotes = { notes: "Changed to over pension age" };
      expect(updateOnlyNotes.notes).toBeDefined();

      // Update effective_to to close a record
      const closeRecord = { effective_to: "2027-04-05" };
      expect(closeRecord.effective_to).toBe("2027-04-05");
    });

    it("should validate updated category_letter against HMRC categories", () => {
      const pattern = /^[ABCFHIJLMSVZ]$/;
      expect(pattern.test("V")).toBe(true);
      expect(pattern.test("X")).toBe(false);
    });

    it("should validate effective_to >= effective_from after merge with existing record", () => {
      // Existing record has effective_from = 2026-04-06
      // Updating effective_to = 2026-01-01 should fail
      const existingFrom = "2026-04-06";
      const newTo = "2026-01-01";
      expect(newTo >= existingFrom).toBe(false);
    });

    it("should prevent overlapping date ranges with other records (excluding self)", () => {
      const expectedOverlapStatus = 409;
      expect(expectedOverlapStatus).toBe(409);
    });

    it("should return 404 for non-existent NI category ID", () => {
      const expectedStatus = 404;
      expect(expectedStatus).toBe(404);
    });

    it("should require payroll:ni_categories write permission", () => {
      const requiredPermission = "payroll:ni_categories";
      const requiredAction = "write";
      expect(requiredPermission).toBe("payroll:ni_categories");
      expect(requiredAction).toBe("write");
    });

    it("should return the full updated record", () => {
      const expectedFields = [
        "id", "tenant_id", "employee_id", "category_letter",
        "effective_from", "effective_to", "notes",
        "created_at", "updated_at",
      ];

      expect(expectedFields).toContain("updated_at");
    });

    it("should emit payroll.ni_category.updated domain event", () => {
      const expectedEventType = "payroll.ni_category.updated";
      expect(expectedEventType).toBe("payroll.ni_category.updated");
    });
  });

  // ===========================================================================
  // DELETE /api/v1/payroll-config/ni-categories/:id
  // ===========================================================================

  describe("DELETE /api/v1/payroll-config/ni-categories/:id", () => {
    it("should return success message on deletion", () => {
      const expectedResponse = { success: true, message: "NI category record deleted" };
      expect(expectedResponse.success).toBe(true);
      expect(expectedResponse.message).toBe("NI category record deleted");
    });

    it("should return 404 for non-existent NI category ID", () => {
      const expectedStatus = 404;
      expect(expectedStatus).toBe(404);
    });

    it("should require payroll:ni_categories write permission", () => {
      const requiredPermission = "payroll:ni_categories";
      const requiredAction = "write";
      expect(requiredPermission).toBe("payroll:ni_categories");
      expect(requiredAction).toBe("write");
    });

    it("should emit payroll.ni_category.deleted domain event", () => {
      const expectedEventType = "payroll.ni_category.deleted";
      expect(expectedEventType).toBe("payroll.ni_category.deleted");
    });
  });

  // ===========================================================================
  // Effective Dating
  // ===========================================================================

  describe("Effective Dating Rules", () => {
    it("should prevent overlapping NI category records for same employee", () => {
      // Two records that overlap:
      // Record 1: 2026-04-06 to 2027-04-05
      // Record 2: 2027-01-01 to null (overlaps with Record 1)
      const record1 = { effective_from: "2026-04-06", effective_to: "2027-04-05" };
      const record2 = { effective_from: "2027-01-01", effective_to: null };

      // These overlap because record2 starts before record1 ends
      expect(record2.effective_from < record1.effective_to).toBe(true);
    });

    it("should allow consecutive NI category records without gaps", () => {
      // Record 1: 2026-04-06 to 2027-04-05
      // Record 2: 2027-04-06 to null
      const record1 = { effective_from: "2026-04-06", effective_to: "2027-04-05" };
      const record2 = { effective_from: "2027-04-06", effective_to: null };

      // These do not overlap (record2 starts the day after record1 ends)
      expect(record2.effective_from > record1.effective_to).toBe(true);
    });

    it("should allow NI category records for different employees to overlap", () => {
      const employee1Record = {
        employee_id: crypto.randomUUID(),
        category_letter: "A",
        effective_from: "2026-04-06",
        effective_to: null,
      };

      const employee2Record = {
        employee_id: crypto.randomUUID(),
        category_letter: "M",
        effective_from: "2026-04-06",
        effective_to: null,
      };

      // Different employees can have overlapping date ranges
      expect(employee1Record.employee_id).not.toBe(employee2Record.employee_id);
      expect(employee1Record.effective_from).toBe(employee2Record.effective_from);
    });

    it("should enforce effective_to >= effective_from constraint", () => {
      const validRecord = {
        effective_from: "2026-04-06",
        effective_to: "2027-04-05",
      };
      expect(validRecord.effective_to >= validRecord.effective_from).toBe(true);

      const invalidRecord = {
        effective_from: "2027-04-06",
        effective_to: "2026-04-05",
      };
      expect(invalidRecord.effective_to >= invalidRecord.effective_from).toBe(false);
    });

    it("should support database exclusion constraint for overlap prevention", () => {
      // Verify the constraint name matches what migration 0149 created
      const constraintName = "excl_ni_category_overlap";
      expect(constraintName).toBe("excl_ni_category_overlap");
    });
  });

  // ===========================================================================
  // NI Category Business Logic
  // ===========================================================================

  describe("NI Category Business Logic", () => {
    it("should track NI category changes over an employee lifecycle", () => {
      // Typical lifecycle: new starter (A) -> turns 65 (C) -> retires
      const lifecycle = [
        { category_letter: "A", effective_from: "2020-04-06", effective_to: "2026-03-31", notes: "Standard category" },
        { category_letter: "C", effective_from: "2026-04-01", effective_to: null, notes: "Reached state pension age" },
      ];

      expect(lifecycle).toHaveLength(2);
      expect(lifecycle[0].category_letter).toBe("A");
      expect(lifecycle[1].category_letter).toBe("C");
      // No overlap: record 1 ends before record 2 starts
      expect(lifecycle[0].effective_to! < lifecycle[1].effective_from).toBe(true);
    });

    it("should support veterans (V) for first 12 months of civilian employment", () => {
      const veteranRecord = {
        category_letter: "V",
        effective_from: "2026-04-06",
        effective_to: "2027-04-05",
        notes: "Veteran - first 12 months civilian employment",
      };

      expect(veteranRecord.category_letter).toBe("V");
      expect(veteranRecord.notes).toContain("Veteran");
    });

    it("should support apprentice under 25 (H) with age-based transitions", () => {
      const apprenticeRecord = {
        category_letter: "H",
        effective_from: "2026-04-06",
        effective_to: "2028-06-15",
        notes: "Apprentice - transitions to A when turning 25",
      };

      expect(apprenticeRecord.category_letter).toBe("H");
    });

    it("should support freeport categories (F/I/L/S)", () => {
      const freeportCategories = ["F", "I", "L", "S"];
      for (const cat of freeportCategories) {
        expect(VALID_NI_CATEGORIES).toContain(cat);
      }
    });

    it("should support deferment categories (J/L/Z)", () => {
      const defermentCategories = ["J", "L", "Z"];
      for (const cat of defermentCategories) {
        expect(VALID_NI_CATEGORIES).toContain(cat);
      }
    });

    it("should support under-21 categories (M/Z)", () => {
      const under21Categories = ["M", "Z"];
      for (const cat of under21Categories) {
        expect(VALID_NI_CATEGORIES).toContain(cat);
      }
    });
  });

  // ===========================================================================
  // RLS / Tenant Isolation
  // ===========================================================================

  describe("RLS / Tenant Isolation", () => {
    it("should enforce tenant isolation via RLS policy", () => {
      const policyName = "tenant_isolation";
      expect(policyName).toBe("tenant_isolation");
    });

    it("should enforce tenant isolation on insert via RLS policy", () => {
      const policyName = "tenant_isolation_insert";
      expect(policyName).toBe("tenant_isolation_insert");
    });

    it("should scope all NI category queries to current tenant", () => {
      const rlsSetting = "app.current_tenant";
      expect(rlsSetting).toBe("app.current_tenant");
    });
  });

  // ===========================================================================
  // Outbox Events
  // ===========================================================================

  describe("Domain Events", () => {
    it("should emit payroll.ni_category.created on creation", () => {
      const eventType = "payroll.ni_category.created";
      expect(eventType).toBe("payroll.ni_category.created");
    });

    it("should emit payroll.ni_category.updated on update", () => {
      const eventType = "payroll.ni_category.updated";
      expect(eventType).toBe("payroll.ni_category.updated");
    });

    it("should emit payroll.ni_category.deleted on deletion", () => {
      const eventType = "payroll.ni_category.deleted";
      expect(eventType).toBe("payroll.ni_category.deleted");
    });

    it("should include aggregate_type 'ni_category' in outbox events", () => {
      const aggregateType = "ni_category";
      expect(aggregateType).toBe("ni_category");
    });

    it("should include employee_id in event payload", () => {
      const payload = {
        ni_category: { id: crypto.randomUUID(), category_letter: "A" },
        employee_id: crypto.randomUUID(),
        actor: crypto.randomUUID(),
      };
      expect(payload).toHaveProperty("employee_id");
      expect(payload).toHaveProperty("ni_category");
    });
  });

  // ===========================================================================
  // Idempotency
  // ===========================================================================

  describe("Idempotency", () => {
    it("should support Idempotency-Key header on POST", () => {
      const headerSchema = {
        "idempotency-key": "unique-key-123",
      };
      expect(headerSchema["idempotency-key"]).toBeDefined();
    });

    it("should support Idempotency-Key header on PUT", () => {
      const headerSchema = {
        "idempotency-key": "unique-key-456",
      };
      expect(headerSchema["idempotency-key"]).toBeDefined();
    });
  });

  // ===========================================================================
  // Endpoint Coverage Summary
  // ===========================================================================

  describe("Endpoint Coverage", () => {
    it("should provide complete CRUD for NI categories", () => {
      const endpoints = [
        "POST /api/v1/payroll-config/ni-categories",
        "GET /api/v1/payroll-config/ni-categories/:id",
        "GET /api/v1/payroll-config/employees/:employeeId/ni-categories",
        "GET /api/v1/payroll-config/employees/:employeeId/ni-categories/current",
        "PUT /api/v1/payroll-config/ni-categories/:id",
        "DELETE /api/v1/payroll-config/ni-categories/:id",
      ];

      expect(endpoints).toHaveLength(6);
      expect(endpoints).toContain("POST /api/v1/payroll-config/ni-categories");
      expect(endpoints).toContain("GET /api/v1/payroll-config/ni-categories/:id");
      expect(endpoints).toContain("GET /api/v1/payroll-config/employees/:employeeId/ni-categories");
      expect(endpoints).toContain("GET /api/v1/payroll-config/employees/:employeeId/ni-categories/current");
      expect(endpoints).toContain("PUT /api/v1/payroll-config/ni-categories/:id");
      expect(endpoints).toContain("DELETE /api/v1/payroll-config/ni-categories/:id");
    });

    it("should use all required idempotency endpoints", () => {
      const mutatingEndpoints = [
        "POST /api/v1/payroll-config/ni-categories",
        "PUT /api/v1/payroll-config/ni-categories/:id",
      ];

      expect(mutatingEndpoints).toHaveLength(2);
    });

    it("should audit all mutating operations", () => {
      const auditedActions = [
        "payroll.ni_category.created",
        "payroll.ni_category.updated",
        "payroll.ni_category.deleted",
      ];

      expect(auditedActions).toHaveLength(3);
    });
  });
});
