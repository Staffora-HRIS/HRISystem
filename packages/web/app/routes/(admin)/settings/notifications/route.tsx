import { useState } from "react";
import {
  Mail,
  Monitor,
  Clock,
  Save,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Checkbox,
  Select,
  Input,
  useToast,
} from "~/components/ui";

interface NotificationOption {
  id: string;
  label: string;
  description: string;
}

const NOTIFICATION_OPTIONS: NotificationOption[] = [
  {
    id: "leave_requests",
    label: "New leave requests",
    description: "Notify when employees submit leave requests",
  },
  {
    id: "leave_approvals",
    label: "Leave approvals",
    description: "Notify when leave requests are approved or rejected",
  },
  {
    id: "case_updates",
    label: "Case updates",
    description: "Notify on case status changes and new comments",
  },
  {
    id: "onboarding_tasks",
    label: "Onboarding tasks",
    description: "Notify about new and overdue onboarding tasks",
  },
  {
    id: "performance_reviews",
    label: "Performance reviews",
    description: "Notify when performance review cycles begin or end",
  },
  {
    id: "system_alerts",
    label: "System alerts",
    description: "Critical system notifications and security alerts",
  },
];

const DIGEST_OPTIONS = [
  { value: "real_time", label: "Real-time" },
  { value: "hourly", label: "Hourly digest" },
  { value: "daily", label: "Daily digest" },
  { value: "weekly", label: "Weekly digest" },
];

export default function NotificationSettingsPage() {
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate save
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast.success("Settings saved successfully");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Notification Settings
          </h1>
          <p className="text-gray-600">
            Configure how and when you receive notifications
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold">Email Notifications</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {NOTIFICATION_OPTIONS.map((option) => (
              <div key={option.id} className="flex items-start gap-3">
                <Checkbox
                  id={`email_${option.id}`}
                  defaultChecked={true}
                  aria-label={`Email: ${option.label}`}
                />
                <label
                  htmlFor={`email_${option.id}`}
                  className="cursor-pointer"
                >
                  <p className="text-sm font-medium text-gray-900">
                    {option.label}
                  </p>
                  <p className="text-xs text-gray-500">{option.description}</p>
                </label>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* In-App Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold">In-App Notifications</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {NOTIFICATION_OPTIONS.map((option) => (
              <div key={option.id} className="flex items-start gap-3">
                <Checkbox
                  id={`inapp_${option.id}`}
                  defaultChecked={true}
                  aria-label={`In-App: ${option.label}`}
                />
                <label
                  htmlFor={`inapp_${option.id}`}
                  className="cursor-pointer"
                >
                  <p className="text-sm font-medium text-gray-900">
                    {option.label}
                  </p>
                  <p className="text-xs text-gray-500">{option.description}</p>
                </label>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Notification Schedule */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold">Notification Schedule</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Digest Frequency"
              options={DIGEST_OPTIONS}
              defaultValue="real_time"
            />
            <Input
              label="Quiet Hours Start"
              type="time"
              defaultValue="22:00"
            />
            <Input
              label="Quiet Hours End"
              type="time"
              defaultValue="07:00"
            />
          </div>
          <p className="text-xs text-gray-500 mt-3">
            During quiet hours, notifications will be held and delivered once the
            quiet period ends.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
