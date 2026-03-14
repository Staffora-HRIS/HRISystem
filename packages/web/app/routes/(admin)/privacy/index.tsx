export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { Link } from "react-router";
import {
  Shield,
  FileCheck,
  UserX,
  AlertOctagon,
  FileText,
  ArrowRight,
} from "lucide-react";
import { Card, CardBody } from "~/components/ui";

interface PrivacySectionCard {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}

const PRIVACY_SECTIONS: PrivacySectionCard[] = [
  {
    title: "Consent Management",
    description:
      "Track and manage employee consent records for data processing activities.",
    href: "/admin/privacy/consent",
    icon: <FileCheck className="h-6 w-6" />,
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    title: "Data Subject Requests",
    description:
      "Manage DSAR requests including access, portability, and rectification.",
    href: "/admin/privacy/dsar",
    icon: <Shield className="h-6 w-6" />,
    iconBg: "bg-purple-100 dark:bg-purple-900/30",
    iconColor: "text-purple-600 dark:text-purple-400",
  },
  {
    title: "Data Erasure",
    description:
      "Process and track data erasure (right to be forgotten) requests.",
    href: "/admin/privacy/data-erasure",
    icon: <UserX className="h-6 w-6" />,
    iconBg: "bg-red-100 dark:bg-red-900/30",
    iconColor: "text-red-600 dark:text-red-400",
  },
  {
    title: "Data Breach Notifications",
    description:
      "Log and manage data breach incidents with ICO notification tracking.",
    href: "/admin/privacy/data-breach",
    icon: <AlertOctagon className="h-6 w-6" />,
    iconBg: "bg-orange-100 dark:bg-orange-900/30",
    iconColor: "text-orange-600 dark:text-orange-400",
  },
  {
    title: "Privacy Notices",
    description:
      "Manage privacy notices and policies with version tracking.",
    href: "/admin/privacy/privacy-notices",
    icon: <FileText className="h-6 w-6" />,
    iconBg: "bg-green-100 dark:bg-green-900/30",
    iconColor: "text-green-600 dark:text-green-400",
  },
];

export default function PrivacyDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Privacy & GDPR
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage data privacy, consent, subject requests, and compliance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PRIVACY_SECTIONS.map((section) => (
          <Link key={section.href} to={section.href} className="group">
            <Card hoverable className="h-full">
              <CardBody>
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${section.iconBg} ${section.iconColor}`}
                  >
                    {section.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">
                      {section.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {section.description}
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
