import { Link } from "react-router";
import {
  Calendar,
  FileText,
  Shield,
  ArrowRight,
} from "lucide-react";
import { Card, CardBody } from "~/components/ui/card";

const leaveModules = [
  {
    title: "Leave Requests",
    description: "View and manage employee leave requests, approvals, and rejections.",
    href: "/admin/leave/requests",
    icon: Calendar,
    color: "text-blue-600 bg-blue-100",
  },
  {
    title: "Leave Types",
    description: "Configure leave types such as annual, sick, parental, and custom types.",
    href: "/admin/leave/types",
    icon: FileText,
    color: "text-emerald-600 bg-emerald-100",
  },
  {
    title: "Leave Policies",
    description: "Set up accrual rules, carry-over limits, and eligibility criteria.",
    href: "/admin/leave/policies",
    icon: Shield,
    color: "text-purple-600 bg-purple-100",
  },
];

export default function LeaveManagementIndex() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Leave Management
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage leave types, policies, and employee leave requests.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {leaveModules.map((mod) => (
          <Link key={mod.href} to={mod.href} className="group">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardBody className="flex flex-col gap-4 p-6">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2.5 ${mod.color}`}>
                    <mod.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {mod.title}
                  </h3>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {mod.description}
                </p>
                <div className="mt-auto flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-700">
                  Open
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
