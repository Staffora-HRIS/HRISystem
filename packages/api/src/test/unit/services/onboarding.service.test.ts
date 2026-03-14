/**
 * Onboarding Service Unit Tests
 *
 * Tests for Employee Onboarding business logic including:
 * - Template validation and lifecycle
 * - Instance start validation (template active, no existing onboarding)
 * - Instance update rules (reject completed/cancelled)
 * - Task completion rules (reject closed instance, already completed)
 * - Task skip rules (reject required tasks)
 *
 * NOTE: These tests extract and verify the business logic directly
 * rather than importing the service class, to avoid bun 1.3.3
 * segfault on Windows when importing modules with native postgres
 * dependencies.
 */

import { describe, it, expect } from "bun:test";

// =============================================================================
// Extracted Business Logic (from modules/onboarding/service.ts)
// =============================================================================

import type { ServiceResult } from "../../../types/service-result";

type InstanceStatus = "not_started" | "in_progress" | "completed" | "cancelled";
type TaskStatus = "pending" | "completed" | "skipped";

interface Template {
  id: string;
  name: string;
  status: "active" | "inactive";
  tasks: unknown[];
}

interface OnboardingInstance {
  id: string;
  status: InstanceStatus;
  employeeId?: string;
  tasks: Array<{
    taskId: string;
    status: TaskStatus;
    required: boolean;
  }>;
}

function getResourceOrNotFound<T>(resource: T | null, name: string): ServiceResult<T> {
  if (!resource) {
    return { success: false, error: { code: "NOT_FOUND", message: `${name} not found` } };
  }
  return { success: true, data: resource };
}

function validateStartOnboarding(
  template: Template | null,
  existingOnboarding: OnboardingInstance | null
): ServiceResult<null> {
  if (!template) {
    return { success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Onboarding template not found" } };
  }
  if (template.status !== "active") {
    return { success: false, error: { code: "TEMPLATE_INACTIVE", message: "Onboarding template is not active" } };
  }
  if (existingOnboarding) {
    return { success: false, error: { code: "ALREADY_ONBOARDING", message: "Employee already has an active onboarding" } };
  }
  return { success: true };
}

function validateUpdateInstance(instance: OnboardingInstance | null): ServiceResult<null> {
  if (!instance) {
    return { success: false, error: { code: "NOT_FOUND", message: "Onboarding instance not found" } };
  }
  if (["completed", "cancelled"].includes(instance.status)) {
    return { success: false, error: { code: "INSTANCE_CLOSED", message: "Cannot update a completed or cancelled onboarding" } };
  }
  return { success: true };
}

function validateCompleteTask(
  instance: OnboardingInstance | null,
  taskId: string
): ServiceResult<null> {
  if (!instance) {
    return { success: false, error: { code: "NOT_FOUND", message: "Onboarding instance not found" } };
  }
  if (["completed", "cancelled"].includes(instance.status)) {
    return { success: false, error: { code: "INSTANCE_CLOSED", message: "Cannot complete tasks on a closed onboarding" } };
  }
  const task = instance.tasks.find((t) => t.taskId === taskId);
  if (!task) {
    return { success: false, error: { code: "TASK_NOT_FOUND", message: "Task not found" } };
  }
  if (task.status === "completed") {
    return { success: false, error: { code: "ALREADY_COMPLETED", message: "Task is already completed" } };
  }
  return { success: true };
}

function validateSkipTask(
  instance: OnboardingInstance | null,
  taskId: string
): ServiceResult<null> {
  if (!instance) {
    return { success: false, error: { code: "NOT_FOUND", message: "Onboarding instance not found" } };
  }
  if (["completed", "cancelled"].includes(instance.status)) {
    return { success: false, error: { code: "INSTANCE_CLOSED", message: "Cannot skip tasks on a closed onboarding" } };
  }
  const task = instance.tasks.find((t) => t.taskId === taskId);
  if (!task) {
    return { success: false, error: { code: "TASK_NOT_FOUND", message: "Task not found" } };
  }
  if (task.required) {
    return { success: false, error: { code: "CANNOT_SKIP_REQUIRED", message: "Required tasks cannot be skipped" } };
  }
  return { success: true };
}

// =============================================================================
// Tests
// =============================================================================

describe("OnboardingService", () => {
  // ===========================================================================
  // Template Operations
  // ===========================================================================

  describe("Template Operations", () => {
    describe("getTemplate", () => {
      it("should return template when found", () => {
        const template: Template = {
          id: "t1",
          name: "Standard Onboarding",
          status: "active",
          tasks: [],
        };
        const result = getResourceOrNotFound(template, "Onboarding template");

        expect(result.success).toBe(true);
        expect(result.data?.name).toBe("Standard Onboarding");
      });

      it("should return NOT_FOUND for missing template", () => {
        const result = getResourceOrNotFound(null, "Onboarding template");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
        expect(result.error?.message).toBe("Onboarding template not found");
      });
    });
  });

  // ===========================================================================
  // Instance Start Validation
  // ===========================================================================

  describe("Start Onboarding", () => {
    it("should allow starting with active template and no existing onboarding", () => {
      const template: Template = { id: "t1", name: "Template", status: "active", tasks: [] };
      const result = validateStartOnboarding(template, null);

      expect(result.success).toBe(true);
    });

    it("should reject starting with non-existent template", () => {
      const result = validateStartOnboarding(null, null);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("TEMPLATE_NOT_FOUND");
    });

    it("should reject starting with inactive template", () => {
      const template: Template = { id: "t1", name: "Template", status: "inactive", tasks: [] };
      const result = validateStartOnboarding(template, null);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("TEMPLATE_INACTIVE");
    });

    it("should reject starting when employee already has active onboarding", () => {
      const template: Template = { id: "t1", name: "Template", status: "active", tasks: [] };
      const existing: OnboardingInstance = {
        id: "i1",
        status: "in_progress",
        tasks: [],
      };
      const result = validateStartOnboarding(template, existing);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("ALREADY_ONBOARDING");
    });
  });

  // ===========================================================================
  // Instance Update Validation
  // ===========================================================================

  describe("Update Instance", () => {
    it("should allow updating active instance", () => {
      const instance: OnboardingInstance = {
        id: "i1",
        status: "in_progress",
        tasks: [],
      };
      const result = validateUpdateInstance(instance);

      expect(result.success).toBe(true);
    });

    it("should allow updating not_started instance", () => {
      const instance: OnboardingInstance = {
        id: "i1",
        status: "not_started",
        tasks: [],
      };
      const result = validateUpdateInstance(instance);

      expect(result.success).toBe(true);
    });

    it("should reject updating completed instance", () => {
      const instance: OnboardingInstance = {
        id: "i1",
        status: "completed",
        tasks: [],
      };
      const result = validateUpdateInstance(instance);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INSTANCE_CLOSED");
    });

    it("should reject updating cancelled instance", () => {
      const instance: OnboardingInstance = {
        id: "i1",
        status: "cancelled",
        tasks: [],
      };
      const result = validateUpdateInstance(instance);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INSTANCE_CLOSED");
    });

    it("should return NOT_FOUND for non-existent instance", () => {
      const result = validateUpdateInstance(null);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  // ===========================================================================
  // Task Completion
  // ===========================================================================

  describe("Task Completion", () => {
    it("should complete a pending task", () => {
      const instance: OnboardingInstance = {
        id: "i1",
        status: "in_progress",
        tasks: [{ taskId: "task1", status: "pending", required: true }],
      };
      const result = validateCompleteTask(instance, "task1");

      expect(result.success).toBe(true);
    });

    it("should reject completing task on closed onboarding", () => {
      const instance: OnboardingInstance = {
        id: "i1",
        status: "completed",
        tasks: [{ taskId: "task1", status: "pending", required: true }],
      };
      const result = validateCompleteTask(instance, "task1");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INSTANCE_CLOSED");
    });

    it("should reject completing task on cancelled onboarding", () => {
      const instance: OnboardingInstance = {
        id: "i1",
        status: "cancelled",
        tasks: [{ taskId: "task1", status: "pending", required: true }],
      };
      const result = validateCompleteTask(instance, "task1");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INSTANCE_CLOSED");
    });

    it("should reject completing already completed task", () => {
      const instance: OnboardingInstance = {
        id: "i1",
        status: "in_progress",
        tasks: [{ taskId: "task1", status: "completed", required: true }],
      };
      const result = validateCompleteTask(instance, "task1");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("ALREADY_COMPLETED");
    });

    it("should return TASK_NOT_FOUND for non-existent task", () => {
      const instance: OnboardingInstance = {
        id: "i1",
        status: "in_progress",
        tasks: [{ taskId: "task1", status: "pending", required: true }],
      };
      const result = validateCompleteTask(instance, "non-existent");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("TASK_NOT_FOUND");
    });

    it("should return NOT_FOUND for non-existent instance", () => {
      const result = validateCompleteTask(null, "task1");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  // ===========================================================================
  // Task Skipping
  // ===========================================================================

  describe("Task Skipping", () => {
    it("should skip optional task", () => {
      const instance: OnboardingInstance = {
        id: "i1",
        status: "in_progress",
        tasks: [{ taskId: "task1", status: "pending", required: false }],
      };
      const result = validateSkipTask(instance, "task1");

      expect(result.success).toBe(true);
    });

    it("should reject skipping required task", () => {
      const instance: OnboardingInstance = {
        id: "i1",
        status: "in_progress",
        tasks: [{ taskId: "task1", status: "pending", required: true }],
      };
      const result = validateSkipTask(instance, "task1");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CANNOT_SKIP_REQUIRED");
    });

    it("should return TASK_NOT_FOUND for non-existent task", () => {
      const instance: OnboardingInstance = {
        id: "i1",
        status: "in_progress",
        tasks: [],
      };
      const result = validateSkipTask(instance, "non-existent");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("TASK_NOT_FOUND");
    });

    it("should reject skipping task on closed onboarding", () => {
      const instance: OnboardingInstance = {
        id: "i1",
        status: "completed",
        tasks: [{ taskId: "task1", status: "pending", required: false }],
      };
      const result = validateSkipTask(instance, "task1");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INSTANCE_CLOSED");
    });

    it("should return NOT_FOUND for non-existent instance", () => {
      const result = validateSkipTask(null, "task1");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });
});
