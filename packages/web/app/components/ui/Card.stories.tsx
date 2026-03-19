import type { Meta, StoryObj } from "@storybook/react";
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  StatCard,
  ListCard,
} from "./card";
import { Button } from "./button";

/**
 * The Card component is a flexible container used throughout the Staffora HRIS
 * to group related content. It supports multiple variants (default, bordered,
 * elevated, flat), padding options, and interactive states (hoverable, clickable,
 * selected). Composed with CardHeader, CardBody, and CardFooter for consistent
 * layout. Also includes pre-built StatCard and ListCard for common dashboard
 * use cases.
 */
const meta: Meta<typeof Card> = {
  title: "UI/Card",
  component: Card,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "bordered", "elevated", "flat"],
      description: "Visual style of the card",
    },
    padding: {
      control: "select",
      options: ["none", "sm", "md", "lg"],
      description: "Internal padding applied to the card",
    },
    hoverable: {
      control: "boolean",
      description: "Adds a hover shadow effect",
    },
    clickable: {
      control: "boolean",
      description: "Adds hover shadow and a subtle press animation",
    },
    selected: {
      control: "boolean",
      description: "Shows a primary-coloured ring around the card",
    },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

// -- Variants --

export const Default: Story = {
  args: {
    variant: "default",
    children: (
      <CardBody>
        <p className="text-gray-600 dark:text-gray-300">
          Default card with a subtle border and shadow.
        </p>
      </CardBody>
    ),
  },
};

export const Bordered: Story = {
  args: {
    variant: "bordered",
    children: (
      <CardBody>
        <p className="text-gray-600 dark:text-gray-300">
          Bordered card with a heavier 2px border.
        </p>
      </CardBody>
    ),
  },
};

export const Elevated: Story = {
  args: {
    variant: "elevated",
    children: (
      <CardBody>
        <p className="text-gray-600 dark:text-gray-300">
          Elevated card with a prominent shadow and no border.
        </p>
      </CardBody>
    ),
  },
};

export const Flat: Story = {
  args: {
    variant: "flat",
    children: (
      <CardBody>
        <p className="text-gray-600 dark:text-gray-300">
          Flat card with a subtle background tint.
        </p>
      </CardBody>
    ),
  },
};

// -- All Variants Gallery --

export const AllVariants: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4" style={{ width: 600 }}>
      {(["default", "bordered", "elevated", "flat"] as const).map((variant) => (
        <Card key={variant} variant={variant}>
          <CardBody>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {variant.charAt(0).toUpperCase() + variant.slice(1)}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              variant=&quot;{variant}&quot;
            </p>
          </CardBody>
        </Card>
      ))}
    </div>
  ),
};

// -- Padding --

export const PaddingNone: Story = {
  args: {
    padding: "none",
    variant: "default",
    children: (
      <div className="bg-primary-50 p-4 text-sm text-primary-700">
        padding=&quot;none&quot; - content touches card edges
      </div>
    ),
  },
};

export const PaddingSmall: Story = {
  args: {
    padding: "sm",
    variant: "default",
    children: (
      <p className="text-sm text-gray-600 dark:text-gray-300">
        padding=&quot;sm&quot; - compact spacing
      </p>
    ),
  },
};

export const PaddingMedium: Story = {
  args: {
    padding: "md",
    variant: "default",
    children: (
      <p className="text-sm text-gray-600 dark:text-gray-300">
        padding=&quot;md&quot; - standard spacing
      </p>
    ),
  },
};

export const PaddingLarge: Story = {
  args: {
    padding: "lg",
    variant: "default",
    children: (
      <p className="text-sm text-gray-600 dark:text-gray-300">
        padding=&quot;lg&quot; - generous spacing
      </p>
    ),
  },
};

// -- Interactive States --

export const Hoverable: Story = {
  args: {
    hoverable: true,
    children: (
      <CardBody>
        <p className="text-gray-600 dark:text-gray-300">
          Hover over this card to see the shadow effect.
        </p>
      </CardBody>
    ),
  },
};

export const Clickable: Story = {
  args: {
    clickable: true,
    onClick: () => alert("Card clicked!"),
    children: (
      <CardBody>
        <p className="text-gray-600 dark:text-gray-300">
          Click this card to see the press animation.
        </p>
      </CardBody>
    ),
  },
};

export const Selected: Story = {
  args: {
    selected: true,
    children: (
      <CardBody>
        <p className="text-gray-600 dark:text-gray-300">
          This card is in a selected state with a primary ring.
        </p>
      </CardBody>
    ),
  },
};

// -- Composed Layout --

export const WithHeaderAndFooter: Story = {
  render: () => (
    <div style={{ width: 400 }}>
      <Card>
        <CardHeader
          title="Employee Details"
          subtitle="Personal information and contact details"
          bordered
        />
        <CardBody>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Name</dt>
              <dd className="font-medium text-gray-900 dark:text-white">Jane Smith</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Department</dt>
              <dd className="font-medium text-gray-900 dark:text-white">Engineering</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">Start date</dt>
              <dd className="font-medium text-gray-900 dark:text-white">15 Jan 2024</dd>
            </div>
          </dl>
        </CardBody>
        <CardFooter bordered>
          <Button variant="outline" size="sm">
            View Profile
          </Button>
          <Button size="sm">Edit</Button>
        </CardFooter>
      </Card>
    </div>
  ),
};

export const HeaderWithAction: Story = {
  render: () => (
    <div style={{ width: 400 }}>
      <Card>
        <CardHeader
          title="Recent Activity"
          subtitle="Last 7 days"
          action={<Button variant="ghost" size="sm">View All</Button>}
          bordered
        />
        <CardBody>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Activity items would appear here.
          </p>
        </CardBody>
      </Card>
    </div>
  ),
};

// -- Footer Justification --

export const FooterJustifyStart: Story = {
  render: () => (
    <div style={{ width: 400 }}>
      <Card>
        <CardBody>
          <p className="text-sm text-gray-600 dark:text-gray-300">justify=&quot;start&quot;</p>
        </CardBody>
        <CardFooter bordered justify="start">
          <Button variant="outline" size="sm">Cancel</Button>
          <Button size="sm">Save</Button>
        </CardFooter>
      </Card>
    </div>
  ),
};

export const FooterJustifyBetween: Story = {
  render: () => (
    <div style={{ width: 400 }}>
      <Card>
        <CardBody>
          <p className="text-sm text-gray-600 dark:text-gray-300">justify=&quot;between&quot;</p>
        </CardBody>
        <CardFooter bordered justify="between">
          <Button variant="ghost" size="sm">Delete</Button>
          <div className="flex gap-3">
            <Button variant="outline" size="sm">Cancel</Button>
            <Button size="sm">Save</Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  ),
};

// -- StatCard --

const UsersIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-6 w-6"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const ClockIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-6 w-6"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export const StatCardBasic: StoryObj<typeof StatCard> = {
  render: (args) => (
    <div style={{ width: 300 }}>
      <StatCard {...args} />
    </div>
  ),
  args: {
    title: "Total Employees",
    value: 247,
    icon: <UsersIcon />,
  },
};

export const StatCardWithIncrease: StoryObj<typeof StatCard> = {
  render: (args) => (
    <div style={{ width: 300 }}>
      <StatCard {...args} />
    </div>
  ),
  args: {
    title: "Total Employees",
    value: 247,
    change: { value: 12, type: "increase" },
    icon: <UsersIcon />,
    description: "vs. last month",
  },
};

export const StatCardWithDecrease: StoryObj<typeof StatCard> = {
  render: (args) => (
    <div style={{ width: 300 }}>
      <StatCard {...args} />
    </div>
  ),
  args: {
    title: "Open Absence Requests",
    value: 8,
    change: { value: 3, type: "decrease" },
    icon: <ClockIcon />,
    description: "vs. last week",
  },
};

export const StatCardNeutral: StoryObj<typeof StatCard> = {
  render: (args) => (
    <div style={{ width: 300 }}>
      <StatCard {...args} />
    </div>
  ),
  args: {
    title: "Departments",
    value: 12,
    change: { value: 0, type: "neutral" },
    description: "No change",
  },
};

export const StatCardDashboard: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4" style={{ width: 960 }}>
      <StatCard
        title="Total Employees"
        value={247}
        change={{ value: 12, type: "increase" }}
        icon={<UsersIcon />}
        description="vs. last month"
      />
      <StatCard
        title="Open Absence Requests"
        value={8}
        change={{ value: 3, type: "decrease" }}
        icon={<ClockIcon />}
        description="vs. last week"
      />
      <StatCard
        title="Departments"
        value={12}
        change={{ value: 0, type: "neutral" }}
        description="No change"
      />
    </div>
  ),
};

// -- ListCard --

interface Employee {
  name: string;
  role: string;
  department: string;
}

const sampleEmployees: Employee[] = [
  { name: "Jane Smith", role: "Software Engineer", department: "Engineering" },
  { name: "Tom Wilson", role: "Product Designer", department: "Design" },
  { name: "Sarah Johnson", role: "HR Manager", department: "People" },
  { name: "Mark Davis", role: "QA Lead", department: "Engineering" },
  { name: "Emily Chen", role: "Finance Analyst", department: "Finance" },
];

export const ListCardDefault: Story = {
  render: () => (
    <div style={{ width: 400 }}>
      <ListCard<Employee>
        title="Recent Joiners"
        items={sampleEmployees.slice(0, 3)}
        renderItem={(emp) => (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {emp.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{emp.role}</p>
            </div>
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/20 dark:text-primary-300">
              {emp.department}
            </span>
          </div>
        )}
      />
    </div>
  ),
};

export const ListCardWithAction: Story = {
  render: () => (
    <div style={{ width: 400 }}>
      <ListCard<Employee>
        title="Team Members"
        items={sampleEmployees}
        action={<Button variant="ghost" size="sm">Add Member</Button>}
        maxItems={3}
        renderItem={(emp) => (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {emp.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {emp.role} - {emp.department}
              </p>
            </div>
          </div>
        )}
      />
    </div>
  ),
};

export const ListCardEmpty: Story = {
  render: () => (
    <div style={{ width: 400 }}>
      <ListCard<Employee>
        title="Pending Approvals"
        items={[]}
        emptyMessage="No pending approvals at this time."
        renderItem={() => null}
      />
    </div>
  ),
};
