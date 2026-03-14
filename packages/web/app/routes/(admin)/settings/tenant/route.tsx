import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Globe,
  Clock,
  Palette,
  Save,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Select,
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

/** Local form state derived from tenant data + settings JSONB */
interface TenantFormState {
  name: string;
  timezone: string;
  dateFormat: string;
  currency: string;
  workWeekStart: string;
  fiscalYearStartMonth: string;
  fiscalYearStartDay: string;
  primaryColor: string;
}

const DEFAULTS: TenantFormState = {
  name: "",
  timezone: "UTC",
  dateFormat: "YYYY-MM-DD",
  currency: "GBP",
  workWeekStart: "monday",
  fiscalYearStartMonth: "01",
  fiscalYearStartDay: "1",
  primaryColor: "#3B82F6",
};

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "UTC", label: "UTC" },
];

const DATE_FORMATS = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (US)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (EU)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (ISO)" },
];

const CURRENCIES = [
  { value: "USD", label: "US Dollar (USD)" },
  { value: "EUR", label: "Euro (EUR)" },
  { value: "GBP", label: "British Pound (GBP)" },
  { value: "JPY", label: "Japanese Yen (JPY)" },
  { value: "CAD", label: "Canadian Dollar (CAD)" },
  { value: "AUD", label: "Australian Dollar (AUD)" },
];

const WEEKDAYS = [
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
  { value: "saturday", label: "Saturday" },
];

/** Convert API response into form state */
function tenantToFormState(tenant: TenantData): TenantFormState {
  const s = tenant.settings ?? {};
  return {
    name: tenant.name ?? DEFAULTS.name,
    timezone: (s.timezone as string) ?? DEFAULTS.timezone,
    dateFormat: (s.dateFormat as string) ?? DEFAULTS.dateFormat,
    currency: (s.currency as string) ?? DEFAULTS.currency,
    workWeekStart: (s.workWeekStart as string) ?? DEFAULTS.workWeekStart,
    fiscalYearStartMonth: (s.fiscalYearStartMonth as string) ?? DEFAULTS.fiscalYearStartMonth,
    fiscalYearStartDay: (s.fiscalYearStartDay as string) ?? DEFAULTS.fiscalYearStartDay,
    primaryColor: (s.primaryColor as string) ?? DEFAULTS.primaryColor,
  };
}

/** Build the PUT body from form state */
function formStateToPayload(form: TenantFormState) {
  return {
    name: form.name,
    settings: {
      timezone: form.timezone,
      dateFormat: form.dateFormat,
      currency: form.currency,
      workWeekStart: form.workWeekStart,
      fiscalYearStartMonth: form.fiscalYearStartMonth,
      fiscalYearStartDay: form.fiscalYearStartDay,
      primaryColor: form.primaryColor,
    },
  };
}

export default function AdminTenantSettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<TenantFormState>(DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);

  // Fetch current tenant data
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

  // Sync form state when data loads
  useEffect(() => {
    if (tenant) {
      setForm(tenantToFormState(tenant));
      setIsDirty(false);
    }
  }, [tenant]);

  // Field change handler
  const updateField = useCallback(
    <K extends keyof TenantFormState>(field: K, value: TenantFormState[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setIsDirty(true);
    },
    []
  );

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formStateToPayload>) =>
      api.put<TenantData>("/api/v1/tenant/settings", payload),
    onSuccess: (updated) => {
      toast.success("Settings saved successfully");
      setIsDirty(false);
      // Update cached tenant data so other components see the change
      if (updated) {
        queryClient.setQueryData(queryKeys.tenant.current(), updated);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.tenant.settings() });
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to save settings. Please try again.";
      toast.error(message);
    },
  });

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Organization name is required");
      return;
    }
    saveMutation.mutate(formStateToPayload(form));
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <span className="sr-only">Loading tenant settings...</span>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-gray-700 font-medium">Failed to load tenant settings</p>
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
          <h1 className="text-2xl font-bold text-gray-900">Tenant Settings</h1>
          <p className="text-gray-600">Configure your organization settings</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending || !isDirty}
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Organization Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold">Organization Information</h2>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Organization Name"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Enter organization name"
              error={!form.name.trim() ? "Organization name is required" : undefined}
            />
            <Input
              label="URL Slug"
              value={tenant?.slug ?? ""}
              placeholder="acme"
              disabled
              hint="The URL slug cannot be changed after creation"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Organization Logo
            </label>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
                <Building2 className="h-8 w-8 text-gray-400" />
              </div>
              <div>
                <Button variant="outline" size="sm" disabled>
                  Upload Logo
                </Button>
                <p className="text-xs text-gray-500 mt-1">
                  Logo upload is not yet available. PNG, JPG up to 2MB. Recommended: 200x200px
                </p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Localization */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold">Localization</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Timezone"
              value={form.timezone}
              onChange={(e) => updateField("timezone", e.target.value)}
              options={TIMEZONES}
            />
            <Select
              label="Date Format"
              value={form.dateFormat}
              onChange={(e) => updateField("dateFormat", e.target.value)}
              options={DATE_FORMATS}
            />
            <Select
              label="Currency"
              value={form.currency}
              onChange={(e) => updateField("currency", e.target.value)}
              options={CURRENCIES}
            />
            <Select
              label="Work Week Starts On"
              value={form.workWeekStart}
              onChange={(e) => updateField("workWeekStart", e.target.value)}
              options={WEEKDAYS}
            />
          </div>
        </CardBody>
      </Card>

      {/* Fiscal Year */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold">Fiscal Year</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Fiscal Year Start Month"
              value={form.fiscalYearStartMonth}
              onChange={(e) => updateField("fiscalYearStartMonth", e.target.value)}
              options={[
                { value: "01", label: "January" },
                { value: "02", label: "February" },
                { value: "03", label: "March" },
                { value: "04", label: "April" },
                { value: "05", label: "May" },
                { value: "06", label: "June" },
                { value: "07", label: "July" },
                { value: "08", label: "August" },
                { value: "09", label: "September" },
                { value: "10", label: "October" },
                { value: "11", label: "November" },
                { value: "12", label: "December" },
              ]}
            />
            <Select
              label="Fiscal Year Start Day"
              value={form.fiscalYearStartDay}
              onChange={(e) => updateField("fiscalYearStartDay", e.target.value)}
              options={Array.from({ length: 28 }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              }))}
            />
          </div>
        </CardBody>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold">Branding</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="primary-color-picker"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Primary Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="primary-color-picker"
                  title="Select primary color"
                  aria-label="Primary color picker"
                  value={form.primaryColor}
                  onChange={(e) => updateField("primaryColor", e.target.value)}
                  className="h-10 w-14 rounded border border-gray-300 cursor-pointer"
                />
                <Input
                  value={form.primaryColor}
                  onChange={(e) => updateField("primaryColor", e.target.value)}
                  placeholder="#3B82F6"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
