import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { UserPlus, Plus, FileText, CheckCircle, Clock } from "lucide-react";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface OnboardingInstance {
  id: string;
  employeeId: string;
  employeeName?: string;
  templateId: string;
  templateName?: string;
  status: "not_started" | "in_progress" | "completed" | "cancelled";
  totalTasks: number;
  completedTasks: number;
  startedAt?: string;
  completedAt?: string;
  dueDate?: string;
}

interface OnboardingTemplate {
  id: string;
  name: string;
  description?: string;
  templateType: "onboarding" | "offboarding" | "transition";
  isActive: boolean;
  isDefault: boolean;
  taskCount: number;
}

export default function OnboardingAdminPage() {
  const { data: instancesData, isLoading: instancesLoading } = useQuery({
    queryKey: ["admin-onboarding-instances"],
    queryFn: () => api.get<{ instances: OnboardingInstance[]; count: number }>("/onboarding/instances"),
  });

  const { data: templatesData } = useQuery({
    queryKey: ["admin-onboarding-templates"],
    queryFn: () => api.get<{ templates: OnboardingTemplate[]; count: number }>("/onboarding/templates"),
  });

  const instances = instancesData?.instances || [];
  const templates = templatesData?.templates || [];

  const stats = {
    active: instances.filter(i => i.status === "in_progress").length,
    completed: instances.filter(i => i.status === "completed").length,
    templates: templates.filter(t => t.isActive).length,
    overdue: instances.filter(i => i.dueDate && new Date(i.dueDate) < new Date() && i.status === "in_progress").length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "not_started": return <Badge variant="secondary">Not Started</Badge>;
      case "in_progress": return <Badge variant="warning">In Progress</Badge>;
      case "completed": return <Badge variant="success">Completed</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getProgress = (instance: OnboardingInstance) => {
    if (instance.totalTasks === 0) return 0;
    return Math.round((instance.completedTasks / instance.totalTasks) * 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Onboarding</h1>
          <p className="text-gray-600">Manage employee onboarding workflows</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/onboarding/templates">
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Templates
            </Button>
          </Link>
          <Link to="/admin/onboarding/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Start Onboarding
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Active Onboardings" value={stats.active} icon={<UserPlus className="h-5 w-5" />} />
        <StatCard title="Completed" value={stats.completed} icon={<CheckCircle className="h-5 w-5" />} />
        <StatCard title="Active Templates" value={stats.templates} icon={<FileText className="h-5 w-5" />} />
        <StatCard title="Overdue" value={stats.overdue} icon={<Clock className="h-5 w-5" />} />
      </div>

      {instancesLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : instances.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <UserPlus className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No onboarding in progress</h3>
            <p className="text-gray-500 mb-4">Start onboarding for new employees.</p>
            <Link to="/admin/onboarding/new">
              <Button>Start Onboarding</Button>
            </Link>
          </CardBody>
        </Card>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Template</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {instances.map((instance) => {
                const progress = getProgress(instance);
                const isOverdue = instance.dueDate && new Date(instance.dueDate) < new Date() && instance.status === "in_progress";

                return (
                  <tr key={instance.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{instance.employeeName || "Unknown"}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{instance.templateName || "Default"}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-500">
                          {instance.completedTasks}/{instance.totalTasks}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(instance.status)}</td>
                    <td className="px-6 py-4">
                      {instance.dueDate ? (
                        <span className={isOverdue ? "text-red-600 font-medium" : "text-gray-500"}>
                          {new Date(instance.dueDate).toLocaleDateString()}
                          {isOverdue && " (Overdue)"}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link to={`/admin/onboarding/${instance.id}`}>
                        <Button variant="outline" size="sm">View</Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
