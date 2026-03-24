export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  ClipboardList,
  Clock,
  AlertTriangle,
  FileCheck,
  CalendarCheck,
  BarChart3,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
} from "~/components/ui";

interface ReportType {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}

const REPORT_TYPES: ReportType[] = [
  {
    id: "attendance-summary",
    title: "Attendance Summary",
    description: "Overview of employee attendance patterns for a selected date range",
    icon: ClipboardList,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  {
    id: "overtime-report",
    title: "Overtime Report",
    description: "Employees with overtime hours including daily and weekly breakdowns",
    icon: Clock,
    color: "text-orange-600",
    bgColor: "bg-orange-100",
  },
  {
    id: "late-arrivals",
    title: "Late Arrivals",
    description: "Employees who clocked in after their scheduled start time",
    icon: AlertTriangle,
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
  {
    id: "timesheet-status",
    title: "Timesheet Status",
    description: "Summary of submitted, approved, and pending timesheets by period",
    icon: FileCheck,
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
  {
    id: "schedule-compliance",
    title: "Schedule Compliance",
    description: "Employee adherence to assigned work schedules and shift patterns",
    icon: CalendarCheck,
    color: "text-purple-600",
    bgColor: "bg-purple-100",
  },
  {
    id: "monthly-summary",
    title: "Monthly Summary",
    description: "Comprehensive monthly time summary per employee with totals and averages",
    icon: BarChart3,
    color: "text-indigo-600",
    bgColor: "bg-indigo-100",
  },
];

export default function TimeReportsPage() {
  const navigate = useNavigate();

  const handleGenerate = (report: ReportType) => {
    navigate(`/admin/reports/new?type=${encodeURIComponent(report.id)}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/time")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Time Reports</h1>
          <p className="text-gray-600">Time and attendance reports</p>
        </div>
      </div>

      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORT_TYPES.map((report) => (
          <Card key={report.id} className="hover:shadow-md transition-shadow">
            <CardBody className="space-y-4">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${report.bgColor}`}
                >
                  <report.icon className={`h-5 w-5 ${report.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-gray-900">{report.title}</h3>
                </div>
              </div>

              <p className="text-sm text-gray-600">{report.description}</p>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => handleGenerate(report)}
              >
                Generate
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
