import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Globe,
  Clock,
  DollarSign,
  Save,
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
import { api } from "~/lib/api-client";

interface TenantSettings {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  dateFormat: string;
  currency: string;
  fiscalYearStart: string;
  workWeekStart: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

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

export default function AdminTenantSettingsPage() {
  const toast = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["admin-tenant-settings"],
    queryFn: async () => {
      // Return mock data for now
      return {
        id: "tenant-1",
        name: "Acme Corporation",
        slug: "acme",
        timezone: "America/New_York",
        dateFormat: "MM/DD/YYYY",
        currency: "USD",
        fiscalYearStart: "01-01",
        workWeekStart: "monday",
        logoUrl: null,
        primaryColor: "#3B82F6",
      } as TenantSettings;
    },
  });

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate save
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast.success("Settings saved successfully");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Saving..." : "Save Changes"}
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
              defaultValue={tenant?.name}
              placeholder="Enter organization name"
            />
            <Input
              label="URL Slug"
              defaultValue={tenant?.slug}
              placeholder="acme"
              disabled
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Organization Logo
            </label>
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
                {tenant?.logoUrl ? (
                  <img
                    src={tenant.logoUrl}
                    alt="Logo"
                    className="h-full w-full object-contain rounded-lg"
                  />
                ) : (
                  <Building2 className="h-8 w-8 text-gray-400" />
                )}
              </div>
              <div>
                <Button variant="outline" size="sm">
                  Upload Logo
                </Button>
                <p className="text-xs text-gray-500 mt-1">
                  PNG, JPG up to 2MB. Recommended: 200x200px
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
              defaultValue={tenant?.timezone}
              options={TIMEZONES}
            />
            <Select
              label="Date Format"
              defaultValue={tenant?.dateFormat}
              options={DATE_FORMATS}
            />
            <Select
              label="Currency"
              defaultValue={tenant?.currency}
              options={CURRENCIES}
            />
            <Select
              label="Work Week Starts On"
              defaultValue={tenant?.workWeekStart}
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
              defaultValue="01"
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
              defaultValue="1"
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
            <DollarSign className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold">Branding</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Primary Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="primary-color-picker"
                  title="Select primary color"
                  aria-label="Primary color picker"
                  defaultValue={tenant?.primaryColor || "#3B82F6"}
                  className="h-10 w-14 rounded border border-gray-300 cursor-pointer"
                />
                <Input
                  defaultValue={tenant?.primaryColor || "#3B82F6"}
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
