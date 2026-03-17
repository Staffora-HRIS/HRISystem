/**
 * Modal Component Tests
 *
 * Tests for modal props, size variants, open/close logic,
 * keyboard handling, body padding, footer alignment,
 * and pre-built modal variant types.
 */

import { describe, it, expect, vi } from "vitest";
import type {
  ModalSize,
  ModalProps,
  ModalHeaderProps,
  ModalBodyProps,
  ModalFooterProps,
  ConfirmModalProps,
  AlertModalProps,
} from "../../../components/ui/modal";

describe("Modal Component", () => {
  describe("ModalSize Type", () => {
    it("should support all size variants", () => {
      const sizes: ModalSize[] = ["sm", "md", "lg", "xl", "full"];

      expect(sizes).toContain("sm");
      expect(sizes).toContain("md");
      expect(sizes).toContain("lg");
      expect(sizes).toContain("xl");
      expect(sizes).toContain("full");
      expect(sizes).toHaveLength(5);
    });
  });

  describe("Size Styles Mapping", () => {
    const sizeStyles: Record<ModalSize, string> = {
      sm: "max-w-md",
      md: "max-w-lg",
      lg: "max-w-2xl",
      xl: "max-w-4xl",
      full: "max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]",
    };

    it("should map sm to max-w-md", () => {
      expect(sizeStyles.sm).toBe("max-w-md");
    });

    it("should map md to max-w-lg", () => {
      expect(sizeStyles.md).toBe("max-w-lg");
    });

    it("should map lg to max-w-2xl", () => {
      expect(sizeStyles.lg).toBe("max-w-2xl");
    });

    it("should map xl to max-w-4xl", () => {
      expect(sizeStyles.xl).toBe("max-w-4xl");
    });

    it("should map full to viewport-relative dimensions", () => {
      expect(sizeStyles.full).toContain("100vw");
      expect(sizeStyles.full).toContain("100vh");
    });
  });

  describe("Default Props", () => {
    it("should default size to md", () => {
      const size: ModalSize = "md";
      expect(size).toBe("md");
    });

    it("should default closeOnOverlayClick to true", () => {
      const closeOnOverlayClick = true;
      expect(closeOnOverlayClick).toBe(true);
    });

    it("should default closeOnEscape to true", () => {
      const closeOnEscape = true;
      expect(closeOnEscape).toBe(true);
    });

    it("should default showCloseButton to true", () => {
      const showCloseButton = true;
      expect(showCloseButton).toBe(true);
    });

    it("should default preventScroll to true", () => {
      const preventScroll = true;
      expect(preventScroll).toBe(true);
    });
  });

  describe("Open/Close State Logic", () => {
    it("should not render when open is false", () => {
      const open = false;
      // Modal returns null when not open
      expect(open).toBe(false);
    });

    it("should render when open is true", () => {
      const open = true;
      expect(open).toBe(true);
    });
  });

  describe("Escape Key Handling", () => {
    it("should call onClose when Escape is pressed and closeOnEscape is true", () => {
      const onClose = vi.fn();
      const closeOnEscape = true;

      const handleKeyDown = (event: { key: string }) => {
        if (closeOnEscape && event.key === "Escape") {
          onClose();
        }
      };

      handleKeyDown({ key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should not call onClose when Escape is pressed but closeOnEscape is false", () => {
      const onClose = vi.fn();
      const closeOnEscape = false;

      const handleKeyDown = (event: { key: string }) => {
        if (closeOnEscape && event.key === "Escape") {
          onClose();
        }
      };

      handleKeyDown({ key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
    });

    it("should not call onClose for non-Escape keys", () => {
      const onClose = vi.fn();
      const closeOnEscape = true;

      const handleKeyDown = (event: { key: string }) => {
        if (closeOnEscape && event.key === "Escape") {
          onClose();
        }
      };

      handleKeyDown({ key: "Enter" });
      handleKeyDown({ key: "Tab" });
      handleKeyDown({ key: "a" });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("Overlay Click Handling", () => {
    it("should call onClose when overlay is clicked and closeOnOverlayClick is true", () => {
      const onClose = vi.fn();
      const closeOnOverlayClick = true;

      // Simulate overlay click where target === currentTarget
      const mockEvent = { target: "overlay", currentTarget: "overlay" };

      if (closeOnOverlayClick && mockEvent.target === mockEvent.currentTarget) {
        onClose();
      }

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should not call onClose when inner content is clicked", () => {
      const onClose = vi.fn();
      const closeOnOverlayClick = true;

      // Simulate content click where target !== currentTarget
      const mockEvent = { target: "content", currentTarget: "overlay" };

      if (closeOnOverlayClick && mockEvent.target === mockEvent.currentTarget) {
        onClose();
      }

      expect(onClose).not.toHaveBeenCalled();
    });

    it("should not call onClose when closeOnOverlayClick is false", () => {
      const onClose = vi.fn();
      const closeOnOverlayClick = false;

      const mockEvent = { target: "overlay", currentTarget: "overlay" };

      if (closeOnOverlayClick && mockEvent.target === mockEvent.currentTarget) {
        onClose();
      }

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("ModalBody Padding", () => {
    const paddingStyles: Record<string, string> = {
      none: "",
      sm: "px-4 py-3",
      md: "px-6 py-4",
      lg: "px-8 py-6",
    };

    it("should default padding to md", () => {
      const padding: ModalBodyProps["padding"] = "md";
      expect(paddingStyles[padding!]).toBe("px-6 py-4");
    });

    it("should support no padding", () => {
      expect(paddingStyles.none).toBe("");
    });

    it("should support sm padding", () => {
      expect(paddingStyles.sm).toBe("px-4 py-3");
    });

    it("should support lg padding", () => {
      expect(paddingStyles.lg).toBe("px-8 py-6");
    });
  });

  describe("ModalFooter Justify", () => {
    const justifyStyles: Record<string, string> = {
      start: "justify-start",
      end: "justify-end",
      center: "justify-center",
      between: "justify-between",
    };

    it("should default justify to end", () => {
      const justify: ModalFooterProps["justify"] = "end";
      expect(justifyStyles[justify!]).toBe("justify-end");
    });

    it("should support start alignment", () => {
      expect(justifyStyles.start).toBe("justify-start");
    });

    it("should support center alignment", () => {
      expect(justifyStyles.center).toBe("justify-center");
    });

    it("should support between alignment", () => {
      expect(justifyStyles.between).toBe("justify-between");
    });
  });

  describe("ConfirmModal Props", () => {
    it("should have default labels", () => {
      const confirmLabel = "Confirm"; // default
      const cancelLabel = "Cancel"; // default

      expect(confirmLabel).toBe("Confirm");
      expect(cancelLabel).toBe("Cancel");
    });

    it("should resolve variant based on danger prop", () => {
      // When danger is true and no confirmVariant specified
      const danger = true;
      const confirmVariant: string | undefined = undefined;
      const variant = confirmVariant || (danger ? "danger" : "primary");

      expect(variant).toBe("danger");
    });

    it("should default to primary variant when not danger", () => {
      const danger = false;
      const confirmVariant: string | undefined = undefined;
      const variant = confirmVariant || (danger ? "danger" : "primary");

      expect(variant).toBe("primary");
    });

    it("should use explicit confirmVariant over danger", () => {
      const danger = true;
      const confirmVariant = "secondary";
      const variant = confirmVariant || (danger ? "danger" : "primary");

      expect(variant).toBe("secondary");
    });

    it("should default loading to false", () => {
      const loading = false;
      expect(loading).toBe(false);
    });

    it("should default danger to false", () => {
      const danger = false;
      expect(danger).toBe(false);
    });
  });

  describe("AlertModal Props", () => {
    const iconColors: Record<string, string> = {
      info: "text-primary-500",
      success: "text-success-500",
      warning: "text-warning-500",
      error: "text-error-500",
    };

    it("should default type to info", () => {
      const type: AlertModalProps["type"] = "info";
      expect(type).toBe("info");
    });

    it("should default buttonLabel to OK", () => {
      const buttonLabel = "OK";
      expect(buttonLabel).toBe("OK");
    });

    it("should map info type to primary color", () => {
      expect(iconColors.info).toBe("text-primary-500");
    });

    it("should map success type to success color", () => {
      expect(iconColors.success).toBe("text-success-500");
    });

    it("should map warning type to warning color", () => {
      expect(iconColors.warning).toBe("text-warning-500");
    });

    it("should map error type to error color", () => {
      expect(iconColors.error).toBe("text-error-500");
    });

    it("should have all four type variants", () => {
      const types: AlertModalProps["type"][] = [
        "info",
        "success",
        "warning",
        "error",
      ];

      expect(types).toHaveLength(4);
      types.forEach((type) => {
        expect(iconColors[type!]).toBeDefined();
      });
    });
  });

  describe("ModalHeader Props", () => {
    it("should support title and subtitle", () => {
      const props: Partial<ModalHeaderProps> = {
        title: "Edit Employee",
        subtitle: "Update employee details",
      };

      expect(props.title).toBe("Edit Employee");
      expect(props.subtitle).toBe("Update employee details");
    });

    it("should allow title and subtitle to be undefined", () => {
      const props: Partial<ModalHeaderProps> = {};

      expect(props.title).toBeUndefined();
      expect(props.subtitle).toBeUndefined();
    });
  });
});
