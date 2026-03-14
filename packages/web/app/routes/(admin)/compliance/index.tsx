export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { Link } from "react-router";
import {
  Shield,
  FileCheck,
  HardHat,
  Clock,
  PoundSterling,
  BarChart3,
  Users,
  ArrowRight,
  FileSearch,
  Database,
  AlertOctagon,
} from "lucide-react";
import { Card, CardBody } from "~/components/ui";

interface ComplianceSection {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
}

const COMPLIANCE_SECTIONS: ComplianceSection[] = [
  {
    title: "Right to Work",
    description:
      "Track employee right-to-work checks, document verification, and expiry dates to ensure compliance with UK immigration law.",
    href: "/admin/compliance/right-to-work",
    icon: FileCheck,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
  },
  {
    title: "Health & Safety",
    description:
      "Record and manage workplace incidents, accidents, near-misses, and RIDDOR reportable events.",
    href: "/admin/compliance/health-safety",
    icon: HardHat,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
  },
  {
    title: "Working Time Regulations",
    description:
      "Monitor compliance with the Working Time Regulations 1998 including weekly hours, rest periods, and opt-out status.",
    href: "/admin/compliance/wtr",
    icon: Clock,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
  },
  {
    title: "National Minimum Wage",
    description:
      "Verify that all employees are paid at or above the National Minimum Wage and National Living Wage rates.",
    href: "/admin/compliance/nmw",
    icon: PoundSterling,
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
  },
  {
    title: "Gender Pay Gap",
    description:
      "View gender pay gap analysis, reporting periods, and generate reports required under the Equality Act 2010.",
    href: "/admin/compliance/gender-pay-gap",
    icon: BarChart3,
    iconBg: "bg-pink-100",
    iconColor: "text-pink-600",
  },
  {
    title: "Diversity Monitoring",
    description:
      "View aggregate diversity statistics across the workforce. Individual data is anonymised to protect employee privacy.",
    href: "/admin/compliance/diversity",
    icon: Users,
    iconBg: "bg-teal-100",
    iconColor: "text-teal-600",
  },
  {
    title: "DSAR Management",
    description:
      "Manage data subject access requests under UK GDPR Articles 15-20 including access, rectification, erasure, and portability.",
    href: "/admin/compliance/dsar",
    icon: FileSearch,
    iconBg: "bg-indigo-100",
    iconColor: "text-indigo-600",
  },
  {
    title: "Data Retention",
    description:
      "Configure and manage data retention policies under UK GDPR Article 5(1)(e) storage limitation principle.",
    href: "/admin/compliance/data-retention",
    icon: Database,
    iconBg: "bg-cyan-100",
    iconColor: "text-cyan-600",
  },
  {
    title: "Data Breach Tracking",
    description:
      "Log and manage data breach incidents with 72-hour ICO notification tracking under UK GDPR Articles 33-34.",
    href: "/admin/compliance/data-breach",
    icon: AlertOctagon,
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
  },
];

export default function ComplianceDashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Shield className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Compliance
          </h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          UK employment law compliance modules and reporting
        </p>
      </div>

      {/* Section Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {COMPLIANCE_SECTIONS.map((section) => (
          <Link
            key={section.href}
            to={section.href}
            className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-xl"
          >
            <Card
              hoverable
              className="h-full transition-shadow group-hover:shadow-md"
            >
              <CardBody>
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${section.iconBg}`}
                  >
                    <section.icon className={`h-6 w-6 ${section.iconColor}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {section.title}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-3">
                      {section.description}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm font-medium text-blue-600 dark:text-blue-400">
                  View details
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
