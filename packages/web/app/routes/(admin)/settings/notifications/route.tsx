import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  Monitor,
  Clock,
  Save,
  AlertCircle,
  RefreshCw,
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
import { api, ApiError } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";

/** Shape returned by GET /tenant/current */
interface TenantData {
  id: string;
  name: string;
  slug: string;
  status: string;
  settings: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

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

/** Notification preferences stored in tenant settings JSONB */
interface NotificationPreferences {
  email: Record<string, boolean>;
  inApp: Record<string, boolean>;
  digestFrequency: string;
  quietHoursStart: string;
  quietHoursEnd: string;
}

const DEFAULT_PREFS: NotificationPreferences = {
  email: Object.fromEntries(NOTIFICATION_OPTIONS.map((o) => [o.id, true])),
  inApp: Object.fromEntries(NOTIFICATION_OPTIONS.map((o) => [o.id, true])),
  digestFrequency: "real_time",
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
};

/** Extract notification preferences from tenant settings */
function extractPrefs(settings: Record<string, unknown>): NotificationPreferences {
  const raw = settings.notifications;
  if (!raw || typeof raw !== "object") return DEFAULT_PREFS;
  const n = raw as Record<string, unknown>;

  return {
    email: (n.email && typeof n.email === "object" && !Array.isArray(n.email))
      ? { ...DEFAULT_PREFS.email, ...(n.email as Record<string, boolean>) }
      : DEFAULT_PREFS.email,
    inApp: (n.inApp && typeof n.inApp === "object" && !Array.isArray(n.inApp))
      ? { ...DEFAULT_PREFS.inApp, ...(n.inApp as Record<string, boolean>) }
      : DEFAULT_PREFS.inApp,
    digestFrequency: typeof n.digestFrequency === "string" ? n.digestFrequency : DEFAULT_PREFS.digestFrequency,
    quietHoursStart: typeof n.quietHoursStart === "string" ? n.quietHoursStart : DEFAULT_PREFS.quietHoursStart,
    quietHoursEnd: typeof n.quietHoursEnd === "string" ? n.quietHoursEnd : DEFAULT_PREFS.quietHoursEnd,
  };
}

export default function NotificationSettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [isDirty, setIsDirty] = useState(false);

  // Fetch current tenant data (includes settings JSONB)
  const {
    data: tenant,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.tenant.current(),
    queryFn: () => api.get<TenantData>("/api/v1/tenant/current"),
  });

  // Sync prefs from server data
  useEffect(() => {
    if (tenant) {
      setPrefs(extractPrefs(tenant.settings));
      setIsDirty(false);
    }
  }, [tenant]);

  const updatePref = useCallback(
    <K extends keyof NotificationPreferences>(
      key: K,
      value: NotificationPreferences[K]
    ) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
      setIsDirty(true);
    },
    []
  );

  const toggleEmailPref = useCallback((optionId: string, checked: boolean) => {
    setPrefs((prev) => ({
      ...prev,
      email: { ...prev.email, [optionId]: checked },
    }));
    setIsDirty(true);
  }, []);

  const toggleInAppPref = useCallback((optionId: string, checked: boolean) => {
    setPrefs((prev) => ({
      ...prev,
      inApp: { ...prev.inApp, [optionId]: checked },
    }));
    setIsDirty(true);
  }, []);

  // Save mutation -- merges notification prefs into existing tenant settings
  const saveMutation = useMutation({
    mutationFn: async (notifPrefs: NotificationPreferences) => {
      // Merge with existing settings to preserve other keys
      const existingSettings = tenant?.settings ?? {};
      const mergedSettings = {
        ...existingSettings,
        notifications: notifPrefs,
      };
      return api.put<TenantData>("/api/v1/tenant/settings", {
        settings: mergedSettings,
      });
    },
    onSuccess: (updated) => {
      toast.success("Notification settings saved successfully");
      setIsDirty(false);
      if (updated) {
        queryClient.setQueryData(queryKeys.tenant.current(), updated);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.tenant.settings() });
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to save notification settings. Please try again.";
      toast.error(message);
    },
  });

  const handleSave = () => {
    saveMutation.mutate(prefs);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <span className="sr-only">Loading notification settings...</span>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-gray-700 font-medium">Failed to load notification settings</p>
        <p className="text-sm text-gray-500">
          {error instanceof ApiError ? error.message : "An unexpected error occurred."}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

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
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending || !isDirty}
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
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
                  checked={prefs.email[option.id] ?? true}
                  onChange={(e) => toggleEmailPref(option.id, e.target.checked)}
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
                  checked={prefs.inApp[option.id] ?? true}
                  onChange={(e) => toggleInAppPref(option.id, e.target.checked)}
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
              value={prefs.digestFrequency}
              onChange={(e) => updatePref("digestFrequency", e.target.value)}
            />
            <Input
              label="Quiet Hours Start"
              type="time"
              value={prefs.quietHoursStart}
              onChange={(e) => updatePref("quietHoursStart", e.target.value)}
            />
            <Input
              label="Quiet Hours End"
              type="time"
              value={prefs.quietHoursEnd}
              onChange={(e) => updatePref("quietHoursEnd", e.target.value)}
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
