import { Link } from "react-router";
import {
  CalendarClock,
  CalendarDays,
  Shield,
  ShieldCheck,
  PoundSterling,
  FileText,
  ArrowRight,
  Hash,
  Minus,
  Receipt,
} from "lucide-react";
import { Card, CardBody } from "~/components/ui/card";

const payrollModules = [
  {
    title: "Payroll Runs",
    description:
      "Create, calculate, approve, and export payroll runs. View per-employee breakdowns and totals.",
    href: "/admin/payroll/runs",
    icon: PoundSterling,
    color: "text-green-600 bg-green-100",
  },
  {
    title: "Tax Details",
    description:
      "Manage employee tax codes, NI numbers, NI categories, and student loan plans with effective dating.",
    href: "/admin/payroll/tax-details",
    icon: FileText,
    color: "text-orange-600 bg-orange-100",
  },
  {
    title: "Pay Schedules",
    description:
      "Configure pay frequencies, pay days, and schedule assignments for your workforce.",
    href: "/admin/payroll/schedules",
    icon: CalendarClock,
    color: "text-blue-600 bg-blue-100",
  },
  {
    title: "Bank Holidays",
    description:
      "Manage bank holiday calendars by country and region. Import official UK holidays.",
    href: "/admin/payroll/bank-holidays",
    icon: CalendarDays,
    color: "text-emerald-600 bg-emerald-100",
  },
  {
    title: "NI Categories",
    description:
      "View and configure National Insurance contribution categories and thresholds.",
    href: "/admin/payroll/ni-categories",
    icon: Shield,
    color: "text-purple-600 bg-purple-100",
  },
  {
    title: "Pension",
    description:
      "Manage workplace pension auto-enrolment, schemes, and compliance with the Pensions Act 2008.",
    href: "/admin/payroll/pension",
    icon: ShieldCheck,
    color: "text-teal-600 bg-teal-100",
  },
  {
    title: "Tax Codes",
    description:
      "Manage employee HMRC tax code assignments with effective dating and source tracking.",
    href: "/admin/payroll/tax-codes",
    icon: Hash,
    color: "text-orange-600 bg-orange-100",
  },
  {
    title: "Deductions",
    description:
      "Configure deduction types and manage employee deduction assignments for statutory and voluntary deductions.",
    href: "/admin/payroll/deductions",
    icon: Minus,
    color: "text-red-600 bg-red-100",
  },
  {
    title: "Payslips",
    description:
      "Generate, approve, and issue employee payslips. Configure payslip templates for PDF generation.",
    href: "/admin/payroll/payslips",
    icon: Receipt,
    color: "text-indigo-600 bg-indigo-100",
  },
];

export default function PayrollConfigurationIndex() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Payroll
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage payroll runs, tax details, pay schedules, and bank holidays.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {payrollModules.map((mod) => (
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
