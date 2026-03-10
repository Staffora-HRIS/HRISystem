import { useNavigate } from "react-router";
import {
  Users,
  BarChart3,
  TrendingDown,
  CalendarDays,
  Clock,
  DollarSign,
  Heart,
  GraduationCap,
  Target,
  ShieldCheck,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
  useToast,
} from "~/components/ui";

interface ReportDefinition {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  available: boolean;
}

const REPORTS: ReportDefinition[] = [
  {
    id: "employee-directory",
    slug: "employee-directory",
    title: "Employee Directory",
    description: "Complete employee listing with contact information and current status",
    icon: Users,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    available: true,
  },
  {
    id: "headcount-summary",
    slug: "headcount-summary",
    title: "Headcount Report",
    description: "Headcount breakdown by department, position, and employment status",
    icon: BarChart3,
    color: "text-indigo-600",
    bgColor: "bg-indigo-100",
    available: true,
  },
  {
    id: "turnover-analysis",
    slug: "turnover-analysis",
    title: "Turnover Report",
    description: "Employee turnover rates, trends, and exit reason analysis",
    icon: TrendingDown,
    color: "text-red-600",
    bgColor: "bg-red-100",
    available: true,
  },
  {
    id: "leave-balance",
    slug: "leave-balance",
    title: "Leave Balances",
    description: "Current leave balances for all employees by leave type",
    icon: CalendarDays,
    color: "text-green-600",
    bgColor: "bg-green-100",
    available: true,
  },
  {
    id: "attendance-report",
    slug: "attendance-report",
    title: "Attendance Report",
    description: "Attendance and time tracking summary including late arrivals and absences",
    icon: Clock,
    color: "text-orange-600",
    bgColor: "bg-orange-100",
    available: false,
  },
  {
    id: "compensation-report",
    slug: "compensation-report",
    title: "Compensation Report",
    description: "Salary ranges, benefits costs, and total compensation summary",
    icon: DollarSign,
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
    available: false,
  },
  {
    id: "benefits-enrollment",
    slug: "benefits-enrollment",
    title: "Benefits Enrollment",
    description: "Benefits enrollment status, participation rates, and plan distribution",
    icon: Heart,
    color: "text-pink-600",
    bgColor: "bg-pink-100",
    available: false,
  },
  {
    id: "training-completion",
    slug: "training-completion",
    title: "Training Completion",
    description: "LMS course completion rates, overdue trainings, and compliance status",
    icon: GraduationCap,
    color: "text-violet-600",
    bgColor: "bg-violet-100",
    available: true,
  },
  {
    id: "performance-summary",
    slug: "performance-summary",
    title: "Performance Summary",
    description: "Performance review results, rating distribution, and goal progress",
    icon: Target,
    color: "text-amber-600",
    bgColor: "bg-amber-100",
    available: false,
  },
  {
    id: "compliance-report",
    slug: "compliance-report",
    title: "Compliance Report",
    description: "Regulatory compliance status including required documents and certifications",
    icon: ShieldCheck,
    color: "text-teal-600",
    bgColor: "bg-teal-100",
    available: false,
  },
];

export default function ReportsIndexPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const handleViewReport = (report: ReportDefinition) => {
    if (report.available) {
      navigate(`/admin/reports/${report.slug}`);
    } else {
      toast.info("Coming soon");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-600">Generate and view reports</p>
      </div>

      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((report) => (
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
                variant={report.available ? "primary" : "outline"}
                size="sm"
                className="w-full"
                onClick={() => handleViewReport(report)}
              >
                {report.available ? "View Report" : "Coming Soon"}
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
