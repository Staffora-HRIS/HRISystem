/**
 * Employee Dashboard
 *
 * Main dashboard for employees showing tasks, leave balance, and quick actions.
 */

import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import {
  Calendar,
  CheckSquare,
  ClipboardList,
  Clock,
  Palmtree,
  UserCircle,
  Users,
} from "lucide-react";
import { Card, CardBody, StatCard, ListCard } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Skeleton } from "../../../components/ui/skeleton";
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
  const navigate = useNavigate();

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
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton height={32} width="60%" className="mb-2" />
            <Skeleton height={20} width="40%" />
          </div>
          <div className="flex gap-2">
            <Skeleton height={40} width={140} rounded="lg" />
            <Skeleton height={40} width={100} rounded="lg" />
          </div>
        </div>
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <Skeleton height={16} width="50%" className="mb-3" />
              <Skeleton height={36} width="30%" />
            </div>
          ))}
        </div>
        {/* Tasks skeleton */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <Skeleton height={20} width="20%" />
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-6 py-3 flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton height={16} width={200} />
                  <Skeleton height={14} width={120} />
                </div>
                <Skeleton height={28} width={60} rounded="lg" />
              </div>
            ))}
          </div>
        </div>
        {/* Quick links skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-6 flex flex-col items-center gap-3">
              <Skeleton height={48} width={48} rounded="lg" />
              <Skeleton height={16} width="60%" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Welcome back, {profile?.user?.firstName || "User"}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">Here's what's happening today</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/me/leave")}>
            Request Time Off
          </Button>
          <Button onClick={() => navigate("/me/time")}>Clock In</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Pending Tasks"
          value={summary?.summary?.pendingTasks || 0}
          icon={<ClipboardList className="h-6 w-6" />}
        />
        <StatCard
          title="Pending Approvals"
          value={summary?.summary?.pendingApprovals || 0}
          icon={<CheckSquare className="h-6 w-6" />}
        />
        <StatCard
          title="Team Members"
          value={summary?.summary?.teamMembers || 0}
          icon={<Users className="h-6 w-6" />}
        />
      </div>

      {/* Tasks Section */}
      <ListCard
        title="My Tasks"
        items={tasks?.tasks || []}
        emptyMessage="No pending tasks"
        maxItems={5}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/me/onboarding")}
          >
            View All
          </Button>
        }
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("/me/onboarding")}
              >
                View
              </Button>
            </div>
          </div>
        )}
      />

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link to="/me/time" className="block">
          <Card hoverable>
            <CardBody className="flex flex-col items-center justify-center py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/20">
                <Calendar className="h-6 w-6 text-primary-600" />
              </div>
              <span className="font-medium text-gray-900 dark:text-white">My Schedule</span>
            </CardBody>
          </Card>
        </Link>
        <Link to="/me/time" className="block">
          <Card hoverable>
            <CardBody className="flex flex-col items-center justify-center py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/20">
                <Clock className="h-6 w-6 text-primary-600" />
              </div>
              <span className="font-medium text-gray-900 dark:text-white">Timesheets</span>
            </CardBody>
          </Card>
        </Link>
        <Link to="/me/leave" className="block">
          <Card hoverable>
            <CardBody className="flex flex-col items-center justify-center py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/20">
                <Palmtree className="h-6 w-6 text-primary-600" />
              </div>
              <span className="font-medium text-gray-900 dark:text-white">Time Off</span>
            </CardBody>
          </Card>
        </Link>
        <Link to="/me/profile" className="block">
          <Card hoverable>
            <CardBody className="flex flex-col items-center justify-center py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/20">
                <UserCircle className="h-6 w-6 text-primary-600" />
              </div>
              <span className="font-medium text-gray-900 dark:text-white">My Profile</span>
            </CardBody>
          </Card>
        </Link>
      </div>
    </div>
  );
}
