/**
 * SearchInput Component Tests
 *
 * Tests for SearchInput with debounce, clear, keyboard support.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchInput } from "../../../components/ui/search-input";

describe("SearchInput Component", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Rendering", () => {
    it("renders a search input", () => {
      render(<SearchInput />);
      expect(screen.getByRole("searchbox")).toBeInTheDocument();
    });

    it("renders with default placeholder", () => {
      render(<SearchInput />);
      expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    });

    it("renders with custom placeholder", () => {
      render(<SearchInput placeholder="Find employees..." />);
      expect(screen.getByPlaceholderText("Find employees...")).toBeInTheDocument();
    });

    it("renders with default value", () => {
      render(<SearchInput defaultValue="initial" />);
      expect(screen.getByRole("searchbox")).toHaveValue("initial");
    });

    it("renders with controlled value", () => {
      render(<SearchInput value="controlled" />);
      expect(screen.getByRole("searchbox")).toHaveValue("controlled");
    });
  });

  describe("Typing and onChange", () => {
    it("calls onChange on each keystroke", async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<SearchInput onChange={onChange} />);

      await user.type(screen.getByRole("searchbox"), "abc");
      expect(onChange).toHaveBeenCalledTimes(3);
      expect(onChange).toHaveBeenLastCalledWith("abc");
    });

    it("updates internal value for uncontrolled input", async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      render(<SearchInput />);

      await user.type(screen.getByRole("searchbox"), "hello");
      expect(screen.getByRole("searchbox")).toHaveValue("hello");
    });
  });

  describe("Debounced search", () => {
    it("calls onSearch after debounce delay", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onSearch = vi.fn();
      render(<SearchInput onSearch={onSearch} debounceMs={300} />);

      await user.type(screen.getByRole("searchbox"), "test");
      // onSearch should not have been called yet
      expect(onSearch).not.toHaveBeenCalled();

      // Advance timers past debounce
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(onSearch).toHaveBeenCalledWith("test");
    });

    it("calls onSearch immediately when debounceMs=0", async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      const onSearch = vi.fn();
      render(<SearchInput onSearch={onSearch} debounceMs={0} />);

      await user.type(screen.getByRole("searchbox"), "a");
      expect(onSearch).toHaveBeenCalledWith("a");
    });
  });

  describe("Clear button", () => {
    it("shows clear button when there is a value", async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      render(<SearchInput />);

      expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
      await user.type(screen.getByRole("searchbox"), "test");
      expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
    });

    it("clears the input when clear button is clicked", async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      const onChange = vi.fn();
      const onSearch = vi.fn();
      render(<SearchInput onChange={onChange} onSearch={onSearch} />);

      await user.type(screen.getByRole("searchbox"), "test");
      await user.click(screen.getByRole("button", { name: "Clear search" }));

      expect(screen.getByRole("searchbox")).toHaveValue("");
      expect(onChange).toHaveBeenLastCalledWith("");
      expect(onSearch).toHaveBeenLastCalledWith("");
    });

    it("hides clear button when showClearButton=false", async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      render(<SearchInput showClearButton={false} />);

      await user.type(screen.getByRole("searchbox"), "test");
      expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    });

    it("does not show clear button during loading", () => {
      render(<SearchInput value="test" loading />);
      expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    });
  });

  describe("Keyboard support", () => {
    it("triggers search on Enter key", async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      const onSearch = vi.fn();
      render(<SearchInput onSearch={onSearch} debounceMs={1000} />);

      await user.type(screen.getByRole("searchbox"), "query");
      await user.keyboard("{Enter}");

      expect(onSearch).toHaveBeenCalledWith("query");
    });

    it("clears input on Escape key", async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<SearchInput onChange={onChange} />);

      await user.type(screen.getByRole("searchbox"), "test");
      await user.keyboard("{Escape}");

      expect(screen.getByRole("searchbox")).toHaveValue("");
      expect(onChange).toHaveBeenLastCalledWith("");
    });
  });

  describe("Disabled state", () => {
    it("disables the input", () => {
      render(<SearchInput disabled />);
      expect(screen.getByRole("searchbox")).toBeDisabled();
    });
  });

  describe("Sizes", () => {
    it("applies sm size class", () => {
      render(<SearchInput size="sm" />);
      expect(screen.getByRole("searchbox").className).toContain("h-8");
    });

    it("applies md size class (default)", () => {
      render(<SearchInput />);
      expect(screen.getByRole("searchbox").className).toContain("h-10");
    });

    it("applies lg size class", () => {
      render(<SearchInput size="lg" />);
      expect(screen.getByRole("searchbox").className).toContain("h-12");
    });
  });

  describe("Loading state", () => {
    it("shows loading indicator when loading=true", () => {
      render(<SearchInput loading />);
      // Loader2 icon has animate-spin class
      const { container } = render(<SearchInput loading />);
      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });
  });
});
