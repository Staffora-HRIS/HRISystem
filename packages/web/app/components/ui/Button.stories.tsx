import type { Meta, StoryObj } from "@storybook/react";
import { Button, IconButton, ButtonGroup } from "./button";

/**
 * The Button component is the primary interactive element used throughout
 * the Staffora HRIS. It supports multiple variants, sizes, loading states,
 * icons, and full-width mode.
 */
const meta: Meta<typeof Button> = {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "outline", "ghost", "danger", "success"],
      description: "Visual style of the button",
    },
    size: {
      control: "select",
      options: ["xs", "sm", "md", "lg", "xl"],
      description: "Size of the button",
    },
    loading: {
      control: "boolean",
      description: "Shows a spinner and disables interaction",
    },
    disabled: {
      control: "boolean",
      description: "Disables the button",
    },
    fullWidth: {
      control: "boolean",
      description: "Makes the button span the full width of its container",
    },
    children: {
      control: "text",
      description: "Button label text",
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

// -- Variants --

export const Primary: Story = {
  args: {
    variant: "primary",
    children: "Primary Button",
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Secondary Button",
  },
};

export const Outline: Story = {
  args: {
    variant: "outline",
    children: "Outline Button",
  },
};

export const Ghost: Story = {
  args: {
    variant: "ghost",
    children: "Ghost Button",
  },
};

export const Danger: Story = {
  args: {
    variant: "danger",
    children: "Delete Record",
  },
};

export const Success: Story = {
  args: {
    variant: "success",
    children: "Approve Request",
  },
};

// -- Sizes --

export const ExtraSmall: Story = {
  args: {
    size: "xs",
    children: "Extra Small",
  },
};

export const Small: Story = {
  args: {
    size: "sm",
    children: "Small",
  },
};

export const Medium: Story = {
  args: {
    size: "md",
    children: "Medium (default)",
  },
};

export const Large: Story = {
  args: {
    size: "lg",
    children: "Large",
  },
};

export const ExtraLarge: Story = {
  args: {
    size: "xl",
    children: "Extra Large",
  },
};

// -- States --

export const Loading: Story = {
  args: {
    loading: true,
    children: "Saving...",
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    children: "Disabled",
  },
};

export const FullWidth: Story = {
  args: {
    fullWidth: true,
    children: "Full Width Button",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 400 }}>
        <Story />
      </div>
    ),
  ],
};

// -- With Icons --

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M3 10a.75.75 0 01.75-.75h10.638l-3.96-3.96a.75.75 0 111.06-1.06l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06l3.96-3.96H3.75A.75.75 0 013 10z"
      clipRule="evenodd"
    />
  </svg>
);

export const WithLeftIcon: Story = {
  args: {
    leftIcon: <PlusIcon />,
    children: "Add Employee",
  },
};

export const WithRightIcon: Story = {
  args: {
    rightIcon: <ArrowRightIcon />,
    children: "Continue",
  },
};

export const WithBothIcons: Story = {
  args: {
    leftIcon: <PlusIcon />,
    rightIcon: <ArrowRightIcon />,
    children: "Add and Continue",
  },
};

// -- All Variants Gallery --

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="success">Success</Button>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="xs">Extra Small</Button>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button size="xl">Extra Large</Button>
    </div>
  ),
};

// -- IconButton --

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
      clipRule="evenodd"
    />
  </svg>
);

const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
  </svg>
);

export const IconButtons: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <IconButton icon={<EditIcon />} aria-label="Edit record" variant="ghost" />
      <IconButton icon={<TrashIcon />} aria-label="Delete record" variant="ghost" />
      <IconButton icon={<PlusIcon />} aria-label="Add item" variant="primary" />
      <IconButton icon={<EditIcon />} aria-label="Edit (disabled)" variant="ghost" disabled />
      <IconButton icon={<PlusIcon />} aria-label="Loading" variant="primary" loading />
    </div>
  ),
};

// -- ButtonGroup --

export const GroupedButtons: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">Day</Button>
      <Button variant="outline">Week</Button>
      <Button variant="outline">Month</Button>
    </ButtonGroup>
  ),
};
