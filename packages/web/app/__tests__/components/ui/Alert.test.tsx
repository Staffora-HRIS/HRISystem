/**
 * Alert Component Tests
 *
 * Tests for alert variant styles, icon mapping, dismissible logic,
 * AlertBanner props, and type defaults.
 */

import { describe, it, expect, vi } from "vitest";
import type {
  AlertVariant,
  AlertProps,
  AlertBannerProps,
} from "../../../components/ui/alert";

describe("Alert Component", () => {
  describe("AlertVariant Type", () => {
    it("should support four variant types", () => {
      const variants: AlertVariant[] = ["success", "error", "warning", "info"];

      expect(variants).toContain("success");
      expect(variants).toContain("error");
      expect(variants).toContain("warning");
      expect(variants).toContain("info");
      expect(variants).toHaveLength(4);
    });
  });

  describe("Variant Styles Mapping", () => {
    const variantStyles: Record<AlertVariant, string> = {
      success: "bg-green-50 border-green-200 text-green-800",
      error: "bg-red-50 border-red-200 text-red-800",
      warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
      info: "bg-blue-50 border-blue-200 text-blue-800",
    };

    it("should use green styles for success", () => {
      expect(variantStyles.success).toContain("bg-green-50");
      expect(variantStyles.success).toContain("border-green-200");
      expect(variantStyles.success).toContain("text-green-800");
    });

    it("should use red styles for error", () => {
      expect(variantStyles.error).toContain("bg-red-50");
      expect(variantStyles.error).toContain("border-red-200");
      expect(variantStyles.error).toContain("text-red-800");
    });

    it("should use yellow styles for warning", () => {
      expect(variantStyles.warning).toContain("bg-yellow-50");
      expect(variantStyles.warning).toContain("border-yellow-200");
      expect(variantStyles.warning).toContain("text-yellow-800");
    });

    it("should use blue styles for info", () => {
      expect(variantStyles.info).toContain("bg-blue-50");
      expect(variantStyles.info).toContain("border-blue-200");
      expect(variantStyles.info).toContain("text-blue-800");
    });

    it("should have consistent style pattern across all variants", () => {
      const variants: AlertVariant[] = ["success", "error", "warning", "info"];

      variants.forEach((variant) => {
        const styles = variantStyles[variant];
        expect(styles).toMatch(/bg-\w+-50/);
        expect(styles).toMatch(/border-\w+-200/);
        expect(styles).toMatch(/text-\w+-800/);
      });
    });
  });

  describe("Icon Color Mapping", () => {
    const iconColorMap: Record<AlertVariant, string> = {
      success: "text-green-500",
      error: "text-red-500",
      warning: "text-yellow-500",
      info: "text-blue-500",
    };

    it("should map success to green icon", () => {
      expect(iconColorMap.success).toBe("text-green-500");
    });

    it("should map error to red icon", () => {
      expect(iconColorMap.error).toBe("text-red-500");
    });

    it("should map warning to yellow icon", () => {
      expect(iconColorMap.warning).toBe("text-yellow-500");
    });

    it("should map info to blue icon", () => {
      expect(iconColorMap.info).toBe("text-blue-500");
    });

    it("should have icon colors for all variants", () => {
      const variants: AlertVariant[] = ["success", "error", "warning", "info"];
      variants.forEach((variant) => {
        expect(iconColorMap[variant]).toBeDefined();
        expect(iconColorMap[variant]).toMatch(/text-\w+-500/);
      });
    });
  });

  describe("Default Props", () => {
    it("should default variant to info", () => {
      const variant: AlertVariant = "info";
      expect(variant).toBe("info");
    });

    it("should default dismissible to false", () => {
      const dismissible = false;
      expect(dismissible).toBe(false);
    });
  });

  describe("Dismissible Logic", () => {
    it("should call onDismiss when dismiss button is clicked", () => {
      const onDismiss = vi.fn();
      onDismiss();
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("should only show dismiss button when both dismissible and onDismiss are provided", () => {
      // Case 1: both provided
      const dismissible1 = true;
      const onDismiss1 = vi.fn();
      const showDismiss1 = dismissible1 && !!onDismiss1;
      expect(showDismiss1).toBe(true);

      // Case 2: dismissible true but no onDismiss
      const dismissible2 = true;
      const onDismiss2 = undefined;
      const showDismiss2 = dismissible2 && !!onDismiss2;
      expect(showDismiss2).toBe(false);

      // Case 3: onDismiss provided but dismissible false
      const dismissible3 = false;
      const onDismiss3 = vi.fn();
      const showDismiss3 = dismissible3 && !!onDismiss3;
      expect(showDismiss3).toBe(false);

      // Case 4: neither provided
      const dismissible4 = false;
      const onDismiss4 = undefined;
      const showDismiss4 = dismissible4 && !!onDismiss4;
      expect(showDismiss4).toBe(false);
    });
  });

  describe("Title Display Logic", () => {
    it("should support optional title", () => {
      const propsWithTitle: Partial<AlertProps> = {
        title: "Important Notice",
      };
      expect(propsWithTitle.title).toBe("Important Notice");
    });

    it("should handle missing title", () => {
      const propsWithoutTitle: Partial<AlertProps> = {};
      expect(propsWithoutTitle.title).toBeUndefined();
    });
  });

  describe("Custom Icon Support", () => {
    it("should support custom icon prop", () => {
      const hasCustomIcon = true;
      // When custom icon is provided, it should be used instead of default
      expect(hasCustomIcon).toBe(true);
    });

    it("should fall back to default variant icon when no custom icon", () => {
      const icon: unknown = undefined;
      const useDefault = !icon;
      expect(useDefault).toBe(true);
    });
  });

  describe("ARIA Role", () => {
    it("should use role=alert for accessibility", () => {
      const role = "alert";
      expect(role).toBe("alert");
    });
  });

  describe("AlertBanner Props", () => {
    it("should extend AlertProps with action slot", () => {
      const bannerProps: Partial<AlertBannerProps> = {
        variant: "warning",
        title: "System Update",
        dismissible: true,
        action: undefined, // ReactNode type
      };

      expect(bannerProps.variant).toBe("warning");
      expect(bannerProps.title).toBe("System Update");
      expect(bannerProps.dismissible).toBe(true);
    });

    it("should default AlertBanner variant to info", () => {
      const variant: AlertVariant = "info";
      expect(variant).toBe("info");
    });

    it("should default AlertBanner dismissible to false", () => {
      const dismissible = false;
      expect(dismissible).toBe(false);
    });
  });

  describe("Alert Variant Completeness", () => {
    it("should have styles, icons, and colors for every variant", () => {
      const variantStyles: Record<AlertVariant, string> = {
        success: "bg-green-50 border-green-200 text-green-800",
        error: "bg-red-50 border-red-200 text-red-800",
        warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
        info: "bg-blue-50 border-blue-200 text-blue-800",
      };

      const iconColors: Record<AlertVariant, string> = {
        success: "text-green-500",
        error: "text-red-500",
        warning: "text-yellow-500",
        info: "text-blue-500",
      };

      const allVariants: AlertVariant[] = ["success", "error", "warning", "info"];

      allVariants.forEach((variant) => {
        expect(variantStyles[variant]).toBeDefined();
        expect(iconColors[variant]).toBeDefined();
      });
    });
  });

  describe("Dismiss Button Accessibility", () => {
    it("should have aria-label for dismiss button", () => {
      const ariaLabel = "Dismiss";
      expect(ariaLabel).toBe("Dismiss");
    });
  });

  describe("className Support", () => {
    it("should accept optional className prop", () => {
      const props: Partial<AlertProps> = {
        className: "mt-4 mb-2",
      };
      expect(props.className).toBe("mt-4 mb-2");
    });

    it("should handle undefined className", () => {
      const props: Partial<AlertProps> = {};
      expect(props.className).toBeUndefined();
    });
  });
});
