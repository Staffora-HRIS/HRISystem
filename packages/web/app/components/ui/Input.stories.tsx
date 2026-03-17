import type { Meta, StoryObj } from "@storybook/react";
import { Input, Textarea, Select, Checkbox, Radio, RadioGroup } from "./input";

/**
 * The Input component provides form inputs with support for labels, validation
 * errors, hints, icons, and addons. It integrates with React Hook Form and
 * follows WCAG accessibility standards with proper labelling and ARIA attributes.
 */
const meta: Meta<typeof Input> = {
  title: "UI/Input",
  component: Input,
  tags: ["autodocs"],
  argTypes: {
    label: {
      control: "text",
      description: "Label displayed above the input",
    },
    error: {
      control: "text",
      description: "Error message displayed below the input",
    },
    hint: {
      control: "text",
      description: "Hint text displayed below the input (hidden when error is present)",
    },
    inputSize: {
      control: "select",
      options: ["sm", "md", "lg"],
      description: "Size of the input field",
    },
    disabled: {
      control: "boolean",
      description: "Disables the input",
    },
    required: {
      control: "boolean",
      description: "Marks the field as required with an asterisk",
    },
    fullWidth: {
      control: "boolean",
      description: "Makes the input span the full container width",
    },
    placeholder: {
      control: "text",
      description: "Placeholder text",
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Input>;

// -- Basic --

export const Default: Story = {
  args: {
    label: "Email address",
    placeholder: "you@company.co.uk",
    type: "email",
    name: "email",
  },
};

export const WithHint: Story = {
  args: {
    label: "Employee ID",
    placeholder: "EMP-001",
    hint: "The unique identifier assigned during onboarding.",
    name: "employeeId",
  },
};

export const Required: Story = {
  args: {
    label: "Full name",
    placeholder: "Jane Smith",
    required: true,
    name: "fullName",
  },
};

export const WithError: Story = {
  args: {
    label: "Email address",
    placeholder: "you@company.co.uk",
    type: "email",
    name: "email",
    value: "not-an-email",
    error: "Please enter a valid email address.",
  },
};

export const Disabled: Story = {
  args: {
    label: "Department",
    value: "Engineering",
    disabled: true,
    name: "department",
  },
};

// -- Sizes --

export const SizeSmall: Story = {
  args: {
    label: "Small input",
    inputSize: "sm",
    placeholder: "Small",
    name: "small",
  },
};

export const SizeMedium: Story = {
  args: {
    label: "Medium input (default)",
    inputSize: "md",
    placeholder: "Medium",
    name: "medium",
  },
};

export const SizeLarge: Story = {
  args: {
    label: "Large input",
    inputSize: "lg",
    placeholder: "Large",
    name: "large",
  },
};

// -- With Icons --

const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
      clipRule="evenodd"
    />
  </svg>
);

const MailIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
    <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
    <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
  </svg>
);

export const WithLeftIcon: Story = {
  args: {
    label: "Search employees",
    leftIcon: <SearchIcon />,
    placeholder: "Search by name or ID...",
    name: "search",
  },
};

export const WithRightIcon: Story = {
  args: {
    label: "Email",
    rightIcon: <MailIcon />,
    placeholder: "you@company.co.uk",
    type: "email",
    name: "email",
  },
};

// -- With Addons --

export const WithLeftAddon: Story = {
  args: {
    label: "Website",
    leftAddon: "https://",
    placeholder: "staffora.co.uk",
    name: "website",
  },
};

export const WithRightAddon: Story = {
  args: {
    label: "Salary",
    rightAddon: "GBP",
    placeholder: "45,000",
    type: "text",
    name: "salary",
  },
};

export const WithBothAddons: Story = {
  args: {
    label: "Price",
    leftAddon: "\u00a3",
    rightAddon: ".00",
    placeholder: "0",
    type: "text",
    name: "price",
  },
};

// -- Textarea --

export const TextareaDefault: StoryObj<typeof Textarea> = {
  render: (args) => <Textarea {...args} />,
  args: {
    label: "Notes",
    placeholder: "Add any additional notes about this employee...",
    name: "notes",
    rows: 4,
  },
};

export const TextareaWithError: StoryObj<typeof Textarea> = {
  render: (args) => <Textarea {...args} />,
  args: {
    label: "Reason for absence",
    placeholder: "Please describe the reason...",
    name: "reason",
    required: true,
    error: "This field is required.",
    rows: 3,
  },
};

// -- Select --

export const SelectDefault: StoryObj<typeof Select> = {
  render: (args) => <Select {...args} />,
  args: {
    label: "Department",
    name: "department",
    placeholder: "Select a department",
    options: [
      { value: "engineering", label: "Engineering" },
      { value: "design", label: "Design" },
      { value: "product", label: "Product" },
      { value: "hr", label: "Human Resources" },
      { value: "finance", label: "Finance" },
    ],
  },
};

export const SelectWithError: StoryObj<typeof Select> = {
  render: (args) => <Select {...args} />,
  args: {
    label: "Employment type",
    name: "employmentType",
    required: true,
    placeholder: "Select type",
    error: "Please select an employment type.",
    options: [
      { value: "full-time", label: "Full-time" },
      { value: "part-time", label: "Part-time" },
      { value: "contract", label: "Contract" },
      { value: "intern", label: "Internship" },
    ],
  },
};

// -- Checkbox --

export const CheckboxDefault: StoryObj<typeof Checkbox> = {
  render: (args) => <Checkbox {...args} />,
  args: {
    label: "Send email notification",
    name: "notify",
  },
};

export const CheckboxWithDescription: StoryObj<typeof Checkbox> = {
  render: (args) => <Checkbox {...args} />,
  args: {
    label: "Enable MFA",
    description: "Require multi-factor authentication for this user account.",
    name: "mfa",
  },
};

export const CheckboxWithError: StoryObj<typeof Checkbox> = {
  render: (args) => <Checkbox {...args} />,
  args: {
    label: "I agree to the terms and conditions",
    error: "You must agree to continue.",
    name: "terms",
  },
};

// -- Radio --

export const RadioDefault: StoryObj<typeof Radio> = {
  render: (args) => <Radio {...args} />,
  args: {
    label: "Full-time",
    name: "type",
    value: "full-time",
  },
};

// -- RadioGroup --

export const RadioGroupVertical: StoryObj<typeof RadioGroup> = {
  render: (args) => <RadioGroup {...args} />,
  args: {
    label: "Employment type",
    name: "employmentType",
    value: "full-time",
    orientation: "vertical",
    options: [
      { value: "full-time", label: "Full-time", description: "Standard 37.5 hours per week" },
      { value: "part-time", label: "Part-time", description: "Less than 37.5 hours per week" },
      { value: "contract", label: "Contract", description: "Fixed-term or project-based" },
    ],
  },
};

export const RadioGroupHorizontal: StoryObj<typeof RadioGroup> = {
  render: (args) => <RadioGroup {...args} />,
  args: {
    label: "Leave type",
    name: "leaveType",
    value: "annual",
    orientation: "horizontal",
    options: [
      { value: "annual", label: "Annual" },
      { value: "sick", label: "Sick" },
      { value: "compassionate", label: "Compassionate" },
    ],
  },
};

// -- Composition --

export const FormExample: Story = {
  render: () => (
    <div className="space-y-4">
      <Input label="Full name" placeholder="Jane Smith" required name="name" />
      <Input
        label="Work email"
        placeholder="jane.smith@company.co.uk"
        type="email"
        required
        name="email"
      />
      <Select
        label="Department"
        name="department"
        required
        placeholder="Select a department"
        options={[
          { value: "engineering", label: "Engineering" },
          { value: "design", label: "Design" },
          { value: "hr", label: "Human Resources" },
        ]}
      />
      <Textarea label="Notes" placeholder="Optional notes..." name="notes" rows={3} />
      <Checkbox
        label="Send welcome email"
        description="The employee will receive an onboarding email."
        name="welcome"
      />
    </div>
  ),
  decorators: [
    (Story) => (
      <div style={{ width: 400 }}>
        <Story />
      </div>
    ),
  ],
};
