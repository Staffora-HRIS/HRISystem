/**
 * Tabs Component Tests
 *
 * Tests for Tabs, TabsList, TabsTrigger, TabsContent.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../../components/ui/tabs";

function renderTabs(props?: { defaultValue?: string; value?: string; onValueChange?: (v: string) => void }) {
  return render(
    <Tabs defaultValue={props?.defaultValue ?? "tab1"} value={props?.value} onValueChange={props?.onValueChange}>
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        <TabsTrigger value="tab3" disabled>Tab 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">Content 1</TabsContent>
      <TabsContent value="tab2">Content 2</TabsContent>
      <TabsContent value="tab3">Content 3</TabsContent>
    </Tabs>
  );
}

describe("Tabs Component", () => {
  describe("Rendering", () => {
    it("renders all tab triggers", () => {
      renderTabs();
      expect(screen.getByRole("tab", { name: "Tab 1" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Tab 2" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Tab 3" })).toBeInTheDocument();
    });

    it("renders tablist container", () => {
      renderTabs();
      expect(screen.getByRole("tablist")).toBeInTheDocument();
    });

    it("shows content for default tab", () => {
      renderTabs({ defaultValue: "tab1" });
      expect(screen.getByText("Content 1")).toBeInTheDocument();
      expect(screen.queryByText("Content 2")).not.toBeInTheDocument();
    });

    it("renders tabpanel with correct id", () => {
      renderTabs({ defaultValue: "tab1" });
      expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "panel-tab1");
    });
  });

  describe("Tab switching", () => {
    it("switches content when tab is clicked", async () => {
      const user = userEvent.setup();
      renderTabs();

      // Initially shows tab1 content
      expect(screen.getByText("Content 1")).toBeInTheDocument();

      // Click tab 2
      await user.click(screen.getByRole("tab", { name: "Tab 2" }));
      expect(screen.queryByText("Content 1")).not.toBeInTheDocument();
      expect(screen.getByText("Content 2")).toBeInTheDocument();
    });

    it("does not switch when disabled tab is clicked", async () => {
      const user = userEvent.setup();
      renderTabs();

      await user.click(screen.getByRole("tab", { name: "Tab 3" }));
      // Content should still be tab1
      expect(screen.getByText("Content 1")).toBeInTheDocument();
      expect(screen.queryByText("Content 3")).not.toBeInTheDocument();
    });

    it("calls onValueChange when tab changes", async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      renderTabs({ onValueChange });

      await user.click(screen.getByRole("tab", { name: "Tab 2" }));
      expect(onValueChange).toHaveBeenCalledWith("tab2");
    });
  });

  describe("Accessibility", () => {
    it("sets aria-selected on active tab", () => {
      renderTabs({ defaultValue: "tab1" });
      expect(screen.getByRole("tab", { name: "Tab 1" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      expect(screen.getByRole("tab", { name: "Tab 2" })).toHaveAttribute(
        "aria-selected",
        "false"
      );
    });

    it("sets aria-controls on tab triggers", () => {
      renderTabs();
      expect(screen.getByRole("tab", { name: "Tab 1" })).toHaveAttribute(
        "aria-controls",
        "panel-tab1"
      );
    });

    it("disabled tab has disabled attribute", () => {
      renderTabs();
      expect(screen.getByRole("tab", { name: "Tab 3" })).toBeDisabled();
    });

    it("tab triggers have type='button'", () => {
      renderTabs();
      const tabs = screen.getAllByRole("tab");
      for (const tab of tabs) {
        expect(tab).toHaveAttribute("type", "button");
      }
    });
  });

  describe("Controlled mode", () => {
    it("respects controlled value prop", () => {
      render(
        <Tabs value="tab2">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );
      expect(screen.queryByText("Content 1")).not.toBeInTheDocument();
      expect(screen.getByText("Content 2")).toBeInTheDocument();
    });
  });

  describe("Variants", () => {
    it("renders with pills variant", () => {
      render(
        <Tabs defaultValue="a" variant="pills">
          <TabsList>
            <TabsTrigger value="a">A</TabsTrigger>
          </TabsList>
          <TabsContent value="a">A content</TabsContent>
        </Tabs>
      );
      expect(screen.getByRole("tablist").className).toContain("rounded-lg");
    });

    it("renders with line variant (default)", () => {
      render(
        <Tabs defaultValue="a" variant="line">
          <TabsList>
            <TabsTrigger value="a">A</TabsTrigger>
          </TabsList>
          <TabsContent value="a">A content</TabsContent>
        </Tabs>
      );
      expect(screen.getByRole("tablist").className).toContain("border-b");
    });
  });

  describe("Icon support", () => {
    it("renders icon in tab trigger", () => {
      render(
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a" icon={<span data-testid="tab-icon">I</span>}>
              With Icon
            </TabsTrigger>
          </TabsList>
          <TabsContent value="a">Content</TabsContent>
        </Tabs>
      );
      expect(screen.getByTestId("tab-icon")).toBeInTheDocument();
    });
  });
});
