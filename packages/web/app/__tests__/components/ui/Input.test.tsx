/**
 * Input, Textarea, Select, Checkbox, Radio, RadioGroup Component Tests
 *
 * Tests rendering, validation, accessibility, and user interactions.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Input,
  Textarea,
  Select,
  Checkbox,
  Radio,
  RadioGroup,
} from "../../../components/ui/input";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
describe("Input Component", () => {
  describe("Rendering", () => {
    it("renders an input element", () => {
      render(<Input name="email" />);
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("renders a label when provided", () => {
      render(<Input name="email" label="Email" />);
      expect(screen.getByLabelText("Email")).toBeInTheDocument();
    });

    it("associates label with input via htmlFor", () => {
      render(<Input id="my-email" label="Email" />);
      const input = screen.getByLabelText("Email");
      expect(input).toHaveAttribute("id", "my-email");
    });

    it("uses name as id fallback when id is not provided", () => {
      render(<Input name="username" label="Username" />);
      expect(screen.getByLabelText("Username")).toHaveAttribute("id", "username");
    });

    it("shows required indicator when required", () => {
      render(<Input name="email" label="Email" required />);
      expect(screen.getByText("*")).toBeInTheDocument();
    });

    it("renders hint text when provided", () => {
      render(<Input name="email" hint="Enter your work email" />);
      expect(screen.getByText("Enter your work email")).toBeInTheDocument();
    });

    it("renders left icon", () => {
      render(<Input name="search" leftIcon={<span data-testid="left-icon" />} />);
      expect(screen.getByTestId("left-icon")).toBeInTheDocument();
    });

    it("renders right icon", () => {
      render(<Input name="search" rightIcon={<span data-testid="right-icon" />} />);
      expect(screen.getByTestId("right-icon")).toBeInTheDocument();
    });

    it("renders left addon", () => {
      render(<Input name="url" leftAddon="https://" />);
      expect(screen.getByText("https://")).toBeInTheDocument();
    });

    it("renders right addon", () => {
      render(<Input name="domain" rightAddon=".com" />);
      expect(screen.getByText(".com")).toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    it("shows error message when provided", () => {
      render(<Input name="email" error="Email is required" />);
      expect(screen.getByText("Email is required")).toBeInTheDocument();
    });

    it("sets aria-invalid when there is an error", () => {
      render(<Input name="email" error="Invalid" />);
      expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    });

    it("sets aria-describedby to error element when there is an error", () => {
      render(<Input name="email" error="Invalid email" />);
      const input = screen.getByRole("textbox");
      expect(input).toHaveAttribute("aria-describedby", "email-error");
    });

    it("sets aria-describedby to hint element when there is a hint and no error", () => {
      render(<Input name="email" hint="Use your work email" />);
      const input = screen.getByRole("textbox");
      expect(input).toHaveAttribute("aria-describedby", "email-hint");
    });

    it("hides hint when error is present", () => {
      render(<Input name="email" hint="Use work email" error="Invalid" />);
      expect(screen.queryByText("Use work email")).not.toBeInTheDocument();
      expect(screen.getByText("Invalid")).toBeInTheDocument();
    });
  });

  describe("Disabled State", () => {
    it("disables the input when disabled=true", () => {
      render(<Input name="email" disabled />);
      expect(screen.getByRole("textbox")).toBeDisabled();
    });
  });

  describe("Interactions", () => {
    it("handles typing", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Input name="email" onChange={onChange} />);
      await user.type(screen.getByRole("textbox"), "hello");
      expect(onChange).toHaveBeenCalledTimes(5);
    });

    it("is focusable via tab", async () => {
      const user = userEvent.setup();
      render(<Input name="email" />);
      await user.tab();
      expect(screen.getByRole("textbox")).toHaveFocus();
    });
  });

  describe("Sizes", () => {
    it("applies small size styles", () => {
      render(<Input name="x" inputSize="sm" />);
      expect(screen.getByRole("textbox").className).toContain("text-sm");
    });

    it("applies large size styles", () => {
      render(<Input name="x" inputSize="lg" />);
      expect(screen.getByRole("textbox").className).toContain("text-base");
    });
  });

  describe("Ref forwarding", () => {
    it("forwards ref to the input element", () => {
      const ref = vi.fn();
      render(<Input name="x" ref={ref} />);
      expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
    });
  });
});

// ---------------------------------------------------------------------------
// Textarea
// ---------------------------------------------------------------------------
describe("Textarea Component", () => {
  it("renders a textarea element", () => {
    render(<Textarea name="notes" />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("textbox").tagName).toBe("TEXTAREA");
  });

  it("renders label when provided", () => {
    render(<Textarea name="notes" label="Notes" />);
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
  });

  it("shows error message", () => {
    render(<Textarea name="notes" error="Required" />);
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows hint when no error", () => {
    render(<Textarea name="notes" hint="Max 500 characters" />);
    expect(screen.getByText("Max 500 characters")).toBeInTheDocument();
  });

  it("defaults to 4 rows", () => {
    render(<Textarea name="notes" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "4");
  });

  it("accepts custom rows", () => {
    render(<Textarea name="notes" rows={8} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "8");
  });

  it("can be disabled", () => {
    render(<Textarea name="notes" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("shows required indicator", () => {
    render(<Textarea name="notes" label="Notes" required />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------
describe("Select Component", () => {
  const options = [
    { value: "a", label: "Option A" },
    { value: "b", label: "Option B" },
    { value: "c", label: "Option C", disabled: true },
  ];

  it("renders a select element with options", () => {
    render(<Select name="choice" options={options} />);
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(screen.getByText("Option A")).toBeInTheDocument();
    expect(screen.getByText("Option B")).toBeInTheDocument();
  });

  it("renders placeholder option", () => {
    render(<Select name="choice" options={options} placeholder="Pick one..." />);
    expect(screen.getByText("Pick one...")).toBeInTheDocument();
  });

  it("renders label", () => {
    render(<Select name="choice" options={options} label="Selection" />);
    expect(screen.getByLabelText("Selection")).toBeInTheDocument();
  });

  it("shows error message", () => {
    render(<Select name="choice" options={options} error="Required" />);
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
  });

  it("disables the select", () => {
    render(<Select name="choice" options={options} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("renders disabled options", () => {
    render(<Select name="choice" options={options} />);
    const optionC = screen.getByText("Option C");
    expect(optionC).toBeDisabled();
  });

  it("handles value change", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select name="choice" options={options} onChange={onChange} />);
    await user.selectOptions(screen.getByRole("combobox"), "b");
    expect(onChange).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Checkbox
// ---------------------------------------------------------------------------
describe("Checkbox Component", () => {
  it("renders a checkbox input", () => {
    render(<Checkbox name="agree" />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("renders with label", () => {
    render(<Checkbox name="agree" label="I agree" />);
    expect(screen.getByLabelText("I agree")).toBeInTheDocument();
  });

  it("renders description text", () => {
    render(<Checkbox name="agree" label="Terms" description="Read the terms" />);
    expect(screen.getByText("Read the terms")).toBeInTheDocument();
  });

  it("renders error text", () => {
    render(<Checkbox name="agree" label="Terms" error="Must agree" />);
    expect(screen.getByText("Must agree")).toBeInTheDocument();
  });

  it("handles check and uncheck", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox name="agree" onChange={onChange} />);
    await user.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalled();
  });

  it("disables the checkbox", () => {
    render(<Checkbox name="agree" disabled />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Radio
// ---------------------------------------------------------------------------
describe("Radio Component", () => {
  it("renders a radio input", () => {
    render(<Radio name="color" value="red" />);
    expect(screen.getByRole("radio")).toBeInTheDocument();
  });

  it("renders with label", () => {
    render(<Radio name="color" value="red" label="Red" />);
    expect(screen.getByLabelText("Red")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<Radio name="color" value="red" label="Red" description="Bright red" />);
    expect(screen.getByText("Bright red")).toBeInTheDocument();
  });

  it("can be disabled", () => {
    render(<Radio name="color" value="red" disabled />);
    expect(screen.getByRole("radio")).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// RadioGroup
// ---------------------------------------------------------------------------
describe("RadioGroup Component", () => {
  const options = [
    { value: "a", label: "Option A" },
    { value: "b", label: "Option B" },
    { value: "c", label: "Option C", disabled: true },
  ];

  it("renders all radio options", () => {
    render(<RadioGroup name="group" options={options} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("renders fieldset legend when label provided", () => {
    render(<RadioGroup name="group" options={options} label="Choose one" />);
    expect(screen.getByText("Choose one")).toBeInTheDocument();
  });

  it("checks the option matching the value", () => {
    render(<RadioGroup name="group" options={options} value="b" />);
    const radios = screen.getAllByRole("radio");
    expect(radios[1]).toBeChecked();
    expect(radios[0]).not.toBeChecked();
  });

  it("calls onChange when an option is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RadioGroup name="group" options={options} onChange={onChange} />);
    await user.click(screen.getByLabelText("Option A"));
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("shows error text", () => {
    render(<RadioGroup name="group" options={options} error="Pick one" />);
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("disables individual options", () => {
    render(<RadioGroup name="group" options={options} />);
    const radios = screen.getAllByRole("radio");
    expect(radios[2]).toBeDisabled();
  });
});
