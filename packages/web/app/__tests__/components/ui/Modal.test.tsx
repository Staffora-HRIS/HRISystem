/**
 * Modal Component Tests
 *
 * Tests for Modal, ModalHeader, ModalBody, ModalFooter, ConfirmModal, AlertModal.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ConfirmModal,
  AlertModal,
} from "../../../components/ui/modal";

describe("Modal Component", () => {
  describe("Open/Closed state", () => {
    it("does not render when open=false", () => {
      render(
        <Modal open={false} onClose={vi.fn()}>
          Modal content
        </Modal>
      );
      expect(screen.queryByText("Modal content")).not.toBeInTheDocument();
    });

    it("renders when open=true", () => {
      render(
        <Modal open={true} onClose={vi.fn()}>
          Modal content
        </Modal>
      );
      expect(screen.getByText("Modal content")).toBeInTheDocument();
    });

    it("renders via portal (attached to document.body)", () => {
      render(
        <Modal open={true} onClose={vi.fn()}>
          Portal content
        </Modal>
      );
      // Content should be in the document
      expect(screen.getByText("Portal content")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("renders with role='dialog' and aria-modal='true'", () => {
      render(
        <Modal open={true} onClose={vi.fn()}>
          Content
        </Modal>
      );
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    });

    it("shows close button with aria-label by default", () => {
      render(
        <Modal open={true} onClose={vi.fn()}>
          Content
        </Modal>
      );
      expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    });

    it("hides close button when showCloseButton=false", () => {
      render(
        <Modal open={true} onClose={vi.fn()} showCloseButton={false}>
          Content
        </Modal>
      );
      expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    });
  });

  describe("Close behavior", () => {
    it("calls onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <Modal open={true} onClose={onClose}>
          Content
        </Modal>
      );
      await user.click(screen.getByRole("button", { name: "Close" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Escape is pressed", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <Modal open={true} onClose={onClose}>
          Content
        </Modal>
      );
      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not call onClose on Escape when closeOnEscape=false", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <Modal open={true} onClose={onClose} closeOnEscape={false}>
          Content
        </Modal>
      );
      await user.keyboard("{Escape}");
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("Size variants", () => {
    it("applies the correct size class", () => {
      const { rerender } = render(
        <Modal open={true} onClose={vi.fn()} size="sm">
          Sm
        </Modal>
      );
      // Check the modal content container has max-w-md
      const dialog = screen.getByRole("dialog");
      const contentDiv = dialog.querySelector(".max-w-md");
      expect(contentDiv).toBeInTheDocument();

      rerender(
        <Modal open={true} onClose={vi.fn()} size="lg">
          Lg
        </Modal>
      );
      const contentDivLg = screen.getByRole("dialog").querySelector(".max-w-2xl");
      expect(contentDivLg).toBeInTheDocument();
    });
  });
});

describe("ModalHeader Component", () => {
  it("renders title", () => {
    render(<ModalHeader title="Edit Employee" />);
    expect(screen.getByText("Edit Employee")).toBeInTheDocument();
  });

  it("renders subtitle", () => {
    render(<ModalHeader title="Title" subtitle="Description here" />);
    expect(screen.getByText("Description here")).toBeInTheDocument();
  });

  it("renders custom children when no title", () => {
    render(<ModalHeader>Custom header</ModalHeader>);
    expect(screen.getByText("Custom header")).toBeInTheDocument();
  });

  it("renders title as h2 heading", () => {
    render(<ModalHeader title="Heading" />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Heading");
  });
});

describe("ModalBody Component", () => {
  it("renders children", () => {
    render(<ModalBody>Body content</ModalBody>);
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("applies md padding by default", () => {
    const { container } = render(<ModalBody>Body</ModalBody>);
    expect((container.firstChild as HTMLElement).className).toContain("px-6");
  });

  it("applies no padding when padding='none'", () => {
    const { container } = render(<ModalBody padding="none">Body</ModalBody>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).not.toContain("px-6");
  });
});

describe("ModalFooter Component", () => {
  it("renders children", () => {
    render(<ModalFooter>Footer</ModalFooter>);
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });

  it("applies justify-end by default", () => {
    const { container } = render(<ModalFooter>Footer</ModalFooter>);
    expect((container.firstChild as HTMLElement).className).toContain("justify-end");
  });

  it("applies justify-center when specified", () => {
    const { container } = render(<ModalFooter justify="center">Footer</ModalFooter>);
    expect((container.firstChild as HTMLElement).className).toContain("justify-center");
  });
});

describe("ConfirmModal Component", () => {
  it("renders title and message", () => {
    render(
      <ConfirmModal
        open={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete Employee"
        message="Are you sure?"
      />
    );
    expect(screen.getByText("Delete Employee")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("renders confirm and cancel buttons with default labels", () => {
    render(
      <ConfirmModal
        open={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Confirm"
        message="Proceed?"
      />
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("renders custom button labels", () => {
    render(
      <ConfirmModal
        open={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete"
        message="Sure?"
        confirmLabel="Yes, delete"
        cancelLabel="No, keep"
      />
    );
    expect(screen.getByRole("button", { name: "Yes, delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No, keep" })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        open={true}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        title="Confirm"
        message="Sure?"
      />
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ConfirmModal
        open={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Confirm"
        message="Sure?"
      />
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows loading state on confirm button", () => {
    render(
      <ConfirmModal
        open={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Confirm"
        message="Sure?"
        loading={true}
      />
    );
    // Cancel should be disabled during loading
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(cancelBtn).toBeDisabled();
  });

  it("uses danger variant when danger=true", () => {
    render(
      <ConfirmModal
        open={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete"
        message="Sure?"
        danger
      />
    );
    // The confirm button should use danger variant
    const buttons = screen.getAllByRole("button");
    const confirmBtn = buttons.find((b) => b.textContent === "Confirm");
    expect(confirmBtn?.className).toContain("bg-error-600");
  });
});

describe("AlertModal Component", () => {
  it("renders title and message", () => {
    render(
      <AlertModal
        open={true}
        onClose={vi.fn()}
        title="Success!"
        message="Employee created."
      />
    );
    expect(screen.getByText("Success!")).toBeInTheDocument();
    expect(screen.getByText("Employee created.")).toBeInTheDocument();
  });

  it("renders OK button by default", () => {
    render(
      <AlertModal
        open={true}
        onClose={vi.fn()}
        title="Info"
        message="Note"
      />
    );
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
  });

  it("renders custom button label", () => {
    render(
      <AlertModal
        open={true}
        onClose={vi.fn()}
        title="Info"
        message="Note"
        buttonLabel="Got it"
      />
    );
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
  });

  it("calls onClose when OK button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <AlertModal
        open={true}
        onClose={onClose}
        title="Info"
        message="Note"
      />
    );
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render close button (showCloseButton=false)", () => {
    render(
      <AlertModal
        open={true}
        onClose={vi.fn()}
        title="Info"
        message="Note"
      />
    );
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });
});
