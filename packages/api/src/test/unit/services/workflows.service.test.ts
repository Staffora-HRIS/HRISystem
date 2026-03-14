/**
 * Workflows Service Unit Tests
 *
 * Tests for Workflow Engine business logic including:
 * - Step key uniqueness validation
 * - Next step reference validation
 * - Definition activation rules
 * - Workflow start validation (definition exists, is active)
 * - Instance cancellation rules
 * - Step processing validation
 *
 * NOTE: These tests extract and verify the business logic directly
 * rather than importing the service class, to avoid bun 1.3.3
 * segfault on Windows when importing modules with native postgres
 * dependencies.
 */

import { describe, it, expect } from "bun:test";

// =============================================================================
// Extracted Business Logic (from modules/workflows/service.ts)
// =============================================================================

interface WorkflowStep {
  stepKey: string;
  nextSteps?: Array<{ stepKey: string }>;
}

interface WorkflowDefinition {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  steps?: WorkflowStep[];
}

interface WorkflowInstance {
  id: string;
  status: "in_progress" | "completed" | "cancelled";
  workflowDefinitionId: string;
}

function validateStepKeys(steps: WorkflowStep[]): { valid: boolean; error?: string } {
  const stepKeys = new Set<string>();
  for (const step of steps) {
    if (stepKeys.has(step.stepKey)) {
      return { valid: false, error: "Step keys must be unique" };
    }
    stepKeys.add(step.stepKey);
  }
  return { valid: true };
}

function validateNextStepReferences(steps: WorkflowStep[]): { valid: boolean; error?: string } {
  const stepKeys = new Set(steps.map((s) => s.stepKey));

  for (const step of steps) {
    if (step.nextSteps) {
      for (const next of step.nextSteps) {
        if (!stepKeys.has(next.stepKey)) {
          return { valid: false, error: `Invalid next step reference: ${next.stepKey}` };
        }
      }
    }
  }
  return { valid: true };
}

function validateDefinitionExists(def: WorkflowDefinition | null): { found: boolean; error?: string } {
  if (!def) {
    return { found: false, error: "Workflow definition not found" };
  }
  return { found: true };
}

function validateDefinitionActive(def: WorkflowDefinition | null): { valid: boolean; error?: string } {
  if (!def) {
    return { valid: false, error: "Workflow definition not found" };
  }
  if (!def.isActive) {
    return { valid: false, error: "Workflow definition is not active" };
  }
  return { valid: true };
}

function validateActivateDefinition(def: WorkflowDefinition | null): { valid: boolean; error?: string } {
  if (!def || def.isActive) {
    return { valid: false, error: "Workflow definition not found or already active" };
  }
  return { valid: true };
}

function validateInstanceExists(instance: WorkflowInstance | null): { found: boolean; error?: string } {
  if (!instance) {
    return { found: false, error: "Workflow instance not found" };
  }
  return { found: true };
}

function validateCancelInstance(instance: WorkflowInstance | null): { valid: boolean; error?: string } {
  if (!instance) {
    return { valid: false, error: "Workflow instance not found or cannot be cancelled" };
  }
  if (instance.status === "completed" || instance.status === "cancelled") {
    return { valid: false, error: "Workflow instance not found or cannot be cancelled" };
  }
  return { valid: true };
}

function validateProcessStep(stepResult: unknown | null): { valid: boolean; error?: string } {
  if (!stepResult) {
    return { valid: false, error: "Step not found or not in active state" };
  }
  return { valid: true };
}

function validateReassignStep(stepResult: unknown | null): { valid: boolean; error?: string } {
  if (!stepResult) {
    return { valid: false, error: "Step not found or not in active state" };
  }
  return { valid: true };
}

// =============================================================================
// Tests
// =============================================================================

describe("WorkflowService", () => {
  // ===========================================================================
  // Workflow Definitions
  // ===========================================================================

  describe("Workflow Definitions", () => {
    describe("step key validation", () => {
      it("should accept unique step keys", () => {
        const steps: WorkflowStep[] = [
          { stepKey: "manager_approval" },
          { stepKey: "hr_approval" },
          { stepKey: "final_approval" },
        ];
        const result = validateStepKeys(steps);

        expect(result.valid).toBe(true);
      });

      it("should reject duplicate step keys", () => {
        const steps: WorkflowStep[] = [
          { stepKey: "step1" },
          { stepKey: "step1" }, // duplicate
        ];
        const result = validateStepKeys(steps);

        expect(result.valid).toBe(false);
        expect(result.error).toBe("Step keys must be unique");
      });

      it("should accept single step", () => {
        const steps: WorkflowStep[] = [{ stepKey: "only_step" }];
        const result = validateStepKeys(steps);

        expect(result.valid).toBe(true);
      });

      it("should accept empty steps array", () => {
        const result = validateStepKeys([]);

        expect(result.valid).toBe(true);
      });
    });

    describe("next step reference validation", () => {
      it("should accept valid next step references", () => {
        const steps: WorkflowStep[] = [
          { stepKey: "step1", nextSteps: [{ stepKey: "step2" }] },
          { stepKey: "step2", nextSteps: [] },
        ];
        const result = validateNextStepReferences(steps);

        expect(result.valid).toBe(true);
      });

      it("should reject invalid next step references", () => {
        const steps: WorkflowStep[] = [
          { stepKey: "step1", nextSteps: [{ stepKey: "non_existent" }] },
        ];
        const result = validateNextStepReferences(steps);

        expect(result.valid).toBe(false);
        expect(result.error).toBe("Invalid next step reference: non_existent");
      });

      it("should accept steps without next steps", () => {
        const steps: WorkflowStep[] = [
          { stepKey: "step1" },
          { stepKey: "step2" },
        ];
        const result = validateNextStepReferences(steps);

        expect(result.valid).toBe(true);
      });

      it("should accept multi-level references", () => {
        const steps: WorkflowStep[] = [
          { stepKey: "step1", nextSteps: [{ stepKey: "step2" }, { stepKey: "step3" }] },
          { stepKey: "step2", nextSteps: [{ stepKey: "step3" }] },
          { stepKey: "step3", nextSteps: [] },
        ];
        const result = validateNextStepReferences(steps);

        expect(result.valid).toBe(true);
      });
    });

    describe("definition lookup", () => {
      it("should return found for existing definition", () => {
        const def: WorkflowDefinition = {
          id: "def1",
          code: "leave-approval",
          name: "Leave Approval",
          isActive: true,
        };
        const result = validateDefinitionExists(def);

        expect(result.found).toBe(true);
      });

      it("should return not found for missing definition", () => {
        const result = validateDefinitionExists(null);

        expect(result.found).toBe(false);
        expect(result.error).toBe("Workflow definition not found");
      });
    });

    describe("activateDefinition", () => {
      it("should activate inactive definition", () => {
        const def: WorkflowDefinition = {
          id: "def1",
          code: "wf1",
          name: "Workflow",
          isActive: false,
        };
        const result = validateActivateDefinition(def);

        expect(result.valid).toBe(true);
      });

      it("should reject when definition not found", () => {
        const result = validateActivateDefinition(null);

        expect(result.valid).toBe(false);
        expect(result.error).toBe("Workflow definition not found or already active");
      });

      it("should reject when already active", () => {
        const def: WorkflowDefinition = {
          id: "def1",
          code: "wf1",
          name: "Workflow",
          isActive: true,
        };
        const result = validateActivateDefinition(def);

        expect(result.valid).toBe(false);
        expect(result.error).toBe("Workflow definition not found or already active");
      });
    });
  });

  // ===========================================================================
  // Workflow Instances
  // ===========================================================================

  describe("Workflow Instances", () => {
    describe("startWorkflow", () => {
      it("should allow starting from active definition", () => {
        const def: WorkflowDefinition = {
          id: "def1",
          code: "wf1",
          name: "Workflow",
          isActive: true,
        };
        const result = validateDefinitionActive(def);

        expect(result.valid).toBe(true);
      });

      it("should reject for non-existent definition", () => {
        const result = validateDefinitionActive(null);

        expect(result.valid).toBe(false);
        expect(result.error).toBe("Workflow definition not found");
      });

      it("should reject for inactive definition", () => {
        const def: WorkflowDefinition = {
          id: "def1",
          code: "wf1",
          name: "Workflow",
          isActive: false,
        };
        const result = validateDefinitionActive(def);

        expect(result.valid).toBe(false);
        expect(result.error).toBe("Workflow definition is not active");
      });
    });

    describe("getInstanceById", () => {
      it("should return found for existing instance", () => {
        const instance: WorkflowInstance = {
          id: "inst1",
          status: "in_progress",
          workflowDefinitionId: "def1",
        };
        const result = validateInstanceExists(instance);

        expect(result.found).toBe(true);
      });

      it("should return not found for missing instance", () => {
        const result = validateInstanceExists(null);

        expect(result.found).toBe(false);
        expect(result.error).toBe("Workflow instance not found");
      });
    });

    describe("cancelInstance", () => {
      it("should allow cancelling in_progress instance", () => {
        const instance: WorkflowInstance = {
          id: "inst1",
          status: "in_progress",
          workflowDefinitionId: "def1",
        };
        const result = validateCancelInstance(instance);

        expect(result.valid).toBe(true);
      });

      it("should reject cancelling completed instance", () => {
        const instance: WorkflowInstance = {
          id: "inst1",
          status: "completed",
          workflowDefinitionId: "def1",
        };
        const result = validateCancelInstance(instance);

        expect(result.valid).toBe(false);
        expect(result.error).toBe("Workflow instance not found or cannot be cancelled");
      });

      it("should reject cancelling already cancelled instance", () => {
        const instance: WorkflowInstance = {
          id: "inst1",
          status: "cancelled",
          workflowDefinitionId: "def1",
        };
        const result = validateCancelInstance(instance);

        expect(result.valid).toBe(false);
      });

      it("should reject when instance not found", () => {
        const result = validateCancelInstance(null);

        expect(result.valid).toBe(false);
        expect(result.error).toBe("Workflow instance not found or cannot be cancelled");
      });
    });
  });

  // ===========================================================================
  // Step Processing
  // ===========================================================================

  describe("Step Processing", () => {
    describe("processStep", () => {
      it("should accept valid step result (approval)", () => {
        const stepResult = {
          id: "step1",
          status: "completed",
          completionAction: "approve",
          completionComment: "Looks good",
        };
        const result = validateProcessStep(stepResult);

        expect(result.valid).toBe(true);
      });

      it("should accept valid step result (rejection)", () => {
        const stepResult = {
          id: "step1",
          status: "rejected",
          completionAction: "reject",
          completionComment: "Insufficient documentation",
        };
        const result = validateProcessStep(stepResult);

        expect(result.valid).toBe(true);
      });

      it("should reject when step not found", () => {
        const result = validateProcessStep(null);

        expect(result.valid).toBe(false);
        expect(result.error).toBe("Step not found or not in active state");
      });
    });

    describe("reassignStep", () => {
      it("should accept valid reassignment", () => {
        const stepResult = {
          id: "step1",
          status: "active",
          assignedTo: "new-assignee",
        };
        const result = validateReassignStep(stepResult);

        expect(result.valid).toBe(true);
      });

      it("should reject when step not found", () => {
        const result = validateReassignStep(null);

        expect(result.valid).toBe(false);
        expect(result.error).toBe("Step not found or not in active state");
      });
    });
  });

  // ===========================================================================
  // Combined Validation Scenarios
  // ===========================================================================

  describe("Combined Validation", () => {
    it("should validate complete workflow definition creation", () => {
      const steps: WorkflowStep[] = [
        { stepKey: "manager_approval", nextSteps: [{ stepKey: "hr_approval" }] },
        { stepKey: "hr_approval", nextSteps: [] },
      ];

      const keyResult = validateStepKeys(steps);
      expect(keyResult.valid).toBe(true);

      const refResult = validateNextStepReferences(steps);
      expect(refResult.valid).toBe(true);
    });

    it("should catch both key duplication and invalid references", () => {
      const stepsWithDupe: WorkflowStep[] = [
        { stepKey: "step1", nextSteps: [{ stepKey: "step2" }] },
        { stepKey: "step1", nextSteps: [] },
      ];

      // Key validation catches duplicate first
      const keyResult = validateStepKeys(stepsWithDupe);
      expect(keyResult.valid).toBe(false);
    });

    it("should validate workflow start to completion flow", () => {
      // Definition must be active
      const def: WorkflowDefinition = {
        id: "def1",
        code: "approval",
        name: "Approval",
        isActive: true,
      };
      expect(validateDefinitionActive(def).valid).toBe(true);

      // Instance is created as in_progress
      const instance: WorkflowInstance = {
        id: "inst1",
        status: "in_progress",
        workflowDefinitionId: "def1",
      };
      expect(validateInstanceExists(instance).found).toBe(true);
      expect(validateCancelInstance(instance).valid).toBe(true);
    });
  });
});
