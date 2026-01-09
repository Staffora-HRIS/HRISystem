import { Link } from "react-router";
import { GitBranch, ArrowRight, Clock, UserCheck, FileText, Briefcase } from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";

const templates = [
  {
    id: "leave-approval",
    name: "Leave Request Approval",
    description: "Standard leave request workflow with manager approval",
    category: "Leave Management",
    icon: Clock,
    steps: 3,
    popular: true,
  },
  {
    id: "onboarding",
    name: "Employee Onboarding",
    description: "Complete onboarding workflow for new hires",
    category: "Onboarding",
    icon: UserCheck,
    steps: 8,
    popular: true,
  },
  {
    id: "expense-approval",
    name: "Expense Report Approval",
    description: "Multi-level approval for expense reports",
    category: "Finance",
    icon: FileText,
    steps: 4,
    popular: false,
  },
  {
    id: "job-requisition",
    name: "Job Requisition",
    description: "Approval workflow for new job postings",
    category: "Recruitment",
    icon: Briefcase,
    steps: 5,
    popular: false,
  },
  {
    id: "timesheet-approval",
    name: "Timesheet Approval",
    description: "Weekly timesheet submission and approval",
    category: "Time & Attendance",
    icon: Clock,
    steps: 2,
    popular: true,
  },
  {
    id: "performance-review",
    name: "Performance Review Cycle",
    description: "Annual performance review with self and manager assessments",
    category: "Performance",
    icon: UserCheck,
    steps: 6,
    popular: false,
  },
];

export default function WorkflowTemplatesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Templates</h1>
          <p className="text-gray-600">Start from a pre-built template to quickly create workflows</p>
        </div>
        <Link to="/admin/workflows/builder">
          <Button variant="outline">
            <GitBranch className="h-4 w-4 mr-2" />
            Build from Scratch
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((template) => {
          const Icon = template.icon;
          return (
            <Card key={template.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Icon className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    {template.popular && <Badge variant="success">Popular</Badge>}
                  </div>
                  <span className="text-xs text-gray-500">{template.category}</span>
                </div>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-gray-600 mb-4">{template.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{template.steps} steps</span>
                  <Button size="sm">
                    Use Template
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
