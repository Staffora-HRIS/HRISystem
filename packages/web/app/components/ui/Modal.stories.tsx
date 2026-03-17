import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ConfirmModal,
  AlertModal,
} from "./modal";
import { Button } from "./button";
import { Input, Select } from "./input";

/**
 * The Modal component renders an accessible dialog overlay with support for
 * different sizes, keyboard dismissal, overlay click handling, and scroll
 * locking. Composed with ModalHeader, ModalBody, and ModalFooter for
 * consistent layout. Also includes pre-built ConfirmModal and AlertModal
 * for common use cases.
 */
const meta: Meta<typeof Modal> = {
  title: "UI/Modal",
  component: Modal,
  tags: ["autodocs"],
  argTypes: {
    open: {
      control: "boolean",
      description: "Controls the visibility of the modal",
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg", "xl", "full"],
      description: "Width of the modal dialog",
    },
    closeOnOverlayClick: {
      control: "boolean",
      description: "Whether clicking the overlay closes the modal",
    },
    closeOnEscape: {
      control: "boolean",
      description: "Whether pressing Escape closes the modal",
    },
    showCloseButton: {
      control: "boolean",
      description: "Whether to show the close (X) button",
    },
  },
  // Modals use portals so we need a padded container
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof Modal>;

// -- Interactive Default --

function DefaultModalDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Button onClick={() => setOpen(true)}>Open Modal</Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalHeader title="Modal Title" subtitle="A brief description of this dialog." />
        <ModalBody>
          <p className="text-gray-600 dark:text-gray-300">
            This is the modal body content. It can contain any React elements including forms,
            tables, or informational text.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setOpen(false)}>Save Changes</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export const Default: Story = {
  render: () => <DefaultModalDemo />,
};

// -- Sizes --

function SizeDemo({ size }: { size: "sm" | "md" | "lg" | "xl" | "full" }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Button onClick={() => setOpen(true)}>Open {size} modal</Button>
      <Modal open={open} onClose={() => setOpen(false)} size={size}>
        <ModalHeader title={`${size.toUpperCase()} Modal`} subtitle={`This modal uses size="${size}".`} />
        <ModalBody>
          <p className="text-gray-600 dark:text-gray-300">
            The content area adjusts to the max-width defined by the size prop.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export const Small: Story = {
  render: () => <SizeDemo size="sm" />,
};

export const Medium: Story = {
  render: () => <SizeDemo size="md" />,
};

export const Large: Story = {
  render: () => <SizeDemo size="lg" />,
};

export const ExtraLarge: Story = {
  render: () => <SizeDemo size="xl" />,
};

export const FullSize: Story = {
  render: () => <SizeDemo size="full" />,
};

// -- With Form Content --

function FormModalDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Button onClick={() => setOpen(true)}>Add Employee</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="lg">
        <ModalHeader
          title="Add New Employee"
          subtitle="Fill in the details below to create a new employee record."
        />
        <ModalBody>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First name" placeholder="Jane" required name="firstName" />
              <Input label="Last name" placeholder="Smith" required name="lastName" />
            </div>
            <Input
              label="Email address"
              placeholder="jane.smith@company.co.uk"
              type="email"
              required
              name="email"
            />
            <Select
              label="Department"
              name="department"
              placeholder="Select a department"
              options={[
                { value: "engineering", label: "Engineering" },
                { value: "design", label: "Design" },
                { value: "product", label: "Product" },
                { value: "hr", label: "Human Resources" },
                { value: "finance", label: "Finance" },
              ]}
            />
            <Select
              label="Employment type"
              name="type"
              placeholder="Select type"
              options={[
                { value: "full-time", label: "Full-time" },
                { value: "part-time", label: "Part-time" },
                { value: "contract", label: "Contract" },
              ]}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setOpen(false)}>Create Employee</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export const WithForm: Story = {
  render: () => <FormModalDemo />,
};

// -- Scrollable Content --

function ScrollableModalDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Button onClick={() => setOpen(true)}>Open Scrollable Modal</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="md">
        <ModalHeader title="Privacy Policy" subtitle="Last updated: March 2026" />
        <ModalBody>
          <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
            {Array.from({ length: 10 }, (_, i) => (
              <p key={i}>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
                tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam,
                quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
                consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse
                cillum dolore eu fugiat nulla pariatur.
              </p>
            ))}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Decline
          </Button>
          <Button onClick={() => setOpen(false)}>Accept</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export const ScrollableContent: Story = {
  render: () => <ScrollableModalDemo />,
};

// -- No Close Button --

function NoCloseButtonDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Button onClick={() => setOpen(true)}>Open Modal (no X)</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        showCloseButton={false}
        closeOnOverlayClick={false}
      >
        <ModalHeader title="Mandatory Action" />
        <ModalBody>
          <p className="text-gray-600 dark:text-gray-300">
            This modal has no close button and cannot be dismissed by clicking the overlay.
            You must use the button below to close it.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button onClick={() => setOpen(false)}>I Understand</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export const NoCloseButton: Story = {
  render: () => <NoCloseButtonDemo />,
};

// -- Confirm Modal --

function ConfirmModalDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete Employee
      </Button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
        title="Delete Employee Record"
        message="Are you sure you want to delete this employee record? This action cannot be undone and all associated data will be permanently removed."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

export const Confirmation: Story = {
  render: () => <ConfirmModalDemo />,
};

function ConfirmModalLoadingDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete with Loading
      </Button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {}}
        title="Deleting..."
        message="Please wait while the record is being deleted."
        confirmLabel="Deleting..."
        danger
        loading
      />
    </div>
  );
}

export const ConfirmationLoading: Story = {
  render: () => <ConfirmModalLoadingDemo />,
};

// -- Alert Modal --

function AlertModalInfoDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Button onClick={() => setOpen(true)}>Show Info Alert</Button>
      <AlertModal
        open={open}
        onClose={() => setOpen(false)}
        title="Information"
        message="Your changes have been saved successfully."
        type="info"
      />
    </div>
  );
}

export const AlertInfo: Story = {
  render: () => <AlertModalInfoDemo />,
};

function AlertModalSuccessDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Button variant="success" onClick={() => setOpen(true)}>
        Show Success Alert
      </Button>
      <AlertModal
        open={open}
        onClose={() => setOpen(false)}
        title="Success"
        message="The employee has been onboarded successfully."
        type="success"
      />
    </div>
  );
}

export const AlertSuccess: Story = {
  render: () => <AlertModalSuccessDemo />,
};

function AlertModalWarningDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Button variant="outline" onClick={() => setOpen(true)}>
        Show Warning Alert
      </Button>
      <AlertModal
        open={open}
        onClose={() => setOpen(false)}
        title="Warning"
        message="This employee's right-to-work documentation will expire in 30 days. Please request updated documents."
        type="warning"
      />
    </div>
  );
}

export const AlertWarning: Story = {
  render: () => <AlertModalWarningDemo />,
};

function AlertModalErrorDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Button variant="danger" onClick={() => setOpen(true)}>
        Show Error Alert
      </Button>
      <AlertModal
        open={open}
        onClose={() => setOpen(false)}
        title="Error"
        message="Failed to submit the leave request. Please check your connection and try again."
        type="error"
        buttonLabel="Dismiss"
      />
    </div>
  );
}

export const AlertError: Story = {
  render: () => <AlertModalErrorDemo />,
};
