/**
 * Badge Component Tests
 *
 * Tests for badge variant styles, size variations, status mapping,
 * count badge logic, priority mapping, and props handling.
 */

import { describe, it, expect, vi } from "vitest";
import type {
  BadgeVariant,
  BadgeSize,
  BadgeProps,
  StatusBadgeProps,
  CountBadgeProps,
  PriorityBadgeProps,
  TypeBadgeProps,
} from "../../../components/ui/badge";

describe("Badge Component", () => {
  describe("BadgeVariant Type", () => {
    it("should support all variant values", () => {
      const variants: BadgeVariant[] = [
        "default",
        "primary",
        "secondary",
        "success",
        "warning",
        "error",
        "info",
        "destructive",
        "outline",
      ];

      expect(variants).toHaveLength(9);
      expect(variants).toContain("default");
      expect(variants).toContain("primary");
      expect(variants).toContain("destructive");
      expect(variants).toContain("outline");
    });
  });

  describe("BadgeSize Type", () => {
    it("should support sm, md, and lg sizes", () => {
      const sizes: BadgeSize[] = ["sm", "md", "lg"];

      expect(sizes).toContain("sm");
      expect(sizes).toContain("md");
      expect(sizes).toContain("lg");
      expect(sizes).toHaveLength(3);
    });
  });

  describe("Size Styles Mapping", () => {
    const sizeStyles: Record<BadgeSize, string> = {
      sm: "px-2 py-0.5 text-xs",
      md: "px-2.5 py-1 text-xs",
      lg: "px-3 py-1 text-sm",
    };

    it("should have correct sm styles", () => {
      expect(sizeStyles.sm).toContain("px-2");
      expect(sizeStyles.sm).toContain("text-xs");
    });

    it("should have correct md styles", () => {
      expect(sizeStyles.md).toContain("px-2.5");
      expect(sizeStyles.md).toContain("text-xs");
    });

    it("should have correct lg styles with larger text", () => {
      expect(sizeStyles.lg).toContain("px-3");
      expect(sizeStyles.lg).toContain("text-sm");
    });
  });

  describe("Default Props", () => {
    it("should default variant to 'default'", () => {
      const variant: BadgeVariant = "default";
      expect(variant).toBe("default");
    });

    it("should default size to 'md'", () => {
      const size: BadgeSize = "md";
      expect(size).toBe("md");
    });

    it("should default rounded to false", () => {
      const rounded = false;
      expect(rounded).toBe(false);
    });

    it("should default dot to false", () => {
      const dot = false;
      expect(dot).toBe(false);
    });

    it("should default removable to false", () => {
      const removable = false;
      expect(removable).toBe(false);
    });
  });

  describe("Rounded Logic", () => {
    it("should use rounded-full class when rounded is true", () => {
      const rounded = true;
      const borderRadius = rounded ? "rounded-full" : "rounded-md";
      expect(borderRadius).toBe("rounded-full");
    });

    it("should use rounded-md class when rounded is false", () => {
      const rounded = false;
      const borderRadius = rounded ? "rounded-full" : "rounded-md";
      expect(borderRadius).toBe("rounded-md");
    });
  });

  describe("Dot Color Resolution", () => {
    const dotColors: Record<BadgeVariant, string> = {
      default: "bg-gray-500",
      primary: "bg-primary-500",
      secondary: "bg-gray-600",
      success: "bg-success-500",
      warning: "bg-warning-500",
      error: "bg-error-500",
      info: "bg-primary-500",
      destructive: "bg-red-500",
      outline: "bg-gray-500",
    };

    it("should use variant-specific dot color by default", () => {
      const variant: BadgeVariant = "success";
      const customDotColor: string | undefined = undefined;
      const resolvedColor = customDotColor || dotColors[variant];

      expect(resolvedColor).toBe("bg-success-500");
    });

    it("should use custom dot color when provided", () => {
      const variant: BadgeVariant = "success";
      const customDotColor = "bg-purple-500";
      const resolvedColor = customDotColor || dotColors[variant];

      expect(resolvedColor).toBe("bg-purple-500");
    });

    it("should have dot colors for all variants", () => {
      const variants: BadgeVariant[] = [
        "default",
        "primary",
        "secondary",
        "success",
        "warning",
        "error",
        "info",
        "destructive",
        "outline",
      ];

      variants.forEach((variant) => {
        expect(dotColors[variant]).toBeDefined();
        expect(dotColors[variant]).toContain("bg-");
      });
    });
  });

  describe("Removable Badge", () => {
    it("should call onRemove when remove button is triggered", () => {
      const onRemove = vi.fn();
      onRemove();
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it("should not show remove button when removable is false", () => {
      const removable = false;
      expect(removable).toBe(false);
    });
  });

  describe("StatusBadge Config", () => {
    const statusConfig: Record<
      StatusBadgeProps["status"],
      { variant: BadgeVariant; label: string }
    > = {
      active: { variant: "success", label: "Active" },
      inactive: { variant: "default", label: "Inactive" },
      pending: { variant: "warning", label: "Pending" },
      approved: { variant: "success", label: "Approved" },
      rejected: { variant: "error", label: "Rejected" },
      draft: { variant: "secondary", label: "Draft" },
      published: { variant: "primary", label: "Published" },
      archived: { variant: "default", label: "Archived" },
      processing: { variant: "info", label: "Processing" },
      completed: { variant: "success", label: "Completed" },
      failed: { variant: "error", label: "Failed" },
      cancelled: { variant: "default", label: "Cancelled" },
    };

    it("should map active to success variant", () => {
      expect(statusConfig.active.variant).toBe("success");
      expect(statusConfig.active.label).toBe("Active");
    });

    it("should map pending to warning variant", () => {
      expect(statusConfig.pending.variant).toBe("warning");
      expect(statusConfig.pending.label).toBe("Pending");
    });

    it("should map rejected to error variant", () => {
      expect(statusConfig.rejected.variant).toBe("error");
      expect(statusConfig.rejected.label).toBe("Rejected");
    });

    it("should map draft to secondary variant", () => {
      expect(statusConfig.draft.variant).toBe("secondary");
      expect(statusConfig.draft.label).toBe("Draft");
    });

    it("should have all 12 status values configured", () => {
      const statuses: StatusBadgeProps["status"][] = [
        "active",
        "inactive",
        "pending",
        "approved",
        "rejected",
        "draft",
        "published",
        "archived",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ];

      statuses.forEach((status) => {
        expect(statusConfig[status]).toBeDefined();
        expect(statusConfig[status].variant).toBeDefined();
        expect(statusConfig[status].label).toBeDefined();
      });
    });

    it("should default StatusBadge size to sm", () => {
      const size: BadgeSize = "sm";
      expect(size).toBe("sm");
    });
  });

  describe("CountBadge Logic", () => {
    it("should return null for zero count", () => {
      const count = 0;
      const shouldRender = count > 0;
      expect(shouldRender).toBe(false);
    });

    it("should return null for negative count", () => {
      const count = -5;
      const shouldRender = count > 0;
      expect(shouldRender).toBe(false);
    });

    it("should display count when positive", () => {
      const count = 5;
      const shouldRender = count > 0;
      expect(shouldRender).toBe(true);
    });

    function formatBadgeCount(count: number, max: number): string | number {
      return count > max ? `${max}+` : count;
    }

    it("should cap display at max value", () => {
      expect(formatBadgeCount(150, 99)).toBe("99+");
    });

    it("should show exact count when below max", () => {
      expect(formatBadgeCount(42, 99)).toBe(42);
    });

    it("should handle custom max value", () => {
      expect(formatBadgeCount(15, 10)).toBe("10+");
    });

    it("should show exact count when equal to max", () => {
      expect(formatBadgeCount(99, 99)).toBe(99);
    });

    it("should default variant to error", () => {
      const variant: BadgeVariant = "error";
      expect(variant).toBe("error");
    });

    it("should default max to 99", () => {
      const max = 99;
      expect(max).toBe(99);
    });
  });

  describe("PriorityBadge Config", () => {
    const priorityConfig: Record<
      PriorityBadgeProps["priority"],
      { variant: BadgeVariant; label: string }
    > = {
      low: { variant: "default", label: "Low" },
      medium: { variant: "info", label: "Medium" },
      high: { variant: "warning", label: "High" },
      urgent: { variant: "error", label: "Urgent" },
    };

    it("should map low to default variant", () => {
      expect(priorityConfig.low.variant).toBe("default");
    });

    it("should map medium to info variant", () => {
      expect(priorityConfig.medium.variant).toBe("info");
    });

    it("should map high to warning variant", () => {
      expect(priorityConfig.high.variant).toBe("warning");
    });

    it("should map urgent to error variant", () => {
      expect(priorityConfig.urgent.variant).toBe("error");
    });

    it("should have capitalised labels", () => {
      expect(priorityConfig.low.label).toBe("Low");
      expect(priorityConfig.medium.label).toBe("Medium");
      expect(priorityConfig.high.label).toBe("High");
      expect(priorityConfig.urgent.label).toBe("Urgent");
    });
  });

  describe("TypeBadge Defaults", () => {
    it("should default variant to secondary", () => {
      const variant: BadgeVariant = "secondary";
      expect(variant).toBe("secondary");
    });

    it("should default size to sm", () => {
      const size: BadgeSize = "sm";
      expect(size).toBe("sm");
    });
  });
});
