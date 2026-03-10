import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  Circle,
  Clock,
  FileText,
  Link as LinkIcon,
  User,
  Building,
  Calendar,
} from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/toast";
import { api } from "~/lib/api-client";

interface OnboardingTask {
  id: string;
  title: string;
  description?: string;
  category: string;
  assigneeType: "employee" | "manager" | "hr" | "it" | "other";
  isRequired: boolean;
  dueDate?: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  completedAt?: string;
  completedBy?: string;
  resourceUrl?: string;
}

interface OnboardingInstance {
  id: string;
  templateName: string;
  status: "not_started" | "in_progress" | "completed" | "cancelled";
  totalTasks: number;
  completedTasks: number;
  startedAt: string;
  completedAt?: string;
  dueDate?: string;
  tasks: OnboardingTask[];
}

const categoryIcons: Record<string, React.ReactNode> = {
  documentation: <FileText className="h-4 w-4" />,
  training: <Calendar className="h-4 w-4" />,
  it_setup: <Building className="h-4 w-4" />,
  meet_team: <User className="h-4 w-4" />,
  default: <Circle className="h-4 w-4" />,
};

export default function MyOnboardingPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: onboarding, isLoading } = useQuery({
    queryKey: ["my-onboarding"],
    queryFn: () => api.get<OnboardingInstance>("/onboarding/my-onboarding"),
  });

  const completeMutation = useMutation({
    mutationFn: (taskId: string) =>
      api.post(`/onboarding/instances/${onboarding!.id}/tasks/${taskId}/complete`),
    onSuccess: () => {
      toast.success("Task completed!");
      queryClient.invalidateQueries({ queryKey: ["my-onboarding"] });
    },
    onError: () => {
      toast.error("Failed to complete task. Please try again.");
    },
  });

  const progress = onboarding
    ? Math.round((onboarding.completedTasks / onboarding.totalTasks) * 100)
    : 0;

  const myTasks = onboarding?.tasks.filter((t) => t.assigneeType === "employee") || [];
  const pendingTasks = myTasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  const completedTasks = myTasks.filter((t) => t.status === "completed");
  const otherTasks = onboarding?.tasks.filter((t) => t.assigneeType !== "employee") || [];

  const handleCompleteTask = (taskId: string) => {
    completeMutation.mutate(taskId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading your onboarding...</div>
      </div>
    );
  }

  if (!onboarding) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Onboarding</h1>
          <p className="text-gray-600">Welcome to your onboarding journey</p>
        </div>

        <Card>
          <CardBody className="text-center py-12">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">
              No Active Onboarding
            </h3>
            <p className="text-gray-500">
              You don't have any active onboarding tasks at this time.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Onboarding</h1>
        <p className="text-gray-600">
          Welcome! Complete these tasks to get started
        </p>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardBody className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {onboarding.templateName}
              </h2>
              <p className="text-sm text-gray-500">
                Started {new Date(onboarding.startedAt).toLocaleDateString()}
                {onboarding.dueDate && (
                  <> · Due {new Date(onboarding.dueDate).toLocaleDateString()}</>
                )}
              </p>
            </div>
            <Badge
              variant={
                onboarding.status === "completed"
                  ? "success"
                  : onboarding.status === "in_progress"
                  ? "warning"
                  : "secondary"
              }
            >
              {onboarding.status.replace("_", " ").toUpperCase()}
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Overall Progress</span>
              <span className="font-medium">
                {onboarding.completedTasks} of {onboarding.totalTasks} tasks
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-right text-sm font-medium text-blue-600">
              {progress}% Complete
            </div>
          </div>
        </CardBody>
      </Card>

      {/* My Tasks */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">My Tasks</h3>
            <span className="text-sm text-gray-500">
              {pendingTasks.length} remaining
            </span>
          </div>
        </CardHeader>
        <CardBody className="p-0 divide-y">
          {pendingTasks.length === 0 && completedTasks.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <CheckCircle className="h-12 w-12 mx-auto text-green-300 mb-2" />
              <p>No tasks assigned to you</p>
            </div>
          ) : (
            <>
              {/* Pending Tasks */}
              {pendingTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 hover:bg-gray-50 flex items-start gap-4"
                >
                  <div className="mt-1">
                    {task.status === "in_progress" ? (
                      <Clock className="h-5 w-5 text-yellow-500" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900">{task.title}</h4>
                      {task.isRequired && (
                        <Badge variant="destructive" className="text-xs">
                          Required
                        </Badge>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-sm text-gray-600 mt-1">
                        {task.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        {categoryIcons[task.category] || categoryIcons.default}
                        {task.category.replace("_", " ")}
                      </span>
                      {task.dueDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Due {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {task.resourceUrl && (
                      <a
                        href={task.resourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <LinkIcon className="h-4 w-4" />
                      </a>
                    )}
                    <Button size="sm" onClick={() => handleCompleteTask(task.id)} disabled={completeMutation.isPending}>
                      {completeMutation.isPending ? "..." : "Complete"}
                    </Button>
                  </div>
                </div>
              ))}

              {/* Completed Tasks */}
              {completedTasks.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-gray-50 text-sm font-medium text-gray-500">
                    Completed ({completedTasks.length})
                  </div>
                  {completedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-4 bg-gray-50/50 flex items-start gap-4 opacity-75"
                    >
                      <div className="mt-1">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-700 line-through">
                          {task.title}
                        </h4>
                        <p className="text-xs text-gray-500 mt-1">
                          Completed{" "}
                          {task.completedAt &&
                            new Date(task.completedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {/* Other Tasks (view-only) */}
      {otherTasks.length > 0 && (
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Other Onboarding Tasks</h3>
              <span className="text-sm text-gray-500">
                Assigned to HR, IT, or Manager
              </span>
            </div>
          </CardHeader>
          <CardBody className="p-0 divide-y">
            {otherTasks.map((task) => (
              <div
                key={task.id}
                className="p-4 flex items-start gap-4 opacity-75"
              >
                <div className="mt-1">
                  {task.status === "completed" ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-300" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4
                      className={`font-medium ${
                        task.status === "completed"
                          ? "text-gray-500 line-through"
                          : "text-gray-700"
                      }`}
                    >
                      {task.title}
                    </h4>
                    <Badge variant="secondary" className="text-xs">
                      {task.assigneeType.replace("_", " ").toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {task.status === "completed"
                      ? `Completed ${
                          task.completedAt &&
                          new Date(task.completedAt).toLocaleDateString()
                        }`
                      : "Pending"}
                  </p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
