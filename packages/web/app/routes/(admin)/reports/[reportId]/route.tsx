import { useState, useMemo } from "react";
import { useParams, Link } from "react-router";
import {
  ArrowLeft,
  Play,
  Download,
  Mail,
  Calendar,
  FileSpreadsheet,
  FileText,
  Clock,
  Filter,
  BarChart3,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Select,
  Badge,
  DataTable,
  toast,
} from "~/components/ui";

interface ReportConfig {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: ReportParameter[];
  columns: string[];
}

interface ReportParameter {
  id: string;
  label: string;
  type: "date" | "select" | "text" | "daterange";
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
}

const REPORTS: Record<string, ReportConfig> = {
  "headcount-summary": {
    id: "headcount-summary",
    name: "Headcount Summary",
    description: "Current employee headcount by department, position, and status",
    category: "Headcount",
    parameters: [
      {
        id: "asOfDate",
        label: "As of Date",
        type: "date",
        required: true,
      },
      {
        id: "department",
        label: "Department",
        type: "select",
        options: [
          { value: "all", label: "All Departments" },
          { value: "engineering", label: "Engineering" },
          { value: "sales", label: "Sales" },
          { value: "hr", label: "Human Resources" },
          { value: "finance", label: "Finance" },
        ],
      },
      {
        id: "status",
        label: "Employment Status",
        type: "select",
        options: [
          { value: "all", label: "All Statuses" },
          { value: "active", label: "Active" },
          { value: "on_leave", label: "On Leave" },
          { value: "terminated", label: "Terminated" },
        ],
      },
    ],
    columns: ["Department", "Position", "Active", "On Leave", "Total", "% of Org"],
  },
  "turnover-analysis": {
    id: "turnover-analysis",
    name: "Turnover Analysis",
    description: "Employee turnover rates and trends over time",
    category: "Turnover",
    parameters: [
      {
        id: "startDate",
        label: "Start Date",
        type: "date",
        required: true,
      },
      {
        id: "endDate",
        label: "End Date",
        type: "date",
        required: true,
      },
      {
        id: "groupBy",
        label: "Group By",
        type: "select",
        options: [
          { value: "month", label: "Month" },
          { value: "quarter", label: "Quarter" },
          { value: "department", label: "Department" },
          { value: "reason", label: "Termination Reason" },
        ],
      },
    ],
    columns: ["Period", "Hires", "Terminations", "Net Change", "Turnover Rate"],
  },
  "leave-balance": {
    id: "leave-balance",
    name: "Leave Balance Report",
    description: "Current leave balances for all employees by leave type",
    category: "Absence",
    parameters: [
      {
        id: "leaveType",
        label: "Leave Type",
        type: "select",
        options: [
          { value: "all", label: "All Types" },
          { value: "pto", label: "PTO" },
          { value: "sick", label: "Sick Leave" },
          { value: "vacation", label: "Vacation" },
        ],
      },
      {
        id: "department",
        label: "Department",
        type: "select",
        options: [
          { value: "all", label: "All Departments" },
          { value: "engineering", label: "Engineering" },
          { value: "sales", label: "Sales" },
        ],
      },
    ],
    columns: ["Employee", "Department", "Leave Type", "Entitled", "Used", "Balance"],
  },
  "training-completion": {
    id: "training-completion",
    name: "Training Completion Report",
    description: "Training and compliance completion status by employee",
    category: "Training",
    parameters: [
      {
        id: "courseType",
        label: "Course Type",
        type: "select",
        options: [
          { value: "all", label: "All Courses" },
          { value: "required", label: "Required/Compliance" },
          { value: "optional", label: "Optional" },
        ],
      },
      {
        id: "status",
        label: "Completion Status",
        type: "select",
        options: [
          { value: "all", label: "All Statuses" },
          { value: "completed", label: "Completed" },
          { value: "in_progress", label: "In Progress" },
          { value: "overdue", label: "Overdue" },
        ],
      },
    ],
    columns: ["Employee", "Course", "Status", "Due Date", "Completed Date", "Score"],
  },
};

const MOCK_DATA = [
  ["Engineering", "Software Engineer", 45, 2, 47, "32%"],
  ["Engineering", "QA Engineer", 12, 1, 13, "9%"],
  ["Sales", "Account Executive", 28, 3, 31, "21%"],
  ["Sales", "Sales Manager", 8, 0, 8, "5%"],
  ["Human Resources", "HR Generalist", 6, 1, 7, "5%"],
  ["Finance", "Accountant", 15, 0, 15, "10%"],
  ["Marketing", "Marketing Specialist", 18, 2, 20, "14%"],
];

export default function AdminReportPage() {
  const params = useParams();
  const reportId = params.reportId || "headcount-summary";
  
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);

  const report = REPORTS[reportId] || REPORTS["headcount-summary"];

  const columns = useMemo(() => {
    return report.columns.map((col, idx) => ({
      id: col.toLowerCase().replace(/\s+/g, "_"),
      header: col,
      cell: ({ row }: { row: (string | number)[] }) => (
        <span className={idx === 0 ? "font-medium" : ""}>{row[idx]}</span>
      ),
    }));
  }, [report.columns]);

  const handleParameterChange = (paramId: string, value: string) => {
    setParameters((prev) => ({ ...prev, [paramId]: value }));
  };

  const handleRunReport = () => {
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
      setHasResults(true);
      toast.success("Report generated successfully");
    }, 1500);
  };

  const handleExport = (format: "csv" | "excel" | "pdf") => {
    toast.success(`Report exported as ${format.toUpperCase()}`);
  };

  const handleSchedule = () => {
    toast.info("Schedule report feature coming soon");
  };

  const handleEmail = () => {
    toast.info("Email report feature coming soon");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link to="/admin/reports">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Reports
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{report.name}</h1>
          <p className="text-gray-600">{report.description}</p>
          <Badge variant="secondary" className="mt-2">
            {report.category}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSchedule}>
            <Calendar className="h-4 w-4 mr-1" />
            Schedule
          </Button>
          <Button variant="outline" size="sm" onClick={handleEmail}>
            <Mail className="h-4 w-4 mr-1" />
            Email
          </Button>
        </div>
      </div>

      {/* Parameters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <h3 className="font-semibold">Report Parameters</h3>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {report.parameters.map((param) => (
              <div key={param.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {param.label}
                  {param.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {param.type === "select" && param.options ? (
                  <Select
                    value={parameters[param.id] || ""}
                    onChange={(e) => handleParameterChange(param.id, e.target.value)}
                    options={param.options}
                  />
                ) : (
                  <Input
                    type={param.type === "date" ? "date" : "text"}
                    value={parameters[param.id] || ""}
                    onChange={(e) => handleParameterChange(param.id, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={handleRunReport} disabled={isRunning}>
              {isRunning ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Report
                </>
              )}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Results */}
      {hasResults && (
        <>
          {/* Export Options */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-gray-500" />
              <span className="font-medium text-gray-700">
                {MOCK_DATA.length} results found
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("csv")}
              >
                <Download className="h-4 w-4 mr-1" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("excel")}
              >
                <FileSpreadsheet className="h-4 w-4 mr-1" />
                Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("pdf")}
              >
                <FileText className="h-4 w-4 mr-1" />
                PDF
              </Button>
            </div>
          </div>

          {/* Results Table */}
          <Card>
            <CardBody className="p-0">
              <DataTable
                columns={columns}
                data={MOCK_DATA}
                totalCount={MOCK_DATA.length}
              />
            </CardBody>
          </Card>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardBody className="text-center">
                <p className="text-sm text-gray-500">Total Headcount</p>
                <p className="text-2xl font-bold text-gray-900">141</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="text-center">
                <p className="text-sm text-gray-500">Active Employees</p>
                <p className="text-2xl font-bold text-green-600">132</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="text-center">
                <p className="text-sm text-gray-500">On Leave</p>
                <p className="text-2xl font-bold text-yellow-600">9</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="text-center">
                <p className="text-sm text-gray-500">Departments</p>
                <p className="text-2xl font-bold text-blue-600">6</p>
              </CardBody>
            </Card>
          </div>
        </>
      )}

      {/* Empty State */}
      {!hasResults && !isRunning && (
        <Card>
          <CardBody className="text-center py-12">
            <BarChart3 className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <h3 className="font-medium text-gray-900 mb-2">Ready to Run</h3>
            <p className="text-gray-500">
              Configure your parameters above and click "Run Report" to generate results.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
