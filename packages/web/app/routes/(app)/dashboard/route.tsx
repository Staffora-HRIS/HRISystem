/**
 * Employee Dashboard
 *
 * Main dashboard for employees showing tasks, leave balance, and quick actions.
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, StatCard, ListCard } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Spinner } from "../../../components/ui/spinner";
import { api } from "../../../lib/api-client";

interface DashboardSummary {
  pendingTasks: number;
  pendingApprovals: number;
  teamMembers: number;
}

interface Task {
  id: string;
  taskType: string;
  title: string;
  dueDate: string;
  priority: string;
  status: string;
}

export default function DashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["portal", "dashboard"],
    queryFn: () => api.get<{ summary: DashboardSummary }>("/portal/dashboard"),
  });

  const { data: tasks } = useQuery({
    queryKey: ["portal", "tasks"],
    queryFn: () => api.get<{ tasks: Task[]; count: number }>("/portal/tasks"),
  });

  const { data: profile } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => api.get<{ user: { firstName: string }; employee: unknown; tenant: unknown }>("/portal/me"),
  });

  if (summaryLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {profile?.user?.firstName || "User"}
          </h1>
          <p className="text-gray-500">Here's what's happening today</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">Request Time Off</Button>
          <Button>Clock In</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Pending Tasks"
          value={summary?.summary?.pendingTasks || 0}
        />
        <StatCard
          title="Pending Approvals"
          value={summary?.summary?.pendingApprovals || 0}
        />
        <StatCard
          title="Team Members"
          value={summary?.summary?.teamMembers || 0}
        />
      </div>

      {/* Tasks Section */}
      <ListCard
        title="My Tasks"
        items={tasks?.tasks || []}
        emptyMessage="No pending tasks"
        maxItems={5}
        action={<Button variant="ghost" size="sm">View All</Button>}
        renderItem={(task: Task) => (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{task.title}</p>
              <p className="text-sm text-gray-500">
                Due: {new Date(task.dueDate).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={task.priority === "high" ? "error" : "default"}>
                {task.priority}
              </Badge>
              <Button size="sm" variant="outline">View</Button>
            </div>
          </div>
        )}
      />

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card hoverable clickable>
          <CardBody className="flex flex-col items-center justify-center py-6">
            <span className="text-2xl mb-2">📅</span>
            <span className="font-medium">My Schedule</span>
          </CardBody>
        </Card>
        <Card hoverable clickable>
          <CardBody className="flex flex-col items-center justify-center py-6">
            <span className="text-2xl mb-2">⏰</span>
            <span className="font-medium">Timesheets</span>
          </CardBody>
        </Card>
        <Card hoverable clickable>
          <CardBody className="flex flex-col items-center justify-center py-6">
            <span className="text-2xl mb-2">🏖️</span>
            <span className="font-medium">Time Off</span>
          </CardBody>
        </Card>
        <Card hoverable clickable>
          <CardBody className="flex flex-col items-center justify-center py-6">
            <span className="text-2xl mb-2">👤</span>
            <span className="font-medium">My Profile</span>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
