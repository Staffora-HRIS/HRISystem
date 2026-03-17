import { Link } from "react-router";
import {
  Building2,
  Plug,
  Shield,
  Bell,
  Palette,
  Database,
  ChevronRight,
} from "lucide-react";
import { Card, CardBody, useToast } from "~/components/ui";

interface SettingsSection {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  available: boolean;
}

const settingsSections: SettingsSection[] = [
  {
    id: "tenant",
    name: "Tenant Settings",
    description: "Configure your organization name, logo, and basic settings",
    icon: Building2,
    href: "/admin/settings/tenant",
    available: true,
  },
  {
    id: "integrations",
    name: "Integrations",
    description: "Connect third-party services and APIs",
    icon: Plug,
    href: "/admin/settings/integrations",
    available: true,
  },
  {
    id: "security",
    name: "Security",
    description: "Password policies, MFA settings, and session management",
    icon: Shield,
    href: "/admin/security",
    available: true,
  },
  {
    id: "notifications",
    name: "Notifications",
    description: "Email templates and notification preferences",
    icon: Bell,
    href: "/admin/settings/notifications",
    available: true,
  },
  {
    id: "appearance",
    name: "Appearance",
    description: "Customize branding, themes, and UI preferences",
    icon: Palette,
    href: "/admin/settings/appearance",
    available: true,
  },
  {
    id: "data",
    name: "Data Management",
    description: "Import, export, and data retention policies",
    icon: Database,
    href: "/admin/settings/tenant",
    available: true,
  },
];

export default function AdminSettingsIndexPage() {
  const toast = useToast();

  const handleSectionClick = (section: SettingsSection) => {
    if (!section.available) {
      toast.info(`${section.name} settings are being configured through Tenant Settings.`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your organization settings and preferences</p>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {settingsSections.map((section) => (
          <Card
            key={section.id}
            className="hover:shadow-md transition-shadow"
          >
            <Link to={section.href} onClick={() => handleSectionClick(section)}>
              <CardBody className="flex items-start gap-4 p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 flex-shrink-0">
                  <section.icon className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">{section.name}</h3>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{section.description}</p>
                </div>
              </CardBody>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
