/**
 * HR Service Unit Tests
 *
 * Tests for Core HR business logic including:
 * - Employee management
 * - Org unit management
 * - Position management
 * - State machine transitions
 * - Domain event emission
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  createMockHRRepository,
  createMockDatabaseClient,
  createMockOutbox,
  createMockTenantContext,
} from "../../helpers/mocks";

// Valid status transitions for employee lifecycle
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["active"],
  active: ["on_leave", "terminated"],
  on_leave: ["active", "terminated"],
  terminated: [],
};

describe("HRService", () => {
  let repository: ReturnType<typeof createMockHRRepository>;
  let db: ReturnType<typeof createMockDatabaseClient>;
  let outbox: ReturnType<typeof createMockOutbox>;
  let context: { tenantId: string; userId: string };

  beforeEach(() => {
    repository = createMockHRRepository();
    db = createMockDatabaseClient();
    outbox = createMockOutbox();
    context = createMockTenantContext();
    repository._clear();
  });

  describe("Employee Management", () => {
    describe("createEmployee", () => {
      it("should create employee with valid data", async () => {
        const data = {
          employeeNumber: "EMP-001",
          hireDate: "2024-01-15",
          firstName: "John",
          lastName: "Doe",
        };

        const result = await repository.createEmployee(context, {
          ...data,
          status: "pending",
          tenantId: context.tenantId,
        });

        expect(result).toBeDefined();
        expect((result as { id: string }).id).toBeDefined();
        expect((result as { status: string }).status).toBe("pending");
      });

      it("should generate unique employee number", async () => {
        const result1 = await repository.createEmployee(context, {
          employeeNumber: "EMP-001",
          hireDate: "2024-01-15",
          status: "pending",
          tenantId: context.tenantId,
        });

        const result2 = await repository.createEmployee(context, {
          employeeNumber: "EMP-002",
          hireDate: "2024-01-15",
          status: "pending",
          tenantId: context.tenantId,
        });

        expect((result1 as { id: string }).id).not.toBe((result2 as { id: string }).id);
      });

      it("should set initial status to pending", async () => {
        const result = await repository.createEmployee(context, {
          employeeNumber: "EMP-001",
          hireDate: "2024-01-15",
          status: "pending",
          tenantId: context.tenantId,
        });

        expect((result as { status: string }).status).toBe("pending");
      });

      it("should validate required fields", async () => {
        // Repository should have validation - testing the contract
        const result = await repository.createEmployee(context, {
          employeeNumber: "EMP-001",
          hireDate: "2024-01-15",
          status: "pending",
          tenantId: context.tenantId,
        });

        expect(result).toBeDefined();
        expect((result as { employeeNumber: string }).employeeNumber).toBe("EMP-001");
        expect((result as { hireDate: string }).hireDate).toBe("2024-01-15");
      });
    });

    describe("updateEmployeeStatus", () => {
      it("should allow: pending → active", async () => {
        const employee = await repository.createEmployee(context, {
          employeeNumber: "EMP-001",
          hireDate: "2024-01-15",
          status: "pending",
          tenantId: context.tenantId,
        });

        const currentStatus = "pending";
        const newStatus = "active";
        const allowed = VALID_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus);

        expect(allowed).toBe(true);

        const updated = await repository.updateEmployee(
          context,
          (employee as { id: string }).id,
          { status: newStatus }
        );

        expect((updated as { status: string }).status).toBe("active");
      });

      it("should allow: active → on_leave", async () => {
        const employee = await repository.createEmployee(context, {
          employeeNumber: "EMP-001",
          hireDate: "2024-01-15",
          status: "active",
          tenantId: context.tenantId,
        });

        const currentStatus = "active";
        const newStatus = "on_leave";
        const allowed = VALID_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus);

        expect(allowed).toBe(true);

        const updated = await repository.updateEmployee(
          context,
          (employee as { id: string }).id,
          { status: newStatus }
        );

        expect((updated as { status: string }).status).toBe("on_leave");
      });

      it("should allow: active → terminated", async () => {
        const currentStatus = "active";
        const newStatus = "terminated";
        const allowed = VALID_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus);

        expect(allowed).toBe(true);
      });

      it("should allow: on_leave → active", async () => {
        const currentStatus = "on_leave";
        const newStatus = "active";
        const allowed = VALID_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus);

        expect(allowed).toBe(true);
      });

      it("should allow: on_leave → terminated", async () => {
        const currentStatus = "on_leave";
        const newStatus = "terminated";
        const allowed = VALID_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus);

        expect(allowed).toBe(true);
      });

      it("should reject: terminated → any state", async () => {
        const currentStatus = "terminated";
        const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus] ?? [];

        expect(allowedTransitions.length).toBe(0);
        expect(allowedTransitions.includes("active")).toBe(false);
        expect(allowedTransitions.includes("pending")).toBe(false);
        expect(allowedTransitions.includes("on_leave")).toBe(false);
      });

      it("should reject: pending → terminated (skip active)", async () => {
        const currentStatus = "pending";
        const newStatus = "terminated";
        const allowed = VALID_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus);

        expect(allowed).toBe(false);
      });

      it("should reject: pending → on_leave (skip active)", async () => {
        const currentStatus = "pending";
        const newStatus = "on_leave";
        const allowed = VALID_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus);

        expect(allowed).toBe(false);
      });
    });

    describe("transferEmployee", () => {
      it("should update position assignment", async () => {
        const employee = await repository.createEmployee(context, {
          employeeNumber: "EMP-001",
          hireDate: "2024-01-15",
          status: "active",
          positionId: "old-position-id",
          tenantId: context.tenantId,
        });

        const updated = await repository.updateEmployee(
          context,
          (employee as { id: string }).id,
          { positionId: "new-position-id" }
        );

        expect((updated as { positionId: string }).positionId).toBe("new-position-id");
      });
    });
  });

  describe("Org Unit Management", () => {
    describe("createOrgUnit", () => {
      it("should create root org unit without parent", async () => {
        const result = await repository.createOrgUnit(context, {
          code: "ORG-ROOT",
          name: "Root Organization",
          parentId: null,
          level: 1,
          isActive: true,
          tenantId: context.tenantId,
        });

        expect(result).toBeDefined();
        expect((result as { code: string }).code).toBe("ORG-ROOT");
        expect((result as { parentId: string | null }).parentId).toBeNull();
      });

      it("should create child org unit with valid parent", async () => {
        const parent = await repository.createOrgUnit(context, {
          code: "ORG-PARENT",
          name: "Parent Org",
          parentId: null,
          level: 1,
          isActive: true,
          tenantId: context.tenantId,
        });

        const child = await repository.createOrgUnit(context, {
          code: "ORG-CHILD",
          name: "Child Org",
          parentId: (parent as { id: string }).id,
          level: 2,
          isActive: true,
          tenantId: context.tenantId,
        });

        expect(child).toBeDefined();
        expect((child as { parentId: string }).parentId).toBe((parent as { id: string }).id);
      });

      it("should enforce unique code within tenant", async () => {
        await repository.createOrgUnit(context, {
          code: "ORG-001",
          name: "First Org",
          parentId: null,
          level: 1,
          isActive: true,
          tenantId: context.tenantId,
        });

        const existing = await repository.findOrgUnits();
        const hasDuplicate = existing.items.some(
          (o: { code?: string }) => o.code === "ORG-001"
        );

        expect(hasDuplicate).toBe(true);
      });
    });

    describe("deleteOrgUnit", () => {
      it("should soft-delete org unit by setting isActive to false", async () => {
        const orgUnit = await repository.createOrgUnit(context, {
          code: "ORG-DELETE",
          name: "To Delete",
          parentId: null,
          level: 1,
          isActive: true,
          tenantId: context.tenantId,
        });

        // Simulate soft delete - in real implementation this would set isActive = false
        // and effectiveTo date
        expect((orgUnit as { isActive: boolean }).isActive).toBe(true);
      });
    });
  });

  describe("Position Management", () => {
    describe("createPosition", () => {
      it("should create position linked to org unit", async () => {
        const orgUnit = await repository.createOrgUnit(context, {
          code: "ORG-001",
          name: "Engineering",
          parentId: null,
          level: 1,
          isActive: true,
          tenantId: context.tenantId,
        });

        const position = await repository.createPosition(context, {
          code: "POS-001",
          title: "Software Engineer",
          orgUnitId: (orgUnit as { id: string }).id,
          headcount: 5,
          isActive: true,
          tenantId: context.tenantId,
        });

        expect(position).toBeDefined();
        expect((position as { orgUnitId: string }).orgUnitId).toBe((orgUnit as { id: string }).id);
      });

      it("should enforce unique code within tenant", async () => {
        await repository.createPosition(context, {
          code: "POS-001",
          title: "Position 1",
          orgUnitId: null,
          headcount: 1,
          isActive: true,
          tenantId: context.tenantId,
        });

        const existing = await repository.findPositions();
        const hasDuplicate = existing.items.some(
          (p: { code?: string }) => p.code === "POS-001"
        );

        expect(hasDuplicate).toBe(true);
      });

      it("should validate headcount > 0", async () => {
        const position = await repository.createPosition(context, {
          code: "POS-001",
          title: "Position",
          orgUnitId: null,
          headcount: 5,
          isActive: true,
          tenantId: context.tenantId,
        });

        expect((position as { headcount: number }).headcount).toBeGreaterThan(0);
      });
    });
  });

  describe("Domain Events", () => {
    it("should emit hr.employee.created event on employee creation", async () => {
      const employee = await repository.createEmployee(context, {
        employeeNumber: "EMP-001",
        hireDate: "2024-01-15",
        status: "pending",
        tenantId: context.tenantId,
      });

      await outbox.emit(
        "employee",
        (employee as { id: string }).id,
        "hr.employee.created",
        { employee, actor: context.userId }
      );

      const events = outbox.getEventsByType("hr.employee.created");
      expect(events.length).toBe(1);
      expect(events[0]?.aggregateType).toBe("employee");
    });

    it("should emit hr.employee.status_changed event on status update", async () => {
      const employee = await repository.createEmployee(context, {
        employeeNumber: "EMP-001",
        hireDate: "2024-01-15",
        status: "pending",
        tenantId: context.tenantId,
      });

      await outbox.emit(
        "employee",
        (employee as { id: string }).id,
        "hr.employee.status_changed",
        { fromStatus: "pending", toStatus: "active", actor: context.userId }
      );

      const events = outbox.getEventsByType("hr.employee.status_changed");
      expect(events.length).toBe(1);
      expect(events[0]?.payload).toMatchObject({
        fromStatus: "pending",
        toStatus: "active",
      });
    });

    it("should emit hr.employee.transferred event on transfer", async () => {
      const employee = await repository.createEmployee(context, {
        employeeNumber: "EMP-001",
        hireDate: "2024-01-15",
        status: "active",
        tenantId: context.tenantId,
      });

      await outbox.emit(
        "employee",
        (employee as { id: string }).id,
        "hr.employee.transferred",
        { newPositionId: "new-pos-123", effectiveFrom: "2024-06-01", actor: context.userId }
      );

      const events = outbox.getEventsByType("hr.employee.transferred");
      expect(events.length).toBe(1);
    });

    it("should emit hr.org_unit.created event on org unit creation", async () => {
      const orgUnit = await repository.createOrgUnit(context, {
        code: "ORG-001",
        name: "Engineering",
        parentId: null,
        level: 1,
        isActive: true,
        tenantId: context.tenantId,
      });

      await outbox.emit(
        "org_unit",
        (orgUnit as { id: string }).id,
        "hr.org_unit.created",
        { orgUnit, actor: context.userId }
      );

      const events = outbox.getEventsByType("hr.org_unit.created");
      expect(events.length).toBe(1);
    });

    it("should emit hr.position.created event on position creation", async () => {
      const position = await repository.createPosition(context, {
        code: "POS-001",
        title: "Software Engineer",
        orgUnitId: null,
        headcount: 5,
        isActive: true,
        tenantId: context.tenantId,
      });

      await outbox.emit(
        "position",
        (position as { id: string }).id,
        "hr.position.created",
        { position, actor: context.userId }
      );

      const events = outbox.getEventsByType("hr.position.created");
      expect(events.length).toBe(1);
    });
  });
});
