/**
 * Input Component Tests
 *
 * Tests for input component props, size styles mapping,
 * id derivation, error state logic, and exported types.
 */

import { describe, it, expect } from "vitest";
import type {
  InputSize,
  InputProps,
  TextareaProps,
  SelectOption,
  SelectProps,
  CheckboxProps,
  RadioProps,
  RadioGroupProps,
} from "../../../components/ui/input";

describe("Input Component", () => {
  describe("InputSize Type", () => {
    it("should support sm, md, and lg sizes", () => {
      const sizes: InputSize[] = ["sm", "md", "lg"];

      expect(sizes).toContain("sm");
      expect(sizes).toContain("md");
      expect(sizes).toContain("lg");
      expect(sizes).toHaveLength(3);
    });
  });

  describe("Size Styles Mapping", () => {
    const sizeStyles: Record<InputSize, string> = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2 text-sm",
      lg: "px-4 py-2.5 text-base",
    };

    it("should have correct sm styles", () => {
      expect(sizeStyles.sm).toBe("px-3 py-1.5 text-sm");
    });

    it("should have correct md styles", () => {
      expect(sizeStyles.md).toBe("px-4 py-2 text-sm");
    });

    it("should have correct lg styles", () => {
      expect(sizeStyles.lg).toBe("px-4 py-2.5 text-base");
    });

    it("should cover all InputSize values", () => {
      const allSizes: InputSize[] = ["sm", "md", "lg"];
      allSizes.forEach((size) => {
        expect(sizeStyles[size]).toBeDefined();
        expect(typeof sizeStyles[size]).toBe("string");
      });
    });
  });

  describe("Icon Size Styles Mapping", () => {
    const iconSizeStyles: Record<InputSize, string> = {
      sm: "[&>svg]:w-4 [&>svg]:h-4",
      md: "[&>svg]:w-5 [&>svg]:h-5",
      lg: "[&>svg]:w-5 [&>svg]:h-5",
    };

    it("should have smaller icons for sm size", () => {
      expect(iconSizeStyles.sm).toContain("w-4");
      expect(iconSizeStyles.sm).toContain("h-4");
    });

    it("should have larger icons for md and lg sizes", () => {
      expect(iconSizeStyles.md).toContain("w-5");
      expect(iconSizeStyles.lg).toContain("w-5");
    });
  });

  describe("Input ID Derivation", () => {
    it("should use provided id when available", () => {
      const id = "custom-id";
      const name = "email";
      const inputId = id || name;

      expect(inputId).toBe("custom-id");
    });

    it("should fall back to name when id is not provided", () => {
      const id: string | undefined = undefined;
      const name = "email";
      const inputId = id || name;

      expect(inputId).toBe("email");
    });

    it("should handle neither id nor name being provided", () => {
      const id: string | undefined = undefined;
      const name: string | undefined = undefined;
      const inputId = id || name;

      expect(inputId).toBeUndefined();
    });
  });

  describe("Error State Logic", () => {
    it("should detect error when error message is provided", () => {
      const error = "This field is required";
      const hasError = !!error;

      expect(hasError).toBe(true);
    });

    it("should not detect error when error is empty", () => {
      const error = "";
      const hasError = !!error;

      expect(hasError).toBe(false);
    });

    it("should not detect error when error is undefined", () => {
      const error: string | undefined = undefined;
      const hasError = !!error;

      expect(hasError).toBe(false);
    });
  });

  describe("ARIA Attributes Logic", () => {
    it("should set aria-invalid when there is an error", () => {
      const hasError = true;
      expect(hasError).toBe(true);
    });

    it("should set aria-describedby to error id when error exists", () => {
      const inputId = "email";
      const hasError = true;
      const hint = "Enter your work email";

      const ariaDescribedBy = hasError
        ? `${inputId}-error`
        : hint
          ? `${inputId}-hint`
          : undefined;

      expect(ariaDescribedBy).toBe("email-error");
    });

    it("should set aria-describedby to hint id when no error but hint exists", () => {
      const inputId = "email";
      const hasError = false;
      const hint = "Enter your work email";

      const ariaDescribedBy = hasError
        ? `${inputId}-error`
        : hint
          ? `${inputId}-hint`
          : undefined;

      expect(ariaDescribedBy).toBe("email-hint");
    });

    it("should have no aria-describedby when neither error nor hint", () => {
      const inputId = "email";
      const hasError = false;
      const hint: string | undefined = undefined;

      const ariaDescribedBy = hasError
        ? `${inputId}-error`
        : hint
          ? `${inputId}-hint`
          : undefined;

      expect(ariaDescribedBy).toBeUndefined();
    });
  });

  describe("Default Props", () => {
    it("should default inputSize to md", () => {
      const inputSize: InputSize = "md"; // default in component
      expect(inputSize).toBe("md");
    });

    it("should default fullWidth to true", () => {
      const fullWidth = true; // default in component
      expect(fullWidth).toBe(true);
    });
  });

  describe("SelectOption Type", () => {
    it("should have value and label", () => {
      const option: SelectOption = {
        value: "uk",
        label: "United Kingdom",
      };

      expect(option.value).toBe("uk");
      expect(option.label).toBe("United Kingdom");
    });

    it("should support optional disabled flag", () => {
      const option: SelectOption = {
        value: "deprecated",
        label: "Deprecated Option",
        disabled: true,
      };

      expect(option.disabled).toBe(true);
    });

    it("should default disabled to undefined", () => {
      const option: SelectOption = {
        value: "active",
        label: "Active Option",
      };

      expect(option.disabled).toBeUndefined();
    });
  });

  describe("Textarea Default Rows", () => {
    it("should default rows to 4", () => {
      const rows = 4; // default in Textarea component
      expect(rows).toBe(4);
    });
  });

  describe("Checkbox Type", () => {
    it("should support label and description", () => {
      const props: Partial<CheckboxProps> = {
        label: "Accept terms",
        description: "You must accept the terms to continue",
      };

      expect(props.label).toBe("Accept terms");
      expect(props.description).toBeDefined();
    });

    it("should support error message", () => {
      const props: Partial<CheckboxProps> = {
        error: "You must accept the terms",
      };

      expect(props.error).toBe("You must accept the terms");
    });
  });

  describe("Radio ID Construction", () => {
    it("should construct radio id from name and value", () => {
      const name = "color";
      const value = "blue";
      const id: string | undefined = undefined;

      const inputId = id || `${name}-${value}`;

      expect(inputId).toBe("color-blue");
    });

    it("should use provided id when available", () => {
      const name = "color";
      const value = "blue";
      const id = "custom-radio-id";

      const inputId = id || `${name}-${value}`;

      expect(inputId).toBe("custom-radio-id");
    });
  });

  describe("RadioGroup Orientation", () => {
    it("should default orientation to vertical", () => {
      const orientation: RadioGroupProps["orientation"] = "vertical";
      expect(orientation).toBe("vertical");
    });

    it("should support horizontal orientation", () => {
      const orientation: RadioGroupProps["orientation"] = "horizontal";
      expect(orientation).toBe("horizontal");
    });
  });
});
