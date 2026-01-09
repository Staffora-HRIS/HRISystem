/**
 * Employee Lifecycle State Machine Tests
 */

import { describe, it, expect } from "bun:test";

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["active"],
  active: ["on_leave", "terminated"],
  on_leave: ["active", "terminated"],
  terminated: [],
};

describe("Employee Lifecycle State Machine", () => {
  describe("Valid Transitions", () => {
    it("pending -> active", () => {
      expect(VALID_TRANSITIONS["pending"]?.includes("active")).toBe(true);
    });

    it("active -> on_leave", () => {
      expect(VALID_TRANSITIONS["active"]?.includes("on_leave")).toBe(true);
    });

    it("active -> terminated", () => {
      expect(VALID_TRANSITIONS["active"]?.includes("terminated")).toBe(true);
    });

    it("on_leave -> active", () => {
      expect(VALID_TRANSITIONS["on_leave"]?.includes("active")).toBe(true);
    });

    it("on_leave -> terminated", () => {
      expect(VALID_TRANSITIONS["on_leave"]?.includes("terminated")).toBe(true);
    });
  });

  describe("Invalid Transitions", () => {
    it("pending -> terminated (should fail)", () => {
      expect(VALID_TRANSITIONS["pending"]?.includes("terminated")).toBe(false);
    });

    it("pending -> on_leave (should fail)", () => {
      expect(VALID_TRANSITIONS["pending"]?.includes("on_leave")).toBe(false);
    });

    it("terminated -> any (should fail)", () => {
      expect(VALID_TRANSITIONS["terminated"]?.length).toBe(0);
    });
  });

  describe("Transition Guards", () => {
    it("termination requires reason", () => {
      const terminationData = { status: "terminated", reason: null as string | null };
      const isValid = terminationData.status === "terminated" && terminationData.reason !== null;
      
      expect(isValid).toBe(false);

      terminationData.reason = "Resignation";
      const isValidWithReason = terminationData.status === "terminated" && terminationData.reason !== null;
      
      expect(isValidWithReason).toBe(true);
    });

    it("on_leave requires return_date or indefinite flag", () => {
      const leaveData = {
        status: "on_leave",
        returnDate: null as string | null,
        isIndefinite: false,
      };

      const isValid = leaveData.returnDate !== null || leaveData.isIndefinite;
      expect(isValid).toBe(false);

      leaveData.returnDate = "2024-06-01";
      const isValidWithDate = leaveData.returnDate !== null || leaveData.isIndefinite;
      expect(isValidWithDate).toBe(true);

      leaveData.returnDate = null;
      leaveData.isIndefinite = true;
      const isValidIndefinite = leaveData.returnDate !== null || leaveData.isIndefinite;
      expect(isValidIndefinite).toBe(true);
    });
  });

  describe("Transition Function", () => {
    const canTransition = (from: string, to: string): boolean => {
      return VALID_TRANSITIONS[from]?.includes(to) ?? false;
    };

    it("should validate transitions correctly", () => {
      expect(canTransition("pending", "active")).toBe(true);
      expect(canTransition("pending", "terminated")).toBe(false);
      expect(canTransition("active", "on_leave")).toBe(true);
      expect(canTransition("terminated", "active")).toBe(false);
    });

    it("should handle unknown states gracefully", () => {
      expect(canTransition("unknown", "active")).toBe(false);
      expect(canTransition("active", "unknown")).toBe(false);
    });
  });
});
